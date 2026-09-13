import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { db } from '@/lib/db';
import { ValidationError } from '@/lib/errors';
import { computeSale } from './compute';
import { cancelSale, createSale, getSale, listSales, type CreateSaleInput } from './sales';
import { seedCajero, seedVariant, cleanupSales, conCajaAbierta } from './__testutil';

const CAJERO_EMAIL = 'task6-ventas@pos.com';
let ACTOR: string;
let SESSION_ID: string;

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
  await cleanupSales([CAJERO_EMAIL]);
  ACTOR = await seedCajero(CAJERO_EMAIL);
  SESSION_ID = await conCajaAbierta(ACTOR);
});

afterAll(async () => {
  await cleanupSales([CAJERO_EMAIL]);
});

describe('createSale', () => {
  it('venta simple 1 línea: Sale COMPLETADA, stock baja, movimiento VENTA, auditoría, folio V-...', async () => {
    const { variantId } = await seedVariant({ precioVenta: 100, stock: 5 });

    const { id, folio } = await createSale(
      ACTOR,
      saleInput({
        lineas: [{ variantId, cantidad: 2 }],
        pagos: [{ metodo: 'EFECTIVO', monto: 232 }],
      }),
      '127.0.0.1',
    );

    expect(folio).toMatch(/^V-\d{6}$/);

    const sale = await db.sale.findUniqueOrThrow({ where: { id }, include: { lines: true, payments: true } });
    expect(sale.estado).toBe('COMPLETADA');
    expect(Number(sale.subtotal)).toBe(200);
    expect(Number(sale.impuestos)).toBe(32);
    expect(Number(sale.total)).toBe(232);
    expect(Number(sale.pagado)).toBe(232);
    expect(Number(sale.cambio)).toBe(0);
    expect(sale.cajeroId).toBe(ACTOR);
    expect(sale.lines).toHaveLength(1);
    expect(Number(sale.lines[0].total)).toBe(232);
    expect(sale.payments).toHaveLength(1);

    const variant = await db.productVariant.findUniqueOrThrow({ where: { id: variantId } });
    expect(variant.stock).toBe(3);

    const mov = await db.inventoryMovement.findFirstOrThrow({ where: { variantId, tipo: 'VENTA' } });
    expect(mov.referenciaTipo).toBe('venta');
    expect(mov.referenciaId).toBe(id);
    expect(mov.cantidad).toBe(-2);

    const log = await db.activityLog.findFirstOrThrow({ where: { entidadId: id, accion: 'ventas.crear' } });
    const meta = log.metadata as { folio: string; total: number };
    expect(meta.folio).toBe(folio);
    expect(meta.total).toBe(232);
  });

  it('multi-línea tasas mixtas + descuento de línea + descuento de ticket: importes == computeSale', async () => {
    const a = await seedVariant({ precioVenta: 100, stock: 10, tasa: 'default' });
    const b = await seedVariant({ precioVenta: 50, stock: 10, tasa: 'exento' });

    const lineas: CreateSaleInput['lineas'] = [
      { variantId: a.variantId, cantidad: 2, descuento: { tipo: 'monto', valor: 10 } },
      { variantId: b.variantId, cantidad: 3 },
    ];
    const descuentoTicket = { tipo: 'porcentaje' as const, valor: 5 };

    const expected = computeSale({
      lineas: [
        { variantId: a.variantId, cantidad: 2, precioUnitario: 100, tasaImpuesto: a.tasa, descuento: { tipo: 'monto', valor: 10 } },
        { variantId: b.variantId, cantidad: 3, precioUnitario: 50, tasaImpuesto: b.tasa, descuento: null },
      ],
      descuentoTicket,
    });

    const { id } = await createSale(
      ACTOR,
      saleInput({ lineas, descuentoTicket, pagos: [{ metodo: 'EFECTIVO', monto: expected.total }] }),
      null,
    );

    const sale = await db.sale.findUniqueOrThrow({ where: { id }, include: { lines: true } });
    expect(Number(sale.subtotal)).toBe(expected.subtotal);
    expect(Number(sale.descuentoLineas)).toBe(expected.descuentoLineas);
    expect(Number(sale.descuentoTicket)).toBe(expected.descuentoTicket);
    expect(Number(sale.impuestos)).toBe(expected.impuestos);
    expect(Number(sale.total)).toBe(expected.total);

    const byVariant = new Map(sale.lines.map((l) => [l.variantId, l]));
    for (const cl of expected.lineas) {
      const l = byVariant.get(cl.variantId)!;
      expect(Number(l.baseNeta)).toBe(cl.baseNeta);
      expect(Number(l.impuesto)).toBe(cl.impuesto);
      expect(Number(l.total)).toBe(cl.total);
      expect(Number(l.descuentoMonto)).toBe(cl.descuentoLinea);
      expect(Number(l.descuentoTicketProrrateado)).toBe(cl.descuentoTicketProrrateado);
      expect(Number(l.tasaImpuesto)).toBe(cl.tasaImpuesto);
    }
  });

  it('sobrepago en efectivo calcula cambio', async () => {
    const { variantId } = await seedVariant({ precioVenta: 100, stock: 5 });
    const { id } = await createSale(
      ACTOR,
      saleInput({ lineas: [{ variantId, cantidad: 2 }], pagos: [{ metodo: 'EFECTIVO', monto: 300 }] }),
      null,
    );
    const sale = await db.sale.findUniqueOrThrow({ where: { id } });
    expect(Number(sale.pagado)).toBe(300);
    expect(Number(sale.cambio)).toBe(68);
  });

  it('cambio > 0 sin pago EFECTIVO suficiente → ValidationError _form', async () => {
    const { variantId } = await seedVariant({ precioVenta: 100, stock: 5 });
    await expect(
      createSale(
        ACTOR,
        saleInput({ lineas: [{ variantId, cantidad: 2 }], pagos: [{ metodo: 'TARJETA', monto: 300 }] }),
        null,
      ),
    ).rejects.toMatchObject({ fields: { _form: 'El cambio solo se entrega en efectivo.' } });
    expect(await db.sale.count()).toBe(0);
  });

  it('pago insuficiente → ValidationError _form, nada creado, FolioCounter no avanzó', async () => {
    const { variantId } = await seedVariant({ precioVenta: 100, stock: 5 });
    const before = (await db.folioCounter.findUniqueOrThrow({ where: { serie: 'V' } })).valor;

    await expect(
      createSale(
        ACTOR,
        saleInput({ lineas: [{ variantId, cantidad: 2 }], pagos: [{ metodo: 'EFECTIVO', monto: 100 }] }),
        null,
      ),
    ).rejects.toBeInstanceOf(ValidationError);

    expect(await db.sale.count()).toBe(0);
    expect(await db.inventoryMovement.count()).toBe(0);
    const after = (await db.folioCounter.findUniqueOrThrow({ where: { serie: 'V' } })).valor;
    expect(after).toBe(before);
  });

  it('stock insuficiente en 1 de 3 líneas → rollback total, sin Sale ni movimientos', async () => {
    const a = await seedVariant({ precioVenta: 100, stock: 10 });
    const b = await seedVariant({ precioVenta: 100, stock: 10 });
    const c = await seedVariant({ precioVenta: 100, stock: 1 });
    const before = (await db.folioCounter.findUniqueOrThrow({ where: { serie: 'V' } })).valor;

    await expect(
      createSale(
        ACTOR,
        saleInput({
          lineas: [
            { variantId: a.variantId, cantidad: 2 },
            { variantId: b.variantId, cantidad: 2 },
            { variantId: c.variantId, cantidad: 2 },
          ],
          pagos: [{ metodo: 'EFECTIVO', monto: 10000 }],
        }),
        null,
      ),
    ).rejects.toBeInstanceOf(ValidationError);

    expect(await db.sale.count()).toBe(0);
    expect(await db.inventoryMovement.count()).toBe(0);
    expect((await db.productVariant.findUniqueOrThrow({ where: { id: a.variantId } })).stock).toBe(10);
    const after = (await db.folioCounter.findUniqueOrThrow({ where: { serie: 'V' } })).valor;
    expect(after).toBe(before);
  });

  it('variante archivada / producto archivado / disponible:false → ValidationError por línea', async () => {
    const archivada = await seedVariant({ precioVenta: 100, stock: 5, archivada: true });
    await expect(
      createSale(ACTOR, saleInput({ lineas: [{ variantId: archivada.variantId, cantidad: 1 }], pagos: [{ metodo: 'EFECTIVO', monto: 116 }] }), null),
    ).rejects.toMatchObject({ fields: { 'lineas.0.variantId': expect.any(String) } });

    const prodArch = await seedVariant({ precioVenta: 100, stock: 5, productoArchivado: true });
    await expect(
      createSale(ACTOR, saleInput({ lineas: [{ variantId: prodArch.variantId, cantidad: 1 }], pagos: [{ metodo: 'EFECTIVO', monto: 116 }] }), null),
    ).rejects.toMatchObject({ fields: { 'lineas.0.variantId': expect.any(String) } });

    const noDisp = await seedVariant({ precioVenta: 100, stock: 5, disponible: false });
    await expect(
      createSale(ACTOR, saleInput({ lineas: [{ variantId: noDisp.variantId, cantidad: 1 }], pagos: [{ metodo: 'EFECTIVO', monto: 116 }] }), null),
    ).rejects.toMatchObject({ fields: { 'lineas.0.variantId': expect.any(String) } });

    const missing = await createSale(
      ACTOR,
      saleInput({ lineas: [{ variantId: 'no-existe', cantidad: 1 }], pagos: [{ metodo: 'EFECTIVO', monto: 1 }] }),
      null,
    ).catch((e) => e);
    expect(missing).toBeInstanceOf(ValidationError);
    expect(missing.fields).toHaveProperty('lineas.0.variantId');

    expect(await db.sale.count()).toBe(0);
  });

  it('requiereFactura con cliente facturable → datosFiscales snapshot presente y sin RFC en auditoría', async () => {
    const FULL_RFC = 'ABC010101XYZ';
    const startedAt = new Date();
    const { variantId } = await seedVariant({ precioVenta: 100, stock: 5 });
    const cliente = await db.customer.create({
      data: {
        nombre: 'ACME SA',
        rfc: 'ABC010101XYZ',
        razonSocial: 'ACME SA DE CV',
        regimenFiscalCode: '601',
        usoCfdiCode: 'G03',
        cpFiscal: '06000',
      },
    });

    const { id } = await createSale(
      ACTOR,
      saleInput({
        customerId: cliente.id,
        lineas: [{ variantId, cantidad: 1 }],
        pagos: [{ metodo: 'TARJETA', monto: 116 }],
        requiereFactura: true,
      }),
      null,
    );

    const sale = await db.sale.findUniqueOrThrow({ where: { id } });
    expect(sale.requiereFactura).toBe(true);
    const datos = sale.datosFiscales as { rfc: string; razonSocial: string; cpFiscal: string };
    expect(datos.rfc).toBe(FULL_RFC);
    expect(datos.razonSocial).toBe('ACME SA DE CV');
    expect(datos.cpFiscal).toBe('06000');

    // El RFC completo no debe aparecer en NINGUNA fila de auditoría de esta venta:
    // ni en `ventas.crear` (entidadId = sale.id) ni en las `inventario.movimiento`
    // por línea (entidadId = variantId), que la primera query nunca inspecciona.
    const saleRows = await db.activityLog.findMany({ where: { entidadId: id } });
    const movRows = await db.activityLog.findMany({
      where: { accion: 'inventario.movimiento', entidadId: variantId, createdAt: { gte: startedAt } },
    });
    expect(saleRows.some((r) => r.accion === 'ventas.crear')).toBe(true);
    expect(movRows.length).toBeGreaterThan(0);
    for (const r of [...saleRows, ...movRows]) {
      expect(JSON.stringify(r.metadata)).not.toContain(FULL_RFC);
    }
  });

  it('requiereFactura con cliente genérico o sin bloque fiscal → ValidationError _form', async () => {
    const { variantId } = await seedVariant({ precioVenta: 100, stock: 5 });

    await expect(
      createSale(
        ACTOR,
        saleInput({
          lineas: [{ variantId, cantidad: 1 }],
          pagos: [{ metodo: 'TARJETA', monto: 116 }],
          requiereFactura: true,
        }),
        null,
      ),
    ).rejects.toMatchObject({ fields: { _form: 'El cliente no tiene datos de facturación completos.' } });

    const incompleto = await db.customer.create({ data: { nombre: 'Sin Fiscal', rfc: 'ABC010101XYZ' } });
    await expect(
      createSale(
        ACTOR,
        saleInput({
          customerId: incompleto.id,
          lineas: [{ variantId, cantidad: 1 }],
          pagos: [{ metodo: 'TARJETA', monto: 116 }],
          requiereFactura: true,
        }),
        null,
      ),
    ).rejects.toMatchObject({ fields: { _form: expect.any(String) } });

    expect(await db.sale.count()).toBe(0);
  });

  it('customerId omitido usa el cliente Público en General', async () => {
    const { variantId } = await seedVariant({ precioVenta: 100, stock: 5 });
    const generico = await db.customer.findFirstOrThrow({ where: { esGenerico: true } });

    const { id } = await createSale(
      ACTOR,
      saleInput({ lineas: [{ variantId, cantidad: 1 }], pagos: [{ metodo: 'EFECTIVO', monto: 116 }] }),
      null,
    );

    const sale = await db.sale.findUniqueOrThrow({ where: { id } });
    expect(sale.customerId).toBe(generico.id);
    // Sin factura → sin snapshot fiscal: NULL real de SQL, no `jsonb 'null'`.
    expect(sale.datosFiscales).toBeNull();
    expect((await getSale(id))!.datosFiscales).toBeNull();
  });

  it('customerId inexistente → ValidationError({ customerId }); nada creado, FolioCounter.V intacto', async () => {
    const { variantId } = await seedVariant({ precioVenta: 100, stock: 5 });
    const before = (await db.folioCounter.findUniqueOrThrow({ where: { serie: 'V' } })).valor;

    await expect(
      createSale(
        ACTOR,
        saleInput({
          customerId: 'no-existe-xyz',
          lineas: [{ variantId, cantidad: 1 }],
          pagos: [{ metodo: 'EFECTIVO', monto: 116 }],
        }),
        null,
      ),
    ).rejects.toMatchObject({ fields: { customerId: expect.any(String) } });

    expect(await db.sale.count()).toBe(0);
    expect(await db.inventoryMovement.count()).toBe(0);
    const after = (await db.folioCounter.findUniqueOrThrow({ where: { serie: 'V' } })).valor;
    expect(after).toBe(before);
  });

  it('sin caja abierta → ValidationError _form, nada creado, FolioCounter.V intacto', async () => {
    const { variantId } = await seedVariant({ precioVenta: 100, stock: 5 });
    await db.cashSession.update({ where: { id: SESSION_ID }, data: { estado: 'CERRADA' } });
    const before = (await db.folioCounter.findUniqueOrThrow({ where: { serie: 'V' } })).valor;

    const err = await createSale(
      ACTOR,
      saleInput({ lineas: [{ variantId, cantidad: 1 }], pagos: [{ metodo: 'EFECTIVO', monto: 116 }] }),
      null,
    ).catch((e) => e);
    expect(err).toBeInstanceOf(ValidationError);
    expect(err.fields).toHaveProperty('_form');

    expect(await db.sale.count()).toBe(0);
    expect(await db.inventoryMovement.count()).toBe(0);
    const after = (await db.folioCounter.findUniqueOrThrow({ where: { serie: 'V' } })).valor;
    expect(after).toBe(before);
  });

  it('con caja abierta → Sale.cashSessionId apunta a la sesión abierta', async () => {
    const { variantId } = await seedVariant({ precioVenta: 100, stock: 5 });
    const { id } = await createSale(
      ACTOR,
      saleInput({ lineas: [{ variantId, cantidad: 1 }], pagos: [{ metodo: 'EFECTIVO', monto: 116 }] }),
      null,
    );
    const sale = await db.sale.findUniqueOrThrow({ where: { id } });
    expect(sale.cashSessionId).toBe(SESSION_ID);
  });
});

