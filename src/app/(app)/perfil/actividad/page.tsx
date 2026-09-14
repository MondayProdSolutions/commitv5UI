import { requireUser } from '@/lib/auth/context';
import { queryActivity, parseDateParam } from '@/lib/activity/query';
import Pagination from '@/components/Pagination';
import { withTenant } from '@/lib/db';
import { requireRequestTenantId } from '@/lib/tenant/with-request-tenant';

export const dynamic = 'force-dynamic';

interface SearchParams {
  page?: string;
  desde?: string;
  hasta?: string;
}

function formatDate(date: Date): string {
  return new Date(date).toLocaleString('es-ES', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export default async function ActividadPage(props: { searchParams: Promise<SearchParams> }) {
  const tenantId = await requireRequestTenantId();
  return withTenant(tenantId, () => renderActividadPage(props));
}

async function renderActividadPage(props: { searchParams: Promise<SearchParams> }) {
  const user = await requireUser();
  const searchParams = await props.searchParams;

  const page = Number(searchParams.page) || 1;
  const pageSize = 20;

  const desde = parseDateParam(searchParams.desde);
  const hasta = parseDateParam(searchParams.hasta);

  const result = await queryActivity({
    actorId: user.id,
    desde,
    hasta,
    page,
    pageSize,
  });

  const baseSearchParams = new URLSearchParams();
  if (searchParams.desde) baseSearchParams.set('desde', searchParams.desde);
  if (searchParams.hasta) baseSearchParams.set('hasta', searchParams.hasta);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Historial de actividad</h1>
        <p className="text-ink-muted">Historial de acciones que has realizado en el sistema</p>
      </div>

      <div className="bg-surface shadow sm:rounded-lg">
        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead className="bg-surface-raised border-b border-line">
              <tr>
                <th className="px-6 py-3 text-left text-sm font-medium text-ink">Acción</th>
                <th className="px-6 py-3 text-left text-sm font-medium text-ink">Fecha/Hora</th>
                <th className="px-6 py-3 text-left text-sm font-medium text-ink">IP</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {result.rows.map((row) => (
                <tr key={row.id} className="hover:bg-surface-raised">
                  <td className="px-6 py-4 text-sm">{row.accionLabel}</td>
                  <td className="px-6 py-4 text-sm">{formatDate(row.createdAt)}</td>
                  <td className="px-6 py-4 text-sm">{row.ip || 'Desconocida'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {result.rows.length === 0 && (
          <div className="px-6 py-8 text-center">
            <p className="text-ink-muted">No hay registro de actividad</p>
          </div>
        )}
      </div>

      <Pagination
        page={page}
        pageSize={pageSize}
        total={result.total}
        baseHref="/perfil/actividad"
        baseSearchParams={baseSearchParams}
      />
    </div>
  );
}
