import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { db, withPlatformAdmin } from '../db';
import { resolveTenantSlug } from './resolve';

const SLUG = 't-resolve-itest';

beforeEach(async () => {
  await withPlatformAdmin(() => db.tenant.deleteMany({ where: { slug: SLUG } }));
});
afterAll(async () => {
  await withPlatformAdmin(() => db.tenant.deleteMany({ where: { slug: SLUG } }));
});

describe('resolución de tenant contra datos reales', () => {
  it('un slug resuelto por resolveTenantSlug encuentra su Tenant', async () => {
    const plan = await withPlatformAdmin(() =>
      db.plan.upsert({
        where: { nombre: 'Estándar' },
        update: {},
        create: { nombre: 'Estándar', maxUsuarios: 10, maxSucursales: 3 },
      }),
    );
    await withPlatformAdmin(() =>
      db.tenant.create({ data: { slug: SLUG, nombre: 'Prueba', estado: 'ACTIVO', planId: plan.id } }),
    );

    const slug = resolveTenantSlug(`${SLUG}.tuapp.com`);
    expect(slug).toBe(SLUG);

    const tenant = await withPlatformAdmin(() => db.tenant.findUnique({ where: { slug: slug! } }));
    expect(tenant?.nombre).toBe('Prueba');
  });
});
