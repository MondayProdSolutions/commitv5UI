# Fundación Multi-Tenant SaaS — Plan de Implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convertir el ERP de un solo inquilino en una plataforma multi-tenant: cada
negocio (tenant) resuelto por subdominio, datos aislados por `tenantId` con Row-Level
Security de Postgres como respaldo, y un plano de Super Admin separado para crear y
administrar tenants y planes.

**Architecture:** Postgres compartido con `tenantId` en cada tabla de negocio,
reforzado por RLS (`FORCE ROW LEVEL SECURITY`) para que ninguna consulta —ni con bug—
cruce tenants. El tenant activo se guarda con `AsyncLocalStorage` de Node y una
transacción de Postgres por request que fija `set_config('app.tenant_id', ...)`;
`db` (el export de `src/lib/db.ts` que ya usa todo el código) se vuelve un `Proxy`
que reenvía cada llamada a esa transacción, así que los ~20 archivos de `src/lib/*`
existentes no cambian. Un segundo plano de autenticación (`PlatformAdmin`) para
Super Admin, completamente separado de `User`/`Session`.

**Tech Stack:** Next.js 16 (App Router, `proxy.ts`), Prisma 7 + `@prisma/adapter-pg`,
Postgres (Row-Level Security), Vitest.

**Spec:** `docs/superpowers/specs/2026-09-13-multi-tenant-saas-foundation-design.md`

## Refinamiento respecto al spec

El spec describe el aislamiento de aplicación como "una extensión de Prisma
(`$extends`) que inyecta `tenantId`". Al planear se verificó contra los tipos reales
de `@prisma/client` instalados (`node_modules/@prisma/client/runtime/client.d.ts`)
que la firma de `$allOperations` en esta versión devuelve `Promise<unknown>`, no el
tipo especial que garantiza el truco de batching en transacción que ese enfoque
necesitaría — no se pudo confirmar con certeza que funcionaría. Se usa en su lugar un
mecanismo con la misma garantía pero construido solo con primitivas estables y
verificables: `DEFAULT` de columna en Postgres ligado a `current_setting`, más un
`Proxy` de JavaScript sobre una transacción de Prisma guardada en
`AsyncLocalStorage`. Mismo resultado (nadie escribe `tenantId` a mano, RLS de
respaldo), menos riesgo de que la sintaxis exacta de una API no esté bien.

## Global Constraints

- Todas las tablas de negocio existentes (`User`, `Role`, `RolePermission`,
  `Session`, `ActivityLog`, `AppSetting`, `TaxRate`, `Category`, `Product`,
  `ProductVariant`, `InventoryMovement`, `Customer`, `Sale`, `SaleLine`, `Payment`,
  `Return`, `ReturnLine`, `FolioCounter`, `CashSession`, `CashMovement`,
  `AttendanceRecord`) ganan `tenantId String` con índice. `PlatformAdmin` y
  `PlatformAdminSession` NO llevan `tenantId` (son de plataforma, no de tenant).
- No hay datos de producción que preservar — está confirmado en el spec. Los
  `ALTER TABLE ... NOT NULL` se escriben sin backfill; la base de dev/test se
  resetea como parte de este trabajo.
- Todo archivo de prueba nuevo sigue el patrón ya usado en el repo: `*.test.ts`
  (unitario, sin DB) o `*.itest.ts` (integración, con DB real vía
  `npx vitest run --project unit|integration <ruta>`).
- Todo mensaje de error visible al usuario va en español, con el mismo tono directo
  que ya usan `ValidationError`/`ForbiddenError` en `src/lib/errors.ts`.
- Commitea con el footer de atribución que ya se usó en este repo esta sesión
  (`Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`).

---

## Task 1: Modelos nuevos — Tenant, Plan, PlatformAdmin, PlatformAdminSession

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `src/lib/tenant/plan.test.ts` (unitario, valida los tipos/constantes que se agreguen)

**Interfaces:**
- Produces: modelos Prisma `Tenant`, `Plan`, `TenantStatus` (enum), `PlatformAdmin`,
  `PlatformAdminSession`, `TenantFiscalConfig` (esta última se crea vacía — es del
  spec, ninguna task de este plan inserta filas en ella; el proyecto de CFDI la usa).
  Ningún código de aplicación los usa todavía — eso empieza en la Task 2 en adelante.

- [ ] **Step 1: Agregar los modelos al schema**

Al final de `prisma/schema.prisma`, agregar:

```prisma
// --- Multi-tenant: plataforma ---

enum TenantStatus {
  PRUEBA
  ACTIVO
  SUSPENDIDO
}

model Plan {
  id            String   @id @default(cuid())
  nombre        String   @unique
  maxUsuarios   Int
  maxSucursales Int
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  tenants       Tenant[]
}

model Tenant {
  id        String       @id @default(cuid())
  slug      String       @unique
  nombre    String
  estado    TenantStatus @default(PRUEBA)
  planId    String
  plan      Plan         @relation(fields: [planId], references: [id])
  createdAt DateTime     @default(now())
  updatedAt DateTime     @updatedAt

  @@index([estado])
}

model TenantFiscalConfig {
  tenantId                String   @id
  tenant                  Tenant   @relation(fields: [tenantId], references: [id])
  rfcEmisor               String?
  razonSocial             String?
  regimenFiscalCode       String?
  csdCertificado          Bytes?
  csdLlaveCifrada         Bytes?
  csdPasswordCifrada      Bytes?
  pacProveedor            String?
  pacCredencialesCifradas Bytes?
  createdAt               DateTime @default(now())
  updatedAt               DateTime @updatedAt
}

model PlatformAdmin {
  id           String   @id @default(cuid())
  nombre       String
  email        String   @unique
  passwordHash String
  createdAt    DateTime @default(now())
  sessions     PlatformAdminSession[]
}

model PlatformAdminSession {
  id              String        @id @default(cuid())
  tokenHash       String        @unique
  platformAdminId String
  platformAdmin   PlatformAdmin @relation(fields: [platformAdminId], references: [id], onDelete: Cascade)
  createdAt       DateTime      @default(now())
  expiresAt       DateTime
  lastActivityAt  DateTime
  ip              String?
  userAgent       String?
  revokedAt       DateTime?

  @@index([platformAdminId])
  @@index([expiresAt])
}
```

`PlatformAdminSession` copia deliberadamente la forma de `Session` (ver
`prisma/schema.prisma:61-75`) — mismo patrón de expiración/revocación, tabla y
cookie separadas.

- [ ] **Step 2: Generar y aplicar la migración**

```bash
npx prisma migrate dev --name multi_tenant_platform_models
```

Cuando pregunte por el nombre, usar exactamente ese. Debe aplicar limpio (son
tablas nuevas, sin tocar datos existentes).

- [ ] **Step 3: Verificar que el cliente Prisma generado tiene los tipos nuevos**

```bash
npx tsc --noEmit
```

