import Link from 'next/link';
import { requirePermission, getCurrentUser } from '@/lib/auth/context';
import { listRoles, type RoleRow } from '@/lib/roles/admin';
import { DataTable, type Column } from '@/components/DataTable';
import { PermissionGate } from '@/components/PermissionGate';
import { Badge } from '@/components/ui/Badge';

export const dynamic = 'force-dynamic';

function SistemaBadge({ esSistema }: { esSistema: boolean }) {
  if (!esSistema) return <span className="text-ink-subtle">—</span>;
  return <Badge tone="neutral">Sistema</Badge>;
}

export default async function RolesPage() {
  await requirePermission('roles.ver');
  const actor = await getCurrentUser();
  const roles = await listRoles();

  const columns: Column<RoleRow>[] = [
    { key: 'nombre', header: 'Nombre' },
    {
      key: 'descripcion',
      header: 'Descripción',
      render: (r) => r.descripcion ?? <span className="text-ink-subtle">—</span>,
    },
    { key: 'usuarios', header: 'Nº usuarios', render: (r) => r.usuarios },
    { key: 'esSistema', header: 'Tipo', render: (r) => <SistemaBadge esSistema={r.esSistema} /> },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Roles y permisos</h1>
          <p className="text-ink-muted">Catálogo de roles y los permisos que otorgan.</p>
        </div>
        <PermissionGate permiso="roles.gestionar" user={actor}>
          <Link
            href="/admin/roles/new"
            className="inline-flex items-center justify-center gap-1.5 rounded-control bg-primary px-4 py-2.5 text-sm font-medium text-on-primary shadow-sm transition-colors hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
          >
            Nuevo rol
          </Link>
        </PermissionGate>
      </div>

      <DataTable
        columns={columns}
        rows={roles}
        getKey={(r) => r.id}
        rowHref={(r) => `/admin/roles/${r.id}`}
        emptyMessage="No hay roles."
      />
    </div>
  );
}
