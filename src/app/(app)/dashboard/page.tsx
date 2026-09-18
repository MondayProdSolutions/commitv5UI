import type { CSSProperties } from 'react';
import Link from 'next/link';
import { requireUser } from '@/lib/auth/context';
import { can } from '@/lib/auth/rbac';
import { getSalesReport } from '@/lib/reports/ventas';
import { getInventoryReport } from '@/lib/reports/inventario';
import type { InventoryReport } from '@/lib/reports/inventario';
import { resolvePeriod } from '@/lib/reports/period';
import type { ReportPeriod } from '@/lib/reports/period';
import { totalSkusActivos } from '@/lib/inventory/stock';
import { listMovements } from '@/lib/inventory/query';
import { money, fmtFechaMX } from '@/app/(app)/ventas/types';
import { KpiCard } from '@/components/ui/KpiCard';
import { ExpandableChartCard } from '@/components/ui/ExpandableChartCard';
import { LineChart } from '@/components/charts/LineChart';
import { StockAlertsBars } from '@/components/charts/StockAlertsBars';
import { Gauge } from '@/components/charts/Gauge';
import { TopRotationList, type RotationItem } from '@/components/charts/TopRotationList';
import { withTenant } from '@/lib/db';
import { requireRequestTenantId } from '@/lib/tenant/with-request-tenant';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const tenantId = await requireRequestTenantId();
  return withTenant(tenantId, renderDashboardPage);
}

/** Rango del mes calendario anterior — solo para comparar el ranking de rotación, sin tocar `period.ts`. */
function periodoMesAnterior(): ReportPeriod {
  const ahora = new Date();
  const desde = new Date(ahora.getFullYear(), ahora.getMonth() - 1, 1);
  const hasta = new Date(ahora.getFullYear(), ahora.getMonth(), 0, 23, 59, 59, 999);
  return { desde, hasta, etiqueta: 'Mes anterior' };
}

function rankDeltas(actual: InventoryReport['topRotacion'], previo: InventoryReport['topRotacion']) {
  const rankPrevio = new Map(previo.map((item, i) => [item.variantId, i + 1]));
  const deltas = new Map<string, number | null>();
  actual.forEach((item, i) => {
    const prev = rankPrevio.get(item.variantId);
    deltas.set(item.variantId, prev !== undefined ? prev - (i + 1) : null);
  });
  return deltas;
}

