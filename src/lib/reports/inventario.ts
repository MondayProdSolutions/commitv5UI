import { db } from '@/lib/db';
import { listStock } from '@/lib/inventory/query';
import type { ReportPeriod } from './period';

const round2 = (x: number): number => Math.round(x * 100) / 100;

export type InventoryReport = {
  periodo: ReportPeriod;
  kpis: { valorCosto: number; valorVenta: number; stockBajo: number; movimientosPeriodo: number };
  movimientosPorTipo: { tipo: string; cantidad: number }[];
  topRotacion: { variantId: string; nombre: string; unidadesVendidas: number; imagenUrl: string | null }[];
  detalle: { fecha: Date; producto: string; tipo: string; cantidad: number; usuario: string }[];
};

export async function getInventoryReport(periodo: ReportPeriod): Promise<InventoryReport> {
  const rango = { gte: periodo.desde, lte: periodo.hasta };

  const [variantes, bajo, agotado, movimientosPorTipoRaw, movimientos] = await Promise.all([
    db.productVariant.findMany({
      where: { archivada: false, product: { archivado: false } },
      select: { stock: true, precioCompra: true, precioVenta: true },
    }),
    listStock({ soloStockBajo: true, page: 1, pageSize: 1 }),
    listStock({ soloAgotados: true, page: 1, pageSize: 1 }),
    db.inventoryMovement.groupBy({ by: ['tipo'], where: { createdAt: rango }, _count: true }),
    db.inventoryMovement.findMany({
      where: { createdAt: rango },
      select: {
        variantId: true,
        createdAt: true,
        tipo: true,
        cantidad: true,
        variant: {
          select: { nombre: true, product: { select: { nombre: true, imagenUrl: true } } },
        },
        actor: { select: { nombre: true } },
      },
      orderBy: { createdAt: 'desc' },
    }),
  ]);

  const valorCosto = round2(variantes.reduce((s, v) => s + v.stock * Number(v.precioCompra), 0));
  const valorVenta = round2(variantes.reduce((s, v) => s + v.stock * Number(v.precioVenta), 0));
  const stockBajo = bajo.total + agotado.total;

  const movimientosPorTipo = movimientosPorTipoRaw.map((m) => ({ tipo: m.tipo, cantidad: m._count }));

  const rotacion = new Map<string, { nombre: string; unidadesVendidas: number; imagenUrl: string | null }>();
  for (const m of movimientos) {
    if (m.tipo !== 'VENTA') continue;
    const nombre = m.variant.nombre ? `${m.variant.product.nombre} (${m.variant.nombre})` : m.variant.product.nombre;
    const acc = rotacion.get(m.variantId) ?? { nombre, unidadesVendidas: 0, imagenUrl: m.variant.product.imagenUrl };
    acc.unidadesVendidas += Math.abs(m.cantidad);
    rotacion.set(m.variantId, acc);
  }
  const topRotacion = [...rotacion.entries()]
    .map(([variantId, v]) => ({
      variantId,
      nombre: v.nombre,
      unidadesVendidas: v.unidadesVendidas,
      imagenUrl: v.imagenUrl,
    }))
    .sort((a, b) => b.unidadesVendidas - a.unidadesVendidas)
    .slice(0, 10);

  const detalle = movimientos.map((m) => ({
    fecha: m.createdAt,
    producto: m.variant.nombre ? `${m.variant.product.nombre} (${m.variant.nombre})` : m.variant.product.nombre,
    tipo: m.tipo,
    cantidad: m.cantidad,
    usuario: m.actor?.nombre ?? 'Sistema',
  }));

  return {
    periodo,
    kpis: { valorCosto, valorVenta, stockBajo, movimientosPeriodo: movimientos.length },
    movimientosPorTipo,
    topRotacion,
    detalle,
  };
}
