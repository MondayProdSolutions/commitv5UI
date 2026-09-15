import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { db, getCurrentTenantId } from '@/lib/db';
import { ValidationError } from '@/lib/errors';
import { prorateReturnLine } from './compute';
import { cancelSale, createSale, getSale } from './sales';
import { createReturn, getReturn, listReturns, type CreateReturnInput } from './returns';
import { seedCajero, seedVariant, cleanupSales, conCajaAbierta } from './__testutil';

const round2 = (x: number): number => Math.round(x * 100) / 100;

/** `FolioCounter` ahora tiene clave compuesta `(tenantId, serie)`. */
function folioCounterWhere(serie: 'V' | 'D' | 'C') {
  return { tenantId_serie: { tenantId: getCurrentTenantId(), serie } };
}

const CAJERO_EMAIL = 'task8-devoluciones@pos.com';
let ACTOR: string;
let SESSION_ID: string;

function returnInput(over: Partial<CreateReturnInput> = {}): CreateReturnInput {
  return {
    saleId: '',
    lineas: [],
    metodoReembolso: 'EFECTIVO',
    motivo: 'Producto defectuoso',
    ...over,
  };
}

/** Crea una venta de una sola línea y devuelve sus ids + la SaleLine persistida. */
async function ventaDe(
  cantidad: number,
  opts: { precioVenta?: number; stock?: number; nombreProducto?: string; nombreVariante?: string | null } = {},
) {
  const { variantId } = await seedVariant({
    precioVenta: opts.precioVenta ?? 100,
    stock: opts.stock ?? 50,
    nombreProducto: opts.nombreProducto ?? 'Café Molido',
    nombreVariante: opts.nombreVariante ?? 'Bolsa 1kg',
  });
  const { id } = await createSale(
    ACTOR,
    {
      customerId: null,
      lineas: [{ variantId, cantidad }],
      descuentoTicket: null,
      pagos: [{ metodo: 'EFECTIVO', monto: 100_000 }],
      requiereFactura: false,
    },
    null,
  );
  const sale = await db.sale.findUniqueOrThrow({ where: { id }, include: { lines: true } });
  return { saleId: id, variantId, sale, saleLine: sale.lines[0] };
}

const asNums = (l: { cantidad: number; baseNeta: unknown; impuesto: unknown; total: unknown }) => ({
  cantidad: l.cantidad,
  baseNeta: Number(l.baseNeta),
  impuesto: Number(l.impuesto),
  total: Number(l.total),
});

beforeEach(async () => {
  await cleanupSales([CAJERO_EMAIL]);
  ACTOR = await seedCajero(CAJERO_EMAIL);
  SESSION_ID = await conCajaAbierta(ACTOR);
});

afterAll(async () => {
  await cleanupSales([CAJERO_EMAIL]);
});

