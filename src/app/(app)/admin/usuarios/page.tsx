import Link from 'next/link';
import { requirePermission, getCurrentUser } from '@/lib/auth/context';
import { db } from '@/lib/db';
import { listUsers, type UserListRow } from '@/lib/users/admin';
import { DataTable, type Column } from '@/components/DataTable';
import Pagination from '@/components/Pagination';
import { PermissionGate } from '@/components/PermissionGate';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { inputClass } from '@/app/(app)/ventas/types';
import { UserFormDialog } from './UserFormDialog';
import { UserRow } from './UserRow';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 20;

type SearchParams = { q?: string; rol?: string; estado?: string; page?: string };

function estadoFrom(v: string | undefined): 'activos' | 'inactivos' | 'todos' {
  return v === 'inactivos' || v === 'todos' ? v : 'activos';
}

export default async function UsuariosPage(props: { searchParams: Promise<SearchParams> }) {
  await requirePermission('usuarios.ver');
  const actor = await getCurrentUser();
  const sp = await props.searchParams;

  const q = sp.q?.trim() || undefined;
  const roleId = sp.rol?.trim() || undefined;
  const estado = estadoFrom(sp.estado);
  const page = Math.max(1, Number(sp.page) || 1);

  const [{ rows, total }, roles] = await Promise.all([
    listUsers({ q, roleId, estado, page, pageSize: PAGE_SIZE }),
    db.role.findMany({ orderBy: { nombre: 'asc' }, select: { id: true, nombre: true } }),
  ]);

  const columns: Column<UserListRow>[] = [
    { key: 'nombre', header: 'Nombre' },
    { key: 'email', header: 'Email' },
    { key: 'roleNombre', header: 'Rol' },
    {
      key: 'estado',
      header: 'Estado',
      render: (r) => (
        <Badge tone={r.activo ? 'success' : 'neutral'}>{r.activo ? 'Activo' : 'Inactivo'}</Badge>
      ),
    },
    {
      key: 'lastLoginAt',
      header: 'Último acceso',
      render: (r) => (r.lastLoginAt ? new Date(r.lastLoginAt).toLocaleString('es-ES') : 'Nunca'),
    },
  ];

  const baseParams = new URLSearchParams();
  if (q) baseParams.set('q', q);
  if (roleId) baseParams.set('rol', roleId);
  if (sp.estado) baseParams.set('estado', estado);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Usuarios</h1>
          <p className="text-ink-muted">Alta, edición y baja de cuentas del sistema.</p>
        </div>
        <PermissionGate permiso="usuarios.crear" user={actor}>
          <UserFormDialog roles={roles} />
        </PermissionGate>
      </div>

      <form method="get" className="flex flex-wrap items-end gap-3 rounded-card border border-line bg-surface p-4">
        <label className="block space-y-1">
          <span className="text-sm font-medium text-ink-muted">Buscar</span>
          <input
            name="q"
            defaultValue={q ?? ''}
            placeholder="Nombre o email"
            className={inputClass}
          />
        </label>
        <label className="block space-y-1">
          <span className="text-sm font-medium text-ink-muted">Rol</span>
          <select name="rol" defaultValue={roleId ?? ''} className={inputClass}>
            <option value="">Todos</option>
            {roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.nombre}
              </option>
            ))}
          </select>
        </label>
        <label className="block space-y-1">
          <span className="text-sm font-medium text-ink-muted">Estado</span>
          <select name="estado" defaultValue={estado} className={inputClass}>
            <option value="activos">Activos</option>
            <option value="inactivos">Inactivos</option>
            <option value="todos">Todos</option>
          </select>
        </label>
        <Button type="submit" variant="primary">
          Filtrar
        </Button>
        <Link href="/admin/usuarios" className="px-2 py-2 text-sm text-ink-subtle hover:text-ink">
          Limpiar
        </Link>
      </form>

      <DataTable
        columns={columns}
        rows={rows}
        getKey={(r) => r.id}
        rowHref={(r) => `/admin/usuarios/${r.id}`}
        rowComponent={UserRow}
        emptyMessage="No hay usuarios que coincidan con el filtro."
      />

      <Pagination
        page={page}
        pageSize={PAGE_SIZE}
        total={total}
        baseHref="/admin/usuarios"
        baseSearchParams={baseParams}
      />
    </div>
  );
}
