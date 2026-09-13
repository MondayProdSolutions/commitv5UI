import { db } from '@/lib/db';
import type { ReportPeriod } from './period';

const round2 = (x: number): number => Math.round(x * 100) / 100;

export type MarginRow = {
  variantId: string;
  nombre: string;
  unidades: number;
  ingreso: number;
  costo: number;
  utilidad: number;
  margenPct: number;
};

export type MarginReport = {
  periodo: ReportPeriod;
  kpis: { utilidadTotal: number; margenPromedio: number; productoMasRentable: string | null };
  topUtilidad: { variantId: string; nombre: string; utilidad: number }[];
  detalle: MarginRow[];
};

export async function getMarginReport(periodo: ReportPeriod): Promise<MarginReport> {
  const rango = { gte: periodo.desde, lte: periodo.hasta };

  const ventas = await db.sale.findMany({
    where: { estado: 'COMPLETADA', createdAt: rango },
    select: {
      lines: {
        select: {
          id: true,
          variantId: true,
          productoNombre: true,
          varianteNombre: true,
          cantidad: true,
          baseNeta: true, // SIN IVA — nunca `total` (que sí incluye IVA); el costo tampoco lo lleva.
          variant: { select: { precioCompra: true } },
        },
      },
    },
  });
  const saleLineIds = ventas.flatMap((v) => v.lines.map((l) => l.id));

  const returnLines =
    saleLineIds.length > 0
      ? await db.returnLine.findMany({
          where: { saleLineId: { in: saleLineIds }, return: { createdAt: rango } },
          select: { saleLineId: true, cantidad: true, baseNeta: true },
        })
      : [];
  const devueltoPorLinea = new Map<string, { cantidad: number; baseNeta: number }>();
  for (const rl of returnLines) {
    const acc = devueltoPorLinea.get(rl.saleLineId) ?? { cantidad: 0, baseNeta: 0 };
    acc.cantidad += rl.cantidad;
    acc.baseNeta += Number(rl.baseNeta);
    devueltoPorLinea.set(rl.saleLineId, acc);
  }

  const porVariante = new Map<string, { nombre: string; unidades: number; ingreso: number; precioCompra: number }>();
  for (const v of ventas) {
    for (const l of v.lines) {
      const dev = devueltoPorLinea.get(l.id) ?? { cantidad: 0, baseNeta: 0 };
      const unidadesNetas = l.cantidad - dev.cantidad;
      const ingresoNeto = Number(l.baseNeta) - dev.baseNeta;
      const acc = porVariante.get(l.variantId) ?? {
        nombre: l.varianteNombre ? `${l.productoNombre} (${l.varianteNombre})` : l.productoNombre,
        unidades: 0,
        ingreso: 0,
        precioCompra: Number(l.variant.precioCompra),
      };
      acc.unidades += unidadesNetas;
      acc.ingreso += ingresoNeto;
      porVariante.set(l.variantId, acc);
    }
  }

  const detalle: MarginRow[] = [...porVariante.entries()]
    .map(([variantId, v]) => {
      const ingreso = round2(v.ingreso);
      const costo = round2(v.unidades * v.precioCompra);
      const utilidad = round2(ingreso - costo);
      const margenPct = ingreso > 0 ? round2((utilidad / ingreso) * 100) : 0;
      return { variantId, nombre: v.nombre, unidades: v.unidades, ingreso, costo, utilidad, margenPct };
    })
    .sort((a, b) => b.utilidad - a.utilidad);

  const utilidadTotal = round2(detalle.reduce((s, d) => s + d.utilidad, 0));
  const ingresoNetoTotal = round2(detalle.reduce((s, d) => s + d.ingreso, 0));
  const margenPromedio = ingresoNetoTotal > 0 ? round2((utilidadTotal / ingresoNetoTotal) * 100) : 0;
  const topUtilidad = detalle
    .slice(0, 10)
    .map((d) => ({ variantId: d.variantId, nombre: d.nombre, utilidad: d.utilidad }));
  const productoMasRentable = topUtilidad[0]?.nombre ?? null;

  return {
    periodo,
    kpis: { utilidadTotal, margenPromedio, productoMasRentable },
    topUtilidad,
    detalle,
  };
}