describe('getSale', () => {
  it('devuelve null si no existe', async () => {
    expect(await getSale('no-existe')).toBeNull();
  });

  it('devuelve desglose y devuelto:{} para una venta sin devoluciones', async () => {
    const { variantId } = await seedVariant({ precioVenta: 100, stock: 5, nombreProducto: 'Café Molido' });
    const { id, folio } = await createSale(
      ACTOR,
      saleInput({
        lineas: [{ variantId, cantidad: 2 }],
        pagos: [{ metodo: 'EFECTIVO', monto: 232 }],
      }),
      null,
    );

    const detail = await getSale(id);
    expect(detail).not.toBeNull();
    expect(detail!.folio).toBe(folio);
    expect(detail!.estado).toBe('COMPLETADA');
    expect(detail!.total).toBe(232);
    expect(detail!.subtotal).toBe(200);
    expect(detail!.impuestos).toBe(32);
    expect(detail!.pagado).toBe(232);
    expect(detail!.cambio).toBe(0);
    expect(typeof detail!.total).toBe('number');
    expect(detail!.clienteNombre).toBe('Público en General');
    expect(detail!.cajeroNombre).toBe('Cajero Test');
    expect(detail!.canceladaPorNombre ?? null).toBeNull();
    expect(detail!.lines).toHaveLength(1);
    expect(detail!.lines[0].productoNombre).toBe('Café Molido');
    expect(detail!.lines[0].total).toBe(232);
    expect(detail!.payments).toEqual([{ metodo: 'EFECTIVO', monto: 232 }]);
    expect(detail!.returns).toEqual([]);
    expect(detail!.devuelto).toEqual({});
  });
});