Expected: sin errores (nada usa los modelos nuevos todavía, así que esto solo
confirma que `@prisma/client` se regeneró bien).

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(tenant): agrega modelos Tenant, Plan, PlatformAdmin y PlatformAdminSession"
```

---

## Task 2: tenantId en todas las tablas existentes + `db` con alcance de tenant

Esta es la tarea central y la más grande — el resto del proyecto depende de ella.
Se aterriza en un solo commit lógico (varios commits chicos internos está bien, pero
el estado final antes de pasar a la Task 3 debe tener **toda la suite de pruebas
existente en verde**, porque a partir de aquí `db` exige un tenant activo.

**Files:**
- Modify: `prisma/schema.prisma` (tenantId + relaciones + uniques compuestos en las
  ~20 tablas de negocio)
- Modify: `src/lib/db.ts` (se vuelve el `Proxy` tenant-aware)
- Create: `src/lib/db.test.ts` (unitario: `getCurrentTenantId()` lanza sin contexto)
- Create: `src/lib/db.itest.ts` (integración: `withTenant`/`withPlatformAdmin` contra
  Postgres real)
- Modify: `prisma/seed.ts` (crea el Plan y Tenant por defecto de dev/test)
- Modify: `test/vitest.setup.ts` (entra al contexto del tenant por defecto)

**Interfaces:**
- Consumes: `Tenant`, `Plan` de la Task 1.
- Produces: `db` (el mismo export de siempre, ahora tenant-aware),
  `withTenant(tenantId: string, fn: () => Promise<T>): Promise<T>`,
  `withPlatformAdmin(fn: () => Promise<T>): Promise<T>`,
  `getCurrentTenantId(): string` (lanza si no hay contexto activo) — todo exportado
  desde `src/lib/db.ts`. Estas cuatro firmas son las que usan las tareas 4, 6, 7 y 8.

- [ ] **Step 1: Editar el schema — tenantId + relación en cada tabla de negocio**

Para cada uno de los 20 modelos listados en Global Constraints, agregar el campo y
la relación. Patrón exacto (usando `Product` de ejemplo — repetir para los otros 19
con el mismo patrón, ajustando solo el nombre del modelo):

```prisma
model Product {
  id          String      @id @default(cuid())
  tenantId    String
  tenant      Tenant      @relation(fields: [tenantId], references: [id])
  nombre      String
  // ...resto de los campos sin cambio...

  @@index([categoryId])
  @@index([archivado])
  @@index([nombre])
  @@index([tenantId])
}
```

Agregar `tenantId String` + `tenant Tenant @relation(...)` + `@@index([tenantId])`
a: `User`, `Role`, `RolePermission`, `Session`, `ActivityLog`, `AppSetting`,
`TaxRate`, `Category`, `Product`, `ProductVariant`, `InventoryMovement`, `Customer`,
`Sale`, `SaleLine`, `Payment`, `Return`, `ReturnLine`, `FolioCounter`, `CashSession`,
`CashMovement`, `AttendanceRecord`. En `Tenant` (Task 1), agregar la relación inversa
`products Product[]` etc. no es necesario — Prisma no exige la relación inversa
nombrada en el lado "uno" cuando no se va a navegar desde ahí; se puede omitir.

- [ ] **Step 2: Convertir los uniques globales que sí pueden chocar entre tenants**

Estos son los que van a `@@unique([tenantId, ...])` porque su valor NO depende ya de
un FK que a su vez pertenezca a un tenant específico (a diferencia de, por ejemplo,
`Category.parentId` o `AttendanceRecord.userId`, que ya son tenant-seguros por
transitividad y no necesitan tocarse):

```prisma
model User {
  // quitar: email String @unique
  email String
  // ...
  @@unique([tenantId, email])
}

model Role {
  // quitar: nombre String @unique
  nombre String
  // ...
  @@unique([tenantId, nombre])
}

model AppSetting {
  // quitar: clave String @id
  tenantId  String
  tenant    Tenant   @relation(fields: [tenantId], references: [id])
  clave     String
  valor     Json
  updatedAt DateTime @updatedAt

  @@id([tenantId, clave])
  @@index([tenantId])
}

model TaxRate {
  // quitar: nombre String @unique
  nombre String
  // ...
  @@unique([tenantId, nombre])
}

model ProductVariant {
  // quitar: sku String? @unique
  // quitar: codigoBarras String? @unique
  sku          String?
  codigoBarras String?
  // ...
  @@unique([tenantId, sku])
  @@unique([tenantId, codigoBarras])
}

model Customer {
  // quitar: telefono String? @unique
  // quitar: correo String? @unique
  // quitar: rfc String? @unique
  telefono String?
  correo   String?
  rfc      String?
  // ...
  @@unique([tenantId, telefono])
  @@unique([tenantId, correo])
  @@unique([tenantId, rfc])
}

model Sale {
  // quitar: folio String @unique
  folio String
  // ...
  @@unique([tenantId, folio])
}

model Return {
  // quitar: folio String @unique
  folio String
  // ...
  @@unique([tenantId, folio])
}

model CashSession {
  // quitar: folio String @unique
  folio String
  // ...
  @@unique([tenantId, folio])
}

model FolioCounter {
  // quitar: serie String @id
  tenantId String
  tenant   Tenant @relation(fields: [tenantId], references: [id])
  serie    String
  valor    Int    @default(0)

  @@id([tenantId, serie])
}
```

`Session.tokenHash` y `PlatformAdminSession.tokenHash` **no cambian** — son secretos
aleatorios, no nombres; su unicidad global es correcta y deseable tal cual.

- [ ] **Step 3: Resetear la base local y aplicar la migración**

No hay datos que preservar (confirmado en el spec), así que se resetea antes de
migrar para no lidiar con backfill de columnas `NOT NULL`:

```bash
npm run db:reset
npx prisma migrate dev --name tenant_id_everywhere
```

Expected: migración aplica limpia contra una base vacía.

- [ ] **Step 4: Escribir `src/lib/db.ts` tenant-aware**

Reemplazar el contenido completo del archivo:

```ts
import { AsyncLocalStorage } from 'node:async_hooks';
import { PrismaClient, type Prisma } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL no está definida');
}
const connectionString = process.env.DATABASE_URL;

type TxClient = Prisma.TransactionClient;

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

// DB_POOL_MAX solo lo fija test/vitest.setup.ts (Step 9), en 1 — necesario para que
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

const storage = new AsyncLocalStorage<TxClient>();

/** Lo que usa el resto de la app: `db.user.findMany()`, `db.sale.create(...)`, etc.
 *  Reenvía cada llamada a la transacción del tenant activo en este request. */
export const db = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    const tx = storage.getStore();
    if (!tx) {
      throw new Error(
        `db.${String(prop)} llamado sin contexto de tenant activo. ` +
          'Envuelve el punto de entrada con withTenant() o withPlatformAdmin().',
      );
    }
    return tx[prop as keyof TxClient];
  },
}) as unknown as PrismaClient;

/** Corre `fn` con `app.tenant_id` fijado para toda la transacción — RLS y el
 *  DEFAULT de columna de cada tabla dependen de esta variable de sesión. */
export async function withTenant<T>(tenantId: string, fn: () => Promise<T>): Promise<T> {
  return rawPrisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`;
      return storage.run(tx, fn);
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
      return storage.run(tx, fn);
    },
    { timeout: 15_000 },
  );
}

/** El tenantId de la request activa. Lanza si no hay contexto — falla ruidoso en
 *  vez de dejar pasar una operación sin tenant. */
export function getCurrentTenantId(): string {
  const tx = storage.getStore();
  if (!tx) throw new Error('No hay contexto de tenant activo.');
  const id = (tx as unknown as { __tenantId?: string }).__tenantId;
  // El id no viaja en el objeto tx; se resuelve por separado — ver Step 5.
  if (!id) throw new Error('No hay contexto de tenant activo.');
  return id;
}
```

El bloque de `getCurrentTenantId` tal como está arriba no funciona todavía (`tx` no
trae el `tenantId` adjunto) — se corrige en el siguiente step guardando el
`tenantId` junto con `tx` en el storage, en vez de solo `tx`.

- [ ] **Step 5: Corregir el storage para guardar `{ tx, tenantId }`**

Reemplazar en `src/lib/db.ts`:

```ts
type TenantStore = { tx: TxClient; tenantId: string | null };

const storage = new AsyncLocalStorage<TenantStore>();

export const db = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    const store = storage.getStore();
    if (!store) {
      throw new Error(
        `db.${String(prop)} llamado sin contexto de tenant activo. ` +
          'Envuelve el punto de entrada con withTenant() o withPlatformAdmin().',
      );
    }
    return store.tx[prop as keyof TxClient];
  },
}) as unknown as PrismaClient;

export async function withTenant<T>(tenantId: string, fn: () => Promise<T>): Promise<T> {
  return rawPrisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`;
      return storage.run({ tx, tenantId }, fn);
    },
    { timeout: 15_000 },
  );
}

export async function withPlatformAdmin<T>(fn: () => Promise<T>): Promise<T> {
  return rawPrisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.platform_admin', 'true', true)`;
      return storage.run({ tx, tenantId: null }, fn);
    },
    { timeout: 15_000 },
  );
}

export function getCurrentTenantId(): string {
  const store = storage.getStore();
  if (!store?.tenantId) throw new Error('No hay contexto de tenant activo.');
  return store.tenantId;
}

/** Solo para `test/vitest.setup.ts` (Step 9): fija el tenant activo para toda la
 *  ejecución del worker de Vitest, sin envolver cada test individualmente.
 *  A diferencia de withTenant, usa `set_config(..., false)` — alcance de SESIÓN,
 *  no de transacción — porque aquí no hay una única transacción envolviendo todos
 *  los tests. Por eso Step 9 fija DB_POOL_MAX=1: con una sola conexión en el pool,
 *  la variable de sesión persiste igual en cada consulta posterior del worker. */
