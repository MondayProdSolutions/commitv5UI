import type { Prisma, PaymentMethod } from '@prisma/client';
import { db } from '@/lib/db';
import { logActivity } from '@/lib/audit';
import { ValidationError } from '@/lib/errors';
import { recordMovement } from '@/lib/inventory/movements';
import { invalidateStockAlertsCache } from '@/lib/inventory/stock';
import { prorateReturnLine } from '@/lib/sales/compute';
import { nextFolio } from '@/lib/sales/folio';
import type { CreateReturnInput } from '@/lib/validation/return';

export type { CreateReturnInput };

const round2 = (x: number) => Math.round(x * 100) / 100;

export async function createReturn(
  actorId: string,
  input: CreateReturnInput,
  ip: string | null,
): Promise<{ id: string; folio: string }> {
  const result = await db.$transaction(async (tx) => {
    const sale = await tx.sale.findUnique({
      where: { id: input.saleId },
      include: { lines: true, returns: { include: { lines: true } } },
    });
    if (!sale) throw new ValidationError({ _form: 'La venta no existe.' });
    if (sale.estado === 'CANCELADA') {
      throw new ValidationError({ _form: 'Una venta cancelada no admite devoluciones.' });
    }
    if (sale.estado !== 'COMPLETADA') {
      throw new ValidationError({ _form: 'Solo se puede devolver una venta completada.' });
    }

    const session = await tx.cashSession.findFirst({ where: { estado: 'ABIERTA' } });
    if (!session) {
      throw new ValidationError({ _form: 'No hay una caja abierta. Abre la caja para registrar devoluciones.' });
    }

    // `yaDevuelto` por línea = suma de TODAS las devoluciones previas de la venta.
    // También se acumulan los importes ya reembolsados por línea para que la
    // devolución que AGOTA la línea absorba el residuo de redondeo.
    const yaDevueltoPorLinea: Record<string, number> = {};
    const yaRefundadoBasePorLinea: Record<string, number> = {};
    const yaRefundadoImpuestoPorLinea: Record<string, number> = {};
    for (const r of sale.returns) {
      for (const rl of r.lines) {
        yaDevueltoPorLinea[rl.saleLineId] = (yaDevueltoPorLinea[rl.saleLineId] ?? 0) + rl.cantidad;
        yaRefundadoBasePorLinea[rl.saleLineId] =
          (yaRefundadoBasePorLinea[rl.saleLineId] ?? 0) + Number(rl.baseNeta);
        yaRefundadoImpuestoPorLinea[rl.saleLineId] =
          (yaRefundadoImpuestoPorLinea[rl.saleLineId] ?? 0) + Number(rl.impuesto);
      }
    }

    // Acumula lo consumido por las líneas de ESTA petición: dos entradas con el
    // mismo `saleLineId` deben sumar contra el mismo `disponible` (Task 9 no
    // deduplica), si no se generaría un sobre-reembolso.
    const consumidoEnEstaPeticion: Record<string, number> = {};

    const computed = input.lineas.map((l, i) => {
      const saleLine = sale.lines.find((sl) => sl.id === l.saleLineId);
      if (!saleLine) {
        throw new ValidationError({
          [`lineas.${i}.saleLineId`]: 'La línea no pertenece a esta venta.',
        });
      }
      const yaDevuelto = yaDevueltoPorLinea[l.saleLineId] ?? 0;
      const consumido = consumidoEnEstaPeticion[l.saleLineId] ?? 0;
      const disponible = saleLine.cantidad - yaDevuelto - consumido;
      if (l.cantidad > disponible) {
        throw new ValidationError({
          [`lineas.${i}.cantidad`]: `Máximo devolvible: ${disponible}.`,
        });
      }
      consumidoEnEstaPeticion[l.saleLineId] = consumido + l.cantidad;

      const baseNetaSale = Number(saleLine.baseNeta);
      const impuestoSale = Number(saleLine.impuesto);
      const totalSale = Number(saleLine.total);

      // `prorateReturnLine` redondea cada parcial de forma independiente contra la
      // línea original, por lo que varias devoluciones parciales pueden desviarse
      // ±1¢ respecto a lo vendido. Cuando ESTA devolución agota la línea (contando
      // las previas ya persistidas), sus importes son el RESIDUO exacto: así
      // `Σ ReturnLine.baseNeta == SaleLine.baseNeta` al centavo (ídem impuesto/total).
      let montos: { baseNeta: number; impuesto: number; total: number };
      if (yaDevuelto + l.cantidad === saleLine.cantidad) {
        const baseNeta = round2(baseNetaSale - (yaRefundadoBasePorLinea[l.saleLineId] ?? 0));
        const impuesto = round2(impuestoSale - (yaRefundadoImpuestoPorLinea[l.saleLineId] ?? 0));
        montos = { baseNeta, impuesto, total: round2(baseNeta + impuesto) };
      } else {
        // `prorateReturnLine` guarda cantidad <= 0 / no entera / > cantidad original.
        montos = prorateReturnLine(
          { cantidad: saleLine.cantidad, baseNeta: baseNetaSale, impuesto: impuestoSale, total: totalSale },
          l.cantidad,
        );
      }
      return { linea: l, saleLine, montos };
    });

    const subtotal = round2(computed.reduce((s, c) => s + c.montos.baseNeta, 0));
    const impuestos = round2(computed.reduce((s, c) => s + c.montos.impuesto, 0));
    const total = round2(computed.reduce((s, c) => s + c.montos.total, 0));

    const folioD = await nextFolio(tx, 'D');

    const ret = await tx.return.create({
      data: {
        folio: folioD,
        saleId: input.saleId,
        cajeroId: actorId,
        cashSessionId: session.id,
        subtotal,
        impuestos,
        total,
        metodoReembolso: input.metodoReembolso,
        motivo: input.motivo.trim(),
        lines: {
          create: computed.map((c) => ({
            saleLineId: c.linea.saleLineId,
            variantId: c.saleLine.variantId,
            cantidad: c.linea.cantidad,
            baseNeta: c.montos.baseNeta,
            impuesto: c.montos.impuesto,
            total: c.montos.total,
          })),
        },
      },
    });

    for (const c of computed) {
      await recordMovement(
        {
          variantId: c.saleLine.variantId,
          tipo: 'DEVOLUCION',
          valor: c.linea.cantidad,
          motivo: `Devolución ${folioD} de ${sale.folio}`,
          actorId,
          referenciaTipo: 'devolucion',
          referenciaId: ret.id,
        },
        tx,
      );
    }

    await logActivity(
      {
        actorId,
        accion: 'ventas.devolver',
        entidad: 'Return',
        entidadId: ret.id,
        metadata: {
          folioD,
          folioV: sale.folio,
          total: Number(ret.total),
          metodoReembolso: input.metodoReembolso,
          nLineas: input.lineas.length,
        },
        ip,
      },
      tx,
    );

    return { id: ret.id, folio: folioD };
  });

  invalidateStockAlertsCache();
  return result;
}

