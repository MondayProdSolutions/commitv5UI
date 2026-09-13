import { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { logActivity } from '@/lib/audit';
import { ValidationError } from '@/lib/errors';
import { nextFolio } from '@/lib/sales/folio';
import type { CashMovementInput } from '@/lib/validation/cash';

const round2 = (x: number) => Math.round(x * 100) / 100;

export type CashSessionLite = {
  id: string;
  folio: string;
  fondoApertura: number;
  abiertaPorId: string;
  abiertaPorNombre: string;
  abiertaEn: Date;
};

export async function getOpenCashSession(): Promise<CashSessionLite | null> {
  const s = await db.cashSession.findFirst({
    where: { estado: 'ABIERTA' },
    include: { abiertaPor: { select: { nombre: true } } },
  });
  if (!s) return null;
  return {
    id: s.id,
    folio: s.folio,
    fondoApertura: Number(s.fondoApertura),
    abiertaPorId: s.abiertaPorId,
    abiertaPorNombre: s.abiertaPor.nombre,
    abiertaEn: s.abiertaEn,
  };
}

export async function openCashSession(
  actorId: string,
  fondoApertura: number,
  ip: string | null,
): Promise<{ id: string; folio: string }> {
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT valor FROM "FolioCounter" WHERE serie = 'C' FOR UPDATE`;
    const abierta = await tx.cashSession.findFirst({ where: { estado: 'ABIERTA' } });
    if (abierta) throw new ValidationError({ _form: 'Ya hay una caja abierta.' });
    if (!(fondoApertura >= 0)) {
      throw new ValidationError({ fondoApertura: 'El fondo no puede ser negativo.' });
    }
    const folio = await nextFolio(tx, 'C');
    const session = await tx.cashSession.create({
      data: { folio, estado: 'ABIERTA', fondoApertura, abiertaPorId: actorId },
    });
    await logActivity(
      {
        actorId,
        accion: 'caja.abrir',
        entidad: 'CashSession',
        entidadId: session.id,
        metadata: { folio, fondoApertura },
        ip,
      },
      tx,
    );
    return { id: session.id, folio };
  });
}

export async function recordCashMovement(
  actorId: string,
  input: CashMovementInput,
  ip: string | null,
): Promise<{ id: string }> {
  return db.$transaction(async (tx) => {
    const session = await tx.cashSession.findFirst({ where: { estado: 'ABIERTA' } });
    if (!session) throw new ValidationError({ _form: 'No hay una caja abierta.' });
    if (!(input.monto > 0)) throw new ValidationError({ monto: 'El monto debe ser mayor que 0.' });
    const motivo = input.motivo.trim();
    if (motivo === '') throw new ValidationError({ motivo: 'Indica el motivo.' });
    const mov = await tx.cashMovement.create({
      data: { sessionId: session.id, tipo: input.tipo, monto: input.monto, motivo, actorId },
    });
    await logActivity(
      {
        actorId,
        accion: 'caja.movimiento',
        entidad: 'CashMovement',
        entidadId: mov.id,
        metadata: { sessionFolio: session.folio, tipo: input.tipo, monto: input.monto, motivo },
        ip,
      },
      tx,
    );
    return { id: mov.id };
  });
}

type ExpectedCash = {
  esperadoEfectivo: number;
  totalEfectivoVentas: number;
  totalTarjeta: number;
  totalTransferencia: number;
  totalReembolsosEfectivo: number;
  totalRetiros: number;
  totalIngresos: number;
  nVentas: number;
};

/**
 * Calcula el arqueo esperado de una sesión de caja por agregación de sus ventas
 * completadas, devoluciones en efectivo y movimientos de caja. Debe correr
 * dentro de la misma transacción que hace el cierre para que el snapshot sea
 * consistente.
 */
async function computeExpectedCash(
  sessionId: string,
  fondoApertura: number,
  tx: Prisma.TransactionClient,
): Promise<ExpectedCash> {
  const ventasCompletadas = await tx.sale.findMany({
    where: { cashSessionId: sessionId, estado: 'COMPLETADA' },
    select: { id: true, cambio: true },
  });
  const ids = ventasCompletadas.map((v) => v.id);

  const [pagosEfectivo, pagosTarjeta, pagosTransferencia, ventasConEfectivo, reembolsos, retiros, ingresos] =
    await Promise.all([
      tx.payment.aggregate({ where: { saleId: { in: ids }, metodo: 'EFECTIVO' }, _sum: { monto: true } }),
      tx.payment.aggregate({ where: { saleId: { in: ids }, metodo: 'TARJETA' }, _sum: { monto: true } }),
      tx.payment.aggregate({ where: { saleId: { in: ids }, metodo: 'TRANSFERENCIA' }, _sum: { monto: true } }),
      tx.payment.findMany({
        where: { saleId: { in: ids }, metodo: 'EFECTIVO' },
        select: { saleId: true },
        distinct: ['saleId'],
      }),
      tx.return.aggregate({
        where: { cashSessionId: sessionId, metodoReembolso: 'EFECTIVO' },
        _sum: { total: true },
      }),
      tx.cashMovement.aggregate({ where: { sessionId, tipo: 'RETIRO' }, _sum: { monto: true } }),
      tx.cashMovement.aggregate({ where: { sessionId, tipo: 'INGRESO' }, _sum: { monto: true } }),
    ]);

  const idsConEfectivo = new Set(ventasConEfectivo.map((v) => v.saleId));
  const cambioEfectivo = ventasCompletadas
    .filter((v) => idsConEfectivo.has(v.id))
    .reduce((s, v) => s + Number(v.cambio), 0);

  const totalEfectivoVentas = round2(Number(pagosEfectivo._sum.monto ?? 0) - cambioEfectivo);
  const totalTarjeta = round2(Number(pagosTarjeta._sum.monto ?? 0));
  const totalTransferencia = round2(Number(pagosTransferencia._sum.monto ?? 0));
  const totalReembolsosEfectivo = round2(Number(reembolsos._sum.total ?? 0));
  const totalRetiros = round2(Number(retiros._sum.monto ?? 0));
  const totalIngresos = round2(Number(ingresos._sum.monto ?? 0));
  const nVentas = ventasCompletadas.length;
  const esperadoEfectivo = round2(
    fondoApertura + totalEfectivoVentas - totalReembolsosEfectivo - totalRetiros + totalIngresos,
  );

  return {
    esperadoEfectivo,
    totalEfectivoVentas,
    totalTarjeta,
    totalTransferencia,
    totalReembolsosEfectivo,
    totalRetiros,
    totalIngresos,
    nVentas,
  };
}

export async function closeCashSession(
  actorId: string,
  efectivoContado: number,
  notaCierre: string | null,
  ip: string | null,
): Promise<{ id: string; folio: string; diferencia: number }> {
  return db.$transaction(async (tx) => {
    const session = await tx.cashSession.findFirst({ where: { estado: 'ABIERTA' } });
    if (!session) throw new ValidationError({ _form: 'No hay una caja abierta.' });
    if (efectivoContado < 0) {
      throw new ValidationError({ efectivoContado: 'El efectivo contado no puede ser negativo.' });
    }

    const t = await computeExpectedCash(session.id, Number(session.fondoApertura), tx);
    const diferencia = round2(efectivoContado - t.esperadoEfectivo);

    await tx.cashSession.update({
      where: { id: session.id },
      data: {
        estado: 'CERRADA',
        cerradaPorId: actorId,
        cerradaEn: new Date(),
        efectivoContado,
        esperadoEfectivo: t.esperadoEfectivo,
        diferencia,
        totalEfectivoVentas: t.totalEfectivoVentas,
        totalTarjeta: t.totalTarjeta,
        totalTransferencia: t.totalTransferencia,
        totalReembolsosEfectivo: t.totalReembolsosEfectivo,
        totalRetiros: t.totalRetiros,
        totalIngresos: t.totalIngresos,
        nVentas: t.nVentas,
        notaCierre: notaCierre?.trim() || null,
      },
    });

    await logActivity(
      {
        actorId,
        accion: 'caja.cerrar',
        entidad: 'CashSession',
        entidadId: session.id,
        metadata: {
          folio: session.folio,
          esperadoEfectivo: t.esperadoEfectivo,
          efectivoContado,
          diferencia,
        },
        ip,
      },
      tx,
    );

    return { id: session.id, folio: session.folio, diferencia };
  });
}

const num = (d: Prisma.Decimal | null): number | null => (d === null ? null : Number(d));

export type CashSessionDetail = {
  id: string;
  folio: string;
  estado: 'ABIERTA' | 'CERRADA';
  fondoApertura: number;
  abiertaPorId: string;
  abiertaPorNombre: string;
  abiertaEn: Date;
  cerradaPorId: string | null;
  cerradaPorNombre: string | null;
  cerradaEn: Date | null;
  efectivoContado: number | null;
  esperadoEfectivo: number | null;
  diferencia: number | null;
  totalEfectivoVentas: number | null;
  totalTarjeta: number | null;
  totalTransferencia: number | null;
  totalReembolsosEfectivo: number | null;
  totalRetiros: number | null;
  totalIngresos: number | null;
  nVentas: number | null;
  notaCierre: string | null;
  movements: {
    id: string;
    tipo: 'RETIRO' | 'INGRESO';
    monto: number;
    motivo: string;
    actorNombre: string;
    createdAt: Date;
  }[];
};

export async function getCashSession(id: string): Promise<CashSessionDetail | null> {
  const s = await db.cashSession.findUnique({
    where: { id },
    include: {
      abiertaPor: { select: { nombre: true } },
      cerradaPor: { select: { nombre: true } },
      movements: { include: { actor: { select: { nombre: true } } }, orderBy: { createdAt: 'asc' } },
    },
  });
  if (!s) return null;

  return {
    id: s.id,
    folio: s.folio,
    estado: s.estado,
    fondoApertura: Number(s.fondoApertura),
    abiertaPorId: s.abiertaPorId,
    abiertaPorNombre: s.abiertaPor.nombre,
    abiertaEn: s.abiertaEn,
    cerradaPorId: s.cerradaPorId,
    cerradaPorNombre: s.cerradaPor?.nombre ?? null,
    cerradaEn: s.cerradaEn,
    efectivoContado: num(s.efectivoContado),
    esperadoEfectivo: num(s.esperadoEfectivo),
    diferencia: num(s.diferencia),
    totalEfectivoVentas: num(s.totalEfectivoVentas),
    totalTarjeta: num(s.totalTarjeta),
    totalTransferencia: num(s.totalTransferencia),
    totalReembolsosEfectivo: num(s.totalReembolsosEfectivo),
    totalRetiros: num(s.totalRetiros),
    totalIngresos: num(s.totalIngresos),
    nVentas: s.nVentas,
    notaCierre: s.notaCierre,
    movements: s.movements.map((m) => ({
      id: m.id,
      tipo: m.tipo,
      monto: Number(m.monto),
      motivo: m.motivo,
      actorNombre: m.actor.nombre,
      createdAt: m.createdAt,
    })),
  };
}

export type CashSessionRow = {
  id: string;
  folio: string;
  estado: 'ABIERTA' | 'CERRADA';
  abiertaEn: Date;
  cerradaEn: Date | null;
  abiertaPor: string;
  fondoApertura: number;
  efectivoContado: number | null;
  diferencia: number | null;
};

export type ListCashSessionsFilter = {
  estado?: 'ABIERTA' | 'CERRADA' | 'todas';
  desde?: Date;
  hasta?: Date;
  page: number;
  pageSize: number;
};

export async function listCashSessions(
  filtro: ListCashSessionsFilter,
): Promise<{ rows: CashSessionRow[]; total: number }> {
  const { estado, desde, hasta, page, pageSize } = filtro;

  const where: Prisma.CashSessionWhereInput = {};
  if (estado && estado !== 'todas') where.estado = estado;
  if (desde || hasta) {
    where.abiertaEn = {
      ...(desde ? { gte: desde } : {}),
      ...(hasta ? { lte: hasta } : {}),
    };
  }

  const [total, rows] = await Promise.all([
    db.cashSession.count({ where }),
    db.cashSession.findMany({
      where,
      include: { abiertaPor: { select: { nombre: true } } },
      orderBy: { abiertaEn: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  return {
    rows: rows.map((s) => ({
      id: s.id,
      folio: s.folio,
      estado: s.estado,
      abiertaEn: s.abiertaEn,
      cerradaEn: s.cerradaEn,
      abiertaPor: s.abiertaPor.nombre,
      fondoApertura: Number(s.fondoApertura),
      efectivoContado: num(s.efectivoContado),
      diferencia: num(s.diferencia),
    })),
    total,
  };
}