export async function __setTestTenantId(tenantId: string): Promise<void> {
  await rawPrisma.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, false)`;
  storage.enterWith({ tx: rawPrisma as unknown as TxClient, tenantId });
}
```

(Este es el contenido final de `src/lib/db.ts` — reemplaza por completo lo escrito
en el Step 4, no se acumulan ambas versiones.)

- [ ] **Step 6: Prueba unitaria — `getCurrentTenantId` sin contexto**

Crear `src/lib/db.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { getCurrentTenantId } from './db';

describe('getCurrentTenantId', () => {
  it('lanza si no hay contexto de tenant activo', () => {
    expect(() => getCurrentTenantId()).toThrow('No hay contexto de tenant activo');
  });
});
```

- [ ] **Step 7: Correr la prueba unitaria**

```bash
npx vitest run --project unit src/lib/db.test.ts
```

Expected: PASS.

- [ ] **Step 8: Actualizar `prisma/seed.ts` — Plan y Tenant por defecto**

`seed.ts` usa su propio `PrismaClient` crudo (no el `db` de `src/lib/db.ts`) porque
corre fuera de cualquier request. Eso significa que, una vez que la Task 3 active
Row-Level Security, sus inserciones a tablas con `tenantId` (`Role`, `AppSetting`,
`TaxRate`, `Customer`, `FolioCounter`) quedarían bloqueadas por RLS si nadie le dice
a Postgres que este script es de confianza — hay que fijarlo ahora mismo, aunque RLS
todavía no exista, para que el seed siga funcionando cuando la Task 3 aterrice
(el seed corre en cada ejecución de `npx vitest run --project integration`, vía
`test/pg-embedded.ts`, así que si se rompe, rompe TODA la suite de integración).

Primero, en la construcción del cliente al inicio del archivo, fijar el pool a una
sola conexión — por la misma razón que `DB_POOL_MAX=1` en el Step 9: una bandera de
alcance de sesión (`set_config(..., false)`) solo es confiable si todas las consultas
posteriores reusan la misma conexión:

```ts
const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL, max: 1 }),
});
```

Después, insertar al inicio de `main()`, antes del loop de roles:

```ts
// Este script confía en sí mismo para escribir en cualquier tenant — necesario
// una vez que la Task 3 active Row-Level Security en las tablas de negocio.
// `false` = alcance de sesión (no de transacción): el seed no envuelve sus
// consultas en una transacción compartida, así que necesita que la bandera
// persista para toda la conexión, no solo para la siguiente consulta.
await db.$executeRaw`SELECT set_config('app.platform_admin', 'true', false)`;

const plan = await db.plan.upsert({
  where: { nombre: 'Estándar' },
  update: {},
  create: { nombre: 'Estándar', maxUsuarios: 10, maxSucursales: 3 },
});

const tenant = await db.tenant.upsert({
  where: { slug: 'default' },
  update: {},
  create: { slug: 'default', nombre: 'Negocio de prueba', estado: 'ACTIVO', planId: plan.id },
});
```

Y cambiar cada `create`/`upsert` posterior en el archivo para incluir
`tenantId: tenant.id` en su `data`/`create` (roles, appSetting, taxRates, cliente
genérico, folioCounters). Ejemplo para el primero:

```ts
const role = await db.role.upsert({
  where: { tenantId_nombre: { tenantId: tenant.id, nombre } },
  update: { esSistema: true },
  create: { tenantId: tenant.id, nombre, esSistema: true, descripcion: `Rol de sistema: ${nombre}` },
});
```

(El nombre `tenantId_nombre` para el `where` compuesto lo genera Prisma
automáticamente a partir de `@@unique([tenantId, nombre])` — confirmarlo revisando
los tipos generados en `node_modules/.prisma/client` tras el Step 3 de este task, o
dejar que `tsc --noEmit` en el Step 10 lo confirme.) Aplicar el mismo patrón
(agregar `tenantId: tenant.id` al `data`/`create`, y al `where` compuesto donde
aplique) a `appSetting`, `taxRate`, `customer` genérico, y `folioCounter`.

- [ ] **Step 9: Actualizar `test/vitest.setup.ts` — entrar al tenant por defecto**

`__setTestTenantId` ya quedó definida en `src/lib/db.ts` (Step 5, al final del
archivo) — este step solo la usa. Nótese `DB_POOL_MAX = '1'`, fijado **antes** de
importar `src/lib/db`: es lo que hace confiable el `set_config(..., false)` de
alcance de sesión que usa `__setTestTenantId` (ver la nota en esa función, Step 5) —
con una sola conexión en el pool, no hay riesgo de que una consulta posterior del
mismo worker caiga en una conexión donde la variable nunca se fijó.

La búsqueda del tenant por `slug` **no puede pasar por `db`** (el `Proxy` de
`src/lib/db.ts` exige contexto activo para CUALQUIER modelo, tenga RLS o no — y en
este punto exacto, antes de que `__setTestTenantId` corra por primera vez, ese
contexto todavía no existe). Se usa un `PrismaClient` aparte y desechable, igual que
ya hace `test/pg-embedded.ts` para las migraciones:

```ts
import { inject } from 'vitest';

process.env.DATABASE_URL = inject('databaseUrl');
process.env.DB_POOL_MAX = '1';

const { PrismaClient } = await import('@prisma/client');
const { PrismaPg } = await import('@prisma/adapter-pg');
const bootstrap = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
const tenant = await bootstrap.tenant.findUniqueOrThrow({ where: { slug: 'default' } });
await bootstrap.$disconnect();

const { __setTestTenantId } = await import('../src/lib/db');
await __setTestTenantId(tenant.id);
```

`Tenant` no tiene RLS (ver nota al inicio de la Task 3), así que esta búsqueda
funciona igual antes y después de que esa tarea aterrice — la separación de cliente
aquí es por cómo funciona el `Proxy`, no por RLS.

- [ ] **Step 10: Correr toda la suite de integración existente**

```bash
npx vitest run --project integration
```

Expected: **todos los tests que ya existían antes de esta tarea siguen en PASS.**
Si algo falla por un `create` sin `tenantId` en algún helper de prueba (por ejemplo
`src/lib/attendance/__testutil.ts`), agregar `tenantId: getCurrentTenantId()` a ese
`data` — es la única clase de arreglo esperado en este step.

- [ ] **Step 11: Correr typecheck y toda la suite unitaria**

```bash
npx tsc --noEmit
npx vitest run --project unit
```

Expected: ambos limpios.

- [ ] **Step 12: Commit**

```bash
git add prisma/schema.prisma prisma/migrations prisma/seed.ts src/lib/db.ts src/lib/db.test.ts test/vitest.setup.ts
git commit -m "feat(tenant): agrega tenantId a todas las tablas de negocio y hace db tenant-aware"
```

---

## Task 3: Row-Level Security + prueba de fuga entre tenants

**Nota de alcance:** RLS se activa solo en las ~20 tablas de negocio que tienen
`tenantId` (la lista de Global Constraints). `Tenant`, `Plan`, `PlatformAdmin` y
`PlatformAdminSession` **no** llevan RLS — son catálogos de plataforma sin columna
`tenantId`, no hay nada que aislar por tenant en ellas; su protección es solo de
aplicación (rutas de Super Admin exigen `getCurrentPlatformAdmin()`). Esto no
elimina la necesidad de `withPlatformAdmin`/`withTenant` al consultar `Tenant` vía
`db` (el `Proxy` de `src/lib/db.ts` exige *algún* contexto activo para cualquier
modelo, tenga RLS o no — por eso `proxy.ts`, Task 4, sigue envolviendo su búsqueda de
`Tenant` en `withPlatformAdmin`); solo significa que, a diferencia de las tablas de
negocio, no hace falta preocuparse de *cuál* tenant esté activo al consultarla.

**Files:**
- Create: `prisma/migrations/<timestamp>_row_level_security/migration.sql` (SQL manual)
- Create: `src/lib/db-isolation.itest.ts`

**Interfaces:**
- Consumes: `db`, `withTenant`, `withPlatformAdmin` de la Task 2.
- Produces: garantía de aislamiento a nivel de base de datos — ninguna tarea
  posterior depende de una interfaz de código nueva aquí, solo de que esta
  protección exista antes de construir el panel de Super Admin (Task 7 en adelante).