const DIA_MS = 24 * 60 * 60 * 1000;

describe('cancelSale', () => {
  it('mismo día: CANCELADA, stock reintegrado (movimientos DEVOLUCION), auditoría ventas.cancelar; Payment intacto', async () => {
    const { variantId } = await seedVariant({ precioVenta: 100, stock: 5 });
    const { id, folio } = await createSale(
      ACTOR,
      saleInput({
        lineas: [{ variantId, cantidad: 2 }],
        pagos: [{ metodo: 'EFECTIVO', monto: 232 }],
      }),
      null,
    );
    expect((await db.productVariant.findUniqueOrThrow({ where: { id: variantId } })).stock).toBe(3);

    await cancelSale(ACTOR, id, '  Cliente se arrepintió  ', '10.0.0.1');

    const sale = await db.sale.findUniqueOrThrow({ where: { id } });
    expect(sale.estado).toBe('CANCELADA');
    expect(sale.canceladaPorId).toBe(ACTOR);
    expect(sale.canceladaEn).toBeInstanceOf(Date);
    expect(sale.motivoCancelacion).toBe('Cliente se arrepintió');

    expect((await db.productVariant.findUniqueOrThrow({ where: { id: variantId } })).stock).toBe(5);

    const mov = await db.inventoryMovement.findFirstOrThrow({
      where: { variantId, tipo: 'DEVOLUCION', referenciaId: id },
    });
    expect(mov.referenciaTipo).toBe('venta');
    expect(mov.cantidad).toBe(2);

    const log = await db.activityLog.findFirstOrThrow({
      where: { entidadId: id, accion: 'ventas.cancelar' },
    });
    const meta = log.metadata as { folio: string; total: number; motivo: string };
    expect(meta.folio).toBe(folio);
    expect(meta.total).toBe(232);
    expect(meta.motivo).toBe('Cliente se arrepintió');

    expect(await db.payment.count({ where: { saleId: id } })).toBe(1);
  });

  it('venta con createdAt de hace 2 días pero sesión ABIERTA → cancelSale procede', async () => {
    const { variantId } = await seedVariant({ precioVenta: 100, stock: 5 });
    const { id } = await createSale(
      ACTOR,
      saleInput({ lineas: [{ variantId, cantidad: 2 }], pagos: [{ metodo: 'EFECTIVO', monto: 232 }] }),
      null,
    );
    await db.sale.update({ where: { id }, data: { createdAt: new Date(Date.now() - 2 * DIA_MS) } });

    await cancelSale(ACTOR, id, 'motivo', null);

    const sale = await db.sale.findUniqueOrThrow({ where: { id } });
    expect(sale.estado).toBe('CANCELADA');
    expect((await db.productVariant.findUniqueOrThrow({ where: { id: variantId } })).stock).toBe(5);
    expect(await db.inventoryMovement.count({ where: { tipo: 'DEVOLUCION', referenciaId: id } })).toBe(1);
  });

  it('sesión de la venta ya CERRADA → ValidationError _form; nada cambia', async () => {
    const { variantId } = await seedVariant({ precioVenta: 100, stock: 5 });
    const { id } = await createSale(
      ACTOR,
      saleInput({ lineas: [{ variantId, cantidad: 2 }], pagos: [{ metodo: 'EFECTIVO', monto: 232 }] }),
      null,
    );
    await db.cashSession.update({ where: { id: SESSION_ID }, data: { estado: 'CERRADA' } });

    await expect(cancelSale(ACTOR, id, 'motivo', null)).rejects.toMatchObject({
      fields: { _form: 'La caja de esta venta ya se cerró; registra una devolución.' },
    });

    const sale = await db.sale.findUniqueOrThrow({ where: { id } });
    expect(sale.estado).toBe('COMPLETADA');
    expect(sale.canceladaEn).toBeNull();
    expect((await db.productVariant.findUniqueOrThrow({ where: { id: variantId } })).stock).toBe(3);
    expect(await db.inventoryMovement.count({ where: { tipo: 'DEVOLUCION' } })).toBe(0);
  });

  it('venta con una devolución previa → ValidationError _form tiene devoluciones', async () => {
    const { variantId } = await seedVariant({ precioVenta: 100, stock: 5 });
    const { id } = await createSale(
      ACTOR,
      saleInput({ lineas: [{ variantId, cantidad: 2 }], pagos: [{ metodo: 'EFECTIVO', monto: 232 }] }),
      null,
    );
    await db.return.create({
      data: {
        folio: 'D-000999',
        saleId: id,
        subtotal: 0,
        impuestos: 0,
        total: 0,
        metodoReembolso: 'EFECTIVO',
        motivo: 'x',
        cajeroId: ACTOR,
      },
    });

    await expect(cancelSale(ACTOR, id, 'motivo', null)).rejects.toMatchObject({
      fields: { _form: 'La venta tiene devoluciones; no se puede cancelar.' },
    });
    expect((await db.sale.findUniqueOrThrow({ where: { id } })).estado).toBe('COMPLETADA');
  });

  it('venta no existente → ValidationError _form', async () => {
    await expect(cancelSale(ACTOR, 'no-existe', 'motivo', null)).rejects.toMatchObject({
      fields: { _form: 'La venta no existe.' },
    });
  });

  it('estado != COMPLETADA (ya CANCELADA) → ValidationError', async () => {
    const { variantId } = await seedVariant({ precioVenta: 100, stock: 5 });
    const { id } = await createSale(
      ACTOR,
      saleInput({ lineas: [{ variantId, cantidad: 2 }], pagos: [{ metodo: 'EFECTIVO', monto: 232 }] }),
      null,
    );
    await cancelSale(ACTOR, id, 'primera', null);

    await expect(cancelSale(ACTOR, id, 'segunda', null)).rejects.toMatchObject({
      fields: { _form: 'Solo se puede cancelar una venta completada.' },
    });
  });

  it('motivo vacío → ValidationError({ motivo })', async () => {
    const { variantId } = await seedVariant({ precioVenta: 100, stock: 5 });
    const { id } = await createSale(
      ACTOR,
      saleInput({ lineas: [{ variantId, cantidad: 1 }], pagos: [{ metodo: 'EFECTIVO', monto: 116 }] }),
      null,
    );

    await expect(cancelSale(ACTOR, id, '  ', null)).rejects.toMatchObject({
      fields: { motivo: 'Indica el motivo.' },
    });
    expect((await db.sale.findUniqueOrThrow({ where: { id } })).estado).toBe('COMPLETADA');
  });
});

