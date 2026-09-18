import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import { db, withPlatformAdmin, withTenant } from '@/lib/db';
import { ValidationError, ForbiddenError } from '@/lib/errors';
import { ALL_PERMISSION_KEYS } from '@/lib/auth/rbac';
import { hashPassword } from '@/lib/auth/password';
import { createPlatformSession } from '@/lib/platform-auth/session';
import { openCashSession } from '@/lib/cash/sessions';

const SLUG = 't-platform-tenants';
const ADMIN_EMAIL = 't-platform-tenants-admin@tuapp.com';

// Simula la cookie de sesión de Super Admin que getCurrentPlatformAdmin() (y
// por lo tanto requirePlatformAdmin()) leen vía next/headers — mismo patrón
// que src/lib/auth/context.itest.ts usa para AuthUser.
const platformCookie = { value: undefined as string | undefined };
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (n: string) => (platformCookie.value ? { name: n, value: platformCookie.value } : undefined),
  }),
}));

import { createTenant, listTenants, setTenantEstado } from './tenants';

// Limpieza por capas: User_tenantId_fkey, Role_tenantId_fkey y
// FolioCounter_tenantId_fkey son ON DELETE RESTRICT (ver
// prisma/migrations/20260914050000_tenant_id_everywhere), así que borrar el
// Tenant directo falla mientras existan User/Role/FolioCounter dependientes
// que createTenant siembra. RolePermission cae solo (onDelete: Cascade en Role).
// CashSession_abiertaPorId_fkey también es RESTRICT contra User — hay que
// borrar la caja (que el test de folios abre) antes que su usuario.
async function cleanup() {
  await withPlatformAdmin(async () => {
    await db.activityLog.deleteMany({ where: { tenant: { slug: SLUG } } });
    await db.cashSession.deleteMany({ where: { tenant: { slug: SLUG } } });
    await db.user.deleteMany({ where: { tenant: { slug: SLUG } } });
    await db.role.deleteMany({ where: { tenant: { slug: SLUG } } });
    await db.folioCounter.deleteMany({ where: { tenant: { slug: SLUG } } });
    await db.tenant.deleteMany({ where: { slug: SLUG } });
    await db.platformAdmin.deleteMany({ where: { email: ADMIN_EMAIL } });
  });
}

/** Crea un PlatformAdmin + PlatformAdminSession real y arma la cookie mockeada
 *  para que requirePlatformAdmin() vea una sesión válida. */
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