- [ ] **Step 1: Crear la migración SQL manual**

Prisma no genera RLS desde el schema — se escribe a mano:

```bash
npx prisma migrate dev --create-only --name row_level_security
```

Editar el archivo `.sql` generado (queda vacío por defecto) con, para cada una de
las 20 tablas listadas en Global Constraints, este bloque (mostrando `Product` como
ejemplo — repetir para las 20, cambiando solo el nombre de tabla):

```sql
ALTER TABLE "Product" ALTER COLUMN "tenantId" SET DEFAULT current_setting('app.tenant_id', true);
ALTER TABLE "Product" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Product" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Product"
  USING (
    "tenantId" = current_setting('app.tenant_id', true)
    OR current_setting('app.platform_admin', true) = 'true'
  );
```

`FORCE ROW LEVEL SECURITY` es imprescindible: sin ella, el rol dueño de la tabla
(con el que corren las migraciones y, en este proyecto, también la app) queda
exento de RLS por default de Postgres, y la protección completa quedaría
desactivada en silencio.

- [ ] **Step 2: Aplicar la migración**

```bash
npx prisma migrate dev
```

Expected: aplica limpio.

- [ ] **Step 3: Escribir el itest de fuga — falla primero**

Crear `src/lib/db-isolation.itest.ts`:

```ts
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
```

- [ ] **Step 4: Correr el itest**

```bash
npx vitest run --project integration src/lib/db-isolation.itest.ts
```

Expected: **PASS** en ambos casos. Si el primero falla (la consulta cruda sí ve la
fila de B), el problema más probable es que falte `FORCE ROW LEVEL SECURITY` en
`TaxRate`, o que el rol de conexión de Postgres tenga `BYPASSRLS` — revisar con
`\d+ "TaxRate"` en `psql` contra la base de test.

- [ ] **Step 5: Confirmar que toda la suite sigue en verde**

```bash
npx vitest run --project integration
npx vitest run --project unit
```

Expected: sin regresiones.

- [ ] **Step 6: Commit**

```bash
git add prisma/migrations src/lib/db-isolation.itest.ts
git commit -m "feat(tenant): activa Row-Level Security y prueba que la fuga entre tenants es imposible"
```

---

## Task 4: Ruteo por subdominio

**Files:**
- Modify: `src/proxy.ts`
- Create: `src/app/tenant-no-encontrado/page.tsx`
- Create: `src/app/tenant-suspendido/page.tsx`
- Create: `src/lib/tenant/resolve.ts`
- Create: `src/lib/tenant/resolve.test.ts`
- Create: `src/lib/tenant/resolve.itest.ts`

**Interfaces:**
- Consumes: `db`, `withPlatformAdmin` de la Task 2/3.
- Produces: `resolveTenantSlug(host: string): string | null` (puro, sin DB — Task 6
  y el propio proxy lo usan), `RESERVED_SLUGS: ReadonlySet<string>`.

- [ ] **Step 1: Función pura de resolución de slug — test primero**

Crear `src/lib/tenant/resolve.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { resolveTenantSlug, RESERVED_SLUGS } from './resolve';

describe('resolveTenantSlug', () => {
  it('extrae el slug de un subdominio', () => {
    expect(resolveTenantSlug('negocio1.tuapp.com')).toBe('negocio1');
  });
  it('devuelve null en el dominio raíz (sin subdominio)', () => {
    expect(resolveTenantSlug('tuapp.com')).toBeNull();
  });
  it('devuelve null para localhost sin subdominio (Super Admin en dev)', () => {
    expect(resolveTenantSlug('localhost:3000')).toBeNull();
  });
  it('extrae el slug de un subdominio en localhost (tenant en dev)', () => {
    expect(resolveTenantSlug('negocio1.localhost:3000')).toBe('negocio1');
  });
  it('devuelve null si el subdominio es una palabra reservada', () => {
    expect(resolveTenantSlug('www.tuapp.com')).toBeNull();
    expect(resolveTenantSlug('admin.tuapp.com')).toBeNull();
  });
  it('RESERVED_SLUGS incluye las palabras clave del dominio propio', () => {
    expect(RESERVED_SLUGS.has('www')).toBe(true);
    expect(RESERVED_SLUGS.has('api')).toBe(true);
    expect(RESERVED_SLUGS.has('admin')).toBe(true);
    expect(RESERVED_SLUGS.has('app')).toBe(true);
  });
});
```

- [ ] **Step 2: Correr y verificar que falla**

```bash
npx vitest run --project unit src/lib/tenant/resolve.test.ts
```

Expected: FAIL — `resolve.ts` no existe todavía.

- [ ] **Step 3: Implementar**

Crear `src/lib/tenant/resolve.ts`:

```ts
export const RESERVED_SLUGS: ReadonlySet<string> = new Set(['www', 'api', 'admin', 'app']);

/** Dado el header Host de una request, devuelve el slug del tenant, o null si es
 *  el dominio raíz, localhost sin subdominio, o una palabra reservada. */
export function resolveTenantSlug(host: string): string | null {
  const hostname = host.split(':')[0]!;
  const parts = hostname.split('.');

  // localhost:3000 -> ['localhost'] ; negocio1.localhost:3000 -> ['negocio1','localhost']
  const isLocalhost = parts[parts.length - 1] === 'localhost';
  const hasSubdomain = isLocalhost ? parts.length > 1 : parts.length > 2;
  if (!hasSubdomain) return null;

  const slug = parts[0]!;
  if (RESERVED_SLUGS.has(slug)) return null;
  return slug;
}
```

- [ ] **Step 4: Correr y verificar que pasa**

```bash
npx vitest run --project unit src/lib/tenant/resolve.test.ts
```

Expected: PASS.

- [ ] **Step 5: Páginas de error de tenant**

Crear `src/app/tenant-no-encontrado/page.tsx`:

```tsx
export default function TenantNoEncontrado() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas p-6">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold text-ink">Esta empresa no existe</h1>
        <p className="mt-2 text-sm text-ink-muted">
          Verifica la dirección o contacta a quien te la compartió.
        </p>
      </div>
    </div>
  );
}
```

Crear `src/app/tenant-suspendido/page.tsx`:

```tsx
export default function TenantSuspendido() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas p-6">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold text-ink">Esta cuenta está suspendida</h1>
        <p className="mt-2 text-sm text-ink-muted">
          Contacta a soporte para reactivarla.
        </p>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Extender `src/proxy.ts`**

Leer el archivo completo primero (`src/proxy.ts`) para insertar en el lugar
correcto. Después de la línea `const { pathname } = req.nextUrl;`, agregar la
resolución de tenant antes de cualquier otra lógica:

```ts
import { resolveTenantSlug } from '@/lib/tenant/resolve';
import { withPlatformAdmin, db } from '@/lib/db';

// ...dentro de proxy(), después de `const { pathname } = req.nextUrl;`:

const host = req.headers.get('host') ?? '';
const slug = resolveTenantSlug(host);

