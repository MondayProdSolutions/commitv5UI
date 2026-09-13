import { db } from '@/lib/db';
import { diaKeyMX } from './period';
import type { ReportPeriod } from './period';

const round2 = (x: number): number => Math.round(x * 100) / 100;

export type SalesReport = {
  periodo: ReportPeriod;
  kpis: {
    ventasCompletadas: number;
    ventasCanceladas: number;
    ingresoNeto: number;
    ticketPromedio: number;
    ivaTotal: number;
    descuentosTotal: number;
  };
  tendenciaDiaria: {
    fecha: string;
    ventas: number;
    ingresoBruto: number;
    devoluciones: number;
    ingresoNeto: number;
    iva: number;
  }[];
  cobrosPorMetodo: { metodo: 'EFECTIVO' | 'TARJETA' | 'TRANSFERENCIA'; monto: number }[];
  topProductos: { variantId: string; nombre: string; cantidad: number; ingreso: number }[];
  porCajero: { cajeroId: string; nombre: string; ventas: number; ingreso: number }[];
};

export async function getSalesReport(periodo: ReportPeriod): Promise<SalesReport> {
  const rango = { gte: periodo.desde, lte: periodo.hasta };

  const [ventas, ventasCanceladas, devoluciones, pagosPorMetodo] = await Promise.all([
    db.sale.findMany({
      where: { estado: 'COMPLETADA', createdAt: rango },
      select: {
        id: true,
        total: true,
        impuestos: true,
        descuentoLineas: true,
        descuentoTicket: true,
        createdAt: true,
        cajeroId: true,
        cajero: { select: { nombre: true } },
        lines: {
          select: { id: true, variantId: true, productoNombre: true, varianteNombre: true, cantidad: true, total: true },
        },
      },
    }),
    db.sale.count({ where: { estado: 'CANCELADA', createdAt: rango } }),
    db.return.findMany({
      where: { createdAt: rango },
      select: {
        total: true,
        impuestos: true,
        createdAt: true,
        lines: { select: { saleLineId: true, cantidad: true, total: true } },
      },
    }),
    db.payment.groupBy({
      by: ['metodo'],
      where: { sale: { estado: 'COMPLETADA', createdAt: rango } },
      _sum: { monto: true },
    }),
  ]);

  const ingresoBruto = round2(ventas.reduce((s, v) => s + Number(v.total), 0));
  const devolucionesTotal = round2(devoluciones.reduce((s, r) => s + Number(r.total), 0));
  const ingresoNeto = round2(ingresoBruto - devolucionesTotal);
  const ticketPromedio = ventas.length > 0 ? round2(ingresoBruto / ventas.length) : 0;
  const ivaBruto = ventas.reduce((s, v) => s + Number(v.impuestos), 0);
  const ivaDevuelto = devoluciones.reduce((s, r) => s + Number(r.impuestos), 0);
  const ivaTotal = round2(ivaBruto - ivaDevuelto);
  const descuentosTotal = round2(
    ventas.reduce((s, v) => s + Number(v.descuentoLineas) + Number(v.descuentoTicket), 0),
  );

  // Tendencia diaria: agrupa ventas y devoluciones por día natural MX.
  const porDia = new Map<string, { ventas: number; ingresoBruto: number; devoluciones: number; iva: number }>();
  for (const v of ventas) {
    const key = diaKeyMX(v.createdAt);
    const acc = porDia.get(key) ?? { ventas: 0, ingresoBruto: 0, devoluciones: 0, iva: 0 };
    acc.ventas += 1;
    acc.ingresoBruto += Number(v.total);
    acc.iva += Number(v.impuestos);
    porDia.set(key, acc);
  }
  for (const r of devoluciones) {
    const key = diaKeyMX(r.createdAt);
    const acc = porDia.get(key) ?? { ventas: 0, ingresoBruto: 0, devoluciones: 0, iva: 0 };
    acc.devoluciones += Number(r.total);
    acc.iva -= Number(r.impuestos);
    porDia.set(key, acc);
  }
  const tendenciaDiaria = [...porDia.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([fecha, v]) => ({
      fecha,
      ventas: v.ventas,
      ingresoBruto: round2(v.ingresoBruto),
      devoluciones: round2(v.devoluciones),
      ingresoNeto: round2(v.ingresoBruto - v.devoluciones),
      iva: round2(v.iva),
    }));

  const cobrosPorMetodo = pagosPorMetodo.map((p) => ({
    metodo: p.metodo,
    monto: round2(Number(p._sum.monto ?? 0)),
  }));

  // Top productos: cantidad e ingreso netos de devolución, solo de líneas de
  // ventas del período (si la venta original de una devolución cae fuera del
  // período, esa línea no aparece en `saleLineToVariant` y no se resta —
  // netear un producto solo tiene sentido si su venta también está en rango).
  const porProducto = new Map<string, { nombre: string; cantidad: number; ingreso: number }>();
  const saleLineToVariant = new Map<string, string>();
  for (const v of ventas) {
    for (const l of v.lines) {
      saleLineToVariant.set(l.id, l.variantId);
      const acc = porProducto.get(l.variantId) ?? {
        nombre: l.varianteNombre ? `${l.productoNombre} (${l.varianteNombre})` : l.productoNombre,
        cantidad: 0,
        ingreso: 0,
      };
      acc.cantidad += l.cantidad;
      acc.ingreso += Number(l.total);
      porProducto.set(l.variantId, acc);
    }
  }
  for (const r of devoluciones) {
    for (const rl of r.lines) {
      const variantId = saleLineToVariant.get(rl.saleLineId);
      if (!variantId) continue;
      const acc = porProducto.get(variantId);
      if (!acc) continue;
      acc.cantidad -= rl.cantidad;
      acc.ingreso -= Number(rl.total);
    }
  }
  const topProductos = [...porProducto.entries()]
    .map(([variantId, v]) => ({ variantId, nombre: v.nombre, cantidad: v.cantidad, ingreso: round2(v.ingreso) }))
    .sort((a, b) => b.ingreso - a.ingreso)
    .slice(0, 20);

  // Por cajero: ingreso BRUTO (sin netear devolución — quien procesa un
  // reembolso puede no ser quien hizo la venta original).
  const porCajeroMap = new Map<string, { nombre: string; ventas: number; ingreso: number }>();
  for (const v of ventas) {
    const acc = porCajeroMap.get(v.cajeroId) ?? { nombre: v.cajero.nombre, ventas: 0, ingreso: 0 };
    acc.ventas += 1;
    acc.ingreso += Number(v.total);
    porCajeroMap.set(v.cajeroId, acc);
  }
  const porCajero = [...porCajeroMap.entries()]
    .map(([cajeroId, v]) => ({ cajeroId, nombre: v.nombre, ventas: v.ventas, ingreso: round2(v.ingreso) }))
    .sort((a, b) => b.ingreso - a.ingreso);

  return {
    periodo,
    kpis: {
      ventasCompletadas: ventas.length,
      ventasCanceladas,
      ingresoNeto,
      ticketPromedio,
      ivaTotal,
      descuentosTotal,
    },
    tendenciaDiaria,
    cobrosPorMetodo,
    topProductos,
    porCajero,
  };
}
