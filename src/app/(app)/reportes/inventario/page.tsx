import { requirePermission } from '@/lib/auth/context';
import { resolvePeriod } from '@/lib/reports/period';
import { getInventoryReport } from '@/lib/reports/inventario';
import { BarChart } from '@/components/charts/BarChart';
import { DataTable } from '@/components/DataTable';
import { Card } from '@/components/ui/Card';
import { KpiCard } from '@/components/ui/KpiCard';
import { money, fmtFechaMX } from '@/app/(app)/ventas/types';
import { PeriodFilterForm } from '../PeriodFilterForm';
import { withTenant } from '@/lib/db';
import { requireRequestTenantId } from '@/lib/tenant/with-request-tenant';

export const dynamic = 'force-dynamic';

type ReporteInventarioPageProps = {
  searchParams: Promise<{ atajo?: string; desde?: string; hasta?: string }>;
};

export default async function ReporteInventarioPage(props: ReporteInventarioPageProps) {
  const tenantId = await requireRequestTenantId();
  return withTenant(tenantId, () => renderReporteInventarioPage(props));
}

async function renderReporteInventarioPage(props: ReporteInventarioPageProps) {
  await requirePermission('reportes.ver');
  const sp = await props.searchParams;
  const periodo = resolvePeriod(sp);
  const r = await getInventoryReport(periodo);

  const exportParams = new URLSearchParams();
  if (sp.atajo) exportParams.set('atajo', sp.atajo);
  if (sp.desde) exportParams.set('desde', sp.desde);
  if (sp.hasta) exportParams.set('hasta', sp.hasta);

  type Detalle = (typeof r.detalle)[number];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold">Reporte de inventario</h1>
          <p className="text-ink-muted">{periodo.etiqueta}</p>
        </div>
        <a
          href={`/reportes/inventario/export?${exportParams.toString()}`}
          className="inline-flex items-center justify-center gap-1.5 rounded-control border border-line-strong bg-surface px-4 py-2.5 text-sm font-medium text-ink-muted transition-colors hover:bg-surface-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
        >
          Exportar CSV
        </a>
      </div>

      <PeriodFilterForm base="/reportes/inventario" atajo={sp.atajo} desde={sp.desde} hasta={sp.hasta} />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Valor a costo" value={money(r.kpis.valorCosto)} />
        <KpiCard label="Valor a venta" value={money(r.kpis.valorVenta)} />
        <KpiCard
          label="Stock bajo/agotado"
          value={String(r.kpis.stockBajo)}
          href="/inventario/stock-bajo"
          tone={r.kpis.stockBajo > 0 ? 'warning' : 'default'}
        />
        <KpiCard label="Movimientos del período" value={String(r.kpis.movimientosPeriodo)} />
      </div>

      <Card>
        <h2 className="mb-3 text-lg font-semibold text-ink">Movimientos por tipo</h2>
        <BarChart data={r.movimientosPorTipo.map((m) => ({ label: m.tipo, value: m.cantidad }))} />
      </Card>

      <Card>
        <h2 className="mb-3 text-lg font-semibold text-ink">Top rotación (unidades vendidas)</h2>
        <BarChart
          orientacion="horizontal"
          data={r.topRotacion.map((t) => ({ label: t.nombre, value: t.unidadesVendidas }))}
        />
      </Card>

      <div className="space-y-2">
        <h2 className="text-lg font-semibold text-ink">Detalle de movimientos</h2>
        <DataTable<Detalle>
          columns={[
            { key: 'fecha', header: 'Fecha', render: (row) => fmtFechaMX(row.fecha) },
            { key: 'producto', header: 'Producto' },
            { key: 'tipo', header: 'Tipo' },
            { key: 'cantidad', header: 'Cantidad' },
            { key: 'usuario', header: 'Usuario' },
          ]}
          rows={r.detalle}
          getKey={(row) => `${row.fecha.toISOString()}-${row.producto}-${row.tipo}-${row.cantidad}`}
        />
      </div>
    </div>
  );
}
