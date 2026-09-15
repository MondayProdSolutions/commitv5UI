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

describe('catálogo de RLS: cada tabla con tenantId tiene RLS forzado y al menos una política', () => {
  // Guardia de regresión (Task 3 / revisión final): la única capa que filtra
  // los SELECT de las 21 tablas de negocio es RLS — el Proxy `db` de
  // src/lib/db.ts no inyecta ningún `where` de tenant. Si una migración futura
  // agrega una tabla con columna `tenantId` y olvida ENABLE+FORCE ROW LEVEL
  // SECURITY y una política, esa tabla queda expuesta entre tenants en
  // silencio, sin que nada lo detecte — hasta este test. Se consulta el
  // catálogo de Postgres directamente (pg_class/pg_attribute/pg_policies), no
  // el schema de Prisma, para que la prueba refleje lo que el servidor
  // realmente aplica.
  it('ninguna tabla con columna tenantId carece de RLS forzado + política', async () => {
    // Nota: el callback de withPlatformAdmin debe ser `async` y usar `await`
    // sobre la consulta cruda explícitamente (no basta con devolver la Promise
    // directamente) — de lo contrario Prisma puede cerrar/commitear la
    // transacción interactiva antes de que la consulta cruda llegue a
    // despacharse, y falla con "Transaction API error: Transaction not
        // found". Se confirmó con una reproducción mínima. Las llamadas a
    // modelos (db.tenant.findMany, etc.) no sufren esto.
    const filas = await withPlatformAdmin(async () => {
      return await db.$queryRawUnsafe<{ relname: string }[]>(`
        SELECT c.relname FROM pg_class c JOIN pg_attribute a ON a.attrelid = c.oid
        WHERE a.attname = 'tenantId' AND c.relkind = 'r' AND a.attnum > 0 AND NOT a.attisdropped
          AND (NOT c.relrowsecurity OR NOT c.relforcerowsecurity
               OR NOT EXISTS (SELECT 1 FROM pg_policies p WHERE p.tablename = c.relname));
      `);
    });
    expect(filas).toEqual([]);
  });

  it('sanity: la consulta sí encuentra al menos una tabla con tenantId (no está vacía por error)', async () => {
    const filas = await withPlatformAdmin(async () => {
      return await db.$queryRawUnsafe<{ relname: string }[]>(`
        SELECT c.relname FROM pg_class c JOIN pg_attribute a ON a.attrelid = c.oid
        WHERE a.attname = 'tenantId' AND c.relkind = 'r' AND a.attnum > 0 AND NOT a.attisdropped;
      `);
    });
    expect(filas.length).toBeGreaterThanOrEqual(21);
  });
});
