import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { db } from '@/lib/db';
import { createSale, cancelSale } from '@/lib/sales/sales';
import { createReturn } from '@/lib/sales/returns';
import { seedCajero, seedVariant, cleanupSales, conCajaAbierta } from '@/lib/sales/__testutil';
import { getSalesReport } from './ventas';
import type { ReportPeriod } from './period';

const CAJERO_A_EMAIL = 't6-reportes-ventas-a@pos.com';
const CAJERO_B_EMAIL = 't6-reportes-ventas-b@pos.com';
const EMAILS = [CAJERO_A_EMAIL, CAJERO_B_EMAIL];

const PERIODO_AMPLIO: ReportPeriod = {
  desde: new Date('2000-01-01T00:00:00Z'),
  hasta: new Date('2100-01-01T00:00:00Z'),
  etiqueta: 'test',
};

let CAJERO_A: string;
let CAJERO_B: string;

beforeEach(async () => {
  await cleanupSales(EMAILS);
  CAJERO_A = await seedCajero(CAJERO_A_EMAIL);
  CAJERO_B = await seedCajero(CAJERO_B_EMAIL);
  await conCajaAbierta(CAJERO_A);
});

afterAll(async () => {
  await cleanupSales(EMAILS);
});

describe('getSalesReport', () => {
  it('escenario compuesto: KPIs, cobros por método, top productos, por cajero — canceladas y devoluciones excluidas/netas', async () => {
    const { variantId } = await seedVariant({ precioVenta: 100, stock: 50 }); // IVA 16% → 1 ud = 116.00

    // 2 ventas EFECTIVO exacto de CAJERO_A: 2 uds (232.00) + 1 ud (116.00).
    await createSale(
      CAJERO_A,
      { customerId: null, lineas: [{ variantId, cantidad: 2 }], descuentoTicket: null, pagos: [{ metodo: 'EFECTIVO', monto: 232 }], requiereFactura: false },
      null,
    );
    await createSale(
      CAJERO_A,
      { customerId: null, lineas: [{ variantId, cantidad: 1 }], descuentoTicket: null, pagos: [{ metodo: 'EFECTIVO', monto: 116 }], requiereFactura: false },
      null,
    );
    // 1 venta TARJETA de CAJERO_B: 1 ud (116.00).
    const ventaTarjeta = await createSale(
      CAJERO_B,
      { customerId: null, lineas: [{ variantId, cantidad: 1 }], descuentoTicket: null, pagos: [{ metodo: 'TARJETA', monto: 116 }], requiereFactura: false },
      null,
    );
    // Devolución total de la venta con tarjeta: 1 ud, reembolso EFECTIVO 116.00 (aunque se cobró con tarjeta, el reembolso puede ser en otro método).
    await createReturn(
      CAJERO_A,
      { saleId: ventaTarjeta.id, lineas: [{ saleLineId: (await db.sale.findUniqueOrThrow({ where: { id: ventaTarjeta.id }, include: { lines: true } })).lines[0].id, cantidad: 1 }], metodoReembolso: 'EFECTIVO', motivo: 'Producto defectuoso' },
      null,
    );
    // 1 venta cancelada de CAJERO_A: 1 ud (116.00) — NO debe contar en nada.
    const ventaCancelada = await createSale(
      CAJERO_A,
      { customerId: null, lineas: [{ variantId, cantidad: 1 }], descuentoTicket: null, pagos: [{ metodo: 'EFECTIVO', monto: 116 }], requiereFactura: false },
      null,
    );
    await cancelSale(CAJERO_A, ventaCancelada.id, 'Prueba de reporte', null);

    const r = await getSalesReport(PERIODO_AMPLIO);

    // KPIs: 3 ventas completadas (232+116+116=464 bruto), 1 cancelada,
    // devoluciones 116, neto 348, ticket promedio 464/3=154.67,
    // IVA bruto 32+16+16=64, IVA devuelto 16, neto 48. Descuentos 0.
    expect(r.kpis.ventasCompletadas).toBe(3);
    expect(r.kpis.ventasCanceladas).toBe(1);
    expect(r.kpis.ingresoNeto).toBe(348);
    expect(r.kpis.ticketPromedio).toBe(154.67);
    expect(r.kpis.ivaTotal).toBe(48);
    expect(r.kpis.descuentosTotal).toBe(0);

    // Cobros por método: EFECTIVO 232+116=348 (las 2 ventas en efectivo, el
    // reembolso NO se resta aquí — es un flujo aparte); TARJETA 116.
    const efectivo = r.cobrosPorMetodo.find((c) => c.metodo === 'EFECTIVO');
    const tarjeta = r.cobrosPorMetodo.find((c) => c.metodo === 'TARJETA');
    expect(efectivo?.monto).toBe(348);
    expect(tarjeta?.monto).toBe(116);

    // Top productos: única variante, cantidad neta 2+1+1−1=3, ingreso neto 232+116+116−116=348.
    expect(r.topProductos).toHaveLength(1);
    expect(r.topProductos[0]).toMatchObject({ variantId, cantidad: 3, ingreso: 348 });

    // Por cajero: A vendió 2 ventas (232+116=348, bruto sin netear), B vendió 1 (116).
    const porA = r.porCajero.find((c) => c.cajeroId === CAJERO_A);
    const porB = r.porCajero.find((c) => c.cajeroId === CAJERO_B);
    expect(porA).toMatchObject({ ventas: 2, ingreso: 348 });
    expect(porB).toMatchObject({ ventas: 1, ingreso: 116 });

    // Tendencia diaria: todo ocurrió "hoy" (mismo día MX) → 1 solo renglón.
    expect(r.tendenciaDiaria).toHaveLength(1);
    expect(r.tendenciaDiaria[0]).toMatchObject({ ventas: 3, ingresoBruto: 464, devoluciones: 116, ingresoNeto: 348, iva: 48 });
  });

  it('agrupa la tendencia diaria en 2 renglones cuando hay ventas de días MX distintos', async () => {
    const { variantId } = await seedVariant({ precioVenta: 100, stock: 10 });
    const venta = await createSale(
      CAJERO_A,
      { customerId: null, lineas: [{ variantId, cantidad: 1 }], descuentoTicket: null, pagos: [{ metodo: 'EFECTIVO', monto: 116 }], requiereFactura: false },
      null,
    );
    // Fuerza esta venta a un día MX distinto (ayer) para probar el bucketing.
    await db.sale.update({ where: { id: venta.id }, data: { createdAt: new Date('2020-01-01T18:00:00Z') } });
    await createSale(
      CAJERO_A,
      { customerId: null, lineas: [{ variantId, cantidad: 1 }], descuentoTicket: null, pagos: [{ metodo: 'EFECTIVO', monto: 116 }], requiereFactura: false },
      null,
    );

    const r = await getSalesReport(PERIODO_AMPLIO);
    expect(r.tendenciaDiaria).toHaveLength(2);
    expect(r.tendenciaDiaria[0].fecha < r.tendenciaDiaria[1].fecha).toBe(true); // orden cronológico
  });

  it('período sin actividad devuelve ceros y arrays vacíos, sin error', async () => {
    const periodoVacio: ReportPeriod = {
      desde: new Date('1990-01-01T00:00:00Z'),
      hasta: new Date('1990-01-02T00:00:00Z'),
      etiqueta: 'test',
    };
    const r = await getSalesReport(periodoVacio);
    expect(r.kpis).toMatchObject({ ventasCompletadas: 0, ventasCanceladas: 0, ingresoNeto: 0, ticketPromedio: 0, ivaTotal: 0, descuentosTotal: 0 });
    expect(r.tendenciaDiaria).toEqual([]);
    expect(r.topProductos).toEqual([]);
    expect(r.porCajero).toEqual([]);
  });

  it('un registro fuera del período no se cuenta', async () => {
    const { variantId } = await seedVariant({ precioVenta: 100, stock: 10 });
    const venta = await createSale(
      CAJERO_A,
      { customerId: null, lineas: [{ variantId, cantidad: 1 }], descuentoTicket: null, pagos: [{ metodo: 'EFECTIVO', monto: 116 }], requiereFactura: false },
      null,
    );
    await db.sale.update({ where: { id: venta.id }, data: { createdAt: new Date('1990-01-01T00:00:00Z') } });

    const periodoActual: ReportPeriod = { desde: new Date(Date.now() - 3600_000), hasta: new Date(Date.now() + 3600_000), etiqueta: 'test' };
    const r = await getSalesReport(periodoActual);
    expect(r.kpis.ventasCompletadas).toBe(0);
  });
});
