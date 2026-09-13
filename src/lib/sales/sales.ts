import { Prisma, type PaymentMethod, type SaleStatus } from '@prisma/client';
import { db } from '@/lib/db';
import { logActivity } from '@/lib/audit';
import { ValidationError } from '@/lib/errors';
import { recordMovement } from '@/lib/inventory/movements';
import { invalidateStockAlertsCache } from '@/lib/inventory/stock';
import { computeSale, type SaleComputeInput } from '@/lib/sales/compute';
import { nextFolio } from '@/lib/sales/folio';
import { bloqueFiscalCompleto } from '@/lib/customers/fiscal';
import type { CreateSaleInput } from '@/lib/validation/sale';

export type { CreateSaleInput };

export type SaleLineDetail = {
  id: string;
  variantId: string;
  productoNombre: string;
  varianteNombre: string | null;
  sku: string | null;
  cantidad: number;
  precioUnitario: number;
  tasaImpuesto: number;
  descuentoMonto: number;
  descuentoTicketProrrateado: number;
  baseNeta: number;
  impuesto: number;
  total: number;
};

export type SaleDetail = {
  id: string;
  folio: string;
  estado: SaleStatus;
  customerId: string;
  clienteNombre: string;
  cajeroId: string;
  cajeroNombre: string;
  canceladaPorNombre?: string | null;
  canceladaEn: Date | null;
  motivoCancelacion: string | null;
  requiereFactura: boolean;
  datosFiscales: Prisma.JsonValue;
  cashSessionId: string | null;
  cashSessionFolio: string | null;
  cashSessionEstado: 'ABIERTA' | 'CERRADA' | null;
  subtotal: number;
  descuentoLineas: number;
  descuentoTicket: number;
  impuestos: number;
  total: number;
  pagado: number;
  cambio: number;
  createdAt: Date;
  lines: SaleLineDetail[];
  payments: { metodo: PaymentMethod; monto: number }[];
  returns: { id: string; folio: string; total: number; createdAt: Date }[];
  devuelto: Record<string, number>;
};

const round2 = (x: number) => Math.round(x * 100) / 100;

type DatosFiscales = {
  rfc: string;
  razonSocial: string;
  regimenFiscalCode: string;
  usoCfdiCode: string;
  cpFiscal: string;
};

// `bloqueFiscalCompleto` ya garantizó que los 5 campos son strings no vacíos.
function snapshotFiscal(c: {
  rfc: string | null;
  razonSocial: string | null;
  regimenFiscalCode: string | null;
  usoCfdiCode: string | null;
  cpFiscal: string | null;
}): DatosFiscales {
  return {
    rfc: c.rfc ?? '',
    razonSocial: c.razonSocial ?? '',
    regimenFiscalCode: c.regimenFiscalCode ?? '',
    usoCfdiCode: c.usoCfdiCode ?? '',
    cpFiscal: c.cpFiscal ?? '',
  };
}