describe('createTenant', () => {
  it('crea el tenant, su plan, y un usuario Administrador que puede iniciar sesión', async () => {
    const plan = await withPlatformAdmin(() =>
      db.plan.upsert({
        where: { nombre: 'Estándar' },
        update: {},
        create: { nombre: 'Estándar', maxUsuarios: 10, maxSucursales: 3 },
      }),
    );

    const { tenantId } = await createTenant({
      slug: SLUG,
      nombre: 'Negocio de prueba',
      planId: plan.id,
      adminNombre: 'Admin',
      adminEmail: 'admin@negocio-prueba.com',
      adminPassword: 'xxxxxxxxxx',
    });

    await withTenant(tenantId, async () => {
      const admin = await db.user.findFirstOrThrow({ where: { email: 'admin@negocio-prueba.com' } });
      expect(admin.roleId).toBeTruthy();
      const rolAdmin = await db.role.findUniqueOrThrow({ where: { id: admin.roleId } });
      expect(rolAdmin.nombre).toBe('Administrador');

      const permisos = await db.rolePermission.findMany({ where: { roleId: rolAdmin.id } });
      expect(permisos.map((p) => p.permiso).sort()).toEqual([...ALL_PERMISSION_KEYS].sort());
    });
  });

  // Regresión: createTenant no sembraba FolioCounter (V/D/C) — cualquier tenant
  // creado desde /plataforma quedaba con caja/ventas/devoluciones rotas desde
  // el primer uso (nextFolio lanzaba "FolioCounter '<serie>' no existe").
  it('deja folios listos: se puede abrir caja de inmediato en el tenant nuevo', async () => {
    const plan = await withPlatformAdmin(() =>
      db.plan.upsert({
        where: { nombre: 'Estándar' },
        update: {},
        create: { nombre: 'Estándar', maxUsuarios: 10, maxSucursales: 3 },
      }),
    );

    const { tenantId } = await createTenant({
      slug: SLUG,
      nombre: 'Negocio de prueba',
      planId: plan.id,
      adminNombre: 'Admin',
      adminEmail: 'folios@negocio-prueba.com',
      adminPassword: 'xxxxxxxxxx',
    });

    await withTenant(tenantId, async () => {
      const series = await db.folioCounter.findMany({ where: { tenantId } });
      expect(series.map((s) => s.serie).sort()).toEqual(['C', 'D', 'V']);

      const admin = await db.user.findFirstOrThrow({ where: { email: 'folios@negocio-prueba.com' } });
      const { folio } = await openCashSession(admin.id, 0, null);
      expect(folio).toBe('C-000001');
    });
  });

  it('rechaza un slug duplicado', async () => {
    const plan = await withPlatformAdmin(() =>
      db.plan.upsert({
        where: { nombre: 'Estándar' },
        update: {},
        create: { nombre: 'Estándar', maxUsuarios: 10, maxSucursales: 3 },
      }),
    );
    await createTenant({
      slug: SLUG, nombre: 'A', planId: plan.id,
      adminNombre: 'A', adminEmail: 'a@a.com', adminPassword: 'xxxxxxxxxx',
    });
    await expect(
      createTenant({
        slug: SLUG, nombre: 'B', planId: plan.id,
        adminNombre: 'B', adminEmail: 'b@b.com', adminPassword: 'xxxxxxxxxx',
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

describe('setTenantEstado', () => {
  it('cambia el estado del tenant', async () => {
    const plan = await withPlatformAdmin(() =>
      db.plan.upsert({
        where: { nombre: 'Estándar' },
        update: {},
        create: { nombre: 'Estándar', maxUsuarios: 10, maxSucursales: 3 },
      }),
    );
    const { tenantId } = await createTenant({
      slug: SLUG, nombre: 'A', planId: plan.id,
      adminNombre: 'A', adminEmail: 'c@c.com', adminPassword: 'xxxxxxxxxx',
    });
    await setTenantEstado(tenantId, 'SUSPENDIDO');
    const t = await withPlatformAdmin(() => db.tenant.findUniqueOrThrow({ where: { id: tenantId } }));
    expect(t.estado).toBe('SUSPENDIDO');
  });
});

describe('listTenants', () => {
  it('incluye el tenant recién creado con su plan', async () => {
    const plan = await withPlatformAdmin(() =>
      db.plan.upsert({
        where: { nombre: 'Estándar' },
        update: {},
        create: { nombre: 'Estándar', maxUsuarios: 10, maxSucursales: 3 },
      }),
    );
    await createTenant({
      slug: SLUG, nombre: 'Listado', planId: plan.id,
      adminNombre: 'A', adminEmail: 'd@d.com', adminPassword: 'xxxxxxxxxx',
    });
    const tenants = await listTenants();
    expect(tenants.some((t) => t.slug === SLUG && t.planNombre === 'Estándar')).toBe(true);
  });
});

// Fix 1 (revisión final de rama, CRITICAL): antes de este fix, estas tres
// funciones solo llamaban a withPlatformAdmin() — que baja RLS, no verifica
// identidad. Un Server Action que las invocara (createTenantAction,
// setTenantEstado no tiene action propio pero podría tenerlo) era alcanzable
// sin ninguna sesión de Super Admin: el layout de /plataforma/** solo protege
// el render, no el endpoint del Server Action en sí (ver el comentario en
// requirePlatformAdmin, src/lib/platform-auth/context.ts). Estas pruebas
// reproducen exactamente ese escenario: sin cookie de PlatformAdminSession.
describe('autorización: exige sesión de Super Admin', () => {
  beforeEach(() => {
    platformCookie.value = undefined;
  });

  it('listTenants lanza ForbiddenError sin sesión', async () => {
    await expect(listTenants()).rejects.toBeInstanceOf(ForbiddenError);
  });

  // Rama de getCurrentPlatformAdmin() antes sin cubrir directamente: token de
  // cookie PRESENTE pero que no corresponde a ninguna PlatformAdminSession
  // (inválido/caducado/revocado) — distinto del caso "sin cookie" de arriba.
  it('listTenants lanza ForbiddenError con una cookie de sesión inválida', async () => {
    platformCookie.value = 'token-invalido-o-caducado';
    await expect(listTenants()).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('createTenant lanza ForbiddenError sin sesión', async () => {
    await expect(
      createTenant({
        slug: SLUG, nombre: 'Intruso', planId: 'no-importa',
        adminNombre: 'X', adminEmail: 'intruso@x.com', adminPassword: 'xxxxxxxxxx',
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    // Y no debe haber creado nada.
    const existe = await withPlatformAdmin(() => db.tenant.findUnique({ where: { slug: SLUG } }));
    expect(existe).toBeNull();
  });

  it('setTenantEstado lanza ForbiddenError sin sesión', async () => {
    await expect(setTenantEstado('no-importa', 'SUSPENDIDO')).rejects.toBeInstanceOf(ForbiddenError);
  });
});