if (slug && !IGNORE.some((re) => re.test(pathname))) {
  const tenant = await withPlatformAdmin(() => db.tenant.findUnique({ where: { slug } }));
  if (!tenant) {
    return NextResponse.rewrite(new URL('/tenant-no-encontrado', req.url));
  }
  if (tenant.estado === 'SUSPENDIDO') {
    return NextResponse.rewrite(new URL('/tenant-suspendido', req.url));
  }
  requestHeaders.set('x-tenant-id', tenant.id);
  requestHeaders.set('x-tenant-slug', tenant.slug);
}
```

Esto va antes del bloque `if (IGNORE.some(...)) return pass();` existente, y
`pass()` debe seguir usando `requestHeaders` (ya lo hace, según el archivo actual)
para que `x-tenant-id`/`x-tenant-slug` viajen igual que `x-pathname`.

- [ ] **Step 7: Itest de resolución de tenant en el proxy**

Crear `src/lib/tenant/resolve.itest.ts` — prueba la función pura contra datos reales
de `Tenant` (no el proxy completo, que se prueba mejor con Playwright/e2e en una
tarea posterior si se decide agregarlo):

```ts
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
```

- [ ] **Step 8: Correr todo**

```bash
npx vitest run --project unit src/lib/tenant
npx vitest run --project integration src/lib/tenant
npx tsc --noEmit
```

Expected: todo en PASS/limpio.

- [ ] **Step 9: Commit**

```bash
git add src/proxy.ts src/lib/tenant src/app/tenant-no-encontrado src/app/tenant-suspendido
git commit -m "feat(tenant): resuelve el tenant por subdominio en el proxy, con páginas de error propias"
```

---

## Task 5: Autenticación de Super Admin (PlatformAdmin)

**Files:**
- Create: `src/lib/platform-auth/password.ts` (reexporta lo ya probado en `src/lib/auth/password.ts` — no hay razón para una política distinta)
- Create: `src/lib/platform-auth/session.ts`
- Create: `src/lib/platform-auth/session.itest.ts`
- Create: `src/lib/platform-auth/context.ts`
- Create: `src/app/plataforma/login/page.tsx`
- Create: `src/app/plataforma/login/actions.ts`

**Interfaces:**
- Consumes: `hashPassword`/`verifyPassword` de `src/lib/auth/password.ts`
  (`src/lib/auth/password.ts:13-23`), `db`/`withPlatformAdmin` de la Task 2.
- Produces: `createPlatformSession(platformAdminId: string, ctx): Promise<{token, expiresAt}>`,
  `validatePlatformSession(token: string | undefined): Promise<{status, session} | {status: 'invalid'|'expired'}>`,
  `getCurrentPlatformAdmin(): Promise<PlatformAdmin | null>` — mismo shape que
  `getCurrentUser()` en `src/lib/auth/context.ts:24-29`, para que la Task 6 (wiring)
  los use de forma simétrica.

- [ ] **Step 1: Reusar la política de contraseñas existente**

Crear `src/lib/platform-auth/password.ts`:

```ts
export { hashPassword, verifyPassword, passwordPolicyError } from '@/lib/auth/password';
```

No hay razón de negocio para que Super Admin tenga una política distinta a la de
los usuarios de tenant — se reexporta en vez de duplicar.

- [ ] **Step 2: Sesión de plataforma — test primero**

Crear `src/lib/platform-auth/session.itest.ts`:

```ts
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { db, withPlatformAdmin } from '@/lib/db';
import { hashPassword } from './password';
import { createPlatformSession, validatePlatformSession } from './session';

const EMAIL = 't-platform-session@tuapp.com';

const CROSS_TENANT_SLUG = 't-platform-session-cross';

async function seedAdmin() {
  return withPlatformAdmin(() =>
    db.platformAdmin.create({
      data: { nombre: 'Super', email: EMAIL, passwordHash: '' },
    }),
  );
}

async function cleanupCrossTenant() {
  await withPlatformAdmin(async () => {
    const tenant = await db.tenant.findUnique({ where: { slug: CROSS_TENANT_SLUG } });
    if (!tenant) return;
    await withTenant(tenant.id, async () => {
      await db.user.deleteMany({ where: { tenantId: tenant.id } });
      await db.role.deleteMany({ where: { tenantId: tenant.id } });
    });
    await db.tenant.delete({ where: { id: tenant.id } });
  });
}

beforeEach(async () => {
  await withPlatformAdmin(() => db.platformAdmin.deleteMany({ where: { email: EMAIL } }));
  await cleanupCrossTenant();
});
afterAll(async () => {
  await withPlatformAdmin(() => db.platformAdmin.deleteMany({ where: { email: EMAIL } }));
  await cleanupCrossTenant();
});

describe('sesión de PlatformAdmin', () => {
  it('crea una sesión válida y la valida correctamente', async () => {
    const admin = await seedAdmin();
    const { token } = await createPlatformSession(admin.id, {});
    const res = await validatePlatformSession(token);
    expect(res.status).toBe('ok');
  });

  it('rechaza un token inexistente', async () => {
    const res = await validatePlatformSession('token-que-no-existe');
    expect(res.status).toBe('invalid');
  });

  it('rechaza undefined', async () => {
    const res = await validatePlatformSession(undefined);
    expect(res.status).toBe('invalid');
  });

  it('el token de una sesión de tenant no autentica como PlatformAdmin', async () => {
    // Prueba explícita de la separación de planos que pide el spec: son tablas
    // distintas, así que un token nacido en Session (usuarios de tenant) no
    // debería siquiera coincidir por casualidad con una fila de
    // PlatformAdminSession — confirma que no hay forma de que una sesión de
    // negocio se cuele como sesión de plataforma.
    const { createSession } = await import('@/lib/auth/session');
    const plan = await withPlatformAdmin(() =>
      db.plan.upsert({
        where: { nombre: 'Estándar' },
        update: {},
        create: { nombre: 'Estándar', maxUsuarios: 10, maxSucursales: 3 },
      }),
    );
    const tenant = await withPlatformAdmin(() =>
      db.tenant.create({ data: { slug: CROSS_TENANT_SLUG, nombre: 'X', estado: 'ACTIVO', planId: plan.id } }),
    );
    const userId = await withTenant(tenant.id, async () => {
      const role = await db.role.create({ data: { tenantId: tenant.id, nombre: 'Cajero' } });
      const user = await db.user.create({
        data: { tenantId: tenant.id, nombre: 'U', email: 'u@x.com', passwordHash: '', roleId: role.id },
      });
      return user.id;
    });
    const { token: tenantToken } = await createSession(userId, {});

    const res = await validatePlatformSession(tenantToken);
    expect(res.status).toBe('invalid');
  });
});
```

(Este test importa `withTenant` además de `withPlatformAdmin` — agregar
`withTenant` al `import { db, withPlatformAdmin } from '@/lib/db';` del inicio del
archivo.)

- [ ] **Step 3: Correr y verificar que falla**

```bash
npx vitest run --project integration src/lib/platform-auth/session.itest.ts
```

Expected: FAIL — `session.ts` no existe.

- [ ] **Step 4: Implementar — calcado del patrón de `src/lib/auth/session.ts`**

Primero leer `src/lib/auth/session.ts` completo para replicar exactamente el
mecanismo de hash de token (`hashToken`) y `SESSION_TTL_MS`. Crear
`src/lib/platform-auth/session.ts`:

```ts
import { randomBytes, createHash } from 'node:crypto';
import { db, withPlatformAdmin } from '@/lib/db';

export const PLATFORM_SESSION_COOKIE = 'platform_session';
const SESSION_TTL_MS = 8 * 60 * 60 * 1000; // 8 horas — sesión de trabajo de soporte, no de POS

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export async function createPlatformSession(
  platformAdminId: string,
  ctx: { ip?: string | null; userAgent?: string | null },
): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(32).toString('base64url');
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);
  await withPlatformAdmin(() =>
    db.platformAdminSession.create({
      data: {
        tokenHash: hashToken(token),
        platformAdminId,
        createdAt: now,
        lastActivityAt: now,
        expiresAt,
        ip: ctx.ip ?? null,
        userAgent: ctx.userAgent ?? null,
      },
    }),
  );
  return { token, expiresAt };
}

export type PlatformSessionResult =
  | { status: 'ok'; session: { platformAdminId: string } }
  | { status: 'invalid' }
  | { status: 'expired' };

export async function validatePlatformSession(token: string | undefined): Promise<PlatformSessionResult> {
  if (!token) return { status: 'invalid' };
  const session = await withPlatformAdmin(() =>
    db.platformAdminSession.findUnique({ where: { tokenHash: hashToken(token) } }),
  );
  if (!session || session.revokedAt) return { status: 'invalid' };
  if (session.expiresAt < new Date()) return { status: 'expired' };
  return { status: 'ok', session: { platformAdminId: session.platformAdminId } };
}
```

- [ ] **Step 5: Correr y verificar que pasa**

```bash
npx vitest run --project integration src/lib/platform-auth/session.itest.ts
```

Expected: PASS.

- [ ] **Step 6: `getCurrentPlatformAdmin` — mismo shape que `getCurrentUser`**

Crear `src/lib/platform-auth/context.ts`:

```ts
import { cookies } from 'next/headers';
import { db, withPlatformAdmin } from '@/lib/db';
import { PLATFORM_SESSION_COOKIE, validatePlatformSession } from './session';

export type CurrentPlatformAdmin = { id: string; nombre: string; email: string };

