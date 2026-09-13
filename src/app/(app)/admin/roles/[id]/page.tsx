import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requirePermission, getCurrentUser } from '@/lib/auth/context';
import { can } from '@/lib/auth/rbac';
import { getRole } from '@/lib/roles/admin';
import { RoleForm } from '../RoleForm';

export const dynamic = 'force-dynamic';

export default async function RoleDetallePage(props: { params: Promise<{ id: string }> }) {
  await requirePermission('roles.ver');
  const actor = await getCurrentUser();
  const canManage = can(actor, 'roles.gestionar');
  const { id } = await props.params;

  const isNew = id === 'new';
  const role = isNew ? null : await getRole(id);
  if (!isNew && !role) notFound();

  const titulo = isNew ? 'Nuevo rol' : role!.nombre;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/roles" className="text-sm text-ink-subtle hover:text-ink">
          ← Roles
        </Link>
        <h1 className="text-2xl font-bold">{titulo}</h1>
        {!isNew && role!.esSistema ? (
          <p className="text-ink-muted">
            Rol de sistema: puedes ajustar sus permisos y descripción, pero no su nombre.
          </p>
        ) : null}
      </div>

      <RoleForm role={role} canManage={canManage} />
    </div>
  );
}
