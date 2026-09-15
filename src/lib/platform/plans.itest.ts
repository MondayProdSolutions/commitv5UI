import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import { db, withPlatformAdmin } from '@/lib/db';
import { ForbiddenError } from '@/lib/errors';
import { hashPassword } from '@/lib/auth/password';
import { createPlatformSession } from '@/lib/platform-auth/session';

const NOMBRE = 't-plan-itest';
const ADMIN_EMAIL = 't-plan-itest-admin@tuapp.com';

// Simula la cookie de sesión de Super Admin que getCurrentPlatformAdmin() (y
// por lo tanto requirePlatformAdmin()) leen vía next/headers — mismo patrón
// que src/lib/auth/context.itest.ts usa para AuthUser.
const platformCookie = { value: undefined as string | undefined };
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (n: string) => (platformCookie.value ? { name: n, value: platformCookie.value } : undefined),
  }),
}));

import { createPlan, listPlans, updatePlan } from './plans';

async function cleanup() {
  await withPlatformAdmin(async () => {
    await db.plan.deleteMany({ where: { nombre: NOMBRE } });
    await db.platformAdmin.deleteMany({ where: { email: ADMIN_EMAIL } });
  });
}

async function seedPlatformSession() {
  const passwordHash = await hashPassword('xxxxxxxxxx');
  const admin = await withPlatformAdmin(() =>
    db.platformAdmin.create({ data: { nombre: 'Super', email: ADMIN_EMAIL, passwordHash } }),
  );
  const { token } = await createPlatformSession(admin.id, {});
  platformCookie.value = token;
}

beforeEach(async () => {
  await cleanup();
  await seedPlatformSession();
});
afterAll(cleanup);

describe('createPlan / listPlans / updatePlan', () => {
  it('crea un plan y aparece en el listado', async () => {
    const { id } = await createPlan({ nombre: NOMBRE, maxUsuarios: 5, maxSucursales: 1 });
    const planes = await listPlans();
    expect(planes.find((p) => p.id === id)?.maxUsuarios).toBe(5);
  });

  it('actualiza los límites de un plan existente', async () => {
    const { id } = await createPlan({ nombre: NOMBRE, maxUsuarios: 5, maxSucursales: 1 });
    await updatePlan(id, { maxUsuarios: 20 });
    const planes = await listPlans();
    expect(planes.find((p) => p.id === id)?.maxUsuarios).toBe(20);
  });
});

// Fix 1 (revisión final de rama, CRITICAL): ver la nota equivalente en
// src/lib/platform/tenants.itest.ts. createPlan corría dentro de
// withPlatformAdmin() (que baja RLS) sin verificar identidad alguna.
describe('autorización: exige sesión de Super Admin', () => {
  beforeEach(() => {
    platformCookie.value = undefined;
  });

  it('listPlans lanza ForbiddenError sin sesión', async () => {
    await expect(listPlans()).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('createPlan lanza ForbiddenError sin sesión', async () => {
    await expect(createPlan({ nombre: NOMBRE, maxUsuarios: 5, maxSucursales: 1 })).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    const existe = await withPlatformAdmin(() => db.plan.findUnique({ where: { nombre: NOMBRE } }));
    expect(existe).toBeNull();
  });

  it('updatePlan lanza ForbiddenError sin sesión', async () => {
    await expect(updatePlan('no-importa', { maxUsuarios: 5 })).rejects.toBeInstanceOf(ForbiddenError);
  });
});
