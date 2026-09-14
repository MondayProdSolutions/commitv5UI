import { AsyncLocalStorage } from 'node:async_hooks';
import { PrismaClient, type Prisma } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL no está definida');
}
const connectionString = process.env.DATABASE_URL;

type TxClient = Prisma.TransactionClient;

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

// DB_POOL_MAX solo lo fija test/vitest.setup.ts (Step 9) — necesario para que
// `set_config(..., false)` (alcance de sesión, ver __setTestTenantId más abajo)
// persista de forma confiable: con más de una conexión en el pool, una consulta
// posterior podría caer en una conexión donde nunca se fijó la variable.
const rawPrisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter: new PrismaPg({
      connectionString,
      max: process.env.DB_POOL_MAX ? Number(process.env.DB_POOL_MAX) : undefined,
    }),
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = rawPrisma;

type TenantStore = { tx: TxClient; tenantId: string | null };

const storage = new AsyncLocalStorage<TenantStore>();

// Solo lo usa __setTestTenantId (Step 9), como respaldo cuando no hay store de
// AsyncLocalStorage activo. Por qué existe: en esta versión de Vitest,
// `storage.enterWith(...)` llamado desde un hook (`beforeAll`/`setupFiles`) no se
// propaga al cuerpo de los `it()` del mismo archivo — la fase de hooks y la fase de
// ejecución de tests corren en cadenas asíncronas que async_hooks no relaciona como
// una sola (se confirmó con una reproducción mínima sin Prisma de por medio: un
// `AsyncLocalStorage` aislado con `enterWith()` en `beforeAll` tampoco sobrevive a
// un `it()` del mismo archivo). Como es solo un valor de módulo (no depende de
// continuidad asíncrona), sí es visible desde cualquier punto del proceso. `db` y
// `getCurrentTenantId()` lo consultan únicamente cuando no hay store de ALS — que
// es exactamente lo que produce `withTenant`/`withPlatformAdmin` en producción, así
// que esto no afecta su aislamiento real (ambos siguen usando `storage.run()`).
let testFallbackStore: TenantStore | null = null;

/** Lo que usa el resto de la app: `db.user.findMany()`, `db.sale.create(...)`, etc.
 *  Reenvía cada llamada a la transacción del tenant activo en este request. */
export const db = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    const store = storage.getStore() ?? testFallbackStore;
    if (!store) {
      throw new Error(
        `db.${String(prop)} llamado sin contexto de tenant activo. ` +
          'Envuelve el punto de entrada con withTenant() o withPlatformAdmin().',
      );
    }
    return store.tx[prop as keyof TxClient];
  },
}) as unknown as PrismaClient;

/** Corre `fn` con `app.tenant_id` fijado para toda la transacción — RLS y el
 *  DEFAULT de columna de cada tabla dependen de esta variable de sesión. */
export async function withTenant<T>(tenantId: string, fn: () => Promise<T>): Promise<T> {
  return rawPrisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`;
      return storage.run({ tx, tenantId }, fn);
    },
    { timeout: 15_000 },
  );
}

/** Igual que withTenant, pero para Super Admin: las políticas RLS dejan pasar
 *  cualquier tenant cuando esta bandera de sesión está activa (Task 3). */
export async function withPlatformAdmin<T>(fn: () => Promise<T>): Promise<T> {
  return rawPrisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.platform_admin', 'true', true)`;
      return storage.run({ tx, tenantId: null }, fn);
    },
    { timeout: 15_000 },
  );
}

/** El tenantId de la request activa. Lanza si no hay contexto — falla ruidoso en
 *  vez de dejar pasar una operación sin tenant. */
export function getCurrentTenantId(): string {
  const store = storage.getStore() ?? testFallbackStore;
  if (!store?.tenantId) throw new Error('No hay contexto de tenant activo.');
  return store.tenantId;
}

// Pool dedicado para __setTestTenantId — deliberadamente NO reutiliza `rawPrisma`.
// `withTenant`/`withPlatformAdmin` no necesitan este hook: cada llamada abre su
// propia transacción fresca y fija la variable con `set_config(..., true)` (alcance
// de transacción, "SET LOCAL"), que por diseño no debe sobrevivir a otra conexión.
// `__setTestTenantId`, en cambio, fija la variable UNA vez para que persista toda
// la ejecución del worker — y por eso es vulnerable a que `@prisma/adapter-pg`
// descarte la conexión pooleada tras cualquier error de consulta (`conn.release(error)`
// en su código de manejo de transacciones/errores), abriendo una conexión de
// reemplazo sin la variable fijada. El hook `pool.on('connect', ...)` de abajo cierra
// ese hueco de raíz: reaplica `app.tenant_id` en CUALQUIER conexión física nueva que
// abra este pool, incluidas las de reemplazo, en vez de parchar cada sitio de
// llamada que resulte afectado.
let testPool: Pool | null = null;
let testPoolPrisma: PrismaClient | null = null;

function getTestPoolPrisma(): PrismaClient {
  if (!testPoolPrisma) {
    testPool = new Pool({
      connectionString,
      max: process.env.DB_POOL_MAX ? Number(process.env.DB_POOL_MAX) : undefined,
    });
    testPool.on('connect', (client) => {
      const tenantId = testFallbackStore?.tenantId;
      if (tenantId) {
        client
          .query("SELECT set_config('app.tenant_id', $1, false)", [tenantId])
          .catch((err: unknown) => {
            console.error('__setTestTenantId: no se pudo re-aplicar app.tenant_id tras un reconnect', err);
          });
      }
    });
    testPoolPrisma = new PrismaClient({ adapter: new PrismaPg(testPool) });
  }
  return testPoolPrisma;
}

/** Solo para `test/vitest.setup.ts` (Step 9): fija el tenant activo para toda la
 *  ejecución del worker de Vitest, sin envolver cada test individualmente.
 *  A diferencia de withTenant, usa `set_config(..., false)` — alcance de SESIÓN,
 *  no de transacción — porque aquí no hay una única transacción envolviendo todos
 *  los tests. Guarda el store en `testFallbackStore` (ver la nota junto a esa
 *  variable) en vez de (solo) `storage.enterWith(...)`, porque enterWith no
 *  sobrevive al límite entre hooks y tests en esta versión de Vitest. */
export async function __setTestTenantId(tenantId: string): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('__setTestTenantId no puede usarse en producción.');
  }
  const prisma = getTestPoolPrisma();
  await prisma.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, false)`;
  const store: TenantStore = { tx: prisma as unknown as TxClient, tenantId };
  storage.enterWith(store);
  testFallbackStore = store;
}
