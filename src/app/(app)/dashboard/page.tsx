import { requireUser } from '@/lib/auth/context';
import { can } from '@/lib/auth/rbac';
import { getSalesReport } from '@/lib/reports/ventas';
import { resolvePeriod } from '@/lib/reports/period';
import { stockAlertsCount } from '@/lib/inventory/stock';
import { getOpenCashSession } from '@/lib/cash/sessions';
import { money, fmtFechaMX } from '@/app/(app)/ventas/types';
import { KpiCard } from '@/components/ui/KpiCard';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const actor = await requireUser();

  const verVentas = can(actor, 'reportes.ver');
  const verInventario = can(actor, 'inventario.ver');
  const verCaja = can(actor, 'caja.gestionar');

  const [ventasHoy, stockBajo, cajaAbierta] = await Promise.all([
    verVentas ? getSalesReport(resolvePeriod({ atajo: 'hoy' })) : Promise.resolve(null),
    verInventario ? stockAlertsCount() : Promise.resolve(null),
    verCaja ? getOpenCashSession() : Promise.resolve(null),
  ]);

  const sinKpis = !verVentas && !verInventario && !verCaja;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-ink">Hola, {actor.nombre}</h1>
        <p className="text-ink-muted">Esto es lo que está pasando hoy.</p>
      </div>

      {sinKpis ? (
        <p className="text-sm text-ink-subtle">No hay información para mostrar con tu rol.</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {verVentas && ventasHoy ? (
            <KpiCard
              label="¿Cuánto vendí hoy?"
              value={money(ventasHoy.kpis.ingresoNeto)}
              hint="neto de devoluciones"
              href="/reportes/ventas?atajo=hoy"
            />
          ) : null}
          {verVentas && ventasHoy ? (
            <KpiCard
              label="¿Cuántas ventas hice hoy?"
              value={String(ventasHoy.kpis.ventasCompletadas)}
              hint={`ticket promedio ${money(ventasHoy.kpis.ticketPromedio)}`}
              href="/reportes/ventas?atajo=hoy"
            />
          ) : null}
          {verInventario && stockBajo !== null ? (
            <KpiCard
              label="¿Hay productos con poco stock?"
              value={String(stockBajo)}
              hint="productos en stock bajo/agotado"
              tone={stockBajo > 0 ? 'warning' : 'default'}
              href="/inventario/stock-bajo"
            />
          ) : null}
          {verCaja ? (
            <KpiCard
              label="¿Caja abierta?"
              value={cajaAbierta ? `Sí — ${cajaAbierta.folio}` : 'No'}
              hint={
                cajaAbierta
                  ? `abierta por ${cajaAbierta.abiertaPorNombre} · ${fmtFechaMX(cajaAbierta.abiertaEn)}`
                  : undefined
              }
              href="/caja"
            />
          ) : null}
        </div>
      )}
    </div>
  );
}
