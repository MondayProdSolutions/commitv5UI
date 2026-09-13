import { cookies, headers } from 'next/headers';
import { db } from '@/lib/db';
import { SESSION_COOKIE, validateSession } from './session';
import { getIdleTimeoutMinutes } from '@/lib/settings';
import { can, type AuthUser, type PermissionKey } from './rbac';
import { ForbiddenError } from '@/lib/errors';
import { logActivity } from '@/lib/audit';
import { getClientIp } from '@/lib/http';

export async function loadAuthUser(userId: string): Promise<AuthUser | null> {
  const u = await db.user.findUnique({
    where: { id: userId },
    include: { role: { include: { permissions: true } } },
  });
  if (!u || !u.activo) return null;
  return {
    id: u.id, nombre: u.nombre, email: u.email,
    roleId: u.roleId, roleName: u.role.nombre,
    permissions: new Set(u.role.permissions.map((p) => p.permiso)),
    mustChangePassword: u.mustChangePassword,
  };
}

export async function getCurrentUser(): Promise<AuthUser | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const res = await validateSession(token, await getIdleTimeoutMinutes());
  if (res.status !== 'ok' || !res.session) return null;
  return loadAuthUser(res.session.userId);
}

export async function requireUser(): Promise<AuthUser> {
  const user = await getCurrentUser();
  if (!user) throw new ForbiddenError('NO_SESSION', 'Sesión requerida');
  return user;
}

export async function requirePermission(permiso: PermissionKey): Promise<AuthUser> {
  const user = await requireUser();
  if (!can(user, permiso)) {
    const h = await headers();
    await logActivity({
      actorId: user.id, accion: 'auth.forbidden',
      metadata: { ruta: h.get('x-pathname') ?? '', permisoRequerido: permiso },
      ip: getClientIp(h),
    });
    const err = new ForbiddenError('FORBIDDEN', 'No tienes permiso para esta acción');
    // The only field that survives to the client error boundary in production.
    (err as Error & { digest?: string }).digest = 'FORBIDDEN';
    throw err;
  }
  return user;
}