describe('createReturn', () => {
  it('devolución parcial 2 de 3: Return + líneas, stock sube 2, importes prorrateados, auditoría ventas.devolver', async () => {
    const { saleId, variantId, sale, saleLine } = await ventaDe(3);
    expect((await db.productVariant.findUniqueOrThrow({ where: { id: variantId } })).stock).toBe(47);

    const esperado = prorateReturnLine(asNums(saleLine), 2);

    const { id, folio } = await createReturn(
      ACTOR,
      returnInput({ saleId, lineas: [{ saleLineId: saleLine.id, cantidad: 2 }], motivo: '  defecto  ' }),
      '127.0.0.1',
    );

    expect(folio).toMatch(/^D-\d{6}$/);

    const ret = await db.return.findUniqueOrThrow({ where: { id }, include: { lines: true } });
    expect(ret.saleId).toBe(saleId);
    expect(ret.cajeroId).toBe(ACTOR);
    expect(ret.motivo).toBe('defecto');
    expect(ret.metodoReembolso).toBe('EFECTIVO');
    expect(ret.lines).toHaveLength(1);
    expect(Number(ret.subtotal)).toBe(esperado.baseNeta);
    expect(Number(ret.impuestos)).toBe(esperado.impuesto);
    expect(Number(ret.total)).toBe(esperado.total);
    expect(Number(ret.total)).toBe(232);

    const rl = ret.lines[0];
    expect(rl.saleLineId).toBe(saleLine.id);
    expect(rl.variantId).toBe(variantId);
    expect(rl.cantidad).toBe(2);
    expect(Number(rl.total)).toBe(esperado.total);

    expect((await db.productVariant.findUniqueOrThrow({ where: { id: variantId } })).stock).toBe(49);

    const mov = await db.inventoryMovement.findFirstOrThrow({
      where: { variantId, tipo: 'DEVOLUCION', referenciaId: id },
    });
    expect(mov.referenciaTipo).toBe('devolucion');
    expect(mov.cantidad).toBe(2);

    const log = await db.activityLog.findFirstOrThrow({
      where: { entidadId: id, accion: 'ventas.devolver' },
    });
    const meta = log.metadata as { folioD: string; folioV: string; total: number; nLineas: number };
    expect(meta.folioD).toBe(folio);
    expect(meta.folioV).toBe(sale.folio);
    expect(meta.total).toBe(232);
    expect(meta.nLineas).toBe(1);
  });

  it('devolución total 3 de 3: importes == SaleLine originales (sin recálculo)', async () => {
    const { saleId, saleLine } = await ventaDe(3);

    const { id } = await createReturn(
      ACTOR,
      returnInput({ saleId, lineas: [{ saleLineId: saleLine.id, cantidad: 3 }] }),
      null,
    );

    const ret = await db.return.findUniqueOrThrow({ where: { id }, include: { lines: true } });
    expect(Number(ret.subtotal)).toBe(Number(saleLine.baseNeta));
    expect(Number(ret.impuestos)).toBe(Number(saleLine.impuesto));
    expect(Number(ret.total)).toBe(Number(saleLine.total));
    expect(Number(ret.lines[0].total)).toBe(Number(saleLine.total));
  });

  it('3 devoluciones de 1u de una línea de 3 con baseNeta indivisible: la última absorbe el residuo y Σ cuadra con la SaleLine', async () => {
    // precio 3.34 × 3 = 10.02; con descuento de línea 0.01 → baseNeta = 10.01,
    // que NO divide exacto entre 3 (round2(10.01/3) = 3.34, ×3 = 10.02 → 1¢ de más).
    const { variantId } = await seedVariant({ precioVenta: 3.34, stock: 50, nombreProducto: 'Galleta' });
    const { id: saleId } = await createSale(
      ACTOR,
      {
        customerId: null,
        lineas: [{ variantId, cantidad: 3, descuento: { tipo: 'monto', valor: 0.01 } }],
        descuentoTicket: null,
        pagos: [{ metodo: 'EFECTIVO', monto: 100_000 }],
        requiereFactura: false,
      },
      null,
    );
    const saleLineAntes = (await getSale(saleId))!.lines[0];
    const saleLineId = saleLineAntes.id;
    expect(saleLineAntes.baseNeta).toBe(10.01); // indivisible entre 3

    const parciales: { total: number; subtotal: number }[] = [];
    for (let i = 0; i < 3; i++) {
      const { id } = await createReturn(
        ACTOR,
        returnInput({ saleId, lineas: [{ saleLineId, cantidad: 1 }], motivo: 'defecto' }),
        null,
      );
      const ret = await db.return.findUniqueOrThrow({ where: { id } });
      parciales.push({ total: Number(ret.total), subtotal: Number(ret.subtotal) });
    }

    const saleLine = (await getSale(saleId))!.lines[0];
    const sumaSubtotal = round2(parciales.reduce((s, p) => s + p.subtotal, 0));
    const sumaTotal = round2(parciales.reduce((s, p) => s + p.total, 0));

    // Σ ReturnLine.baseNeta == SaleLine.baseNeta al centavo (sin la corrección: 10.02).
    expect(sumaSubtotal).toBe(saleLine.baseNeta);
    expect(sumaSubtotal).toBe(10.01);
    expect(sumaTotal).toBe(saleLine.total);

    // toda la línea quedó devuelta
    expect((await getSale(saleId))!.devuelto[saleLineId]).toBe(3);
  });

  it('exceder lo devolvible (4 de una línea de 3) → ValidationError({ lineas.0.cantidad }) "Máximo devolvible: 3."', async () => {
    const { saleId, saleLine } = await ventaDe(3);
    const folioBefore = (await db.folioCounter.findUniqueOrThrow({ where: folioCounterWhere('D') })).valor;

    await expect(
      createReturn(ACTOR, returnInput({ saleId, lineas: [{ saleLineId: saleLine.id, cantidad: 4 }] }), null),
    ).rejects.toMatchObject({ fields: { 'lineas.0.cantidad': 'Máximo devolvible: 3.' } });

    expect(await db.return.count()).toBe(0);
    expect(await db.inventoryMovement.count({ where: { tipo: 'DEVOLUCION' } })).toBe(0);
    const folioAfter = (await db.folioCounter.findUniqueOrThrow({ where: folioCounterWhere('D') })).valor;
    expect(folioAfter).toBe(folioBefore);
  });

  it('segunda devolución agota el resto (1 tras 2 de 3) → OK; una tercera → ValidationError "Máximo devolvible: 0."', async () => {
    const { saleId, variantId, saleLine } = await ventaDe(3);

    await createReturn(ACTOR, returnInput({ saleId, lineas: [{ saleLineId: saleLine.id, cantidad: 2 }] }), null);
    const segunda = await createReturn(
      ACTOR,
      returnInput({ saleId, lineas: [{ saleLineId: saleLine.id, cantidad: 1 }] }),
      null,
    );
    expect(segunda.folio).toMatch(/^D-\d{6}$/);

    expect((await db.productVariant.findUniqueOrThrow({ where: { id: variantId } })).stock).toBe(50);
    expect(await db.return.count({ where: { saleId } })).toBe(2);

    await expect(
      createReturn(ACTOR, returnInput({ saleId, lineas: [{ saleLineId: saleLine.id, cantidad: 1 }] }), null),
    ).rejects.toMatchObject({ fields: { 'lineas.0.cantidad': 'Máximo devolvible: 0.' } });
    expect(await db.return.count({ where: { saleId } })).toBe(2);
  });

  it('dos líneas de entrada con el mismo saleLineId que suman más de lo devolvible → ValidationError', async () => {
    const { saleId, variantId, saleLine } = await ventaDe(3);
    const folioBefore = (await db.folioCounter.findUniqueOrThrow({ where: folioCounterWhere('D') })).valor;

    await expect(
      createReturn(
        ACTOR,
        returnInput({
          saleId,
          lineas: [
            { saleLineId: saleLine.id, cantidad: 2 },
            { saleLineId: saleLine.id, cantidad: 2 }, // 2 + 2 = 4 > 3 → la 2ª ve disponible 1
          ],
          motivo: 'prueba duplicado',
        }),
        null,
      ),
    ).rejects.toMatchObject({
      fields: { 'lineas.1.cantidad': expect.stringContaining('Máximo devolvible: 1.') },
    });

    expect(await db.return.count()).toBe(0);
    expect(await db.inventoryMovement.count({ where: { tipo: 'DEVOLUCION' } })).toBe(0);
    expect((await db.productVariant.findUniqueOrThrow({ where: { id: variantId } })).stock).toBe(47);
    const folioAfter = (await db.folioCounter.findUniqueOrThrow({ where: folioCounterWhere('D') })).valor;
    expect(folioAfter).toBe(folioBefore);
  });

  it('sobre venta CANCELADA → ValidationError _form', async () => {
    const { saleId, saleLine } = await ventaDe(2);
    await cancelSale(ACTOR, saleId, 'arrepentimiento', null);

    await expect(
      createReturn(ACTOR, returnInput({ saleId, lineas: [{ saleLineId: saleLine.id, cantidad: 1 }] }), null),
    ).rejects.toMatchObject({ fields: { _form: 'Una venta cancelada no admite devoluciones.' } });
    expect(await db.return.count()).toBe(0);
  });

  it('sobre venta inexistente → ValidationError _form', async () => {
    await expect(
      createReturn(ACTOR, returnInput({ saleId: 'no-existe', lineas: [{ saleLineId: 'x', cantidad: 1 }] }), null),
    ).rejects.toMatchObject({ fields: { _form: 'La venta no existe.' } });
  });

  it('saleLineId que no pertenece a la venta → ValidationError por línea', async () => {
    const { saleId } = await ventaDe(3);
    const otra = await ventaDe(1);

    await expect(
      createReturn(
        ACTOR,
        returnInput({ saleId, lineas: [{ saleLineId: otra.saleLine.id, cantidad: 1 }] }),
        null,
      ),
    ).rejects.toMatchObject({ fields: { 'lineas.0.saleLineId': 'La línea no pertenece a esta venta.' } });
    expect(await db.return.count()).toBe(0);
  });

  it('sin caja abierta → ValidationError _form, nada creado', async () => {
    const { saleId, saleLine } = await ventaDe(3);
    await db.cashSession.update({ where: { id: SESSION_ID }, data: { estado: 'CERRADA' } });
    const folioBefore = (await db.folioCounter.findUniqueOrThrow({ where: folioCounterWhere('D') })).valor;

    const err = await createReturn(
      ACTOR,
      returnInput({ saleId, lineas: [{ saleLineId: saleLine.id, cantidad: 1 }] }),
      null,
    ).catch((e) => e);
    expect(err).toBeInstanceOf(ValidationError);
    expect(err.fields).toHaveProperty('_form');

    expect(await db.return.count()).toBe(0);
    expect(await db.inventoryMovement.count({ where: { tipo: 'DEVOLUCION' } })).toBe(0);
    const folioAfter = (await db.folioCounter.findUniqueOrThrow({ where: folioCounterWhere('D') })).valor;
    expect(folioAfter).toBe(folioBefore);
  });

  it('con caja abierta → Return.cashSessionId apunta a la sesión abierta', async () => {
    const { saleId, saleLine } = await ventaDe(3);
    const { id } = await createReturn(
      ACTOR,
      returnInput({ saleId, lineas: [{ saleLineId: saleLine.id, cantidad: 1 }] }),
      null,
    );
    const ret = await db.return.findUniqueOrThrow({ where: { id } });
    expect(ret.cashSessionId).toBe(SESSION_ID);
  });
});

