import { randomUUID } from 'node:crypto';
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

  it('un create() sin tenantId explícito toma el DEFAULT de columna bajo el set_config transaccional de withTenant', async () => {
    const tenant = await withPlatformAdmin(() =>
      db.tenant.findFirstOrThrow({ where: { slug: 'default' } }),
    );
    const nombre = `db-itest-default-${randomUUID()}`;

    await withTenant(tenant.id, async () => {
      const rate = await db.taxRate.create({ data: { nombre, tasa: 0.16, esDefault: false } });
      expect(rate.tenantId).toBe(tenant.id);
    });

    await withPlatformAdmin(() => db.taxRate.deleteMany({ where: { nombre } }));
  });

  it('un db.$transaction anidado dentro de withTenant hace rollback solo de la transacción interna que falla', async () => {
    const tenant = await withPlatformAdmin(() =>
      db.tenant.findFirstOrThrow({ where: { slug: 'default' } }),
    );
    const nombreOk = `db-itest-nested-ok-${randomUUID()}`;
    const nombreFail = `db-itest-nested-fail-${randomUUID()}`;

    await withTenant(tenant.id, async () => {
      // Transacción interna que sí confirma.
      await db.$transaction(async (tx) => {
        await tx.taxRate.create({ data: { nombre: nombreOk, tasa: 0.16, esDefault: false } });
      });

      // Transacción interna que falla a propósito — debe revertirse sin tumbar la
      // transacción externa de withTenant (Prisma 7 implementa esto con SAVEPOINTs
      // sobre @prisma/adapter-pg).
      await expect(
        db.$transaction(async (tx) => {
          await tx.taxRate.create({ data: { nombre: nombreFail, tasa: 0.16, esDefault: false } });
          throw new Error('rollback a propósito');
        }),
      ).rejects.toThrow('rollback a propósito');

      // La transacción externa sigue viva: se puede seguir consultando en ella.
      const ok = await db.taxRate.findFirst({ where: { nombre: nombreOk } });
      const fail = await db.taxRate.findFirst({ where: { nombre: nombreFail } });
      expect(ok).not.toBeNull();
      expect(fail).toBeNull();
    });

    // Confirma también después de que withTenant hizo commit de la transacción externa.
    const okAfterCommit = await withPlatformAdmin(() => db.taxRate.findFirst({ where: { nombre: nombreOk } }));
    const failAfterCommit = await withPlatformAdmin(() => db.taxRate.findFirst({ where: { nombre: nombreFail } }));
    expect(okAfterCommit).not.toBeNull();
    expect(failAfterCommit).toBeNull();

    await withPlatformAdmin(() =>
      db.taxRate.deleteMany({ where: { nombre: { in: [nombreOk, nombreFail] } } }),
    );
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
