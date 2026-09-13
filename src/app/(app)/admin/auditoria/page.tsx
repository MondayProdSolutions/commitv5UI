import { requirePermission } from '@/lib/auth/context';
import { db } from '@/lib/db';
import { queryActivity, parseDateParam } from '@/lib/activity/query';
import { AUDIT_ACTIONS } from '@/lib/activity/actions-catalog';
import Pagination from '@/components/Pagination';
import { AuditFilters } from './AuditFilters';
import { AuditRow } from './AuditRow';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 20;

type SearchParams = { actor?: string; accion?: string; desde?: string; hasta?: string; page?: string };

export default async function AuditoriaPage(props: { searchParams: Promise<SearchParams> }) {
  await requirePermission('auditoria.ver');
  const sp = await props.searchParams;

  const page = Math.max(1, Number(sp.page) || 1);

  const [{ rows, total }, users] = await Promise.all([
    queryActivity({
      actorId: sp.actor?.trim() || undefined,
      accion: sp.accion?.trim() || undefined,
      desde: parseDateParam(sp.desde),
      hasta: parseDateParam(sp.hasta),
      page,
      pageSize: PAGE_SIZE,
    }),
    db.user.findMany({
      orderBy: { nombre: 'asc' },
      select: { id: true, nombre: true },
    }),
  ]);

  const baseParams = new URLSearchParams();
  if (sp.actor) baseParams.set('actor', sp.actor);
  if (sp.accion) baseParams.set('accion', sp.accion);
  if (sp.desde) baseParams.set('desde', sp.desde);
  if (sp.hasta) baseParams.set('hasta', sp.hasta);

  const exportParams = new URLSearchParams(baseParams);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Auditoría</h1>
          <p className="text-ink-muted">Registro de actividades del sistema.</p>
        </div>
        <a
          href={`/admin/auditoria/export?${exportParams.toString()}`}
          download
          className="inline-flex items-center justify-center gap-1.5 rounded-control border border-line-strong bg-surface px-4 py-2.5 text-sm font-medium text-ink-muted transition-colors hover:bg-surface-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
        >
          Exportar CSV
        </a>
      </div>

      <AuditFilters users={users} actions={AUDIT_ACTIONS} defaultActor={sp.actor} defaultAccion={sp.accion} defaultDesde={sp.desde} defaultHasta={sp.hasta} />

      <div className="overflow-x-auto rounded-card border border-line bg-surface">
        <table className="w-full">
          <thead>
            <tr className="border-b border-line bg-surface-raised">
              <th className="px-6 py-3 text-left text-sm font-semibold text-ink">Fecha/hora</th>
              <th className="px-6 py-3 text-left text-sm font-semibold text-ink">Acción</th>
              <th className="px-6 py-3 text-left text-sm font-semibold text-ink">Usuario</th>
              <th className="px-6 py-3 text-left text-sm font-semibold text-ink">Entidad</th>
              <th className="px-6 py-3 text-left text-sm font-semibold text-ink">IP</th>
              <th className="px-6 py-3 text-left text-sm font-semibold text-ink">Detalle</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-8 text-center text-sm text-ink-subtle">
                  No hay registros que coincidan con los filtros.
                </td>
              </tr>
            ) : (
              rows.map((row) => <AuditRow key={row.id} row={row} />)
            )}
          </tbody>
        </table>
      </div>

      <Pagination
        page={page}
        pageSize={PAGE_SIZE}
        total={total}
        baseHref="/admin/auditoria"
        baseSearchParams={baseParams}
      />
    </div>
  );
}