async function renderDashboardPage() {
  const actor = await requireUser();

  const verVentas = can(actor, 'reportes.ver');
  const verInventario = can(actor, 'inventario.ver');

  const [ventasHoy, ventasTendencia, totalSkus, inv, invMesAnterior, feed] = await Promise.all([
    verVentas ? getSalesReport(resolvePeriod({ atajo: 'hoy' })) : Promise.resolve(null),
    verVentas ? getSalesReport(resolvePeriod({ atajo: '30dias' })) : Promise.resolve(null),
    verInventario ? totalSkusActivos() : Promise.resolve(null),
    verInventario ? getInventoryReport(resolvePeriod({ atajo: 'mes' })) : Promise.resolve(null),
    verInventario ? getInventoryReport(periodoMesAnterior()) : Promise.resolve(null),
    verInventario ? listMovements({ page: 1, pageSize: 8 }) : Promise.resolve(null),
  ]);

  const sinKpis = !verVentas && !verInventario;
  const top5 = inv?.topRotacion.slice(0, 5) ?? [];
  const deltas = inv && invMesAnterior ? rankDeltas(top5, invMesAnterior.topRotacion) : new Map();
  const rotationItems: RotationItem[] = top5.map((item) => ({
    variantId: item.variantId,
    nombre: item.nombre,
    unidadesVendidas: item.unidadesVendidas,
    imagenUrl: item.imagenUrl,
    rankDelta: deltas.get(item.variantId) ?? null,
  }));

  const ventasHoyCount = ventasHoy?.kpis.ventasCompletadas ?? 0;
  const gaugeMax = Math.max(20, Math.ceil((ventasHoyCount * 1.6) / 10) * 10);

  return (
    <div className="space-y-4 pb-6">
      <div>
        <h1 className="text-2xl font-bold text-ink">Hola, {actor.nombre}</h1>
        <p className="text-ink-muted">Esto es lo que está pasando hoy.</p>
      </div>

      {sinKpis ? (
        <p className="text-sm text-ink-subtle">No hay información para mostrar con tu rol.</p>
      ) : (
        <>
          {/* Fila superior: 1/3 (SKUs + Valor Inventario) + 2/3 (Alertas + Ventas de hoy) */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            {verInventario && totalSkus !== null && inv ? (
              <div className="flex flex-col gap-4 lg:col-span-1">
                <div className="lg:h-[192px]">
                  <KpiCard
                    label="Total SKUs"
                    value={String(totalSkus)}
                    hint="productos activos"
                    tone="dark"
                    href="/productos"
                    revealDelay={0}
                    countUp={{ value: totalSkus }}
                  />
                </div>
                <div className="lg:h-[192px]">
                  <KpiCard
                    label="Valor de inventario"
                    value={money(inv.kpis.valorVenta)}
                    hint="a precio de venta, stock activo"
                    tone="accent"
                    href="/reportes/inventario"
                    revealDelay={40}
                    countUp={{ value: inv.kpis.valorVenta, format: 'money' }}
                  />
                </div>
              </div>
            ) : null}

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:col-span-2">
              {verInventario && inv ? (
                <Link
                  href="/inventario/stock-bajo"
                  className="reveal group flex h-[360px] flex-col rounded-card border border-line bg-surface p-4 shadow-card transition-colors hover:border-primary/50 md:h-[400px]"
                  style={{ '--reveal-delay': '80ms' } as CSSProperties}
                >
                  <p className="flex items-center gap-2 text-sm font-medium text-ink">
                    <span
                      aria-hidden="true"
                      className={'inline-block h-2.5 w-2.5 rounded-pill ' + (inv.kpis.stockBajo > 0 ? 'bg-danger-solid' : 'bg-success')}
                    />
                    Alertas de stock bajo
                  </p>
                  <p className="mt-1.5 font-mono text-3xl font-light tracking-tight tabular-nums text-ink md:text-[48px]">
                    {inv.kpis.stockBajo}
                  </p>
                  <p className="mt-1 text-xs text-ink-subtle">
                    {inv.kpis.stockBajo > 0 ? 'productos en stock bajo/agotado' : 'todo en orden'}
                  </p>
                  <div className="mt-auto pt-4">
                    <StockAlertsBars ok={inv.kpis.stockBajo === 0} />
                  </div>
                </Link>
              ) : null}

              {verVentas && ventasHoy ? (
                <Link
                  href="/reportes/ventas?atajo=hoy"
                  className="reveal group flex h-[360px] flex-col rounded-card border border-line bg-surface p-4 shadow-card transition-colors hover:border-primary/50 md:h-[400px]"
                  style={{ '--reveal-delay': '120ms' } as CSSProperties}
                >
                  <p className="flex items-center gap-2 text-sm font-medium text-ink">
                    <span aria-hidden="true" className="inline-block h-2.5 w-2.5 rounded-pill bg-primary" />
                    Ventas de hoy
                  </p>
                  <p className="mt-1.5 font-mono text-3xl font-light tracking-tight tabular-nums text-ink md:text-[48px]">
                    {ventasHoyCount}
                  </p>
                  <p className="mt-1 text-xs text-ink-subtle">
                    ticket promedio {money(ventasHoy.kpis.ticketPromedio)}
                  </p>
                  <div className="mt-auto flex items-end">
                    <Gauge value={ventasHoyCount} max={gaugeMax} label="Ventas completadas hoy" />
                  </div>
                </Link>
              ) : null}
            </div>
          </div>

          {/* Fila inferior: gráficas */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {verVentas && ventasTendencia ? (
              <ExpandableChartCard title="Ingresos (últimos 30 días)" dotClassName="bg-primary" revealDelay={160}>
                <LineChart
                  data={ventasTendencia.tendenciaDiaria.map((d) => ({ label: d.fecha, value: d.ingresoNeto }))}
                  formatValue={money}
                />
              </ExpandableChartCard>
            ) : null}

            {verInventario && inv ? (
              <div
                className="reveal flex h-[400px] flex-col rounded-card border border-line bg-surface p-4 shadow-card"
                style={{ '--reveal-delay': '200ms' } as CSSProperties}
              >
                <p className="flex items-center gap-2 text-sm font-medium text-ink">
                  <span aria-hidden="true" className="inline-block h-2.5 w-2.5 rounded-pill bg-primary" />
                  Top 5 productos de mayor rotación
                </p>
                <div className="mt-4 min-h-0 flex-1 overflow-auto">
                  <TopRotationList items={rotationItems} />
                </div>
              </div>
            ) : null}
          </div>

          {/* Stock feed */}
          {verInventario && feed && feed.rows.length > 0 ? (
            <div
              className="reveal rounded-card border border-line bg-surface p-4 shadow-card"
              style={{ '--reveal-delay': '240ms' } as CSSProperties}
            >
              <p className="flex items-center gap-2 text-sm font-medium text-ink">
                <span aria-hidden="true" className="inline-block h-2.5 w-2.5 rounded-pill bg-primary" />
                Movimientos recientes de stock
              </p>
              <ul className="mt-3 divide-y divide-line">
                {feed.rows.map((m) => (
                  <li key={m.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-ink">
                        {m.productoNombre}
                        {m.varianteNombre ? ` (${m.varianteNombre})` : ''}
                      </p>
                      <p className="text-xs text-ink-subtle">
                        {m.tipoLabel} · {m.actorNombre ?? 'Sistema'} · {fmtFechaMX(m.createdAt)}
                      </p>
                    </div>
                    <span
                      className={
                        'shrink-0 font-mono text-sm font-medium tabular-nums ' +
                        (m.cantidad >= 0 ? 'text-success' : 'text-danger')
                      }
                    >
                      {m.cantidad >= 0 ? `+${m.cantidad}` : m.cantidad}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