export async function createSale(
  actorId: string,
  input: CreateSaleInput,
  ip: string | null,
): Promise<{ id: string; folio: string }> {
  const result = await db.$transaction(async (tx) => {
    const session = await tx.cashSession.findFirst({ where: { estado: 'ABIERTA' } });
    if (!session) {
      throw new ValidationError({ _form: 'No hay una caja abierta. Abre la caja para registrar ventas.' });
    }

    const customerId =
      input.customerId ?? (await tx.customer.findFirstOrThrow({ where: { esGenerico: true } })).id;
    const customer = await tx.customer.findUnique({ where: { id: customerId } });
    if (!customer) throw new ValidationError({ customerId: 'El cliente no existe.' });

    const ids = [...new Set(input.lineas.map((l) => l.variantId))];
    const variants = await tx.productVariant.findMany({
      where: { id: { in: ids } },
      include: { product: { include: { taxRate: true } } },
    });
    const byId = new Map(variants.map((v) => [v.id, v]));

    const computeLines = input.lineas.map((l, i) => {
      const v = byId.get(l.variantId);
      if (!v || v.archivada || v.product.archivado || v.disponible === false) {
        throw new ValidationError({ [`lineas.${i}.variantId`]: 'El producto ya no está disponible.' });
      }
      return {
        variantId: v.id,
        cantidad: l.cantidad,
        precioUnitario: Number(v.precioVenta),
        tasaImpuesto: Number(v.product.taxRate.tasa),
        descuento: l.descuento ?? null,
      };
    });

    const computed = computeSale({
      lineas: computeLines,
      descuentoTicket: input.descuentoTicket ?? null,
    } satisfies SaleComputeInput);

    const pagado = round2(input.pagos.reduce((s, p) => s + p.monto, 0));
    if (pagado < computed.total) {
      throw new ValidationError({ _form: 'El pago no cubre el total.' });
    }
    const cambio = round2(pagado - computed.total);
    if (cambio > 0) {
      const efectivoOk = input.pagos.some((p) => p.metodo === 'EFECTIVO' && p.monto >= cambio);
      if (!efectivoOk) {
        throw new ValidationError({ _form: 'El cambio solo se entrega en efectivo.' });
      }
    }

    let datosFiscales: DatosFiscales | undefined;
    if (input.requiereFactura) {
      if (customer.esGenerico || !bloqueFiscalCompleto(customer)) {
        throw new ValidationError({ _form: 'El cliente no tiene datos de facturación completos.' });
      }
      datosFiscales = snapshotFiscal(customer);
    }

    const folio = await nextFolio(tx, 'V');

    const sale = await tx.sale.create({
      data: {
        folio,
        estado: 'COMPLETADA',
        customerId,
        cajeroId: actorId,
        cashSessionId: session.id,
        subtotal: computed.subtotal,
        descuentoLineas: computed.descuentoLineas,
        descuentoTicket: computed.descuentoTicket,
        impuestos: computed.impuestos,
        total: computed.total,
        pagado,
        cambio,
        requiereFactura: input.requiereFactura,
        datosFiscales: datosFiscales ?? Prisma.DbNull,
        lines: {
          create: computed.lineas.map((cl) => {
            const v = byId.get(cl.variantId)!;
            return {
              variantId: cl.variantId,
              productoNombre: v.product.nombre,
              varianteNombre: v.nombre ?? null,
              sku: v.sku ?? null,
              cantidad: cl.cantidad,
              precioUnitario: cl.precioUnitario,
              tasaImpuesto: cl.tasaImpuesto,
              descuentoMonto: cl.descuentoLinea,
              descuentoTicketProrrateado: cl.descuentoTicketProrrateado,
              baseNeta: cl.baseNeta,
              impuesto: cl.impuesto,
              total: cl.total,
            };
          }),
        },
        payments: {
          create: input.pagos.map((p) => ({ metodo: p.metodo, monto: p.monto })),
        },
      },
    });

    for (const cl of computed.lineas) {
      await recordMovement(
        {
          variantId: cl.variantId,
          tipo: 'VENTA',
          valor: cl.cantidad,
          motivo: `Venta ${folio}`,
          actorId,
          referenciaTipo: 'venta',
          referenciaId: sale.id,
        },
        tx,
      );
    }

    await logActivity(
      {
        actorId,
        accion: 'ventas.crear',
        entidad: 'Sale',
        entidadId: sale.id,
        metadata: {
          folio,
          total: computed.total,
          nLineas: computed.lineas.length,
          customerId,
          metodos: [...new Set(input.pagos.map((p) => p.metodo))],
        },
        ip,
      },
      tx,
    );

    return { id: sale.id, folio };
  });

  invalidateStockAlertsCache();
  return result;
}

export async function cancelSale(
  actorId: string,
  saleId: string,
  motivo: string,
  ip: string | null,
): Promise<void> {
  await db.$transaction(async (tx) => {
    const sale = await tx.sale.findUnique({
      where: { id: saleId },
      include: { lines: true, returns: true, cashSession: { select: { estado: true, folio: true } } },
    });
    if (!sale) throw new ValidationError({ _form: 'La venta no existe.' });
    if (sale.estado !== 'COMPLETADA') {
      throw new ValidationError({ _form: 'Solo se puede cancelar una venta completada.' });
    }

    if (sale.cashSession?.estado !== 'ABIERTA') {
      throw new ValidationError({ _form: 'La caja de esta venta ya se cerró; registra una devolución.' });
    }

    if (sale.returns.length > 0) {
      throw new ValidationError({ _form: 'La venta tiene devoluciones; no se puede cancelar.' });
    }

    const motivoLimpio = motivo.trim();
    if (motivoLimpio === '') throw new ValidationError({ motivo: 'Indica el motivo.' });

    for (const line of sale.lines) {
      await recordMovement(
        {
          variantId: line.variantId,
          tipo: 'DEVOLUCION',
          valor: line.cantidad,
          motivo: `Cancelación ${sale.folio}`,
          actorId,
          referenciaTipo: 'venta',
          referenciaId: saleId,
        },
        tx,
      );
    }

    await tx.sale.update({
      where: { id: saleId },
      data: {
        estado: 'CANCELADA',
        canceladaEn: new Date(),
        canceladaPorId: actorId,
        motivoCancelacion: motivoLimpio,
      },
    });

    await logActivity(
      {
        actorId,
        accion: 'ventas.cancelar',
        entidad: 'Sale',
        entidadId: saleId,
        metadata: { folio: sale.folio, total: Number(sale.total), motivo: motivoLimpio },
        ip,
      },
      tx,
    );
  });

  invalidateStockAlertsCache();
}

