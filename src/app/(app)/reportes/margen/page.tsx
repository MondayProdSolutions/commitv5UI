import { requirePermission } from '@/lib/auth/context';
import { resolvePeriod } from '@/lib/reports/period';
import { getMarginReport } from '@/lib/reports/margen';
import { BarChart } from '@/components/charts/BarChart';
import { DataTable } from '@/components/DataTable';
import { Card } from '@/components/ui/Card';
import { KpiCard } from '@/components/ui/KpiCard';
import { money } from '@/app/(app)/ventas/types';
import { PeriodFilterForm } from '../PeriodFilterForm';

export const dynamic = 'force-dynamic';

export default async function ReporteMargenPage(props: {
  searchParams: Promise<{ atajo?: string; desde?: string; hasta?: string }>;
}) {
  await requirePermission('reportes.margen');
  const sp = await props.searchParams;
  const periodo = resolvePeriod(sp);
  const r = await getMarginReport(periodo);

  const exportParams = new URLSearchParams();
  if (sp.atajo) exportParams.set('atajo', sp.atajo);
  if (sp.desde) exportParams.set('desde', sp.desde);
  if (sp.hasta) exportParams.set('hasta', sp.hasta);

  type Fila = (typeof r.detalle)[number];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold">Reporte de utilidad y margen</h1>
          <p className="text-ink-muted">{periodo.etiqueta}</p>
        </div>
        <a
          href={`/reportes/margen/export?${exportParams.toString()}`}
          className="inline-flex items-center justify-center gap-1.5 rounded-control border border-line-strong bg-surface px-4 py-2.5 text-sm font-medium text-ink-muted transition-colors hover:bg-surface-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
        >
          Exportar CSV
        </a>
      </div>

      <PeriodFilterForm base="/reportes/margen" atajo={sp.atajo} desde={sp.desde} hasta={sp.hasta} />

      <div className="rounded-control border border-line bg-surface-raised p-3 text-sm text-ink-muted">
        <p>
          El margen usa el costo actual de cada producto (precioCompra); si el costo cambió después de la venta, el
          margen histórico es una aproximación.
        </p>
        <p>El ingreso mostrado aquí no incluye IVA (a diferencia del reporte de Ventas), para poder compararlo directamente con el costo.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <KpiCard label="Utilidad total" value={money(r.kpis.utilidadTotal)} />
        <KpiCard label="Margen promedio" value={`${r.kpis.margenPromedio}%`} />
        <KpiCard label="Producto más rentable" value={r.kpis.productoMasRentable ?? '—'} />
      </div>

      <Card>
        <h2 className="mb-3 text-lg font-semibold text-ink">Top utilidad por producto</h2>
        <BarChart
          orientacion="horizontal"
          data={r.topUtilidad.map((t) => ({ label: t.nombre, value: t.utilidad }))}
          formatValue={money}
        />
      </Card>

      <div className="space-y-2">
        <h2 className="text-lg font-semibold text-ink">Detalle por producto</h2>
        <DataTable<Fila>
          columns={[
            { key: 'nombre', header: 'Producto' },
            { key: 'unidades', header: 'Unidades' },
            { key: 'ingreso', header: 'Ingreso', render: (row) => money(row.ingreso) },
            { key: 'costo', header: 'Costo', render: (row) => money(row.costo) },
            { key: 'utilidad', header: 'Utilidad', render: (row) => money(row.utilidad) },
            { key: 'margenPct', header: '% Margen', render: (row) => `${row.margenPct}%` },
          ]}
          rows={r.detalle}
          getKey={(row) => row.variantId}
        />
      </div>
    </div>
  );
}
