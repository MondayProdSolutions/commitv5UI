import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { db } from '@/lib/db';
import { createSale } from '@/lib/sales/sales';
import { createReturn } from '@/lib/sales/returns';
import { seedCajero, seedVariant, cleanupSales, conCajaAbierta } from '@/lib/sales/__testutil';
import { getCustomersReport } from './clientes';
import type { ReportPeriod } from './period';

const CAJERO_EMAIL = 't8-reportes-clientes@pos.com';
const EMAILS = [CAJERO_EMAIL];

const PERIODO_AMPLIO: ReportPeriod = {
  desde: new Date('2000-01-01T00:00:00Z'),
  hasta: new Date('2100-01-01T00:00:00Z'),
  etiqueta: 'test',
};

let CAJERO: string;

async function limpiarClientes() {
  await db.customer.deleteMany({ where: { nombre: { startsWith: 'T8ReportesCliente' } } });
}

beforeEach(async () => {
  await cleanupSales(EMAILS);
  await limpiarClientes();
  CAJERO = await seedCajero(CAJERO_EMAIL);
  await conCajaAbierta(CAJERO);
});

afterAll(async () => {
  await cleanupSales(EMAILS);
  await limpiarClientes();
});

describe('getCustomersReport', () => {
  it('escenario compuesto: monto neto por cliente, genérico excluido y reportado aparte, cliente nuevo', async () => {
    const cliente = await db.customer.create({ data: { nombre: 'T8ReportesCliente Ana' } });
    const generico = await db.customer.findFirstOrThrow({ where: { esGenerico: true } });
    const { variantId } = await seedVariant({ precioVenta: 100, stock: 20 });

    // Ana compra 2 uds (232.00), luego devuelve la venta completa (232.00) → montoNeto 0, sigue contando como "activa" (tuvo una compra).
    const ventaAna = await createSale(
      CAJERO,
      { customerId: cliente.id, lineas: [{ variantId, cantidad: 2 }], descuentoTicket: null, pagos: [{ metodo: 'EFECTIVO', monto: 232 }], requiereFactura: false },
      null,
    );
    const lineaAna = (await db.sale.findUniqueOrThrow({ where: { id: ventaAna.id }, include: { lines: true } })).lines[0];
    await createReturn(
      CAJERO,
      { saleId: ventaAna.id, lineas: [{ saleLineId: lineaAna.id, cantidad: 2 }], metodoReembolso: 'EFECTIVO', motivo: 'Prueba de reporte' },
      null,
    );
    // Ana compra de nuevo, 1 ud (116.00) sin devolver.
    await createSale(
      CAJERO,
      { customerId: cliente.id, lineas: [{ variantId, cantidad: 1 }], descuentoTicket: null, pagos: [{ metodo: 'EFECTIVO', monto: 116 }], requiereFactura: false },
      null,
    );
    // Venta al cliente genérico (Público en general): 1 ud (116.00).
    await createSale(
      CAJERO,
      { customerId: generico.id, lineas: [{ variantId, cantidad: 1 }], descuentoTicket: null, pagos: [{ metodo: 'EFECTIVO', monto: 116 }], requiereFactura: false },
      null,
    );

    const r = await getCustomersReport(PERIODO_AMPLIO);

    const filaAna = r.detalle.find((c) => c.customerId === cliente.id);
    // montoNeto: (232−232) + 116 = 116; compras: 2; ticketPromedio bruto: (232+116)/2=174.
    expect(filaAna).toMatchObject({ compras: 2, montoNeto: 116, ticketPromedio: 174 });
    expect(r.detalle.some((c) => c.customerId === generico.id)).toBe(false); // genérico excluido
    expect(r.genericoResumen).toMatchObject({ ventas: 1, monto: 116 });
    expect(r.kpis.clientesActivos).toBeGreaterThanOrEqual(1);
    expect(r.kpis.clientesNuevos).toBeGreaterThanOrEqual(1); // Ana se creó "ahora", cae en el período amplio
  });

  it('un cliente nuevo fuera del período no cuenta en clientesNuevos', async () => {
    const cliente = await db.customer.create({ data: { nombre: 'T8ReportesCliente Vieja' } });
    await db.customer.update({ where: { id: cliente.id }, data: { createdAt: new Date('1990-01-01T00:00:00Z') } });

    const periodoActual: ReportPeriod = { desde: new Date(Date.now() - 3600_000), hasta: new Date(Date.now() + 3600_000), etiqueta: 'test' };
    const r = await getCustomersReport(periodoActual);
    expect(r.kpis.clientesNuevos).toBe(0);
  });

  it('período sin actividad devuelve ceros y arrays vacíos', async () => {
    const periodoVacio: ReportPeriod = {
      desde: new Date('1990-01-01T00:00:00Z'),
      hasta: new Date('1990-01-02T00:00:00Z'),
      etiqueta: 'test',
    };
    const r = await getCustomersReport(periodoVacio);
    expect(r.kpis).toMatchObject({ clientesActivos: 0, clientesNuevos: 0, ticketPromedio: 0 });
    expect(r.detalle).toEqual([]);
    expect(r.topClientes).toEqual([]);
    expect(r.genericoResumen).toMatchObject({ ventas: 0, monto: 0 });
  });
});
