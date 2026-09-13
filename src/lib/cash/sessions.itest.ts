import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { db } from '@/lib/db';
import { ValidationError } from '@/lib/errors';
import { hashPassword } from '@/lib/auth/password';
import { cancelSale, createSale, type CreateSaleInput } from '@/lib/sales/sales';
import { createReturn } from '@/lib/sales/returns';
import { seedVariant, cleanupSales } from '@/lib/sales/__testutil';
import {
  getOpenCashSession,
  openCashSession,
  recordCashMovement,
  closeCashSession,
  getCashSession,
  listCashSessions,
  type CashSessionLite,
} from './sessions';

const GESTOR_EMAIL = 'task7-caja@pos.com';
let ACTOR: string;

/** Crea (o recrea) un usuario con rol `Gerente` — FK real para `abiertaPorId`/`actorId`.
 *  Gerente tiene permiso `ventas.crear`, así que también sirve como cajero en estos tests. */
async function seedGestor(email: string): Promise<string> {
  await db.user.deleteMany({ where: { email } });
  const rol = await db.role.findFirstOrThrow({ where: { nombre: 'Gerente' } });
  const user = await db.user.create({
    data: {
      nombre: 'Gestor Caja Test',
      email,
      passwordHash: await hashPassword('xxxxxxxxxx'),
      roleId: rol.id,
    },
  });
  return user.id;
}

/** Este archivo asevera el número exacto de folio, así que el contador 'C' parte de 0. */
async function resetFolioC(): Promise<void> {
  await db.folioCounter.update({ where: { serie: 'C' }, data: { valor: 0 } });
}

function saleInput(over: Partial<CreateSaleInput> = {}): CreateSaleInput {
  return {
    customerId: null,
    lineas: [],
    descuentoTicket: null,
    pagos: [],
    requiereFactura: false,
    ...over,
  };
}

beforeEach(async () => {
  await cleanupSales([GESTOR_EMAIL]);
  await resetFolioC();
  ACTOR = await seedGestor(GESTOR_EMAIL);
});

afterAll(async () => {
  await cleanupSales([GESTOR_EMAIL]);
  await resetFolioC();
});

