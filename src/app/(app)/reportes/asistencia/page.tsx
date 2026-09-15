import { requirePermission } from '@/lib/auth/context';
import { can } from '@/lib/auth/rbac';
import { resolvePeriod } from '@/lib/reports/period';
import { getAttendanceDashboard } from '@/lib/attendance/dashboard';
import { db } from '@/lib/db';
import { BarChart } from '@/components/charts/BarChart';
import { Card } from '@/components/ui/Card';
import { PeriodFilterForm } from '@/app/(app)/reportes/PeriodFilterForm';
import { AttendanceFilters } from './AttendanceFilters';
import { CorregirTurnoForm } from './CorregirTurnoForm';

export const dynamic = 'force-dynamic';

function fmtMinutos(min: number): string {
  return `${Math.floor(min / 60)}h ${min % 60}m`;
}

function fmtHora(d: Date): string {
  return new Intl.DateTimeFormat('es-MX', {
    timeZone: 'America/Mexico_City',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(d);
}

export default async function AsistenciaPage(props: {
  searchParams: Promise<{
    atajo?: string; desde?: string; hasta?: string; userId?: string; roleId?: string;
  }>;
}) {
  const actor = await requirePermission('asistencia.ver');
  const sp = await props.searchParams;
  const periodo = resolvePeriod(sp);
  const dashboard = await getAttendanceDashboard(periodo, {
    userId: sp.userId || undefined,
    roleId: sp.roleId || undefined,
  });
  const [usuarios, roles] = await Promise.all([
    db.user.findMany({ where: { activo: true }, select: { id: true, nombre: true }, orderBy: { nombre: 'asc' } }),
    db.role.findMany({ select: { id: true, nombre: true }, orderBy: { nombre: 'asc' } }),
  ]);
  const puedeCorregir = can(actor, 'asistencia.corregir');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Reporte de asistencia</h1>
        <p className="text-ink-muted">{periodo.etiqueta}</p>
      </div>

      <PeriodFilterForm base="/reportes/asistencia" atajo={sp.atajo} desde={sp.desde} hasta={sp.hasta} />
      <AttendanceFilters usuarios={usuarios} roles={roles} current={sp} />

      <Card>
        <h2 className="mb-3 text-lg font-semibold text-ink">Llegadas por hora</h2>
        <BarChart data={dashboard.llegadasPorHora} />
      </Card>

      <Card>
        <h2 className="mb-3 text-lg font-semibold text-ink">Turnos abiertos en el período</h2>
        {dashboard.turnosAbiertos.length === 0 ? (
          <p className="text-sm text-ink-subtle">No hay turnos abiertos en este período.</p>
        ) : (
          <ul className="divide-y divide-line">
            {dashboard.turnosAbiertos.map((t) => (
              <li key={t.id} className="py-2">
                <p className="text-sm text-ink">
                  {t.nombre} — entrada el {t.fecha} a las {fmtHora(t.checkInAt)}
                </p>
                {puedeCorregir ? <CorregirTurnoForm recordId={t.id} /> : null}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <h2 className="mb-3 text-lg font-semibold text-ink">Horas trabajadas por empleado</h2>
        {dashboard.horasPorEmpleado.length === 0 ? (
          <p className="text-sm text-ink-subtle">Sin datos en este período.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-ink-muted">
                <th className="py-2">Empleado</th>
                <th className="py-2">Rol</th>
                <th className="py-2 text-right">Horas trabajadas</th>
              </tr>
            </thead>
            <tbody>
              {dashboard.horasPorEmpleado.map((h) => (
                <tr key={h.userId} className="border-b border-line last:border-0">
                  <td className="py-2">{h.nombre}</td>
                  <td className="py-2 text-ink-muted">{h.roleName}</td>
                  <td className="py-2 text-right tabular-nums">{fmtMinutos(h.minutos)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Card>
        <h2 className="mb-3 text-lg font-semibold text-ink">Registros de hoy</h2>
        {dashboard.registrosDeHoy.length === 0 ? (
          <p className="text-sm text-ink-subtle">Sin registros hoy.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {dashboard.registrosDeHoy.map((r) => (
              <div key={r.id} className="rounded-control border border-line p-3">
                <p className="font-medium text-ink">{r.nombre}</p>
                <div className="mt-2 flex gap-2">
                  {r.checkInFotoPath ? (
                    // eslint-disable-next-line @next/next/no-img-element -- servida por route handler propio con control de permiso, no aplica next/image
                    <img
                      src={`/api/asistencia/foto/${r.checkInFotoPath}`}
                      alt={`Entrada de ${r.nombre}`}
                      className="h-16 w-16 rounded-control object-cover"
                    />
                  ) : (
                    <div className="flex h-16 w-16 items-center justify-center rounded-control bg-surface-raised text-xs text-ink-subtle">
                      Sin foto
                    </div>
                  )}
                  {r.checkOutFotoPath ? (
                    // eslint-disable-next-line @next/next/no-img-element -- servida por route handler propio con control de permiso, no aplica next/image
                    <img
                      src={`/api/asistencia/foto/${r.checkOutFotoPath}`}
                      alt={`Salida de ${r.nombre}`}
                      className="h-16 w-16 rounded-control object-cover"
                    />
                  ) : (
                    <div className="flex h-16 w-16 items-center justify-center rounded-control bg-surface-raised text-xs text-ink-subtle">
                      {r.checkOutAt ? 'Sin foto' : 'En curso'}
                    </div>
                  )}
                </div>
                <p className="mt-2 text-xs text-ink-muted">
                  Entrada {fmtHora(r.checkInAt)}
                  {r.checkOutAt ? ` · Salida ${fmtHora(r.checkOutAt)}` : ' · En curso'}
                </p>
                {!r.checkOutAt && puedeCorregir ? <CorregirTurnoForm recordId={r.id} /> : null}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
