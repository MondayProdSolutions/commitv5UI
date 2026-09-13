import { requirePermission } from '@/lib/auth/context';
import { resolvePeriod } from '@/lib/reports/period';
import { getCustomersReport } from '@/lib/reports/clientes';
import { BarChart } from '@/components/charts/BarChart';
import { DataTable } from '@/components/DataTable';
import { Card } from '@/components/ui/Card';
import { KpiCard } from '@/components/ui/KpiCard';
import { money, fmtFechaMX } from '@/app/(app)/ventas/types';
import { PeriodFilterForm } from '../PeriodFilterForm';

export const dynamic = 'force-dynamic';

export default async function ReporteClientesPage(props: {
  searchParams: Promise<{ atajo?: string; desde?: string; hasta?: string }>;
}) {
  await requirePermission('reportes.ver');
  const sp = await props.searchParams;
  const periodo = resolvePeriod(sp);
  const r = await getCustomersReport(periodo);

  const exportParams = new URLSearchParams();
  if (sp.atajo) exportParams.set('atajo', sp.atajo);
  if (sp.desde) exportParams.set('desde', sp.desde);
  if (sp.hasta) exportParams.set('hasta', sp.hasta);

  type Detalle = (typeof r.detalle)[number];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold">Reporte de clientes</h1>
          <p className="text-ink-muted">{periodo.etiqueta}</p>
        </div>
        <a
          href={`/reportes/clientes/export?${exportParams.toString()}`}
          className="inline-flex items-center justify-center gap-1.5 rounded-control border border-line-strong bg-surface px-4 py-2.5 text-sm font-medium text-ink-muted transition-colors hover:bg-surface-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
        >
          Exportar CSV
        </a>
      </div>

      <PeriodFilterForm base="/reportes/clientes" atajo={sp.atajo} desde={sp.desde} hasta={sp.hasta} />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <KpiCard label="Clientes activos" value={String(r.kpis.clientesActivos)} />
        <KpiCard label="Clientes nuevos" value={String(r.kpis.clientesNuevos)} />
        <KpiCard label="Ticket promedio" value={money(r.kpis.ticketPromedio)} />
      </div>

      <p className="rounded-card border border-line bg-surface-raised p-4 text-sm text-ink-muted">
        Ventas sin cliente identificado: {r.genericoResumen.ventas} ({money(r.genericoResumen.monto)})
      </p>

      <Card>
        <h2 className="mb-3 text-lg font-semibold text-ink">Top clientes</h2>
        <BarChart
          orientacion="horizontal"
          data={r.topClientes.map((c) => ({ label: c.nombre, value: c.montoNeto }))}
          formatValue={money}
        />
      </Card>

      <div className="space-y-2">
        <h2 className="text-lg font-semibold text-ink">Detalle</h2>
        <DataTable<Detalle>
          columns={[
            { key: 'nombre', header: 'Cliente' },
            { key: 'compras', header: 'Compras' },
            { key: 'montoNeto', header: 'Monto neto', render: (row) => money(row.montoNeto) },
            { key: 'ticketPromedio', header: 'Ticket promedio', render: (row) => money(row.ticketPromedio) },
            { key: 'ultimaCompra', header: 'Última compra', render: (row) => fmtFechaMX(row.ultimaCompra) },
          ]}
          rows={r.detalle}
          getKey={(row) => row.customerId}
        />
      </div>
    </div>
  );
}
