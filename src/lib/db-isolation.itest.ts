import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { db, withTenant, withPlatformAdmin } from './db';

const SLUG_A = 't-iso-a';
const SLUG_B = 't-iso-b';

async function makeTenant(slug: string) {
  return withPlatformAdmin(async () => {
    const plan = await db.plan.upsert({
      where: { nombre: 'Estándar' },
      update: {},
      create: { nombre: 'Estándar', maxUsuarios: 10, maxSucursales: 3 },
    });
    return db.tenant.upsert({
      where: { slug },
      update: {},
      create: { slug, nombre: slug, estado: 'ACTIVO', planId: plan.id },
    });
  });
}

beforeEach(async () => {
  await withPlatformAdmin(async () => {
    await db.taxRate.deleteMany({ where: { tenant: { slug: { in: [SLUG_A, SLUG_B] } } } });
    await db.tenant.deleteMany({ where: { slug: { in: [SLUG_A, SLUG_B] } } });
  });
});
afterAll(async () => {
  await withPlatformAdmin(async () => {
    await db.taxRate.deleteMany({ where: { tenant: { slug: { in: [SLUG_A, SLUG_B] } } } });
    await db.tenant.deleteMany({ where: { slug: { in: [SLUG_A, SLUG_B] } } });
  });
});

describe('aislamiento entre tenants', () => {
  it('el tenant A nunca ve filas del tenant B, ni con findMany ni con consulta cruda', async () => {
    const tenantA = await makeTenant(SLUG_A);
    const tenantB = await makeTenant(SLUG_B);

    await withTenant(tenantA.id, async () => {
      await db.taxRate.create({ data: { nombre: 'Solo A', tasa: 0.16, esDefault: false } });
    });
    await withTenant(tenantB.id, async () => {
      await db.taxRate.create({ data: { nombre: 'Solo B', tasa: 0.08, esDefault: false } });
    });

    await withTenant(tenantA.id, async () => {
      const visibles = await db.taxRate.findMany({ where: { nombre: { in: ['Solo A', 'Solo B'] } } });
      expect(visibles.map((t) => t.nombre)).toEqual(['Solo A']);

      // Consulta cruda que ignora deliberadamente cualquier filtro de aplicación:
      // si esto devolviera la fila de B, la protección real (RLS) no estaría activa.
      const raw = await db.$queryRawUnsafe<{ nombre: string }[]>(
        `SELECT "nombre" FROM "TaxRate" WHERE "nombre" IN ('Solo A', 'Solo B')`,
      );
      expect(raw.map((r) => r.nombre)).toEqual(['Solo A']);
    });
  });

  it('withPlatformAdmin sí ve filas de ambos tenants', async () => {
    const tenantA = await makeTenant(SLUG_A);
    const tenantB = await makeTenant(SLUG_B);
    await withTenant(tenantA.id, async () => {
      await db.taxRate.create({ data: { nombre: 'Solo A2', tasa: 0.16, esDefault: false } });
    });
    await withTenant(tenantB.id, async () => {
      await db.taxRate.create({ data: { nombre: 'Solo B2', tasa: 0.08, esDefault: false } });
    });

    await withPlatformAdmin(async () => {
      const todas = await db.taxRate.findMany({ where: { nombre: { in: ['Solo A2', 'Solo B2'] } } });
      expect(todas.map((t) => t.nombre).sort()).toEqual(['Solo A2', 'Solo B2']);
    });
  });
});