describe('listSales', () => {
  async function nuevaVenta(over: Partial<CreateSaleInput> = {}) {
    const { variantId } = await seedVariant({ precioVenta: 100, stock: 50 });
    return createSale(
      ACTOR,
      saleInput({
        lineas: [{ variantId, cantidad: 1 }],
        pagos: [{ metodo: 'EFECTIVO', monto: 116 }],
        ...over,
      }),
      null,
    );
  }

  it('filtro estado: COMPLETADA / CANCELADA / todas', async () => {
    const completada = await nuevaVenta();
    const cancelada = await nuevaVenta();
    await cancelSale(ACTOR, cancelada.id, 'motivo', null);

    const soloComp = await listSales({ estado: 'COMPLETADA', page: 1, pageSize: 50 });
    expect(soloComp.rows.map((r) => r.id)).toEqual([completada.id]);

    const soloCanc = await listSales({ estado: 'CANCELADA', page: 1, pageSize: 50 });
    expect(soloCanc.rows.map((r) => r.id)).toEqual([cancelada.id]);

    const todas = await listSales({ estado: 'todas', page: 1, pageSize: 50 });
    expect(todas.rows.map((r) => r.id).sort()).toEqual([completada.id, cancelada.id].sort());

    const sinFiltro = await listSales({ page: 1, pageSize: 50 });
    expect(sinFiltro.total).toBe(2);
  });

  it('filtro cajeroId', async () => {
    const { id } = await nuevaVenta();

    const propio = await listSales({ cajeroId: ACTOR, page: 1, pageSize: 50 });
    expect(propio.rows.map((r) => r.id)).toEqual([id]);
    expect(propio.rows[0].cajero).toBe('Cajero Test');

    const ajeno = await listSales({ cajeroId: 'otro-cajero', page: 1, pageSize: 50 });
    expect(ajeno.rows).toEqual([]);
    expect(ajeno.total).toBe(0);
  });

  it('filtro rango de fechas desde/hasta', async () => {
    const enero = await nuevaVenta();
    const junio = await nuevaVenta();
    await db.sale.update({ where: { id: enero.id }, data: { createdAt: new Date('2026-01-10T12:00:00Z') } });
    await db.sale.update({ where: { id: junio.id }, data: { createdAt: new Date('2026-06-10T12:00:00Z') } });

    const q1 = await listSales({
      desde: new Date('2026-01-01T00:00:00Z'),
      hasta: new Date('2026-03-01T00:00:00Z'),
      page: 1,
      pageSize: 50,
    });
    expect(q1.rows.map((r) => r.id)).toEqual([enero.id]);
    expect(q1.total).toBe(1);

    const soloDesde = await listSales({ desde: new Date('2026-05-01T00:00:00Z'), page: 1, pageSize: 50 });
    expect(soloDesde.rows.map((r) => r.id)).toEqual([junio.id]);
  });

  it('q por folio (prefijo) y por nombre de cliente', async () => {
    const cliente = await db.customer.create({ data: { nombre: 'Distribuidora Zafiro' } });
    const { variantId } = await seedVariant({ precioVenta: 100, stock: 50 });
    const conCliente = await createSale(
      ACTOR,
      saleInput({
        customerId: cliente.id,
        lineas: [{ variantId, cantidad: 1 }],
        pagos: [{ metodo: 'EFECTIVO', monto: 116 }],
      }),
      null,
    );
    const otra = await nuevaVenta();

    const porFolio = await listSales({ q: conCliente.folio, page: 1, pageSize: 50 });
    expect(porFolio.rows.map((r) => r.id)).toEqual([conCliente.id]);

    const porNombre = await listSales({ q: 'zafiro', page: 1, pageSize: 50 });
    expect(porNombre.rows.map((r) => r.id)).toEqual([conCliente.id]);
    expect(porNombre.rows[0].cliente).toBe('Distribuidora Zafiro');

    const ambas = await listSales({ page: 1, pageSize: 50 });
    expect(ambas.rows.map((r) => r.id).sort()).toEqual([conCliente.id, otra.id].sort());
  });

  it('orden createdAt desc; total = count(where) no la longitud de página', async () => {
    const creadas: string[] = [];
    for (let i = 0; i < 3; i++) {
      const { id } = await nuevaVenta();
      // createdAt distinto y creciente para un orden determinista
      await db.sale.update({
        where: { id },
        data: { createdAt: new Date(`2026-02-0${i + 1}T12:00:00Z`) },
      });
      creadas.push(id);
    }

    const pagina = await listSales({ page: 1, pageSize: 2 });
    expect(pagina.rows).toHaveLength(2);
    expect(pagina.total).toBe(3);
    expect(pagina.rows[0].fecha.getTime()).toBeGreaterThan(pagina.rows[1].fecha.getTime());
    expect(pagina.rows[0].id).toBe(creadas[2]);

    const pagina2 = await listSales({ page: 2, pageSize: 2 });
    expect(pagina2.rows).toHaveLength(1);
    expect(pagina2.total).toBe(3);
    expect(pagina2.rows[0].id).toBe(creadas[0]);

    expect(pagina.rows[0]).toMatchObject({
      folio: expect.stringMatching(/^V-\d{6}$/),
      cliente: 'Público en General',
      cajero: 'Cajero Test',
      nLineas: 1,
      total: 116,
      estado: 'COMPLETADA',
    });
  });
});
