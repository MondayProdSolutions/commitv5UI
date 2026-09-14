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
// posterior podría caer en una conexión donde nunca se fijó la variable. Esa
// necesidad es específica de `testPool` (más abajo): `rawPrisma` solo abre
// transacciones con `set_config(..., true)` de alcance de TRANSACCIÓN
// (SET LOCAL, ver withTenant/withPlatformAdmin/withIndependentTenantTransaction),
// que no depende de en qué conexión caiga cada una.
//
// El piso de 2 de abajo no es solo cosa de test: cualquier llamada a
// withIndependentTenantTransaction anidada dentro de un withTenant ambiente
// todavía abierto (el caso real: requirePermission, ver context.ts) necesita
// una SEGUNDA conexión mientras la primera sigue tomada — con pool=1 eso es
// un interbloqueo garantizado, no solo bajo DB_POOL_MAX=1 de test, sino en
// cualquier despliegue cuyo pool real llegara a 1. En producción, con el pool
// por defecto (10), esto en cambio es presión, no interbloqueo: basta con que
// las conexiones libres se agoten un instante para que la transacción
// independiente tenga que esperar por maxWait antes de conseguir una — por
// eso esa escritura de auditoría es best-effort (ver el try/catch en
// requirePermission) y nunca debe poder reemplazar al ForbiddenError real.
// Aquí simplemente se garantiza el piso mínimo de 2 para que el caso de test
// (pool=1) no sea peor que el de producción.
const rawPrismaPoolMax = process.env.DB_POOL_MAX
  ? Math.max(2, Number(process.env.DB_POOL_MAX))
  : undefined;
const rawPrisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter: new PrismaPg({
      connectionString,
      max: rawPrismaPoolMax,
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

// La conexión real de la app (dev y test) abre sesión como "postgres", que en
// Postgres es superusuario — y un superusuario ignora RLS siempre, sin
// excepción, sin importar ENABLE/FORCE ROW LEVEL SECURITY (ver el comentario al
// principio de prisma/migrations/20260914060000_row_level_security/migration.sql).
// Por eso cada transacción baja de privilegios a "app_role" (rol sin LOGIN
// creado en esa misma migración, sin superusuario ni BYPASSRLS) antes de correr
// el callback: así las políticas RLS sí aplican de verdad a cada consulta que
// pasa por `db`. `SET LOCAL ROLE` solo dura la transacción — se revierte solo al
// hacer commit/rollback, igual que `set_config(..., true)`. Un superusuario como
// "postgres" puede hacer SET ROLE a cualquier rol sin necesitar membresía.

/** Corre `fn` con `app.tenant_id` fijado para toda la transacción — RLS y el
 *  DEFAULT de columna de cada tabla dependen de esta variable de sesión. */
export async function withTenant<T>(tenantId: string, fn: () => Promise<T>): Promise<T> {
  return rawPrisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`;
      await tx.$executeRaw`SET LOCAL ROLE app_role`;
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
      await tx.$executeRaw`SET LOCAL ROLE app_role`;
      return storage.run({ tx, tenantId: null }, fn);
    },
    { timeout: 15_000 },
  );
}

/** Corre `fn(tx)` en una transacción NUEVA e independiente de cualquier
 *  transacción ambiente ya abierta por el llamador (p. ej. la que withTenant
 *  dejó activa vía AsyncLocalStorage) — vuelve a fijar el mismo
 *  `app.tenant_id` + `SET LOCAL ROLE app_role` que withTenant, pero en su
 *  propia conexión de Postgres tomada del pool, así que hace commit (o
 *  rollback) por su cuenta sin arrastrar ni depender de la transacción
 *  ambiente. A diferencia de withTenant, NO llama a `storage.run(...)`: no
 *  reemplaza el `db` ambiente del llamador, solo entrega el cliente de esta
 *  transacción nueva directamente a `fn`.
 *
 *  Pensado para escrituras que deben sobrevivir aunque el código que las
 *  dispara termine lanzando y revirtiendo su propia transacción — el caso que
 *  la motivó es el log de auditoría de un permiso denegado en
 *  requirePermission (src/lib/auth/context.ts): si usara el `db` ambiente, el
 *  INSERT quedaría dentro de la misma transacción que el `ForbiddenError` a
 *  punto de lanzarse revierte, y el registro de auditoría desaparecería en
 *  silencio junto con ella.
 *
 *  Ojo al llamarla anidada dentro de un withTenant/withPlatformAdmin ambiente
 *  todavía abierto: consume una SEGUNDA conexión del pool mientras la
 *  primera sigue tomada, así que bajo presión puede tener que esperar
 *  `maxWait` antes de conseguirla. Por eso cualquier caller que la anide así
 *  debe tratarla como best-effort (try/catch alrededor, sin dejar que un
 *  fallo aquí reemplace el error real que el caller iba a lanzar) — ver el
 *  try/catch en requirePermission. `maxWait`/`timeout` se fijan explícitos
 *  (no se heredan los default de Prisma) para que ese límite quede a la
 *  vista en vez de implícito. */
export async function withIndependentTenantTransaction<T>(
  tenantId: string,
  fn: (tx: TxClient) => Promise<T>,
): Promise<T> {
  return rawPrisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`;
      await tx.$executeRaw`SET LOCAL ROLE app_role`;
      return fn(tx);
    },
    { maxWait: 2_000, timeout: 15_000 },
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
// También baja a `app_role` en cada conexión física nueva (`SET ROLE`, alcance
// de SESIÓN — no hay una transacción envolviendo estas consultas, así que
// `SET LOCAL ROLE` como en withTenant/withPlatformAdmin no serviría de nada,
// se revertiría antes de la siguiente consulta). Sin esto, los ~58 archivos
// *.itest.ts que dependen del tenant ambiente de __setTestTenantId (en vez de
// envolver cada test en withTenant/withPlatformAdmin) correrían como
// "postgres" — superusuario, RLS inerte para ellos — y las políticas de Task 3
// quedarían sin ejercitar fuera de db.itest.ts/db-isolation.itest.ts.
let testPool: Pool | null = null;
let testPoolPrisma: PrismaClient | null = null;

function getTestPoolPrisma(): PrismaClient {
  if (!testPoolPrisma) {
    testPool = new Pool({
      connectionString,
      max: process.env.DB_POOL_MAX ? Number(process.env.DB_POOL_MAX) : undefined,
    });
    testPool.on('connect', (client) => {
      // Las dos llamadas van seguidas, sin `await` entre ellas: pg encola cada
      // `.query()` en el cliente en el mismo orden en que se llama, de forma
      // síncrona, antes de que el event loop pueda ceder el control a quien
      // esté esperando esta conexión — así queda garantizado que SET ROLE y
      // set_config se ejecutan, en ese orden, antes que cualquier consulta real
      // que dispare esta reconexión. (Se probó una variante con `await` entre
      // ambas llamadas: abre una ventana real entre ellas donde esa consulta
      // real puede colarse ya con el rol nuevo pero sin `app.tenant_id` fijado
      // — RLS entonces no deja ver ninguna fila, deleteMany() no borra nada en
      // silencio, y una limpieza de test posterior falla por FK huérfana. Se
      // confirmó reproduciendo la falla y revirtiendo a esta versión síncrona.)
      client.query('SET ROLE app_role').catch((err: unknown) => {
        console.error('__setTestTenantId: no se pudo bajar a app_role tras un reconnect', err);
      });
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
