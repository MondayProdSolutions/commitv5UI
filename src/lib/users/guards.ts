import type { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { MANAGER_GUARD_PERMISSIONS } from '@/lib/auth/rbac';
import { ValidationError } from '@/lib/errors';

type Client = Prisma.TransactionClient | typeof db;

/** El rol tiene TODOS los permisos de `MANAGER_GUARD_PERMISSIONS`. */
export async function roleHasAllGuardPermissions(roleId: string, tx: Client = db): Promise<boolean> {
  const count = await tx.rolePermission.count({
    where: { roleId, permiso: { in: [...MANAGER_GUARD_PERMISSIONS] } },
  });
  return count === MANAGER_GUARD_PERMISSIONS.length;
}

/** Usuarios activos cuyo rol cumple el guard (opcionalmente excluyendo a uno). */
export async function countActiveGuardUsers(excludeUserId?: string, tx: Client = db): Promise<number> {
  const users = await tx.user.findMany({
    where: { activo: true, ...(excludeUserId ? { id: { not: excludeUserId } } : {}) },
    select: { roleId: true },
  });
  const guardRoleIds = new Set<string>();
  for (const roleId of new Set(users.map((u) => u.roleId))) {
    if (await roleHasAllGuardPermissions(roleId, tx)) guardRoleIds.add(roleId);
  }
  return users.filter((u) => guardRoleIds.has(u.roleId)).length;
}

/**
 * Lanza `ValidationError` si la operación dejaría al sistema con 0 usuarios-guardián
 * (activos y con TODOS los `MANAGER_GUARD_PERMISSIONS`).
 * - `deactivating`: se está desactivando a `excludeUserId`.
 * - `prospectiveRoleId`: se simula un cambio de rol de `excludeUserId` a ese rol.
 */
export async function assertGuardPreserved(
  opts: { excludeUserId?: string; prospectiveRoleId?: string; deactivating?: boolean },
  tx: Client = db,
): Promise<void> {
  let remaining = await countActiveGuardUsers(opts.excludeUserId, tx);
  if (!opts.deactivating && opts.prospectiveRoleId && opts.excludeUserId) {
    if (await roleHasAllGuardPermissions(opts.prospectiveRoleId, tx)) remaining += 1;
  }
  if (remaining < 1) {
    throw new ValidationError(
      { _form: 'Esta acción dejaría al sistema sin ningún administrador con permisos de gestión.' },
      'Guardián del sistema requerido',
    );
  }
}