describe('openCashSession', () => {
  it('sin ninguna abierta → ABIERTA, folio C-000001, audita caja.abrir', async () => {
    expect(await getOpenCashSession()).toBeNull();

    const { id, folio } = await openCashSession(ACTOR, 1500.5, '127.0.0.1');
    expect(folio).toBe('C-000001');

    const row = await db.cashSession.findUniqueOrThrow({ where: { id } });
    expect(row.estado).toBe('ABIERTA');
    expect(row.folio).toBe('C-000001');
    expect(Number(row.fondoApertura)).toBe(1500.5);
    expect(row.abiertaPorId).toBe(ACTOR);

    const abierta = await getOpenCashSession();
    expect(abierta).not.toBeNull();
    expect(abierta!.folio).toBe('C-000001');

    const log = await db.activityLog.findFirstOrThrow({
      where: { entidadId: id, accion: 'caja.abrir' },
    });
    const meta = log.metadata as { folio: string; fondoApertura: number };
    expect(meta.folio).toBe('C-000001');
    expect(meta.fondoApertura).toBe(1500.5);
  });

  it('con una ya abierta → ValidationError _form "Ya hay una caja abierta.", FolioCounter[C] no avanzó', async () => {
    await openCashSession(ACTOR, 100, null);
    const before = (await db.folioCounter.findUniqueOrThrow({ where: { serie: 'C' } })).valor;
    expect(before).toBe(1);

    const err = await openCashSession(ACTOR, 200, null).catch((e) => e);
    expect(err).toBeInstanceOf(ValidationError);
    expect(err.fields._form).toBe('Ya hay una caja abierta.');

    const after = (await db.folioCounter.findUniqueOrThrow({ where: { serie: 'C' } })).valor;
    expect(after).toBe(1);
    expect(await db.cashSession.count()).toBe(1);
  });

  it('dos aperturas en paralelo (Promise.allSettled) → exactamente una fulfilled, la otra ValidationError', async () => {
    const results = await Promise.allSettled([
      openCashSession(ACTOR, 100, null),
      openCashSession(ACTOR, 100, null),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(ValidationError);

    expect(await db.cashSession.count({ where: { estado: 'ABIERTA' } })).toBe(1);
  });
});

describe('recordCashMovement', () => {
  it('RETIRO con caja abierta → crea el movimiento y audita caja.movimiento', async () => {
    const { id: sessionId } = await openCashSession(ACTOR, 500, null);

    const { id } = await recordCashMovement(
      ACTOR,
      { tipo: 'RETIRO', monto: 120.25, motivo: '  Pago a proveedor  ' },
      '10.0.0.2',
    );

    const mov = await db.cashMovement.findUniqueOrThrow({ where: { id } });
    expect(mov.tipo).toBe('RETIRO');
    expect(Number(mov.monto)).toBe(120.25);
    expect(mov.motivo).toBe('Pago a proveedor');
    expect(mov.sessionId).toBe(sessionId);
    expect(mov.actorId).toBe(ACTOR);

    const log = await db.activityLog.findFirstOrThrow({
      where: { entidadId: id, accion: 'caja.movimiento' },
    });
    const meta = log.metadata as { tipo: string; monto: number };
    expect(meta.tipo).toBe('RETIRO');
    expect(meta.monto).toBe(120.25);
  });

  it('INGRESO con caja abierta → crea el movimiento', async () => {
    await openCashSession(ACTOR, 500, null);

    const { id } = await recordCashMovement(
      ACTOR,
      { tipo: 'INGRESO', monto: 80, motivo: 'Fondo adicional' },
      null,
    );

    const mov = await db.cashMovement.findUniqueOrThrow({ where: { id } });
    expect(mov.tipo).toBe('INGRESO');
    expect(Number(mov.monto)).toBe(80);
    expect(mov.motivo).toBe('Fondo adicional');
  });

  it('sin caja abierta → ValidationError _form', async () => {
    const err = await recordCashMovement(
      ACTOR,
      { tipo: 'RETIRO', monto: 50, motivo: 'motivo válido' },
      null,
    ).catch((e) => e);

    expect(err).toBeInstanceOf(ValidationError);
    expect(err.fields._form).toBe('No hay una caja abierta.');
    expect(await db.cashMovement.count()).toBe(0);
  });

  it('monto 0 → ValidationError({ monto }); motivo en blanco → ValidationError({ motivo })', async () => {
    await openCashSession(ACTOR, 500, null);

    const errMonto = await recordCashMovement(
      ACTOR,
      { tipo: 'RETIRO', monto: 0, motivo: 'motivo válido' },
      null,
    ).catch((e) => e);
    expect(errMonto).toBeInstanceOf(ValidationError);
    expect(typeof errMonto.fields.monto).toBe('string');

    const errMotivo = await recordCashMovement(
      ACTOR,
      { tipo: 'RETIRO', monto: 50, motivo: '   ' },
      null,
    ).catch((e) => e);
    expect(errMotivo).toBeInstanceOf(ValidationError);
    expect(typeof errMotivo.fields.motivo).toBe('string');

    expect(await db.cashMovement.count()).toBe(0);
  });
});

describe('getOpenCashSession', () => {
  it('devuelve el shape CashSessionLite con abiertaPorNombre', async () => {
    const { id } = await openCashSession(ACTOR, 999.99, null);

    const lite = await getOpenCashSession();
    expect(lite).not.toBeNull();

    const expected: CashSessionLite = {
      id,
      folio: 'C-000001',
      fondoApertura: 999.99,
      abiertaPorId: ACTOR,
      abiertaPorNombre: 'Gestor Caja Test',
      abiertaEn: lite!.abiertaEn,
    };
    expect(lite).toEqual(expected);
    expect(lite!.abiertaEn).toBeInstanceOf(Date);
    expect(typeof lite!.fondoApertura).toBe('number');
  });
});

/**
 * Arma el escenario compuesto del arqueo (spec §2.5):
 *  - abre caja con fondo 1000
 *  - variante a 100 (IVA 16 % → total unitario 116)
 *  - 3 ventas 1u en EFECTIVO exacto (116 c/u) → efectivo bruto 348
 *  - 1 venta 1u con sobrepago EFECTIVO 200 → cambio 84 (neto 116)
 *  - 1 venta 1u pagada con TARJETA 116
 *  - 1 venta 1u EFECTIVO 116, cancelada → NO debe contar
 *  - 1 devolución total (1u) de la primera venta exacta, reembolso EFECTIVO 116
 *  - RETIRO 300; INGRESO 50
 * Esperado a mano: 1000 + (348 + 116 - 84) - 116 - 300 + 50 == 1098
 */
async function armarEscenarioCompuesto(): Promise<{ sessionId: string }> {
  const { id: sessionId } = await openCashSession(ACTOR, 1000, null);
  const { variantId } = await seedVariant({ precioVenta: 100, stock: 20 });

  const ventasExactas: string[] = [];
  for (let i = 0; i < 3; i++) {
    const { id } = await createSale(
      ACTOR,
      saleInput({
        lineas: [{ variantId, cantidad: 1 }],
        pagos: [{ metodo: 'EFECTIVO', monto: 116 }],
      }),
      null,
    );
    ventasExactas.push(id);
  }

  await createSale(
    ACTOR,
    saleInput({
      lineas: [{ variantId, cantidad: 1 }],
      pagos: [{ metodo: 'EFECTIVO', monto: 200 }],
    }),
    null,
  );

  await createSale(
    ACTOR,
    saleInput({
      lineas: [{ variantId, cantidad: 1 }],
      pagos: [{ metodo: 'TARJETA', monto: 116 }],
    }),
    null,
  );

  const { id: ventaCancelada } = await createSale(
    ACTOR,
    saleInput({
      lineas: [{ variantId, cantidad: 1 }],
      pagos: [{ metodo: 'EFECTIVO', monto: 116 }],
    }),
    null,
  );
  await cancelSale(ACTOR, ventaCancelada, 'motivo de cancelación', null);

  const ventaADevolver = await db.sale.findUniqueOrThrow({
    where: { id: ventasExactas[0] },
    include: { lines: true },
  });
  await createReturn(
    ACTOR,
    {
      saleId: ventaADevolver.id,
      lineas: [{ saleLineId: ventaADevolver.lines[0].id, cantidad: 1 }],
      metodoReembolso: 'EFECTIVO',
      motivo: 'motivo de devolución',
    },
    null,
  );

  await recordCashMovement(ACTOR, { tipo: 'RETIRO', monto: 300, motivo: 'retiro de prueba' }, null);
  await recordCashMovement(ACTOR, { tipo: 'INGRESO', monto: 50, motivo: 'ingreso de prueba' }, null);

  return { sessionId };
}

describe('closeCashSession', () => {
  it('escenario compuesto, contado exacto (1098) → diferencia 0, totales fotografiados, canceladas excluidas', async () => {
    const { sessionId } = await armarEscenarioCompuesto();

    const { id, folio, diferencia } = await closeCashSession(ACTOR, 1098, null, null);
    expect(id).toBe(sessionId);
    expect(diferencia).toBe(0);

    const row = await db.cashSession.findUniqueOrThrow({ where: { id } });
    expect(row.estado).toBe('CERRADA');
    expect(row.cerradaPorId).toBe(ACTOR);
    expect(row.cerradaEn).toBeInstanceOf(Date);
    expect(Number(row.efectivoContado)).toBe(1098);
    expect(Number(row.esperadoEfectivo)).toBe(1098);
    expect(Number(row.diferencia)).toBe(0);
    expect(Number(row.totalEfectivoVentas)).toBe(464);
    expect(Number(row.totalTarjeta)).toBe(116);
    expect(Number(row.totalTransferencia)).toBe(0);
    expect(Number(row.totalReembolsosEfectivo)).toBe(116);
    expect(Number(row.totalRetiros)).toBe(300);
    expect(Number(row.totalIngresos)).toBe(50);
    expect(row.nVentas).toBe(5);
    expect(row.notaCierre).toBeNull();
    expect(row.folio).toBe(folio);

    const log = await db.activityLog.findFirstOrThrow({
      where: { entidadId: id, accion: 'caja.cerrar' },
    });
    const meta = log.metadata as { folio: string; esperadoEfectivo: number; efectivoContado: number; diferencia: number };
    expect(meta.folio).toBe(folio);
    expect(meta.esperadoEfectivo).toBe(1098);
    expect(meta.efectivoContado).toBe(1098);
    expect(meta.diferencia).toBe(0);
  });

  it('mismo escenario, contado 1120 → diferencia +22', async () => {
    await armarEscenarioCompuesto();
    const { diferencia } = await closeCashSession(ACTOR, 1120, null, null);
    expect(diferencia).toBe(22);
  });

  it('mismo escenario, contado 1080 → diferencia -18', async () => {
    await armarEscenarioCompuesto();
    const { diferencia } = await closeCashSession(ACTOR, 1080, null, null);
    expect(diferencia).toBe(-18);
  });

  it('sin caja abierta → ValidationError _form', async () => {
    const err = await closeCashSession(ACTOR, 100, null, null).catch((e) => e);
    expect(err).toBeInstanceOf(ValidationError);
    expect(err.fields._form).toBe('No hay una caja abierta.');
  });

  it('efectivoContado < 0 → ValidationError({ efectivoContado })', async () => {
    await openCashSession(ACTOR, 500, null);

    const err = await closeCashSession(ACTOR, -5, null, null).catch((e) => e);
    expect(err).toBeInstanceOf(ValidationError);
    expect(typeof err.fields.efectivoContado).toBe('string');

    const row = await db.cashSession.findFirstOrThrow({ where: { estado: 'ABIERTA' } });
    expect(row).not.toBeNull();
  });

  it('tras cerrar, getOpenCashSession() === null; nueva openCashSession funciona y da C-000002', async () => {
    await openCashSession(ACTOR, 500, null);
    await closeCashSession(ACTOR, 500, null, null);

    expect(await getOpenCashSession()).toBeNull();

    const { folio } = await openCashSession(ACTOR, 200, null);
    expect(folio).toBe('C-000002');
  });
});

describe('getCashSession', () => {
  it('sesión abierta → snapshot de cierre en null, movements presentes con actorNombre', async () => {
    const { id } = await openCashSession(ACTOR, 500, null);
    await recordCashMovement(ACTOR, { tipo: 'INGRESO', monto: 20, motivo: 'motivo válido' }, null);

    const detail = await getCashSession(id);
    expect(detail).not.toBeNull();
    expect(detail!.id).toBe(id);
    expect(detail!.estado).toBe('ABIERTA');
    expect(detail!.abiertaPorId).toBe(ACTOR);
    expect(detail!.abiertaPorNombre).toBe('Gestor Caja Test');
    expect(detail!.cerradaPorId).toBeNull();
    expect(detail!.cerradaPorNombre).toBeNull();
    expect(detail!.cerradaEn).toBeNull();
    expect(detail!.efectivoContado).toBeNull();
    expect(detail!.esperadoEfectivo).toBeNull();
    expect(detail!.diferencia).toBeNull();
    expect(detail!.totalEfectivoVentas).toBeNull();
    expect(detail!.totalTarjeta).toBeNull();
    expect(detail!.totalTransferencia).toBeNull();
    expect(detail!.totalReembolsosEfectivo).toBeNull();
    expect(detail!.totalRetiros).toBeNull();
    expect(detail!.totalIngresos).toBeNull();
    expect(detail!.nVentas).toBeNull();
    expect(detail!.notaCierre).toBeNull();
    expect(detail!.movements).toHaveLength(1);
    expect(detail!.movements[0].tipo).toBe('INGRESO');
    expect(detail!.movements[0].monto).toBe(20);
    expect(detail!.movements[0].motivo).toBe('motivo válido');
    expect(detail!.movements[0].actorNombre).toBe('Gestor Caja Test');
  });

  it('sesión cerrada → todos los total* presentes; abiertaPorNombre y cerradaPorNombre', async () => {
    const { id } = await openCashSession(ACTOR, 500, null);
    await closeCashSession(ACTOR, 500, 'nota de cierre', null);

    const detail = await getCashSession(id);
    expect(detail).not.toBeNull();
    expect(detail!.estado).toBe('CERRADA');
    expect(detail!.abiertaPorNombre).toBe('Gestor Caja Test');
    expect(detail!.cerradaPorNombre).toBe('Gestor Caja Test');
    expect(detail!.cerradaEn).toBeInstanceOf(Date);
    expect(detail!.efectivoContado).toBe(500);
    expect(detail!.esperadoEfectivo).toBe(500);
    expect(detail!.diferencia).toBe(0);
    expect(detail!.totalEfectivoVentas).toBe(0);
    expect(detail!.totalTarjeta).toBe(0);
    expect(detail!.totalTransferencia).toBe(0);
    expect(detail!.totalReembolsosEfectivo).toBe(0);
    expect(detail!.totalRetiros).toBe(0);
    expect(detail!.totalIngresos).toBe(0);
    expect(detail!.nVentas).toBe(0);
    expect(detail!.notaCierre).toBe('nota de cierre');
  });

  it('id inexistente → null', async () => {
    expect(await getCashSession('nonexistent-id')).toBeNull();
  });
});

describe('listCashSessions', () => {
  it('filtra por estado y rango de fechas; orden abiertaEn desc; total = count sin paginar', async () => {
    const { id: id1 } = await openCashSession(ACTOR, 100, null);
    await closeCashSession(ACTOR, 100, null, null);

    const cutoff = new Date();

    const { id: id2 } = await openCashSession(ACTOR, 200, null);
    await closeCashSession(ACTOR, 200, null, null);

    const { id: id3 } = await openCashSession(ACTOR, 300, null);
    // id3 queda ABIERTA

    const todas = await listCashSessions({ estado: 'todas', page: 1, pageSize: 10 });
    expect(todas.total).toBe(3);
    expect(todas.rows.map((r) => r.id)).toEqual([id3, id2, id1]);

    const sinFiltro = await listCashSessions({ page: 1, pageSize: 10 });
    expect(sinFiltro.total).toBe(3);

    const abiertas = await listCashSessions({ estado: 'ABIERTA', page: 1, pageSize: 10 });
    expect(abiertas.total).toBe(1);
    expect(abiertas.rows[0].id).toBe(id3);
    expect(abiertas.rows[0].efectivoContado).toBeNull();
    expect(abiertas.rows[0].diferencia).toBeNull();

    const cerradas = await listCashSessions({ estado: 'CERRADA', page: 1, pageSize: 10 });
    expect(cerradas.total).toBe(2);
    expect(cerradas.rows.map((r) => r.id).sort()).toEqual([id1, id2].sort());
    expect(cerradas.rows.every((r) => typeof r.efectivoContado === 'number')).toBe(true);

    const desdeFiltro = await listCashSessions({ estado: 'todas', desde: cutoff, page: 1, pageSize: 10 });
    expect(desdeFiltro.total).toBe(2);
    expect(desdeFiltro.rows.map((r) => r.id).sort()).toEqual([id2, id3].sort());

    const hastaFiltro = await listCashSessions({ estado: 'todas', hasta: cutoff, page: 1, pageSize: 10 });
    expect(hastaFiltro.total).toBe(1);
    expect(hastaFiltro.rows[0].id).toBe(id1);
  });
});
