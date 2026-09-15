import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { db, withPlatformAdmin, withTenant } from '@/lib/db';
import { createPlatformSession, validatePlatformSession } from './session';

const EMAIL = 't-platform-session@tuapp.com';

const CROSS_TENANT_SLUG = 't-platform-session-cross';

async function seedAdmin() {
  return withPlatformAdmin(() =>
    db.platformAdmin.create({
      data: { nombre: 'Super', email: EMAIL, passwordHash: '' },
    }),
  );
}

async function cleanupCrossTenant() {
  // No anida withTenant dentro de withPlatformAdmin: en el proyecto "integration"
  // DB_POOL_MAX=1 (test/vitest.setup.ts), así que ambos usan el mismo pool de una
  // sola conexión — anidar las transacciones deja a la interna esperando por
  // siempre una conexión que la externa ya tiene tomada. Se llaman en secuencia,
  // cada una soltando su conexión al terminar, igual que en db-isolation.itest.ts.
  const tenant = await withPlatformAdmin(() => db.tenant.findUnique({ where: { slug: CROSS_TENANT_SLUG } }));
  if (!tenant) return;
  await withTenant(tenant.id, async () => {
    await db.user.deleteMany({ where: { tenantId: tenant.id } });
    await db.role.deleteMany({ where: { tenantId: tenant.id } });
  });
  await withPlatformAdmin(() => db.tenant.delete({ where: { id: tenant.id } }));
}

beforeEach(async () => {
  await withPlatformAdmin(() => db.platformAdmin.deleteMany({ where: { email: EMAIL } }));
  await cleanupCrossTenant();
});
afterAll(async () => {
  await withPlatformAdmin(() => db.platformAdmin.deleteMany({ where: { email: EMAIL } }));
  await cleanupCrossTenant();
});

describe('sesión de PlatformAdmin', () => {
  it('crea una sesión válida y la valida correctamente', async () => {
    const admin = await seedAdmin();
    const { token } = await createPlatformSession(admin.id, {});
    const res = await validatePlatformSession(token);
    expect(res.status).toBe('ok');
  });

  it('rechaza un token inexistente', async () => {
    const res = await validatePlatformSession('token-que-no-existe');
    expect(res.status).toBe('invalid');
  });

  it('rechaza undefined', async () => {
    const res = await validatePlatformSession(undefined);
    expect(res.status).toBe('invalid');
  });

  it('el token de una sesión de tenant no autentica como PlatformAdmin', async () => {
    // Prueba explícita de la separación de planos que pide el spec: son tablas
    // distintas, así que un token nacido en Session (usuarios de tenant) no
    // debería siquiera coincidir por casualidad con una fila de
    // PlatformAdminSession — confirma que no hay forma de que una sesión de
    // negocio se cuele como sesión de plataforma.
    const { createSession } = await import('@/lib/auth/session');
    const plan = await withPlatformAdmin(() =>
      db.plan.upsert({
        where: { nombre: 'Estándar' },
        update: {},
        create: { nombre: 'Estándar', maxUsuarios: 10, maxSucursales: 3 },
      }),
    );
    const tenant = await withPlatformAdmin(() =>
      db.tenant.create({ data: { slug: CROSS_TENANT_SLUG, nombre: 'X', estado: 'ACTIVO', planId: plan.id } }),
    );
    const userId = await withTenant(tenant.id, async () => {
      const role = await db.role.create({ data: { tenantId: tenant.id, nombre: 'Cajero' } });
      const user = await db.user.create({
        data: { tenantId: tenant.id, nombre: 'U', email: 'u@x.com', passwordHash: '', roleId: role.id },
      });
      return user.id;
    });
    const { token: tenantToken } = await createSession(userId, {});

    const res = await validatePlatformSession(tenantToken);
    expect(res.status).toBe('invalid');
  });
});
