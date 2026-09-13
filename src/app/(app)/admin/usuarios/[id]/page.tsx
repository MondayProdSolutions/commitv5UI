import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requirePermission, getCurrentUser } from '@/lib/auth/context';
import { db } from '@/lib/db';
import { PermissionGate } from '@/components/PermissionGate';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { UserFormDialog } from '../UserFormDialog';
import {
  ActivateToggleForm,
  RevokeSessionsForm,
  ResetPasswordForm,
} from '../UserAdminActions';

export const dynamic = 'force-dynamic';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-subtle">{title}</h2>
      {children}
    </Card>
  );
}

export default async function UsuarioDetallePage(props: { params: Promise<{ id: string }> }) {
  await requirePermission('usuarios.ver');
  const actor = await getCurrentUser();
  const { id } = await props.params;

  const [user, roles] = await Promise.all([
    db.user.findUnique({ where: { id }, include: { role: { select: { id: true, nombre: true } } } }),
    db.role.findMany({ orderBy: { nombre: 'asc' }, select: { id: true, nombre: true } }),
  ]);
  if (!user) notFound();

  const isSelf = actor?.id === user.id;
  const activeSessions = await db.session.count({
    where: { userId: user.id, revokedAt: null, expiresAt: { gt: new Date() } },
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href="/admin/usuarios" className="text-sm text-ink-subtle hover:text-ink">
            ← Usuarios
          </Link>
          <h1 className="text-2xl font-bold">{user.nombre}</h1>
          <p className="text-ink-muted">{user.email}</p>
        </div>
        <PermissionGate permiso="usuarios.editar" user={actor}>
          <UserFormDialog
            roles={roles}
            user={{
              id: user.id,
              nombre: user.nombre,
              email: user.email,
              telefono: user.telefono,
              roleId: user.roleId,
            }}
          />
        </PermissionGate>
      </div>

      <Section title="Datos">
        <dl className="grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2">
          <div>
            <dt className="text-xs text-ink-subtle">Rol</dt>
            <dd className="text-sm text-ink">{user.role.nombre}</dd>
          </div>
          <div>
            <dt className="text-xs text-ink-subtle">Estado</dt>
            <dd className="text-sm text-ink">
              <Badge tone={user.activo ? 'success' : 'neutral'}>
                {user.activo ? 'Activo' : 'Inactivo'}
              </Badge>
            </dd>
          </div>
          <div>
            <dt className="text-xs text-ink-subtle">Teléfono</dt>
            <dd className="text-sm text-ink">{user.telefono ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-xs text-ink-subtle">Último acceso</dt>
            <dd className="text-sm text-ink">
              {user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString('es-ES') : 'Nunca'}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-ink-subtle">Debe cambiar contraseña</dt>
            <dd className="text-sm text-ink">{user.mustChangePassword ? 'Sí' : 'No'}</dd>
          </div>
          <div>
            <dt className="text-xs text-ink-subtle">Sesiones activas</dt>
            <dd className="text-sm text-ink">{activeSessions}</dd>
          </div>
        </dl>
      </Section>

      <PermissionGate permiso="usuarios.reset_password" user={actor}>
        <Section title="Restablecer contraseña">
          <ResetPasswordForm targetId={user.id} />
        </Section>
      </PermissionGate>

      <PermissionGate permiso="usuarios.editar" user={actor}>
        <Section title="Sesiones">
          <RevokeSessionsForm targetId={user.id} />
        </Section>
      </PermissionGate>

      {!isSelf ? (
        <PermissionGate permiso="usuarios.desactivar" user={actor}>
          <Section title="Estado de la cuenta">
            <ActivateToggleForm targetId={user.id} activo={user.activo} />
          </Section>
        </PermissionGate>
      ) : null}
    </div>
  );
}
