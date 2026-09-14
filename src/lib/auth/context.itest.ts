import { describe, it, expect, beforeEach, vi } from 'vitest';
import { db, withTenant, getCurrentTenantId } from '@/lib/db';
import { hashPassword } from './password';
import { createSession } from './session';

const cookieStore = { value: undefined as string | undefined };
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: (n: string) => (cookieStore.value ? { name: n, value: cookieStore.value } : undefined) }),
  headers: async () => new Headers(),
}));

import { getCurrentUser, requirePermission } from './context';

async function makeUser(roleName: string, activo = true) {
  const role = await db.role.findFirstOrThrow({ where: { nombre: roleName } });
  return db.user.create({
    data: { nombre: roleName, email: `${roleName}-${Math.random()}@pos.com`,
      passwordHash: await hashPassword('xxxxxxxxxx'), roleId: role.id, activo },
  });
}

beforeEach(async () => {
  await db.session.deleteMany();
  await db.user.deleteMany();
  await db.activityLog.deleteMany();
  cookieStore.value = undefined;
});

describe('getCurrentUser', () => {
  it('null sin cookie', async () => {
    expect(await getCurrentUser()).toBeNull();
  });
  it('devuelve el usuario con permisos de su rol', async () => {
    const u = await makeUser('Administrador');
    cookieStore.value = (await createSession(u.id, {})).token;
    const cu = await getCurrentUser();
    expect(cu?.email).toBe(u.email);
    expect(cu?.permissions.has('roles.gestionar')).toBe(true);
  });
  it('null si el usuario está inactivo', async () => {
    const u = await makeUser('Cajero', false);
    cookieStore.value = (await createSession(u.id, {})).token;
    expect(await getCurrentUser()).toBeNull();
  });
});

describe('requirePermission', () => {
  it('lanza y audita si falta el permiso', async () => {
    const u = await makeUser('Cajero');
    cookieStore.value = (await createSession(u.id, {})).token;
    await expect(requirePermission('usuarios.crear')).rejects.toMatchObject({ code: 'FORBIDDEN' });
    const log = await db.activityLog.findFirst({ where: { accion: 'auth.forbidden' } });
    expect(log?.metadata).toMatchObject({ permisoRequerido: 'usuarios.crear' });
  });

  // Reproduce el escenario real: todo call site de requirePermission (page,
  // Route Handler, Server Action) corre dentro de un withTenant(...) abierto
  // por el llamador (ver p. ej. createUserAction en admin/usuarios/actions.ts).
  // Si el throw de ForbiddenError se propaga hasta ese withTenant, Prisma
  // revierte SU transacción — y con ella, cualquier INSERT hecho vía el `db`
  // ambiente dentro de esa misma transacción, incluido el log de auditoría
  // que requirePermission acaba de escribir. Este test falla contra el código
  // sin arreglar (el log no sobrevive) y debe pasar tras la corrección.
  it('el log de auditoría sobrevive aunque requirePermission corra dentro de un withTenant que revierte', async () => {
    const u = await makeUser('Cajero');
    cookieStore.value = (await createSession(u.id, {})).token;
    const tenantId = getCurrentTenantId();

    await expect(
      withTenant(tenantId, async () => {
        await requirePermission('usuarios.crear');
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });

    const log = await db.activityLog.findFirst({
      where: { accion: 'auth.forbidden', actorId: u.id },
    });
    expect(log?.metadata).toMatchObject({ permisoRequerido: 'usuarios.crear' });
  });
});
