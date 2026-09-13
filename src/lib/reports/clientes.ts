import { db } from '@/lib/db';
import type { ReportPeriod } from './period';

const round2 = (x: number): number => Math.round(x * 100) / 100;

export type CustomerRow = {
  customerId: string;
  nombre: string;
  compras: number;
  montoNeto: number;
  ticketPromedio: number;
  ultimaCompra: Date;
};

export type CustomersReport = {
  periodo: ReportPeriod;
  kpis: { clientesActivos: number; clientesNuevos: number; ticketPromedio: number };
  genericoResumen: { ventas: number; monto: number };
  topClientes: CustomerRow[];
  detalle: CustomerRow[];
};

export async function getCustomersReport(periodo: ReportPeriod): Promise<CustomersReport> {
  const rango = { gte: periodo.desde, lte: periodo.hasta };

  const [ventas, devolucionesPorVenta, clientesNuevos] = await Promise.all([
    db.sale.findMany({
      where: { estado: 'COMPLETADA', createdAt: rango },
      select: {
        id: true,
        total: true,
        createdAt: true,
        customerId: true,
        customer: { select: { nombre: true, esGenerico: true } },
      },
    }),
    db.return.groupBy({ by: ['saleId'], where: { createdAt: rango }, _sum: { total: true } }),
    db.customer.count({ where: { esGenerico: false, createdAt: rango } }),
  ]);

  const devueltoPorVenta = new Map(devolucionesPorVenta.map((d) => [d.saleId, Number(d._sum.total ?? 0)]));

  const porCliente = new Map<
    string,
    { nombre: string; compras: number; montoNeto: number; montoBruto: number; ultimaCompra: Date }
  >();
  let ventasGenerico = 0;
  let montoGenerico = 0;
  for (const v of ventas) {
    const neto = Number(v.total) - (devueltoPorVenta.get(v.id) ?? 0);
    if (v.customer.esGenerico) {
      ventasGenerico += 1;
      montoGenerico += Number(v.total);
      continue;
    }
    const acc = porCliente.get(v.customerId) ?? {
      nombre: v.customer.nombre,
      compras: 0,
      montoNeto: 0,
      montoBruto: 0,
      ultimaCompra: v.createdAt,
    };
    acc.compras += 1;
    acc.montoNeto += neto;
    acc.montoBruto += Number(v.total);
    if (v.createdAt > acc.ultimaCompra) acc.ultimaCompra = v.createdAt;
    porCliente.set(v.customerId, acc);
  }

  const detalle: CustomerRow[] = [...porCliente.entries()]
    .map(([customerId, c]) => ({
      customerId,
      nombre: c.nombre,
      compras: c.compras,
      montoNeto: round2(c.montoNeto),
      ticketPromedio: c.compras > 0 ? round2(c.montoBruto / c.compras) : 0,
      ultimaCompra: c.ultimaCompra,
    }))
    .sort((a, b) => b.montoNeto - a.montoNeto);

  const topClientes = detalle.slice(0, 10);
  const clientesActivos = detalle.length;
  const ticketPromedio =
    clientesActivos > 0 ? round2(detalle.reduce((s, c) => s + c.montoNeto, 0) / clientesActivos) : 0;

  return {
    periodo,
    kpis: { clientesActivos, clientesNuevos, ticketPromedio },
    genericoResumen: { ventas: ventasGenerico, monto: round2(montoGenerico) },
    topClientes,
    detalle,
  };
}
