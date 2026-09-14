import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { db, withPlatformAdmin, withTenant } from '@/lib/db';
import { createTenant, listTenants, setTenantEstado } from './tenants';
import { ValidationError } from '@/lib/errors';

const SLUG = 't-platform-tenants';

// Limpieza por capas: User_tenantId_fkey y Role_tenantId_fkey son ON DELETE
// RESTRICT (ver prisma/migrations/20260914050000_tenant_id_everywhere), así que
// borrar el Tenant directo falla mientras existan User/Role dependientes que
// createTenant siembra. RolePermission cae solo (onDelete: Cascade en Role).
async function cleanup() {
  await withPlatformAdmin(async () => {
    await db.user.deleteMany({ where: { tenant: { slug: SLUG } } });
    await db.role.deleteMany({ where: { tenant: { slug: SLUG } } });
    await db.tenant.deleteMany({ where: { slug: SLUG } });
  });
}

beforeEach(cleanup);
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