export async function getCurrentPlatformAdmin(): Promise<CurrentPlatformAdmin | null> {
  const token = (await cookies()).get(PLATFORM_SESSION_COOKIE)?.value;
  const res = await validatePlatformSession(token);
  if (res.status !== 'ok') return null;
  const admin = await withPlatformAdmin(() =>
    db.platformAdmin.findUnique({ where: { id: res.session.platformAdminId } }),
  );
  if (!admin) return null;
  return { id: admin.id, nombre: admin.nombre, email: admin.email };
}
```

- [ ] **Step 7: Server Action de login**

Primero leer `src/app/(auth)/login/actions.ts` y `LoginForm.tsx` completos para
copiar el patrón de `useActionState`. Crear `src/app/plataforma/login/actions.ts`:

```ts
'use server';

import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { db, withPlatformAdmin } from '@/lib/db';
import { verifyPassword } from '@/lib/platform-auth/password';
import { createPlatformSession, PLATFORM_SESSION_COOKIE } from '@/lib/platform-auth/session';
import { getClientIp } from '@/lib/http';

export type PlatformLoginState = { ok: boolean; error?: string };

export async function platformLoginAction(
  _prev: PlatformLoginState,
  formData: FormData,
): Promise<PlatformLoginState> {
  const email = String(formData.get('email') ?? '').trim();
  const password = String(formData.get('password') ?? '');

  const admin = await withPlatformAdmin(() => db.platformAdmin.findUnique({ where: { email } }));
  if (!admin || !(await verifyPassword(admin.passwordHash, password))) {
    return { ok: false, error: 'Correo o contraseña incorrectos' };
  }

  const h = await headers();
  const { token, expiresAt } = await createPlatformSession(admin.id, {
    ip: getClientIp(h),
    userAgent: h.get('user-agent'),
  });

  (await cookies()).set(PLATFORM_SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    expires: expiresAt,
    path: '/',
  });

  redirect('/plataforma');
}
```

- [ ] **Step 8: Página de login**

Primero leer `src/app/(auth)/login/page.tsx` y `LoginForm.tsx` para replicar el
layout visual (mismos tokens de Tailwind: `bg-surface`, `rounded-card`, etc.). Crear
`src/app/plataforma/login/page.tsx` siguiendo esa misma estructura de formulario,
apuntando a `platformLoginAction` en vez de `loginAction`.

- [ ] **Step 9: Confirmar suite completa**

```bash
npx vitest run --project unit
npx vitest run --project integration
npx tsc --noEmit
```

- [ ] **Step 10: Commit**

```bash
git add src/lib/platform-auth src/app/plataforma
git commit -m "feat(tenant): autenticación separada de Super Admin (PlatformAdmin)"
```

---

## Task 6: Conectar el resto de la app al contexto de tenant en requests reales

Hasta aquí `withTenant`/`withPlatformAdmin` solo se usan en pruebas. Esta tarea los
conecta a requests reales: cada Route Handler y Server Action de tenant debe correr
dentro de `withTenant(tenantId, ...)`, usando el `x-tenant-id` que la Task 4 ya deja
en los headers.

**Files:**
- Modify: `src/app/(app)/layout.tsx`
- Modify: `src/lib/auth/context.ts` (para que `requireUser`/`getCurrentUser` corran
  ya dentro del tenant resuelto)
- Create: `src/lib/tenant/with-request-tenant.ts`
- Modify: `src/app/api/session/heartbeat/route.ts` (como caso de ejemplo de Route
  Handler; el mismo patrón aplica a `src/app/api/asistencia/**` y
  `src/app/api/asistente/route.ts` — se listan al final del task)

**Interfaces:**
- Consumes: `withTenant` (Task 2), `x-tenant-id` header (Task 4).
- Produces: `requireRequestTenant(): Promise<string>` — helper que lee el header y
  lanza `ForbiddenError` si falta (usado por cada Route Handler/Server Action que
  toca `db`).

- [ ] **Step 1: Helper para leer el tenant de la request actual**

Crear `src/lib/tenant/with-request-tenant.ts`:

```ts
import { headers } from 'next/headers';
import { ForbiddenError } from '@/lib/errors';

/** Lee x-tenant-id (puesto por el proxy tras resolver el subdominio) o lanza. */
export async function requireRequestTenantId(): Promise<string> {
  const id = (await headers()).get('x-tenant-id');
  if (!id) throw new ForbiddenError('NO_TENANT', 'No se pudo resolver la empresa de esta solicitud');
  return id;
}
```

- [ ] **Step 2: Envolver el layout de `(app)` en `withTenant`**

Leer `src/app/(app)/layout.tsx` (ya tiene el contenido de la sesión anterior, con
`AssistantWidget` agregado). Modificar el inicio de `AppLayout` para resolver el
tenant primero y envolver el resto del render:

```tsx
import { withTenant } from '@/lib/db';
import { requireRequestTenantId } from '@/lib/tenant/with-request-tenant';

export default async function AppLayout({ children }: { children: ReactNode }) {
  const tenantId = await requireRequestTenantId();
  return withTenant(tenantId, () => renderAppLayout(children));
}

