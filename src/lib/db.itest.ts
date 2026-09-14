import { describe, it, expect } from 'vitest';
import { db, withTenant, withPlatformAdmin, getCurrentTenantId } from './db';

describe('withTenant', () => {
  it('activa el tenantId dado y permite consultar contra Postgres real', async () => {
    const tenant = await withPlatformAdmin(() =>
      db.tenant.findFirstOrThrow({ where: { slug: 'default' } }),
    );

    await withTenant(tenant.id, async () => {
      expect(getCurrentTenantId()).toBe(tenant.id);
      const roles = await db.role.findMany();
      expect(Array.isArray(roles)).toBe(true);
    });
  });

  it('fija app.tenant_id en la sesión de Postgres para la duración de la transacción', async () => {
    const tenant = await withPlatformAdmin(() =>
      db.tenant.findFirstOrThrow({ where: { slug: 'default' } }),
    );

    await withTenant(tenant.id, async () => {
      const rows = await db.$queryRaw<{ current_setting: string }[]>`
        SELECT current_setting('app.tenant_id', true)
      `;
      expect(rows[0].current_setting).toBe(tenant.id);
    });
  });
});

describe('withPlatformAdmin', () => {
  it('fija app.platform_admin en la sesión y permite consultar sin un tenant activo', async () => {
    await withPlatformAdmin(async () => {
      const rows = await db.$queryRaw<{ current_setting: string }[]>`
        SELECT current_setting('app.platform_admin', true)
      `;
      expect(rows[0].current_setting).toBe('true');

      const tenants = await db.tenant.findMany();
      expect(tenants.length).toBeGreaterThan(0);
    });
  });

  it('getCurrentTenantId lanza dentro de withPlatformAdmin (no hay tenant activo)', async () => {
    await withPlatformAdmin(async () => {
      expect(() => getCurrentTenantId()).toThrow('No hay contexto de tenant activo');
    });
  });
});