export type ReturnDetailLine = {
  saleLineId: string;
  productoNombre: string;
  varianteNombre: string | null;
  cantidad: number;
  baseNeta: number;
  impuesto: number;
  total: number;
};

export type ReturnDetail = {
  id: string;
  folio: string;
  saleId: string;
  cajeroId: string;
  ventaId: string;
  ventaFolio: string;
  cajeroNombre: string;
  cashSessionId: string | null;
  cashSessionFolio: string | null;
  subtotal: number;
  impuestos: number;
  total: number;
  metodoReembolso: PaymentMethod;
  motivo: string;
  createdAt: Date;
  lines: ReturnDetailLine[];
};

export async function getReturn(id: string): Promise<ReturnDetail | null> {
  const ret = await db.return.findUnique({
    where: { id },
    include: {
      sale: { select: { id: true, folio: true } },
      cajero: { select: { nombre: true } },
      cashSession: { select: { folio: true } },
      lines: {
        include: { saleLine: { select: { productoNombre: true, varianteNombre: true } } },
      },
    },
  });
  if (!ret) return null;

  return {
    id: ret.id,
    folio: ret.folio,
    saleId: ret.saleId,
    cajeroId: ret.cajeroId,
    ventaId: ret.sale.id,
    ventaFolio: ret.sale.folio,
    cajeroNombre: ret.cajero.nombre,
    cashSessionId: ret.cashSessionId,
    cashSessionFolio: ret.cashSession?.folio ?? null,
    subtotal: Number(ret.subtotal),
    impuestos: Number(ret.impuestos),
    total: Number(ret.total),
    metodoReembolso: ret.metodoReembolso,
    motivo: ret.motivo,
    createdAt: ret.createdAt,
    lines: ret.lines.map((l) => ({
      saleLineId: l.saleLineId,
      productoNombre: l.saleLine.productoNombre,
      varianteNombre: l.saleLine.varianteNombre,
      cantidad: l.cantidad,
      baseNeta: Number(l.baseNeta),
      impuesto: Number(l.impuesto),
      total: Number(l.total),
    })),
  };
}

export type ReturnRow = {
  id: string;
  folio: string;
  fecha: Date;
  ventaFolio: string;
  total: number;
  cajero: string;
};

export type ListReturnsFilter = {
  saleId?: string;
  cashSessionId?: string;
  desde?: Date;
  hasta?: Date;
  page: number;
  pageSize: number;
};

export async function listReturns(
  filtro: ListReturnsFilter,
): Promise<{ rows: ReturnRow[]; total: number }> {
  const { saleId, cashSessionId, desde, hasta, page, pageSize } = filtro;

  const where: Prisma.ReturnWhereInput = {};
  if (saleId) where.saleId = saleId;
  if (cashSessionId) where.cashSessionId = cashSessionId;
  if (desde || hasta) {
    where.createdAt = {
      ...(desde ? { gte: desde } : {}),
      ...(hasta ? { lte: hasta } : {}),
    };
  }

  const [total, rows] = await Promise.all([
    db.return.count({ where }),
    db.return.findMany({
      where,
      include: {
        sale: { select: { folio: true } },
        cajero: { select: { nombre: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  return {
    rows: rows.map((r) => ({
      id: r.id,
      folio: r.folio,
      fecha: r.createdAt,
      ventaFolio: r.sale.folio,
      total: Number(r.total),
      cajero: r.cajero.nombre,
    })),
    total,
  };
}