export type SaleRow = {
  id: string;
  folio: string;
  fecha: Date;
  cliente: string;
  cajero: string;
  nLineas: number;
  total: number;
  estado: 'COMPLETADA' | 'CANCELADA';
};

export type ListSalesFilter = {
  q?: string;
  estado?: 'COMPLETADA' | 'CANCELADA' | 'todas';
  cajeroId?: string;
  customerId?: string;
  cashSessionId?: string;
  desde?: Date;
  hasta?: Date;
  page: number;
  pageSize: number;
};

export async function listSales(
  filtro: ListSalesFilter,
): Promise<{ rows: SaleRow[]; total: number }> {
  const { q, estado, cajeroId, customerId, cashSessionId, desde, hasta, page, pageSize } = filtro;

  const where: Prisma.SaleWhereInput = {};
  if (estado && estado !== 'todas') where.estado = estado;
  if (cajeroId) where.cajeroId = cajeroId;
  if (customerId) where.customerId = customerId;
  if (cashSessionId) where.cashSessionId = cashSessionId;
  if (desde || hasta) {
    where.createdAt = {
      ...(desde ? { gte: desde } : {}),
      ...(hasta ? { lte: hasta } : {}),
    };
  }
  const term = q?.trim();
  if (term) {
    where.OR = [
      { folio: { contains: term, mode: 'insensitive' } },
      { customer: { nombre: { contains: term, mode: 'insensitive' } } },
    ];
  }

  const [total, sales] = await Promise.all([
    db.sale.count({ where }),
    db.sale.findMany({
      where,
      include: {
        customer: { select: { nombre: true } },
        cajero: { select: { nombre: true } },
        _count: { select: { lines: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  const rows: SaleRow[] = sales.map((s) => ({
    id: s.id,
    folio: s.folio,
    fecha: s.createdAt,
    cliente: s.customer.nombre,
    cajero: s.cajero.nombre,
    nLineas: s._count.lines,
    total: Number(s.total),
    estado: s.estado,
  }));

  return { rows, total };
}

export async function getSale(id: string): Promise<SaleDetail | null> {
  const sale = await db.sale.findUnique({
    where: { id },
    include: {
      customer: true,
      cajero: true,
      canceladaPor: true,
      lines: true,
      payments: true,
      returns: { include: { lines: true } },
      cashSession: { select: { folio: true, estado: true } },
    },
  });
  if (!sale) return null;

  const devuelto: Record<string, number> = {};
  for (const r of sale.returns) {
    for (const rl of r.lines) {
      devuelto[rl.saleLineId] = (devuelto[rl.saleLineId] ?? 0) + rl.cantidad;
    }
  }

  return {
    id: sale.id,
    folio: sale.folio,
    estado: sale.estado,
    customerId: sale.customerId,
    clienteNombre: sale.customer.nombre,
    cajeroId: sale.cajeroId,
    cajeroNombre: sale.cajero.nombre,
    canceladaPorNombre: sale.canceladaPor?.nombre ?? null,
    canceladaEn: sale.canceladaEn,
    motivoCancelacion: sale.motivoCancelacion,
    requiereFactura: sale.requiereFactura,
    datosFiscales: sale.datosFiscales,
    cashSessionId: sale.cashSessionId,
    cashSessionFolio: sale.cashSession?.folio ?? null,
    cashSessionEstado: sale.cashSession?.estado ?? null,
    subtotal: Number(sale.subtotal),
    descuentoLineas: Number(sale.descuentoLineas),
    descuentoTicket: Number(sale.descuentoTicket),
    impuestos: Number(sale.impuestos),
    total: Number(sale.total),
    pagado: Number(sale.pagado),
    cambio: Number(sale.cambio),
    createdAt: sale.createdAt,
    lines: sale.lines.map((l) => ({
      id: l.id,
      variantId: l.variantId,
      productoNombre: l.productoNombre,
      varianteNombre: l.varianteNombre,
      sku: l.sku,
      cantidad: l.cantidad,
      precioUnitario: Number(l.precioUnitario),
      tasaImpuesto: Number(l.tasaImpuesto),
      descuentoMonto: Number(l.descuentoMonto),
      descuentoTicketProrrateado: Number(l.descuentoTicketProrrateado),
      baseNeta: Number(l.baseNeta),
      impuesto: Number(l.impuesto),
      total: Number(l.total),
    })),
    payments: sale.payments.map((p) => ({ metodo: p.metodo, monto: Number(p.monto) })),
    returns: sale.returns.map((r) => ({
      id: r.id,
      folio: r.folio,
      total: Number(r.total),
      createdAt: r.createdAt,
    })),
    devuelto,
  };
}