describe('getReturn', () => {
  it('devuelve líneas con productoNombre/varianteNombre y la venta origen; null si no existe', async () => {
    const { saleId, sale, saleLine } = await ventaDe(3, {
      nombreProducto: 'Té Verde',
      nombreVariante: 'Caja 20u',
    });
    const { id } = await createReturn(
      ACTOR,
      returnInput({ saleId, lineas: [{ saleLineId: saleLine.id, cantidad: 2 }], motivo: 'caja rota' }),
      null,
    );

    const detail = await getReturn(id);
    expect(detail).not.toBeNull();
    expect(detail!.ventaId).toBe(saleId);
    expect(detail!.ventaFolio).toBe(sale.folio);
    expect(detail!.cajeroNombre).toBe('Cajero Test');
    expect(detail!.motivo).toBe('caja rota');
    expect(detail!.metodoReembolso).toBe('EFECTIVO');
    expect(typeof detail!.total).toBe('number');
    expect(detail!.total).toBe(232);
    expect(detail!.lines).toHaveLength(1);
    expect(detail!.lines[0]).toMatchObject({
      saleLineId: saleLine.id,
      productoNombre: 'Té Verde',
      varianteNombre: 'Caja 20u',
      cantidad: 2,
      total: 232,
    });
    expect(typeof detail!.lines[0].baseNeta).toBe('number');

    expect(await getReturn('no-existe')).toBeNull();
  });
});