async function renderAppLayout(children: ReactNode) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  // ...resto del cuerpo actual de AppLayout, sin cambios...
}
```

(Se separa en dos funciones porque `withTenant` necesita una función `() => Promise<T>`
— el cuerpo existente de `AppLayout` se mueve tal cual a `renderAppLayout`.)

- [ ] **Step 3: Mismo patrón en cada Route Handler que usa `db`**

Aplicar el mismo envoltorio (`requireRequestTenantId()` + `withTenant(id, () => ...)`)
al cuerpo de: `src/app/api/session/heartbeat/route.ts`,
`src/app/api/asistencia/route.ts`, `src/app/api/asistencia/foto/[...path]/route.ts`,
`src/app/api/asistente/route.ts`. Ejemplo completo para
`src/app/api/session/heartbeat/route.ts` (leer el archivo actual primero para
conservar su lógica exacta dentro del wrapper):

```ts
export async function POST(req: Request) {
  const tenantId = await requireRequestTenantId();
  return withTenant(tenantId, async () => {
    // ...cuerpo actual de la función, sin cambios...
  });
}
```

- [ ] **Step 4: Rutas públicas (`/login`, `/setup`, `/plataforma/**`) también necesitan tenant**

`/login` y `/setup` (grupo `(auth)`) siguen siendo de un tenant específico (el
usuario inicia sesión dentro de `negocio1.tuapp.com/login`) — leer
`src/app/(auth)/layout.tsx` si existe, o el layout raíz que envuelve ese grupo, y
aplicar el mismo patrón `requireRequestTenantId` + `withTenant`. `/plataforma/**`
NO — usa `withPlatformAdmin`, no `withTenant` (ya resuelto por diseño: el proxy no
pone `x-tenant-id` en el dominio raíz).

- [ ] **Step 5: Prueba de regresión — la suite completa sigue verde**

```bash
npx vitest run --project unit
npx vitest run --project integration
npx tsc --noEmit
```

Los itests existentes de estas rutas (`route.itest.ts` de asistencia, sesión,
asistente) ya mockean `next/headers` — confirmar que sus mocks de `headers()`
incluyan `x-tenant-id` apuntando al tenant de prueba sembrado en cada archivo, o
agregarlo si el mock actual devuelve un `Headers()` vacío.

- [ ] **Step 6: Commit**

```bash
git add src/app/\(app\)/layout.tsx src/lib/tenant/with-request-tenant.ts src/app/api
git commit -m "feat(tenant): conecta las rutas de tenant al contexto de withTenant en requests reales"
```

---

## Task 7: Super Admin — CRUD de Tenant + alta con primer Administrador

**Files:**
- Create: `src/lib/platform/tenants.ts`
- Create: `src/lib/platform/tenants.itest.ts`

**Interfaces:**
- Consumes: `db`, `withPlatformAdmin` (Task 2), `hashPassword` (Task 5),
  `passwordPolicyError` (`src/lib/auth/password.ts`).
- Produces: `listTenants(): Promise<TenantSummary[]>`,
  `createTenant(input: CreateTenantInput): Promise<{ tenantId: string }>`,
  `setTenantEstado(tenantId: string, estado: TenantStatus): Promise<void>` — la
  Task 9 (UI) llama directo a estas tres.

- [ ] **Step 1: Test primero — crear tenant con su primer Administrador**

Crear `src/lib/platform/tenants.itest.ts`:

```ts
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { db, withPlatformAdmin, withTenant } from '@/lib/db';
import { createTenant, listTenants, setTenantEstado } from './tenants';
import { ValidationError } from '@/lib/errors';

const SLUG = 't-platform-tenants';

beforeEach(async () => {
  await withPlatformAdmin(() => db.tenant.deleteMany({ where: { slug: SLUG } }));
});
afterAll(async () => {
  await withPlatformAdmin(() => db.tenant.deleteMany({ where: { slug: SLUG } }));
});

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
```

- [ ] **Step 2: Correr y verificar que falla**

```bash
npx vitest run --project integration src/lib/platform/tenants.itest.ts
```

Expected: FAIL — `tenants.ts` no existe.

- [ ] **Step 3: Implementar**

Primero leer `src/lib/auth/bootstrap.ts` completo (el `createFirstAdmin` ya
existente) — la creación del admin de un tenant nuevo es ese mismo flujo, corriendo
dentro de `withTenant` del tenant recién creado. Crear `src/lib/platform/tenants.ts`:

```ts
import { db, withPlatformAdmin, withTenant } from '@/lib/db';
import { ValidationError } from '@/lib/errors';
import { hashPassword, passwordPolicyError } from '@/lib/auth/password';

export type TenantSummary = {
  id: string;
  slug: string;
  nombre: string;
  estado: 'PRUEBA' | 'ACTIVO' | 'SUSPENDIDO';
  planNombre: string;
};

export type CreateTenantInput = {
  slug: string;
  nombre: string;
  planId: string;
  adminNombre: string;
  adminEmail: string;
  adminPassword: string;
};

export async function listTenants(): Promise<TenantSummary[]> {
  return withPlatformAdmin(async () => {
    const tenants = await db.tenant.findMany({ include: { plan: true }, orderBy: { createdAt: 'desc' } });
    return tenants.map((t) => ({
      id: t.id,
      slug: t.slug,
      nombre: t.nombre,
      estado: t.estado,
      planNombre: t.plan.nombre,
    }));
  });
}

export async function createTenant(input: CreateTenantInput): Promise<{ tenantId: string }> {
  const policyError = passwordPolicyError(input.adminPassword, input.adminEmail);
  if (policyError) throw new ValidationError({ adminPassword: policyError });

  const existing = await withPlatformAdmin(() => db.tenant.findUnique({ where: { slug: input.slug } }));
  if (existing) throw new ValidationError({ slug: 'Ese identificador de empresa ya está en uso' });

  const tenant = await withPlatformAdmin(() =>
    db.tenant.create({
      data: { slug: input.slug, nombre: input.nombre, estado: 'ACTIVO', planId: input.planId },
    }),
  );

  await withTenant(tenant.id, async () => {
    const role = await db.role.upsert({
      where: { tenantId_nombre: { tenantId: tenant.id, nombre: 'Administrador' } },
      update: { esSistema: true },
      create: { tenantId: tenant.id, nombre: 'Administrador', esSistema: true, descripcion: 'Rol de sistema: Administrador' },
    });
    const passwordHash = await hashPassword(input.adminPassword);
    await db.user.create({
      data: {
        tenantId: tenant.id,
        nombre: input.adminNombre,
        email: input.adminEmail,
        passwordHash,
        roleId: role.id,
        mustChangePassword: false,
      },
    });
  });

  return { tenantId: tenant.id };
}

export async function setTenantEstado(
  tenantId: string,
  estado: 'PRUEBA' | 'ACTIVO' | 'SUSPENDIDO',
): Promise<void> {
  await withPlatformAdmin(() => db.tenant.update({ where: { id: tenantId }, data: { estado } }));
}
```

El rol "Administrador" creado aquí no trae permisos (`RolePermission`) — a
diferencia de `createFirstAdmin` actual, que asume que `ROLE_PERMISSIONS['Administrador']`
ya fue sembrado por `prisma/seed.ts` a nivel global. Como los roles ahora son por
tenant, este `createTenant` necesita sembrar también los `RolePermission` del rol
Administrador recién creado — agregar, dentro del mismo bloque `withTenant`, antes
de crear el `User`:

```ts
    const { ALL_PERMISSION_KEYS } = await import('@/lib/auth/rbac');
    await db.rolePermission.createMany({
      data: ALL_PERMISSION_KEYS.map((permiso) => ({ tenantId: tenant.id, roleId: role.id, permiso })),
      skipDuplicates: true,
    });
```

- [ ] **Step 4: Correr y verificar que pasa**

```bash
npx vitest run --project integration src/lib/platform/tenants.itest.ts
```

Expected: PASS en los cuatro casos.

- [ ] **Step 5: Commit**

```bash
git add src/lib/platform/tenants.ts src/lib/platform/tenants.itest.ts
git commit -m "feat(tenant): Super Admin puede crear, listar y suspender tenants"
```

---

## Task 8: Super Admin — CRUD de Plan + límite de usuarios por plan

**Files:**
- Create: `src/lib/platform/plans.ts`
- Create: `src/lib/platform/plans.itest.ts`
- Modify: `src/lib/users/` (el módulo que ya crea usuarios — localizar el archivo
  exacto con `Grep` antes de editar; el spec lo referencia como
  `src/lib/users`)

**Interfaces:**
- Consumes: `db`, `withPlatformAdmin` (Task 2).
- Produces: `createPlan`, `listPlans`, `updatePlan` (CRUD simple, mismo patrón que
  `src/lib/roles/admin.ts` para roles). Modifica la función de creación de usuario
  existente para que valide el límite antes de insertar.

- [ ] **Step 1: Localizar el módulo de creación de usuarios**

```bash
grep -rn "export async function createUser" src/lib/users
```

Leer el archivo completo que aparezca para conocer su firma exacta y su manejo de
`ValidationError` actual, antes de tocarlo en el Step 4.

- [ ] **Step 2: Test primero — CRUD de Plan**

Crear `src/lib/platform/plans.itest.ts`:

```ts
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { db, withPlatformAdmin } from '@/lib/db';
import { createPlan, listPlans, updatePlan } from './plans';

const NOMBRE = 't-plan-itest';

beforeEach(async () => {
  await withPlatformAdmin(() => db.plan.deleteMany({ where: { nombre: NOMBRE } }));
});
afterAll(async () => {
  await withPlatformAdmin(() => db.plan.deleteMany({ where: { nombre: NOMBRE } }));
});

describe('createPlan / listPlans / updatePlan', () => {
  it('crea un plan y aparece en el listado', async () => {
    const { id } = await createPlan({ nombre: NOMBRE, maxUsuarios: 5, maxSucursales: 1 });
    const planes = await listPlans();
    expect(planes.find((p) => p.id === id)?.maxUsuarios).toBe(5);
  });

  it('actualiza los límites de un plan existente', async () => {
    const { id } = await createPlan({ nombre: NOMBRE, maxUsuarios: 5, maxSucursales: 1 });
    await updatePlan(id, { maxUsuarios: 20 });
    const planes = await listPlans();
    expect(planes.find((p) => p.id === id)?.maxUsuarios).toBe(20);
  });
});
```

- [ ] **Step 3: Implementar `src/lib/platform/plans.ts`**

```ts
import { db, withPlatformAdmin } from '@/lib/db';
import { ValidationError } from '@/lib/errors';

export type PlanSummary = { id: string; nombre: string; maxUsuarios: number; maxSucursales: number };

export async function listPlans(): Promise<PlanSummary[]> {
  return withPlatformAdmin(() => db.plan.findMany({ orderBy: { nombre: 'asc' } }));
}

export async function createPlan(input: {
  nombre: string;
  maxUsuarios: number;
  maxSucursales: number;
}): Promise<{ id: string }> {
  if (input.maxUsuarios < 1) throw new ValidationError({ maxUsuarios: 'Debe ser al menos 1' });
  if (input.maxSucursales < 1) throw new ValidationError({ maxSucursales: 'Debe ser al menos 1' });
  return withPlatformAdmin(() => db.plan.create({ data: input }));
}

export async function updatePlan(
  id: string,
  input: Partial<{ maxUsuarios: number; maxSucursales: number }>,
): Promise<void> {
  await withPlatformAdmin(() => db.plan.update({ where: { id }, data: input }));
}
```

- [ ] **Step 4: Correr y verificar que pasa**

```bash
npx vitest run --project integration src/lib/platform/plans.itest.ts
```

- [ ] **Step 5: Límite de usuarios — test primero, en el módulo localizado en Step 1**

Agregar al archivo de tests existente de ese módulo (o crear uno si no existe) un
caso: sembrar un `Plan` con `maxUsuarios: 1`, un `Tenant` en ese plan, un usuario ya
existente, y confirmar que crear un segundo usuario lanza `ValidationError` con un
mensaje que mencione el límite. Adaptar el patrón exacto de `beforeEach`/`seedUser`
que ya use ese archivo de test (varía según lo encontrado en el Step 1).

- [ ] **Step 6: Implementar el chequeo de límite**

En la función de creación de usuario localizada en el Step 1, antes del
`db.user.create(...)`, agregar:

```ts
const tenantId = getCurrentTenantId(); // import desde '@/lib/db'
const [plan, usuariosActuales] = await Promise.all([
  db.tenant.findUniqueOrThrow({ where: { id: tenantId }, include: { plan: true } }).then((t) => t.plan),
  db.user.count(),
]);
if (usuariosActuales >= plan.maxUsuarios) {
  throw new ValidationError({ email: `Tu plan permite hasta ${plan.maxUsuarios} usuarios` });
}
```

- [ ] **Step 7: Correr la suite completa de ese módulo + la general**

```bash
npx vitest run --project integration src/lib/users
npx vitest run --project integration
npx vitest run --project unit
npx tsc --noEmit
```

- [ ] **Step 8: Commit**

```bash
git add src/lib/platform/plans.ts src/lib/platform/plans.itest.ts src/lib/users
git commit -m "feat(tenant): CRUD de planes y límite de usuarios por plan"
```

---

## Task 9: UI de Super Admin

**Files:**
- Create: `src/app/plataforma/layout.tsx`
- Create: `src/app/plataforma/page.tsx` (listado de tenants)
- Create: `src/app/plataforma/tenants/nuevo/page.tsx`
- Create: `src/app/plataforma/tenants/nuevo/actions.ts`
- Create: `src/app/plataforma/planes/page.tsx`

**Interfaces:**
- Consumes: `listTenants`/`createTenant`/`setTenantEstado` (Task 7),
  `listPlans`/`createPlan` (Task 8), `getCurrentPlatformAdmin` (Task 5).

- [ ] **Step 1: Layout de plataforma — exige sesión de Super Admin**

Leer `src/app/(app)/layout.tsx` como referencia de estructura (sidebar/topbar), y
`src/components/Sidebar.tsx`/`Topbar.tsx` para reusar el mismo lenguaje visual con
una navegación reducida (solo "Negocios" y "Planes"). Crear
`src/app/plataforma/layout.tsx`:

```tsx
import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { getCurrentPlatformAdmin } from '@/lib/platform-auth/context';

export const dynamic = 'force-dynamic';

export default async function PlataformaLayout({ children }: { children: ReactNode }) {
  const admin = await getCurrentPlatformAdmin();
  if (!admin) redirect('/plataforma/login');

  return (
    <div className="min-h-screen bg-canvas">
      <header className="border-b border-line bg-surface px-6 py-4">
        <span className="text-sm font-semibold text-ink">Plataforma — {admin.nombre}</span>
        <nav className="mt-2 flex gap-4 text-sm">
          <a href="/plataforma" className="text-ink-muted hover:text-ink">Negocios</a>
          <a href="/plataforma/planes" className="text-ink-muted hover:text-ink">Planes</a>
        </nav>
      </header>
      <main className="p-6">{children}</main>
    </div>
  );
}
```

- [ ] **Step 2: Listado de tenants**

Crear `src/app/plataforma/page.tsx`, usando `Badge`/`Card`/`DataTable` de
`src/components/ui` y `src/components/DataTable.tsx` (leerlos primero para respetar
su API exacta):

```tsx
import { listTenants } from '@/lib/platform/tenants';
import { Card } from '@/components/ui/Card';

export default async function TenantsPage() {
  const tenants = await listTenants();
  return (
    <Card>
      <h1 className="text-lg font-semibold text-ink">Negocios</h1>
      <table className="mt-4 w-full text-sm">
        <thead>
          <tr className="text-left text-ink-muted">
            <th className="py-2">Nombre</th>
            <th>Subdominio</th>
            <th>Plan</th>
            <th>Estado</th>
          </tr>
        </thead>
        <tbody>
          {tenants.map((t) => (
            <tr key={t.id} className="border-t border-line">
              <td className="py-2">{t.nombre}</td>
              <td>{t.slug}</td>
              <td>{t.planNombre}</td>
              <td>{t.estado}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <a href="/plataforma/tenants/nuevo" className="mt-4 inline-block text-sm text-primary">
        + Crear negocio
      </a>
    </Card>
  );
}
```

(Sin botón de suspender/reactivar inline en este step para mantenerlo chico — se
puede agregar como mejora posterior con un Server Action por fila siguiendo el
mismo patrón que el Step 3.)

- [ ] **Step 3: Formulario de alta de tenant**

Leer `src/app/(auth)/setup/SetupForm.tsx` completo como referencia de estructura de
formulario con `useActionState`. Crear `src/app/plataforma/tenants/nuevo/actions.ts`:

```ts
'use server';

import { redirect } from 'next/navigation';
import { createTenant } from '@/lib/platform/tenants';
import { ValidationError } from '@/lib/errors';

export type CreateTenantState = { ok: boolean; error?: string };

export async function createTenantAction(
  _prev: CreateTenantState,
  formData: FormData,
): Promise<CreateTenantState> {
  try {
    await createTenant({
      slug: String(formData.get('slug') ?? ''),
      nombre: String(formData.get('nombre') ?? ''),
      planId: String(formData.get('planId') ?? ''),
      adminNombre: String(formData.get('adminNombre') ?? ''),
      adminEmail: String(formData.get('adminEmail') ?? ''),
      adminPassword: String(formData.get('adminPassword') ?? ''),
    });
  } catch (e) {
    if (e instanceof ValidationError) return { ok: false, error: Object.values(e.fields)[0] };
    throw e;
  }
  redirect('/plataforma');
}
```

Y `src/app/plataforma/tenants/nuevo/page.tsx` con el formulario correspondiente
(campos: slug, nombre, selector de plan poblado con `listPlans()`, y los tres
campos del primer Administrador), siguiendo el mismo patrón visual de
`SetupForm.tsx`.

- [ ] **Step 4: Página de planes**

Crear `src/app/plataforma/planes/page.tsx`, listado simple con `listPlans()` +
formulario de alta apuntando a un Server Action `createPlanAction` construido igual
que `createTenantAction` pero llamando a `createPlan`.

- [ ] **Step 5: Verificación manual**

Esto es UI — seguir la skill `run` para levantar `npm run dev`, crear un
`PlatformAdmin` de prueba directo en la base (o vía un script `tsx` puntual, como se
hizo para el usuario de prueba de la sesión anterior), iniciar sesión en
`/plataforma/login`, crear un tenant desde el formulario, y confirmar en pantalla
que aparece en el listado.

- [ ] **Step 6: `tsc` y suite completa una última vez**

```bash
npx tsc --noEmit
npx vitest run --project unit
npx vitest run --project integration
```

- [ ] **Step 7: Commit**

```bash
git add src/app/plataforma
git commit -m "feat(tenant): UI de Super Admin para crear negocios y administrar planes"
```

---

## Notas para quien ejecute este plan

- La Task 2 es la que más puede desviarse de lo escrito aquí si el nombre exacto de
  algún tipo generado por Prisma (como `tenantId_nombre` en los `where` compuestos)
  no coincide — confirmarlo contra `node_modules/.prisma/client/index.d.ts` después
  de cada `prisma migrate dev`, no asumirlo.
- Ninguna task de este plan implementa CFDI en sí (cifrado del CSD, llamadas al PAC,
  timbrado, cancelación). La tabla `TenantFiscalConfig` se crea en la Task 1 (vacía,
  tal como dice el spec) para que el modelo de datos quede listo, pero llenarla y
  usarla es el primer task del proyecto de CFDI, planificado aparte una vez que esta
  fundación esté mergeada y estable.
