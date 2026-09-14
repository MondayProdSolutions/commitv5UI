import { inject } from 'vitest';

// globalSetup provides this from a separate process; make it visible to the worker.
process.env.DATABASE_URL = inject('databaseUrl');
// Necesario para que `set_config(..., false)` (alcance de sesión) de
// `__setTestTenantId` persista de forma confiable — ver la nota en esa función,
// src/lib/db.ts. Debe fijarse antes de importar src/lib/db.
process.env.DB_POOL_MAX = '1';

// La búsqueda del tenant por slug no puede pasar por `db` (el Proxy exige contexto
// activo para cualquier modelo, y ese contexto todavía no existe en este punto) —
// se usa un PrismaClient aparte y desechable, igual que test/pg-embedded.ts.
const { PrismaClient } = await import('@prisma/client');
const { PrismaPg } = await import('@prisma/adapter-pg');
const bootstrap = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});
const tenant = await bootstrap.tenant.findUniqueOrThrow({ where: { slug: 'default' } });
await bootstrap.$disconnect();

const { __setTestTenantId } = await import('../src/lib/db');
await __setTestTenantId(tenant.id);