describe('listReturns', () => {
  it('filtra por saleId y rango de fechas; orden createdAt desc; total de count', async () => {
    const a = await ventaDe(5);
    const b = await ventaDe(5);

    const r1 = await createReturn(ACTOR, returnInput({ saleId: a.saleId, lineas: [{ saleLineId: a.saleLine.id, cantidad: 1 }] }), null);
    const r2 = await createReturn(ACTOR, returnInput({ saleId: a.saleId, lineas: [{ saleLineId: a.saleLine.id, cantidad: 1 }] }), null);
    const r3 = await createReturn(ACTOR, returnInput({ saleId: b.saleId, lineas: [{ saleLineId: b.saleLine.id, cantidad: 1 }] }), null);

    await db.return.update({ where: { id: r1.id }, data: { createdAt: new Date('2026-01-10T12:00:00Z') } });
    await db.return.update({ where: { id: r2.id }, data: { createdAt: new Date('2026-06-10T12:00:00Z') } });
    await db.return.update({ where: { id: r3.id }, data: { createdAt: new Date('2026-03-10T12:00:00Z') } });

    // filtro por saleId
    const soloA = await listReturns({ saleId: a.saleId, page: 1, pageSize: 50 });
    expect(soloA.total).toBe(2);
    expect(soloA.rows.map((r) => r.id).sort()).toEqual([r1.id, r2.id].sort());
    expect(soloA.rows[0].ventaFolio).toBe(a.sale.folio);
    expect(soloA.rows[0].cajero).toBe('Cajero Test');
    // orden createdAt desc
    expect(soloA.rows[0].id).toBe(r2.id);
    expect(soloA.rows[0].fecha.getTime()).toBeGreaterThan(soloA.rows[1].fecha.getTime());

    // rango de fechas
    const q1 = await listReturns({
      desde: new Date('2026-01-01T00:00:00Z'),
      hasta: new Date('2026-04-01T00:00:00Z'),
      page: 1,
      pageSize: 50,
    });
    expect(q1.rows.map((r) => r.id).sort()).toEqual([r1.id, r3.id].sort());
    expect(q1.total).toBe(2);

    // total de count, no longitud de página
    const pagina = await listReturns({ page: 1, pageSize: 2 });
    expect(pagina.rows).toHaveLength(2);
    expect(pagina.total).toBe(3);
  });
});
