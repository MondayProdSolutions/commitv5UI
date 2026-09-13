import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { db } from '@/lib/db';
import { createSale } from '@/lib/sales/sales';
import { createReturn } from '@/lib/sales/returns';
import { seedCajero, seedVariant, cleanupSales, conCajaAbierta } from '@/lib/sales/__testutil';
import { getMarginReport } from './margen';
import type { ReportPeriod } from './period';

const CAJERO_EMAIL = 't7-reportes-margen@pos.com';
const EMAILS = [CAJERO_EMAIL];

const PERIODO_AMPLIO: ReportPeriod = {
  desde: new Date('2000-01-01T00:00:00Z'),
  hasta: new Date('2100-01-01T00:00:00Z'),
  etiqueta: 'test',
};

let CAJERO: string;

beforeEach(async () => {
  await cleanupSales(EMAILS);
  CAJERO = await seedCajero(CAJERO_EMAIL);
  await conCajaAbierta(CAJERO);
});

afterAll(async () => {
  await cleanupSales(EMAILS);
});

describe('getMarginReport', () => {
  it('escenario compuesto: utilidad neta de devolución, costo actual, % margen', async () => {
    // precioVenta 100 (neto), precioCompra 60 → margen unitario neto 40 (100−60), IVA no entra en el costo.
    const { variantId } = await seedVariant({ precioVenta: 100, stock: 20, tasa: 'default' });
    await db.productVariant.update({ where: { id: variantId }, data: { precioCompra: 60 } });

    // Venta de 3 uds: ingreso neto de línea = 3×100=300 (base, sin IVA); costo = 3×60=180; utilidad bruta 120.
    const venta = await createSale(
      CAJERO,
      { customerId: null, lineas: [{ variantId, cantidad: 3 }], descuentoTicket: null, pagos: [{ metodo: 'EFECTIVO', monto: 348 }], requiereFactura: false },
      null,
    );
    const saleLineId = (await db.sale.findUniqueOrThrow({ where: { id: venta.id }, include: { lines: true } })).lines[0].id;
    // Devuelve 1 de las 3 uds: resta 1×100=100 de ingreso y 1×60=60 de costo (unidadesNetas=2, ingresoNeto=200, costo=120, utilidad=80).
    await createReturn(
      CAJERO,
      { saleId: venta.id, lineas: [{ saleLineId, cantidad: 1 }], metodoReembolso: 'EFECTIVO', motivo: 'Prueba de reporte' },
      null,
    );

    const r = await getMarginReport(PERIODO_AMPLIO);

    const linea = r.detalle.find((d) => d.variantId === variantId);
    expect(linea).toMatchObject({ unidades: 2, ingreso: 200, costo: 120, utilidad: 80, margenPct: 40 });
    expect(r.kpis.utilidadTotal).toBeGreaterThanOrEqual(80);
    expect(r.kpis.productoMasRentable).toBe(linea?.nombre);
  });

  it('período sin actividad devuelve ceros y arrays vacíos', async () => {
    const periodoVacio: ReportPeriod = {
      desde: new Date('1990-01-01T00:00:00Z'),
      hasta: new Date('1990-01-02T00:00:00Z'),
      etiqueta: 'test',
    };
    const r = await getMarginReport(periodoVacio);
    expect(r.kpis).toMatchObject({ utilidadTotal: 0, margenPromedio: 0, productoMasRentable: null });
    expect(r.detalle).toEqual([]);
    expect(r.topUtilidad).toEqual([]);
  });
});
