import { requirePermission } from '@/lib/auth/context';
import { resolvePeriod } from '@/lib/reports/period';
import { getSalesReport } from '@/lib/reports/ventas';
import { BarChart } from '@/components/charts/BarChart';
import { LineChart } from '@/components/charts/LineChart';
import { DataTable } from '@/components/DataTable';
import { Card } from '@/components/ui/Card';
import { KpiCard } from '@/components/ui/KpiCard';
import { money, METODO_LABEL } from '@/app/(app)/ventas/types';
import { PeriodFilterForm } from '../PeriodFilterForm';
import { withTenant } from '@/lib/db';
import { requireRequestTenantId } from '@/lib/tenant/with-request-tenant';

export const dynamic = 'force-dynamic';

/** Fecha corta en español, a partir de una clave `YYYY-MM-DD` (día natural MX). */
function fmtFechaCorta(fecha: string): string {
  return new Date(`${fecha}T12:00:00-06:00`).toLocaleDateString('es-MX', {
    timeZone: 'America/Mexico_City',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

type ReporteVentasPageProps = {
  searchParams: Promise<{ atajo?: string; desde?: string; hasta?: string }>;
};

export default async function ReporteVentasPage(props: ReporteVentasPageProps) {
  const tenantId = await requireRequestTenantId();
  return withTenant(tenantId, () => renderReporteVentasPage(props));
}

async function renderReporteVentasPage(props: ReporteVentasPageProps) {
  await requirePermission('reportes.ver');
  const sp = await props.searchParams;
  const periodo = resolvePeriod(sp);
  const r = await getSalesReport(periodo);

  const exportParams = new URLSearchParams();
  if (sp.atajo) exportParams.set('atajo', sp.atajo);
  if (sp.desde) exportParams.set('desde', sp.desde);
  if (sp.hasta) exportParams.set('hasta', sp.hasta);

  type TopProducto = (typeof r.topProductos)[number];
  type PorCajero = (typeof r.porCajero)[number];
  type Dia = (typeof r.tendenciaDiaria)[number];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold">Reporte de ventas</h1>
          <p className="text-ink-muted">{periodo.etiqueta}</p>
        </div>
        <a
          href={`/reportes/ventas/export?${exportParams.toString()}`}
          className="inline-flex items-center justify-center gap-1.5 rounded-control border border-line-strong bg-surface px-4 py-2.5 text-sm font-medium text-ink-muted transition-colors hover:bg-surface-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
        >
          Exportar CSV
        </a>
      </div>

      <PeriodFilterForm base="/reportes/ventas" atajo={sp.atajo} desde={sp.desde} hasta={sp.hasta} />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <KpiCard label="Ventas completadas" value={String(r.kpis.ventasCompletadas)} />
        <KpiCard label="Canceladas" value={String(r.kpis.ventasCanceladas)} />
        <KpiCard label="Ingreso neto" value={money(r.kpis.ingresoNeto)} />
        <KpiCard label="Ticket promedio" value={money(r.kpis.ticketPromedio)} />
        <KpiCard label="IVA" value={money(r.kpis.ivaTotal)} />
        <KpiCard label="Descuentos" value={money(r.kpis.descuentosTotal)} />
      </div>

      <Card>
        <h2 className="mb-3 text-lg font-semibold text-ink">Tendencia de ingreso neto</h2>
        <LineChart
          data={r.tendenciaDiaria.map((d) => ({ label: d.fecha, value: d.ingresoNeto }))}
          formatValue={money}
        />
      </Card>

      <Card>
        <h2 className="mb-3 text-lg font-semibold text-ink">Cobros por método de pago</h2>
        <BarChart
          data={r.cobrosPorMetodo.map((c) => ({ label: METODO_LABEL[c.metodo], value: c.monto }))}
          formatValue={money}
        />
      </Card>

      <div className="space-y-2">
        <h2 className="text-lg font-semibold text-ink">Top productos</h2>
        <DataTable<TopProducto>
          columns={[
            { key: 'nombre', header: 'Producto' },
            { key: 'cantidad', header: 'Cantidad' },
            { key: 'ingreso', header: 'Ingreso', render: (row) => money(row.ingreso) },
          ]}
          rows={r.topProductos}
          getKey={(row) => row.variantId}
        />
      </div>

      <div className="space-y-2">
        <h2 className="text-lg font-semibold text-ink">Por cajero</h2>
        <DataTable<PorCajero>
          columns={[
            { key: 'nombre', header: 'Cajero' },
            { key: 'ventas', header: 'Ventas' },
            { key: 'ingreso', header: 'Ingreso', render: (row) => money(row.ingreso) },
          ]}
          rows={r.porCajero}
          getKey={(row) => row.cajeroId}
        />
      </div>

      <div className="space-y-2">
        <h2 className="text-lg font-semibold text-ink">Por día</h2>
        <DataTable<Dia>
          columns={[
            { key: 'fecha', header: 'Fecha', render: (row) => fmtFechaCorta(row.fecha) },
            { key: 'ventas', header: 'Ventas' },
            { key: 'ingresoBruto', header: 'Ingreso bruto', render: (row) => money(row.ingresoBruto) },
            { key: 'devoluciones', header: 'Devoluciones', render: (row) => money(row.devoluciones) },
            { key: 'ingresoNeto', header: 'Ingreso neto', render: (row) => money(row.ingresoNeto) },
            { key: 'iva', header: 'IVA', render: (row) => money(row.iva) },
          ]}
          rows={r.tendenciaDiaria}
          getKey={(row) => row.fecha}
        />
      </div>
    </div>
  );
}
