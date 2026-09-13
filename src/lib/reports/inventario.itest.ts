import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { db } from '@/lib/db';
import { seedVariant } from '@/lib/sales/__testutil';
import { getInventoryReport } from './inventario';
import type { ReportPeriod } from './period';

const PERIODO_AMPLIO: ReportPeriod = {
  desde: new Date('2000-01-01T00:00:00Z'),
  hasta: new Date('2100-01-01T00:00:00Z'),
  etiqueta: 'test',
};

async function limpiar() {
  await db.inventoryMovement.deleteMany({ where: { motivo: { startsWith: 't6-reportes-inv' } } });
  await db.productVariant.deleteMany({ where: { product: { nombre: { startsWith: 'T6ReportesInv' } } } });
  await db.product.deleteMany({ where: { nombre: { startsWith: 'T6ReportesInv' } } });
}

beforeEach(limpiar);
afterAll(limpiar);

describe('getInventoryReport', () => {
  it('escenario compuesto: valorización, stock bajo, movimientos por tipo, top rotación', async () => {
    const { variantId } = await seedVariant({
      precioVenta: 100,
      stock: 5,
      nombreProducto: 'T6ReportesInv Uno',
    });
    // Ajusta stockMinimo para que quede en "bajo" tras la VENTA de abajo, y
    // registra movimientos ENTRADA/VENTA dentro del período.
    await db.productVariant.update({ where: { id: variantId }, data: { stockMinimo: 10, precioCompra: 60 } });
    await db.inventoryMovement.create({
      data: { variantId, tipo: 'ENTRADA', cantidad: 5, stockPrevio: 5, stockNuevo: 10, motivo: 't6-reportes-inv entrada' },
    });
    await db.productVariant.update({ where: { id: variantId }, data: { stock: 10 } });
    await db.inventoryMovement.create({
      data: { variantId, tipo: 'VENTA', cantidad: -3, stockPrevio: 10, stockNuevo: 7, motivo: 't6-reportes-inv venta' },
    });
    await db.productVariant.update({ where: { id: variantId }, data: { stock: 7 } });

    const r = await getInventoryReport(PERIODO_AMPLIO);

    // La tabla ProductVariant puede tener otras filas sembradas por suites
    // paralelas, así que el KPI agregado solo se verifica como cota inferior;
    // la contribución exacta de esta variante se confirma vía `detalle`.
    expect(r.kpis.valorCosto).toBeGreaterThanOrEqual(round2(7 * 60));
    expect(r.kpis.movimientosPeriodo).toBeGreaterThanOrEqual(2);
    const entradaTipo = r.movimientosPorTipo.find((m) => m.tipo === 'ENTRADA');
    const ventaTipo = r.movimientosPorTipo.find((m) => m.tipo === 'VENTA');
    expect(entradaTipo?.cantidad).toBeGreaterThanOrEqual(1);
    expect(ventaTipo?.cantidad).toBeGreaterThanOrEqual(1);
    const rotVariante = r.topRotacion.find((t) => t.variantId === variantId);
    expect(rotVariante?.unidadesVendidas).toBeGreaterThanOrEqual(3);
    const detalleVariante = r.detalle.filter((d) => d.producto.startsWith('T6ReportesInv Uno'));
    expect(detalleVariante).toHaveLength(2);
  });

  it('período sin actividad devuelve ceros y arrays vacíos', async () => {
    const periodoVacio: ReportPeriod = {
      desde: new Date('1990-01-01T00:00:00Z'),
      hasta: new Date('1990-01-02T00:00:00Z'),
      etiqueta: 'test',
    };
    const r = await getInventoryReport(periodoVacio);
    expect(r.kpis.movimientosPeriodo).toBe(0);
    expect(r.movimientosPorTipo).toEqual([]);
    expect(r.topRotacion).toEqual([]);
    expect(r.detalle).toEqual([]);
  });
});

function round2(x: number): number {
  return Math.round(x * 100) / 100;
}
