# POS Bloque 5 (Caja / sesión de caja) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sesión de caja única a nivel negocio sobre el Bloque 4: apertura con fondo, retiros e ingresos manuales, cierre con arqueo a ciegas (esperado calculado dentro del cierre), corte imprimible, historial y export CSV. Toda venta y devolución se sella con `cashSessionId`; `createSale`/`createReturn` exigen caja abierta; `cancelSale` exige que la sesión de la venta siga abierta.

**Architecture:** Mismo proyecto Next.js (App Router, gate `src/proxy.ts`). `src/lib/cash/sessions.ts` concentra el ciclo de la sesión y el cálculo del esperado — **todo por agregación al cerrar, sin saldo corriente en la fila**. La unicidad de "una sola sesión abierta" la impone `openCashSession` con `SELECT … FOR UPDATE` sobre `FolioCounter['C']`. Los cambios en Ventas son aditivos: una guarda + una columna de `data` en `createSale`/`createReturn`; en `cancelSale` la regla de "mismo día" se sustituye por "la sesión de la venta sigue `ABIERTA`". Toda mutación entra por una Server Action con `requirePermission('caja.gestionar')` primera sentencia y auditoría dentro de la misma `db.$transaction`.

**Tech Stack:** Next.js 16.3.4, React 19.2, TypeScript strict, PostgreSQL + Prisma 7 + `@prisma/adapter-pg`, Zod 4, Tailwind v4, Vitest 4 (`*.test.ts` unit / `*.itest.ts` integración con Postgres efímero), Playwright.

**Spec:** `docs/superpowers/specs/2026-09-04-pos-block5-caja-design.md`

## Global Constraints

- **Base ya construida (Bloques 1–4, en `master`):** reutiliza sin reescribir — `requirePermission`/`getCurrentUser` (`@/lib/auth/context`), `PERMISSIONS`/`can`/`ALL_PERMISSION_KEYS`/`PermissionKey` (`@/lib/auth/rbac`), `ROLE_PERMISSIONS` (`@/lib/auth/role-permissions` — fuente única seed↔`admin.itest.ts`), `logActivity`/`actionLabel`/`KNOWN_ACTIONS`/`AuditAction` (`@/lib/audit`), `parseDateParam` (`@/lib/activity/query`), `type FormState` (`@/app/(auth)/setup/actions`), `ValidationError`/`ForbiddenError` (`@/lib/errors`), `db` (`@/lib/db`), `getClientIp` (`@/lib/http`), `nextFolio` (`@/lib/sales/folio`), `esMismoDiaMX` (`@/lib/sales/fecha`), `fmtFechaMX`/`money`/`inputClass` (`@/app/(app)/ventas/types`), `createSale`/`getSale`/`cancelSale`/`listSales` (`@/lib/sales/sales`), `createReturn`/`getReturn`/`listReturns` (`@/lib/sales/returns`), `seedCajero`/`seedVariant`/`cleanupSales` (`@/lib/sales/__testutil`), `PrintOnMount` (`@/app/(app)/ventas/PrintOnMount`), `DataTable`/`Column`/`Pagination`/`PermissionGate` (`@/components/*`), `visibleNav`/`NAV_ITEMS` (`@/lib/nav`).
- **Prisma:** un solo cliente, `import { db } from '@/lib/db'` — NUNCA `new PrismaClient()` (excepción: `prisma/seed.ts`). `Prisma.TransactionClient` para funciones con `tx`.
- **Migración:** ADITIVA. 2 tablas nuevas (`CashSession`, `CashMovement`), 2 enums nuevos (`CashSessionStatus`, `CashMovementType`), columnas **anulables sin default** `Sale.cashSessionId`/`Return.cashSessionId` + sus FK/índices, relaciones inversas nuevas en `User`. **`SaleStatus`/`PaymentMethod`/`MovementType` intactos.** Ninguna columna/tabla/enum existente se altera ni se borra. `npx prisma migrate dev --name bloque5_caja`. Requiere la BD de desarrollo levantada: `npm run db:start` (foreground; arráncalo con `run_in_background`; PG en `localhost:54329`, db `pos_dev`).
- **Dinero:** `Decimal @db.Decimal(12,2)` para importes (nullable: `Decimal? @db.Decimal(12,2)`). Los servicios reciben/devuelven `number`; `round2 = (x) => Math.round(x * 100) / 100` (idioma del repo). Nunca `toFixed` para redondear.
- **Fórmula del esperado (Sección 2.5 del spec):** `esperadoEfectivo = round2(fondoApertura + totalEfectivoVentas − totalReembolsosEfectivo − totalRetiros + totalIngresos)`. `totalEfectivoVentas = round2(Σ Payment.monto(EFECTIVO de ventas COMPLETADA de la sesión) − Σ Sale.cambio(de esas ventas que tuvieron algún Payment EFECTIVO))`. Ventas `CANCELADA` **excluidas** de todos los `total*` y de `nVentas`. Tarjeta/transferencia se totalizan **informativas**, NO entran en el esperado.
- **Blind real:** `computeExpectedCash` es un helper **interno** de `sessions.ts`, no se exporta ni se expone por ningún endpoint/pantalla antes de `closeCashSession`. El panel de "caja abierta" muestra solo el fondo y los movimientos manuales.
- **Una sola sesión abierta:** `openCashSession`, dentro de su `db.$transaction`, hace `SELECT valor FROM "FolioCounter" WHERE serie = 'C' FOR UPDATE` **antes** de comprobar si hay sesión `ABIERTA`. Dos aperturas concurrentes se serializan; la segunda ve la primera y lanza `ValidationError({ _form: 'Ya hay una caja abierta.' })`.
- **Gating de Ventas:** `createSale` y `createReturn` cargan `tx.cashSession.findFirst({ where: { estado: 'ABIERTA' } })` dentro de su transacción; si `null` → `ValidationError({ _form: 'No hay una caja abierta. Abre la caja para registrar ventas.' })` (mensaje "…devoluciones." para `createReturn`); sellan `cashSessionId: session.id`. `cancelSale` carga la venta con `cashSession: { select: { estado: true, folio: true } }`; si `sale.cashSession?.estado !== 'ABIERTA'` → `ValidationError({ _form: 'La caja de esta venta ya se cerró; registra una devolución.' })`. **Se elimina** el chequeo `esMismoDiaMX(sale.createdAt, new Date())` de `cancelSale` y su import en `sales.ts`; `esMismoDiaMX` y `fecha.test.ts` se conservan.
- **Permiso nuevo** (grupo `caja` en `PERMISSIONS`): `caja.gestionar`. Reparto en `ROLE_PERMISSIONS`: Gerente += `caja.gestionar`; Cajero += `caja.gestionar`; Empleado sin cambios; Administrador vía `ALL_PERMISSION_KEYS`.
- **Autorización:** toda Server Action mutante empieza con `await requirePermission('caja.gestionar')` ANTES de leer `formData` o tocar la BD. `redirect()` fuera de try/catch. Solo `ValidationError` se captura; `ForbiddenError` se propaga. El route de export hace `try { await requirePermission('caja.gestionar') } catch (e) { if (e instanceof ForbiddenError) return NextResponse.json({ error: e.message }, { status: 403 }); throw e }`.
- **Auditoría:** dentro de la misma `db.$transaction` que la mutación. Acciones nuevas (a `AuditAction`, `LABELS`): `caja.abrir`, `caja.cerrar`, `caja.movimiento`. `metadata` lleva folios y montos, ningún dato sensible.
- **UI:** español; server pages con `requirePermission('caja.gestionar')` primera sentencia y `export const dynamic = 'force-dynamic'`; `redirect()`/`notFound()` fuera de try/catch; React 19 `useActionState`; Zod 4; Tailwind v4; sin `any`; sin `console.*`. El corte imprimible vive en `src/app/caja-corte/[id]/page.tsx` **fuera del grupo `(app)`** (como `/ventas-ticket`).
- **TDD:** test primero. `*.test.ts` unit (sin BD), `*.itest.ts` integración (globalSetup levanta Postgres efímero en `localhost:54330` db `pos_test`, aplica migraciones + seed). **Un test que importe `@/lib/audit` o `@/lib/cash/*` (que a su vez importan `@/lib/db`) debe ser `.itest.ts`** (convención confirmada en Bloques 3–4: `audit-clientes.itest.ts`, `audit-ventas.itest.ts`). Ejecutar por tarea: `npm run typecheck && npm run lint && npm run test:unit && npm run test:integration && npm run build`, y pegar las colas en el reporte.
- **Aislamiento FK en itests** (orden de limpieza en `beforeEach`/`afterAll`): `activityLog` → `payment` → `returnLine` → `return` → `saleLine` → `sale` → `cashMovement` → `cashSession` → `inventoryMovement` → `productVariant` → `product` → usuarios de prueba. **Nunca** borrar el cliente `esGenerico`, roles de sistema, `taxRate`, ni reiniciar `FolioCounter` a mano salvo el itest de folios dedicado. Los itests que aseveran el número exacto de folio `C` corren aislados y fijan `FolioCounter['C'].valor`; el resto asevera `/^C-\d{6}$/`.
- **Commits:** Conventional Commits en español, terminando EXACTAMENTE con:
  ```
  Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01EnFJHWm8zVoqgkmfwwcRHi
  ```
- **Sin push, sin remoto, sin deploy.** Todo local.

---

## Estructura de archivos

**Prisma**
- `prisma/schema.prisma` — + `CashSession`, `CashMovement`, enums, `Sale.cashSessionId?`, `Return.cashSessionId?`, relaciones inversas en `User`.
- `prisma/seed.ts` — + `upsert FolioCounter { serie: 'C' }`.
- `prisma/migrations/<ts>_bloque5_caja/` — generada.

**Librería**
- `src/lib/auth/rbac.ts` — + grupo `caja`.
- `src/lib/auth/role-permissions.ts` — + `caja.gestionar` en Gerente y Cajero.
- `src/lib/audit.ts` — + 3 acciones.
- `src/lib/nav.ts` — + ítem "Caja".
- `src/lib/sales/folio.ts` — `nextFolio` acepta `'C'`.
- `src/lib/validation/cash.ts` — 3 esquemas Zod + tipos.
- `src/lib/cash/sessions.ts` — `getOpenCashSession`, `openCashSession`, `recordCashMovement`, `computeExpectedCash` (interno), `closeCashSession`, `getCashSession`, `listCashSessions` + tipos.
- `src/lib/sales/sales.ts` — `createSale`/`cancelSale`/`getSale`/`listSales` (aditivo).
- `src/lib/sales/returns.ts` — `createReturn`/`getReturn`/`listReturns` (aditivo).
- `src/lib/sales/__testutil.ts` — + `conCajaAbierta()`, `cleanupSales` amplía a `cashMovement`/`cashSession`.

**App**
- `src/app/(app)/caja/{page.tsx,actions.ts}`, `cerrar/page.tsx`, `sesiones/[id]/page.tsx`, `historial/page.tsx`, `historial/export/route.ts` (+ `route.itest.ts`).
- `src/app/(app)/caja/*.tsx` — `AbrirCajaForm`, `PanelCajaAbierta`, `CashMovementForm`, `CerrarCajaForm`, `CorteView`, `CajaSessionRow`.
- `src/app/caja-corte/[id]/page.tsx` — corte imprimible, fuera de `(app)`.
- `src/app/(app)/ventas/page.tsx` — aviso "No hay una caja abierta".

**Tests**
- `*.test.ts` / `*.itest.ts` junto a cada módulo.
- `src/lib/__tests__/seed-bloque5.itest.ts`.
- `e2e/caja.spec.ts`; `e2e/ventas.spec.ts` adaptado; helper `abrirCaja`.

---

## Task 1: Esquema Prisma, migración y seed

**Files:**
- Modify: `prisma/schema.prisma`, `prisma/seed.ts`
- Create: `prisma/migrations/<ts>_bloque5_caja/migration.sql` (generada), `src/lib/__tests__/seed-bloque5.itest.ts`

**Interfaces:**
- Consumes: esquema de Bloques 1–4 (`User`, `Sale`, `Return`, `FolioCounter`).
- Produces: modelos `CashSession`/`CashMovement`; enums `CashSessionStatus { ABIERTA CERRADA }`, `CashMovementType { RETIRO INGRESO }`; `Sale.cashSessionId String?` + relación + `@@index`; `Return.cashSessionId String?` + relación + `@@index`; relaciones inversas `User.cajasAbiertas`/`User.cajasCerradas`/`User.movimientosCaja`. Seed: `FolioCounter` con fila `C` (valor 0).

- [ ] **Step 1: Añadir a `prisma/schema.prisma`** (enums junto a los de Ventas; modelos al final)

```prisma
enum CashSessionStatus {
  ABIERTA
  CERRADA
}

enum CashMovementType {
  RETIRO
  INGRESO
}

model CashSession {
  id                      String            @id @default(cuid())
  folio                   String            @unique
  estado                  CashSessionStatus @default(ABIERTA)
  fondoApertura           Decimal           @db.Decimal(12, 2)
  abiertaPorId            String
  abiertaPor              User              @relation("AbiertaPor", fields: [abiertaPorId], references: [id])
  abiertaEn               DateTime          @default(now())
  cerradaPorId            String?
  cerradaPor              User?             @relation("CerradaPor", fields: [cerradaPorId], references: [id])
  cerradaEn               DateTime?
  efectivoContado         Decimal?          @db.Decimal(12, 2)
  esperadoEfectivo        Decimal?          @db.Decimal(12, 2)
  diferencia              Decimal?          @db.Decimal(12, 2)
  totalEfectivoVentas     Decimal?          @db.Decimal(12, 2)
  totalTarjeta            Decimal?          @db.Decimal(12, 2)
  totalTransferencia      Decimal?          @db.Decimal(12, 2)
  totalReembolsosEfectivo Decimal?          @db.Decimal(12, 2)
  totalRetiros            Decimal?          @db.Decimal(12, 2)
  totalIngresos           Decimal?          @db.Decimal(12, 2)
  nVentas                 Int?
  notaCierre              String?
  movements               CashMovement[]
  sales                   Sale[]
  returns                 Return[]

  @@index([estado])
  @@index([abiertaEn])
}

model CashMovement {
  id        String          @id @default(cuid())
  sessionId String
  session   CashSession     @relation(fields: [sessionId], references: [id], onDelete: Cascade)
  tipo      CashMovementType
  monto     Decimal         @db.Decimal(12, 2)
  motivo    String
  actorId   String
  actor     User            @relation("ActorMovimientoCaja", fields: [actorId], references: [id])
  createdAt DateTime        @default(now())

  @@index([sessionId])
}
```

En `model Sale`: `cashSessionId String?` + `cashSession CashSession? @relation(fields: [cashSessionId], references: [id])` + `@@index([cashSessionId])`.
En `model Return`: idéntico.
En `model User`: `cajasAbiertas CashSession[] @relation("AbiertaPor")`, `cajasCerradas CashSession[] @relation("CerradaPor")`, `movimientosCaja CashMovement[] @relation("ActorMovimientoCaja")`.

- [ ] **Step 2: Levantar la BD de desarrollo (background)** — Run (con `run_in_background`): `npm run db:start`. Espera a que reporte listo; `npm run db:status` si hace falta. NO en primer plano.

- [ ] **Step 3: Generar la migración**

Run: `npx prisma migrate dev --name bloque5_caja`
Revisar `prisma/migrations/<ts>_bloque5_caja/migration.sql`: solo `CREATE TYPE "CashSessionStatus"` / `"CashMovementType"`, `CREATE TABLE "CashSession"` / `"CashMovement"` + índices, `ALTER TABLE "Sale" ADD COLUMN "cashSessionId" TEXT`, `ALTER TABLE "Return" ADD COLUMN "cashSessionId" TEXT`, y `ADD CONSTRAINT … FOREIGN KEY`. **NO** debe alterar/borrar nada existente ni tocar `"SaleStatus"`/`"PaymentMethod"`/`"MovementType"`. Si lo hace → STOP, reportar BLOCKED. `npx prisma generate` si el migrate no regeneró el cliente.

- [ ] **Step 4: `src/lib/__tests__/seed-bloque5.itest.ts` (falla)**

```ts
import { describe, it, expect } from 'vitest';
import { db } from '@/lib/db';

describe('seed bloque 5', () => {
  it('siembra FolioCounter con la serie C', async () => {
    const c = await db.folioCounter.findUnique({ where: { serie: 'C' } });
    expect(c).not.toBeNull();
    expect(c!.valor).toBeTypeOf('number');
  });

  it('Gerente y Cajero tienen caja.gestionar; Empleado no', async () => {
    for (const nombre of ['Gerente', 'Cajero']) {
      const rol = await db.role.findUniqueOrThrow({ where: { nombre }, include: { permissions: true } });
      expect(rol.permissions.map((p) => p.permiso)).toContain('caja.gestionar');
    }
    const empleado = await db.role.findUniqueOrThrow({ where: { nombre: 'Empleado' }, include: { permissions: true } });
    expect(empleado.permissions.map((p) => p.permiso)).not.toContain('caja.gestionar');
  });

  it('no hay ninguna CashSession sembrada', async () => {
    expect(await db.cashSession.count()).toBe(0);
  });
});
```

Run: `npm run test:integration -- src/lib/__tests__/seed-bloque5.itest.ts` → FAIL (no hay fila `C`; las claves de permiso las pone Task 2, así que esos casos podrían pasar ya o fallar según el orden — el que falla seguro es el de `FolioCounter`).

- [ ] **Step 5: Ampliar `prisma/seed.ts`** — En el bucle que siembra `FolioCounter` (Bloque 4 siembra `V` y `D`), añadir `'C'`:

```ts
  for (const serie of ['V', 'D', 'C']) {
    await db.folioCounter.upsert({ where: { serie }, update: {}, create: { serie, valor: 0 } });
  }
```

- [ ] **Step 6: Ejecutar** — `npm run test:integration -- src/lib/__tests__/seed-bloque5.itest.ts` → PASS (el caso de permisos pasa tras Task 2; si Task 2 aún no corrió, ese caso falla — es esperado, se re-verifica en la suite completa tras Task 2).

- [ ] **Step 7: Suite completa + commit**

Run: `npm run typecheck && npm run lint && npm run test:unit && npm run test:integration && npm run build`
Expected: 0 errores; suite verde (los itests del Bloque 4 aún no exigen caja — no se rompen todavía; Task 6 los adapta).

```bash
git add prisma/schema.prisma prisma/seed.ts prisma/migrations/ src/lib/__tests__/seed-bloque5.itest.ts
git commit -m "feat(caja): modelo CashSession/CashMovement, migración aditiva y contador de folio C

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01EnFJHWm8zVoqgkmfwwcRHi"
```

---

## Task 2: RBAC, auditoría y navegación (aditivo)

**Files:**
- Modify: `src/lib/auth/rbac.ts`, `src/lib/auth/role-permissions.ts`, `src/lib/audit.ts`, `src/lib/nav.ts`
- Create: `src/lib/auth/rbac-caja.test.ts`, `src/lib/audit-caja.itest.ts`

**Interfaces:**
- Produces: clave `caja.gestionar` (parte de `PermissionKey`/`ALL_PERMISSION_KEYS`, derivados). Acciones de auditoría `caja.abrir`/`caja.cerrar`/`caja.movimiento` (parte de `AuditAction`/`KNOWN_ACTIONS`). `ROLE_PERMISSIONS.Gerente` y `.Cajero` += `caja.gestionar`.

- [ ] **Step 1: `src/lib/auth/rbac-caja.test.ts` (falla)**

```ts
import { describe, it, expect } from 'vitest';
import { PERMISSIONS, ALL_PERMISSION_KEYS } from './rbac';

describe('grupo de permisos caja', () => {
  it('existe el módulo caja con 1 clave', () => {
    const g = PERMISSIONS.find((x) => x.modulo === 'caja');
    expect(g?.permisos.map((p) => p.key)).toEqual(['caja.gestionar']);
  });
  it('caja.gestionar está en ALL_PERMISSION_KEYS', () => {
    expect(ALL_PERMISSION_KEYS).toContain('caja.gestionar');
  });
});
```

- [ ] **Step 2: Ejecutar (FAIL), añadir el grupo en `rbac.ts`** — como último elemento de `PERMISSIONS` (tras `ventas`, antes de `] as const;`):

```ts
  {
    modulo: 'caja', label: 'Caja',
    permisos: [
      { key: 'caja.gestionar', label: 'Abrir y cerrar caja, registrar movimientos y ver cortes' },
    ],
  },
```

Run: `npm run test:unit -- src/lib/auth/rbac-caja.test.ts` → PASS.

- [ ] **Step 3: `src/lib/audit-caja.itest.ts` (falla)** — `.itest.ts` porque importa `@/lib/audit` → `@/lib/db`.

```ts
import { describe, it, expect } from 'vitest';
import { KNOWN_ACTIONS, actionLabel } from './audit';

describe('acciones de auditoría de caja', () => {
  const acciones = ['caja.abrir', 'caja.cerrar', 'caja.movimiento'];
  it('están en KNOWN_ACTIONS', () => {
    for (const a of acciones) expect(KNOWN_ACTIONS).toContain(a);
  });
  it('tienen etiqueta en español', () => {
    for (const a of acciones) expect(actionLabel(a)).not.toBe(a);
  });
});
```

- [ ] **Step 4: Ejecutar (FAIL), ampliar `audit.ts`** — en la unión `AuditAction` (antes del `;`): `| 'caja.abrir' | 'caja.cerrar' | 'caja.movimiento'`. En `LABELS` (tras las de `ventas.*`):

```ts
  'caja.abrir': 'Apertura de caja',
  'caja.cerrar': 'Cierre de caja',
  'caja.movimiento': 'Movimiento de caja',
```

Run: `npm run test:integration -- src/lib/audit-caja.itest.ts` → PASS.

- [ ] **Step 5: `role-permissions.ts` — añadir `caja.gestionar`** — a `ROLE_PERMISSIONS.Gerente` (tras el bloque `// Bloque 4: Ventas`, comentario `// Bloque 5: Caja`) y a `ROLE_PERMISSIONS.Cajero`:

```ts
    // Bloque 5: Caja
    'caja.gestionar',
```
```ts
  Cajero: [
    'productos.ver', 'inventario.ver', 'clientes.ver', 'clientes.crear',
    'ventas.crear', 'ventas.ver', 'ventas.devolver',
    'caja.gestionar',
  ],
```

- [ ] **Step 6: `nav.ts` — 1 ítem** — entre el ítem `/ventas/historial` y `/perfil`: `{ href: '/caja', label: 'Caja', permiso: 'caja.gestionar' }`.

- [ ] **Step 7: Suite completa + commit**

Run: `npm run typecheck && npm run lint && npm run test:unit && npm run test:integration`
Expected: 0 errores; `src/lib/roles/admin.itest.ts` sigue verde (consume `ROLE_PERMISSIONS`); `seed-bloque5.itest.ts` ahora pasa entero.

```bash
git add src/lib/auth/rbac.ts src/lib/auth/rbac-caja.test.ts src/lib/auth/role-permissions.ts src/lib/audit.ts src/lib/audit-caja.itest.ts src/lib/nav.ts
git commit -m "feat(caja): permiso caja.gestionar, acciones de auditoría y navegación

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01EnFJHWm8zVoqgkmfwwcRHi"
```

---

## Task 3: Esquemas de validación (`src/lib/validation/cash.ts`)

**Files:**
- Create: `src/lib/validation/cash.ts`, `src/lib/validation/cash.test.ts`

**Interfaces:**
- Consumes: `zod`.
- Produces: `openCashSessionSchema` + `type OpenCashSessionInput`; `cashMovementSchema` + `type CashMovementInput`; `closeCashSessionSchema` + `type CloseCashSessionInput`. Shapes exactamente los del spec §4.5.

- [ ] **Step 1: `src/lib/validation/cash.test.ts` (falla)** — unit (sin BD).

```ts
import { describe, it, expect } from 'vitest';
import { openCashSessionSchema, cashMovementSchema, closeCashSessionSchema } from './cash';

const errs = (schema: { safeParse: (v: unknown) => { success: boolean; error?: { issues: { path: PropertyKey[]; message: string }[] } } }, v: unknown) => {
  const r = schema.safeParse(v);
  if (r.success) return {} as Record<string, string>;
  const out: Record<string, string> = {};
  for (const i of r.error!.issues) { const k = i.path.map(String).join('.'); if (k && !(k in out)) out[k] = i.message; }
  return out;
};

describe('openCashSessionSchema', () => {
  it('fondo 0 y positivo válidos', () => {
    expect(openCashSessionSchema.safeParse({ fondoApertura: 0 }).success).toBe(true);
    expect(openCashSessionSchema.safeParse({ fondoApertura: '1500.50' }).success).toBe(true);
  });
  it('fondo negativo → issue en fondoApertura', () => {
    expect(errs(openCashSessionSchema, { fondoApertura: -1 })).toHaveProperty('fondoApertura');
  });
});

describe('cashMovementSchema', () => {
  it('válido parsea', () => {
    expect(cashMovementSchema.safeParse({ tipo: 'RETIRO', monto: 200, motivo: 'depósito banco' }).success).toBe(true);
  });
  it('monto 0 / negativo → issue en monto', () => {
    expect(errs(cashMovementSchema, { tipo: 'INGRESO', monto: 0, motivo: 'xxx' })).toHaveProperty('monto');
  });
  it('motivo < 3 → issue en motivo', () => {
    expect(errs(cashMovementSchema, { tipo: 'INGRESO', monto: 10, motivo: 'ab' })).toHaveProperty('motivo');
  });
  it('tipo fuera del enum → issue', () => {
    expect(cashMovementSchema.safeParse({ tipo: 'X', monto: 10, motivo: 'xxxx' }).success).toBe(false);
  });
});

describe('closeCashSessionSchema', () => {
  it('contado ≥ 0 válido; notaCierre "" → null', () => {
    const r = closeCashSessionSchema.safeParse({ efectivoContado: 732, notaCierre: '' });
    expect(r.success && r.data.notaCierre).toBeNull();
  });
  it('contado negativo → issue en efectivoContado', () => {
    expect(errs(closeCashSessionSchema, { efectivoContado: -5 })).toHaveProperty('efectivoContado');
  });
});
```

- [ ] **Step 2: Ejecutar (FAIL), escribir `src/lib/validation/cash.ts`** — copiar del spec §4.5 verbatim. `export type … = z.infer<typeof …>`.

- [ ] **Step 3: Ejecutar y verificar que pasa** — `npm run test:unit -- src/lib/validation/cash.test.ts` → PASS.

- [ ] **Step 4: typecheck + lint + commit**

```bash
git add src/lib/validation/cash.ts src/lib/validation/cash.test.ts
git commit -m "feat(caja): esquemas Zod de apertura, movimiento y cierre

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01EnFJHWm8zVoqgkmfwwcRHi"
```

---

## Task 4: `nextFolio` acepta la serie `'C'`

**Files:**
- Modify: `src/lib/sales/folio.ts`, `src/lib/sales/folio.itest.ts`

**Interfaces:**
- Consumes: nada nuevo.
- Produces: `nextFolio(tx, prefijo: 'V' | 'D' | 'C'): Promise<string>` — mismo comportamiento (`UPDATE … RETURNING`, sin huecos), ahora también para `'C'` → `'C-000001'`.

- [ ] **Step 1: Añadir casos a `src/lib/sales/folio.itest.ts` (falla)**

```ts
// beforeEach ya fija V a 0; añade C a 0 también:
beforeEach(async () => {
  await db.folioCounter.update({ where: { serie: 'V' }, data: { valor: 0 } });
  await db.folioCounter.update({ where: { serie: 'C' }, data: { valor: 0 } });
});

it('serie C incrementa y formatea', async () => {
  const a = await db.$transaction((tx) => nextFolio(tx, 'C'));
  const b = await db.$transaction((tx) => nextFolio(tx, 'C'));
  expect(a).toBe('C-000001');
  expect(b).toBe('C-000002');
});
```

- [ ] **Step 2: Ejecutar (FAIL por tipo), cambiar la firma en `folio.ts`** — `prefijo: 'V' | 'D' | 'C'`. Nada más cambia (el `${prefijo}` ya es parámetro).

- [ ] **Step 3: Ejecutar** — `npm run test:integration -- src/lib/sales/folio.itest.ts` → PASS (los casos `V` existentes siguen verdes).

- [ ] **Step 4: typecheck + lint + commit**

```bash
git add src/lib/sales/folio.ts src/lib/sales/folio.itest.ts
git commit -m "feat(caja): nextFolio admite la serie C

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01EnFJHWm8zVoqgkmfwwcRHi"
```

---

## Task 5: Servicio de caja — apertura y movimientos (`src/lib/cash/sessions.ts`)

**Files:**
- Create: `src/lib/cash/sessions.ts`, `src/lib/cash/sessions.itest.ts`

**Interfaces:**
- Consumes: `db`, `Prisma`, `logActivity` (`@/lib/audit`), `ValidationError` (`@/lib/errors`), `nextFolio` (`@/lib/sales/folio`), `CashMovementInput` (`@/lib/validation/cash`).
- Produces:
  - `type CashSessionLite = { id: string; folio: string; fondoApertura: number; abiertaPorId: string; abiertaPorNombre: string; abiertaEn: Date }`
  - `getOpenCashSession(): Promise<CashSessionLite | null>`
  - `openCashSession(actorId: string, fondoApertura: number, ip: string | null): Promise<{ id: string; folio: string }>`
  - `recordCashMovement(actorId: string, input: CashMovementInput, ip: string | null): Promise<{ id: string }>`

- [ ] **Step 1: `src/lib/cash/sessions.itest.ts` (falla) — cobertura de apertura + movimientos**

Helper local: `seedGestor(email)` crea un usuario con rol `Gerente` (tiene `caja.gestionar`; FK real para `abiertaPorId`/`actorId`). Limpieza FK-segura (`activityLog` → `cashMovement` → `cashSession` → usuarios). Restaura `FolioCounter['C'].valor = 0` en `beforeEach` (este archivo asevera el número exacto de folio).

```ts
it('openCashSession sin ninguna abierta → ABIERTA, folio C-000001, audita caja.abrir');
//   - getOpenCashSession() === null antes; tras abrir, !== null y folio === 'C-000001'
//   - db.cashSession con estado ABIERTA, fondoApertura correcto, abiertaPorId === actor
//   - activityLog 'caja.abrir' con metadata.folio y metadata.fondoApertura
it('openCashSession con una ya abierta → ValidationError _form "Ya hay una caja abierta.", FolioCounter[C] no avanzó');
it('dos openCashSession en paralelo (Promise.allSettled) → exactamente una fulfilled, la otra ValidationError');
//   - al final db.cashSession.count({ where: { estado: 'ABIERTA' } }) === 1
it('recordCashMovement RETIRO con caja abierta → crea, audita caja.movimiento con metadata.tipo/monto');
it('recordCashMovement INGRESO con caja abierta → crea');
it('recordCashMovement sin caja abierta → ValidationError _form');
it('recordCashMovement monto 0 → ValidationError({ monto }); motivo "  " → ValidationError({ motivo })');
it('getOpenCashSession devuelve el shape CashSessionLite con abiertaPorNombre');
```

- [ ] **Step 2: Ejecutar (FAIL), escribir `src/lib/cash/sessions.ts`** (solo apertura + movimientos + `getOpenCashSession` de momento). Esqueleto:

```ts
import { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { logActivity } from '@/lib/audit';
import { ValidationError } from '@/lib/errors';
import { nextFolio } from '@/lib/sales/folio';
import type { CashMovementInput } from '@/lib/validation/cash';

export type CashSessionLite = {
  id: string; folio: string; fondoApertura: number;
  abiertaPorId: string; abiertaPorNombre: string; abiertaEn: Date;
};

export async function getOpenCashSession(): Promise<CashSessionLite | null> {
  const s = await db.cashSession.findFirst({
    where: { estado: 'ABIERTA' },
    include: { abiertaPor: { select: { nombre: true } } },
  });
  if (!s) return null;
  return {
    id: s.id, folio: s.folio, fondoApertura: Number(s.fondoApertura),
    abiertaPorId: s.abiertaPorId, abiertaPorNombre: s.abiertaPor.nombre, abiertaEn: s.abiertaEn,
  };
}

export async function openCashSession(
  actorId: string, fondoApertura: number, ip: string | null,
): Promise<{ id: string; folio: string }> {
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT valor FROM "FolioCounter" WHERE serie = 'C' FOR UPDATE`;
    const abierta = await tx.cashSession.findFirst({ where: { estado: 'ABIERTA' } });
    if (abierta) throw new ValidationError({ _form: 'Ya hay una caja abierta.' });
    if (!(fondoApertura >= 0)) throw new ValidationError({ fondoApertura: 'El fondo no puede ser negativo.' });
    const folio = await nextFolio(tx, 'C');
    const session = await tx.cashSession.create({
      data: { folio, estado: 'ABIERTA', fondoApertura, abiertaPorId: actorId },
    });
    await logActivity(
      { actorId, accion: 'caja.abrir', entidad: 'CashSession', entidadId: session.id, metadata: { folio, fondoApertura }, ip },
      tx,
    );
    return { id: session.id, folio };
  });
}

export async function recordCashMovement(
  actorId: string, input: CashMovementInput, ip: string | null,
): Promise<{ id: string }> {
  return db.$transaction(async (tx) => {
    const session = await tx.cashSession.findFirst({ where: { estado: 'ABIERTA' } });
    if (!session) throw new ValidationError({ _form: 'No hay una caja abierta.' });
    if (!(input.monto > 0)) throw new ValidationError({ monto: 'El monto debe ser mayor que 0.' });
    const motivo = input.motivo.trim();
    if (motivo === '') throw new ValidationError({ motivo: 'Indica el motivo.' });
    const mov = await tx.cashMovement.create({
      data: { sessionId: session.id, tipo: input.tipo, monto: input.monto, motivo, actorId },
    });
    await logActivity(
      { actorId, accion: 'caja.movimiento', entidad: 'CashMovement', entidadId: mov.id, metadata: { sessionFolio: session.folio, tipo: input.tipo, monto: input.monto, motivo }, ip },
      tx,
    );
    return { id: mov.id };
  });
}
```

- [ ] **Step 3: Ejecutar y verificar que pasa** — `npm run test:integration -- src/lib/cash/sessions.itest.ts` → PASS.

- [ ] **Step 4: Suite completa + commit**

```bash
git add src/lib/cash/sessions.ts src/lib/cash/sessions.itest.ts
git commit -m "feat(caja): openCashSession (sesión única) y recordCashMovement

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01EnFJHWm8zVoqgkmfwwcRHi"
```

---

## Task 6: Ventas exigen caja abierta (cambios aditivos en Bloque 4)

**Files:**
- Modify: `src/lib/sales/sales.ts` (`createSale`, `cancelSale`, `getSale`/`SaleDetail`, `ListSalesFilter`), `src/lib/sales/returns.ts` (`createReturn`, `getReturn`/`ReturnDetail`, `listReturns`), `src/lib/sales/__testutil.ts` (+ `conCajaAbierta`, `cleanupSales` amplía)
- Modify: `src/app/(app)/ventas/[id]/page.tsx` (el gate del botón "Cancelar venta" pasa de fecha a `sale.cashSessionEstado === 'ABIERTA'`)
- Modify: `src/lib/sales/sales.itest.ts`, `src/lib/sales/returns.itest.ts`, `src/app/(app)/ventas/actions.itest.ts` (anteponer apertura de caja + limpieza)

**Interfaces:**
- Consumes: `getOpenCashSession` no — dentro de la `tx` se usa `tx.cashSession.findFirst({ where: { estado: 'ABIERTA' } })` directamente. `openCashSession` (`@/lib/cash/sessions`) para `conCajaAbierta`.
- Produces: `createSale`/`createReturn` rechazan sin caja abierta y sellan `cashSessionId`. `cancelSale` exige `sale.cashSession.estado === 'ABIERTA'` (sin `esMismoDiaMX`). `SaleDetail` += `cashSessionId: string | null` / `cashSessionFolio: string | null` / `cashSessionEstado: 'ABIERTA' | 'CERRADA' | null`. `ReturnDetail` += `cashSessionId` / `cashSessionFolio`. `ListSalesFilter` += `cashSessionId?: string`. `__testutil` exporta `conCajaAbierta(actorId): Promise<string>`.

- [ ] **Step 1: `__testutil.ts` — `conCajaAbierta` + limpieza**

```ts
import { openCashSession, getOpenCashSession } from '@/lib/cash/sessions';

/** Abre una caja con fondo 0 si no hay ninguna abierta; devuelve el id de la sesión abierta. */
export async function conCajaAbierta(actorId: string): Promise<string> {
  const abierta = await getOpenCashSession();
  if (abierta) return abierta.id;
  const { id } = await openCashSession(actorId, 0, null);
  return id;
}
```
En `cleanupSales`, tras `db.sale.deleteMany()` y antes de `db.inventoryMovement.deleteMany()`:
```ts
  await db.cashMovement.deleteMany();
  await db.cashSession.deleteMany();
```

- [ ] **Step 2: `sales.ts` — `createSale`** — dentro de la `db.$transaction`, como PRIMERA operación (antes de resolver el cliente genérico):

```ts
    const session = await tx.cashSession.findFirst({ where: { estado: 'ABIERTA' } });
    if (!session) {
      throw new ValidationError({ _form: 'No hay una caja abierta. Abre la caja para registrar ventas.' });
    }
```
Y en `tx.sale.create({ data: { …, cashSessionId: session.id } })`.

- [ ] **Step 3: `sales.ts` — `cancelSale`** — cambiar el `include` a `{ lines: true, returns: true, cashSession: { select: { estado: true, folio: true } } }`. Sustituir el bloque `if (!esMismoDiaMX(...))` por:
```ts
    if (sale.cashSession?.estado !== 'ABIERTA') {
      throw new ValidationError({ _form: 'La caja de esta venta ya se cerró; registra una devolución.' });
    }
```
Eliminar el `import { esMismoDiaMX } from '@/lib/sales/fecha';` de `sales.ts` (verificar que no se usa en otro sitio del archivo).

- [ ] **Step 4: `sales.ts` — `getSale` / `SaleDetail`** — añadir al `include` `cashSession: { select: { folio: true, estado: true } }`; a `SaleDetail` los 3 campos; mapear `cashSessionId: sale.cashSessionId`, `cashSessionFolio: sale.cashSession?.folio ?? null`, `cashSessionEstado: sale.cashSession?.estado ?? null`.

- [ ] **Step 4b: `src/app/(app)/ventas/[id]/page.tsx` — gate del botón "Cancelar venta"** — hoy el gate calcula `esDelDia` con `esMismoDiaMX(sale.createdAt, new Date())` y muestra `<CancelSaleForm>` si `canCancelar && sale.estado === 'COMPLETADA' && esDelDia && sale.returns.length === 0`. Sustituir `esDelDia` por `sale.cashSessionEstado === 'ABIERTA'` (y quitar el `import { esMismoDiaMX }` y el cálculo de `esDelDia` de ese archivo si ya no se usan). El gate queda `canCancelar && sale.estado === 'COMPLETADA' && sale.cashSessionEstado === 'ABIERTA' && sale.returns.length === 0`. Así el botón solo aparece cuando `cancelSale` lo aceptaría.

- [ ] **Step 5: `sales.ts` — `ListSalesFilter`** — `+ cashSessionId?: string`; en `where`: `if (filtro.cashSessionId) where.cashSessionId = filtro.cashSessionId;`.

- [ ] **Step 6: `returns.ts` — `createReturn`** — dentro de la `db.$transaction`, tras cargar la venta y validar su `estado`:
```ts
    const session = await tx.cashSession.findFirst({ where: { estado: 'ABIERTA' } });
    if (!session) {
      throw new ValidationError({ _form: 'No hay una caja abierta. Abre la caja para registrar devoluciones.' });
    }
```
Y `tx.return.create({ data: { …, cashSessionId: session.id } })`.

- [ ] **Step 7: `returns.ts` — `getReturn` / `ReturnDetail` / `listReturns`** — `ReturnDetail` += `cashSessionId` / `cashSessionFolio` (via `include: { cashSession: { select: { folio: true } } }`); `listReturns` filtro opcional `cashSessionId?`.

- [ ] **Step 8: Adaptar `sales.itest.ts` / `returns.itest.ts` / `ventas/actions.itest.ts`**
- En cada `beforeEach`, tras sembrar el/los usuario(s) y ANTES de crear ventas: `await conCajaAbierta(ACTOR);` (o el id del cajero correspondiente). Para los tests que ya llaman `cleanupSales` en `beforeEach`, el `conCajaAbierta` va después.
- Casos NUEVOS a añadir:
  - `sales.itest.ts`: `createSale` sin caja abierta (cerrar/no abrir la del beforeEach en un `it` concreto) → `ValidationError({ _form })`, nada creado, `FolioCounter['V']` intacto.
  - `sales.itest.ts`: `createSale` con caja abierta → `sale.cashSessionId === <id de la sesión>`.
  - `sales.itest.ts`: `cancelSale` de una venta cuya sesión se cerró (abrir A, vender, `closeCashSession` no existe aún en Task 6 — usar `db.cashSession.update({ where:{id}, data:{ estado:'CERRADA' } })` para forzar) → `ValidationError({ _form: '…ya se cerró…' })`. El caso de "cancelación mismo día" existente se re-encuadra: con la sesión ABIERTA (la del beforeEach) sigue permitiendo cancelar.
  - `returns.itest.ts`: `createReturn` sin caja abierta → `ValidationError`; con caja abierta → `return.cashSessionId === <id>`.
- Los asertos de importe/folio/auditoría existentes NO cambian.

- [ ] **Step 9: Suite completa + commit**

Run: `npm run typecheck && npm run lint && npm run test:unit && npm run test:integration && npm run build` — todo verde. Correr `npm run test:integration` una segunda vez (estabilidad).

```bash
git add src/lib/sales/sales.ts src/lib/sales/returns.ts src/lib/sales/__testutil.ts src/lib/sales/sales.itest.ts src/lib/sales/returns.itest.ts "src/app/(app)/ventas/actions.itest.ts"
git commit -m "feat(caja): ventas y devoluciones exigen caja abierta; cancelSale exige sesión abierta

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01EnFJHWm8zVoqgkmfwwcRHi"
```

---

## Task 7: Servicio de caja — arqueo y cierre (`src/lib/cash/sessions.ts`)

**Files:**
- Modify: `src/lib/cash/sessions.ts` (+ `computeExpectedCash`, `closeCashSession`, `getCashSession`, `listCashSessions` + tipos), `src/lib/cash/sessions.itest.ts` (+ describe blocks)

**Interfaces:**
- Consumes: lo de Task 5 + `createSale`/`createReturn`/`cancelSale` (`@/lib/sales/*`) y `seedVariant`/`conCajaAbierta` (`@/lib/sales/__testutil`) en el itest.
- Produces:
  - `computeExpectedCash(sessionId: string, tx: Prisma.TransactionClient): Promise<ExpectedCash>` — **NO exportada** (helper interno). `ExpectedCash = { esperadoEfectivo; totalEfectivoVentas; totalTarjeta; totalTransferencia; totalReembolsosEfectivo; totalRetiros; totalIngresos; nVentas }` (todos `number`).
  - `closeCashSession(actorId: string, efectivoContado: number, notaCierre: string | null, ip: string | null): Promise<{ id: string; folio: string; diferencia: number }>`
  - `type CashSessionDetail` (campos de `CashSession` como `number`/`null` + `abiertaPorNombre` + `cerradaPorNombre: string | null` + `movements: { id; tipo; monto: number; motivo; actorNombre: string; createdAt: Date }[]`)
  - `getCashSession(id: string): Promise<CashSessionDetail | null>`
  - `type CashSessionRow` + `type ListCashSessionsFilter` (spec §2.8)
  - `listCashSessions(filtro: ListCashSessionsFilter): Promise<{ rows: CashSessionRow[]; total: number }>`

- [ ] **Step 1: Añadir tests a `sessions.itest.ts` (fallan)**

El `beforeEach` de este archivo ahora también debe permitir crear ventas: siembra un cajero (`seedCajero`) además del gestor, o usa el gestor (Gerente tiene `ventas.crear`). Limpieza FK-segura ampliada (`payment`/`saleLine`/`sale`/`return*` antes de `cashMovement`/`cashSession`).

```ts
describe('closeCashSession', () => {
  it('escenario compuesto: esperado == fórmula a mano, canceladas excluidas, totales fotografiados');
  //  - abrir caja fondo 1000
  //  - seedVariant precio 100 (IVA 16%): 3 ventas 1u en EFECTIVO exacto (total 116 c/u) → efectivo 348
  //  - 1 venta 1u pagada con sobrepago EFECTIVO 200 → cambio 84 (neto 116)
  //  - 1 venta 1u pagada TARJETA 116
  //  - 1 venta 1u EFECTIVO 116 y luego cancelSale → NO cuenta
  //  - 1 createReturn de 1u de una venta EFECTIVO, metodoReembolso EFECTIVO, total 116
  //  - recordCashMovement RETIRO 300; INGRESO 50
  //  - closeCashSession(gestor, <contado>, null)
  //  - esperadoEfectivo == 1000 + (348 + 116) - 116 - 300 + 50 == 1098
  //  - totalEfectivoVentas == 464 ; totalTarjeta == 116 ; totalReembolsosEfectivo == 116
  //  - totalRetiros == 300 ; totalIngresos == 50 ; nVentas == 5 (canceladas fuera)
  //  - contado 1098 → diferencia 0 (sub-test) ; contado 1120 → diferencia +22 ; contado 1080 → diferencia -18
  //  - estado 'CERRADA', cerradaPorId, cerradaEn, todos los total* presentes; audita 'caja.cerrar'
  it('closeCashSession sin caja abierta → ValidationError _form');
  it('closeCashSession efectivoContado < 0 → ValidationError({ efectivoContado })');
  it('tras cerrar, getOpenCashSession() === null; nueva openCashSession funciona y da C-000002');
});
describe('getCashSession', () => {
  it('sesión abierta → total*/esperado/contado/diferencia en null, movements presentes');
  it('sesión cerrada → todos los total* presentes; abiertaPorNombre y cerradaPorNombre');
  it('id inexistente → null');
});
describe('listCashSessions', () => {
  it('filtra por estado (ABIERTA/CERRADA/todas) y rango de fechas; orden abiertaEn desc; total de count');
});
```

- [ ] **Step 2: Ejecutar (FAIL), implementar en `sessions.ts`**

`computeExpectedCash(sessionId, tx)`:
- `ventasIds = (await tx.sale.findMany({ where: { cashSessionId: sessionId, estado: 'COMPLETADA' }, select: { id: true, cambio: true } }))`.
- `pagos = await tx.payment.groupBy({ by: ['metodo'], where: { saleId: { in: ventasIds.map(v => v.id) } }, _sum: { monto: true } })` → sacar EFECTIVO/TARJETA/TRANSFERENCIA.
- `ventasConEfectivo = await tx.payment.findMany({ where: { saleId: { in: … }, metodo: 'EFECTIVO' }, select: { saleId: true }, distinct: ['saleId'] })` → set de saleIds; `cambioEfectivo = Σ v.cambio` de `ventasIds` cuyo `id ∈ ese set`.
- `totalEfectivoVentas = round2(pagosEfectivo − cambioEfectivo)`.
- `totalReembolsosEfectivo = round2((await tx.return.aggregate({ where: { cashSessionId: sessionId, metodoReembolso: 'EFECTIVO' }, _sum: { total: true } }))._sum.total ?? 0)`.
- `totalRetiros` / `totalIngresos` = `tx.cashMovement.aggregate({ where: { sessionId, tipo }, _sum: { monto: true } })`.
- `nVentas = ventasIds.length`.
- `esperadoEfectivo = round2(fondoApertura + totalEfectivoVentas − totalReembolsosEfectivo − totalRetiros + totalIngresos)` (el `fondoApertura` se pasa o se lee de la sesión dentro del helper — pásalo como argumento desde `closeCashSession` para no re-consultar).

`closeCashSession` — seguir el spec §2.6 verbatim.
`getCashSession` — spec §2.7.
`listCashSessions` — spec §2.8.

- [ ] **Step 3: Ejecutar y verificar que pasa** — `npm run test:integration -- src/lib/cash/sessions.itest.ts` → PASS.

- [ ] **Step 4: Suite completa + commit**

```bash
git add src/lib/cash/sessions.ts src/lib/cash/sessions.itest.ts
git commit -m "feat(caja): closeCashSession con arqueo por agregación, getCashSession y listCashSessions

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01EnFJHWm8zVoqgkmfwwcRHi"
```

---

## Task 8: Server Actions (`src/app/(app)/caja/actions.ts`)

**Files:**
- Create: `src/app/(app)/caja/actions.ts`, `src/app/(app)/caja/actions.itest.ts`

**Interfaces:**
- Consumes: `requirePermission` (`@/lib/auth/context`), `getClientIp` (`@/lib/http`), `ValidationError` (`@/lib/errors`), `openCashSessionSchema`/`cashMovementSchema`/`closeCashSessionSchema` (`@/lib/validation/cash`), `openCashSession`/`recordCashMovement`/`closeCashSession` (`@/lib/cash/sessions`), `type FormState` (`@/app/(auth)/setup/actions`).
- Produces (todas `(_prev: FormState, formData: FormData) => Promise<FormState>`): `abrirCajaAction`, `registrarMovimientoCajaAction`, `cerrarCajaAction`. Helpers locales `fieldErrorsFrom`/`fromValidationError`/`ip()` (copiar de `@/app/(app)/ventas/actions.ts` o `clientes/actions.ts`).

- [ ] **Step 1: `src/app/(app)/caja/actions.itest.ts` (falla)** — mock `next/headers`, `next/cache` (`revalidatePath: () => {}`), `next/navigation` (`redirect: (u) => { throw new Error('REDIRECT:' + u); }`). Siembra usuarios por rol de sistema. Aislamiento FK-seguro (`activityLog` → `cashMovement` → `cashSession` → usuarios). Casos del spec §6.2.

- [ ] **Step 2: Ejecutar (FAIL), escribir `actions.ts`** — idioma de `clientes/actions.ts`. Cada action: `const actor = await requirePermission('caja.gestionar');` primera sentencia; `safeParse(Object.fromEntries(formData))`; `try { await <servicio>(...) } catch (e) { if (e instanceof ValidationError) return fromValidationError(e); throw e }`; `redirect()` fuera del try (abrir/cerrar) o `return { ok: true }` (movimiento). Ver spec §6.1 para la tabla.

- [ ] **Step 3: Ejecutar y verificar que pasa** — `npm run test:integration -- "src/app/(app)/caja/actions.itest.ts"` → PASS.

- [ ] **Step 4: Suite completa + commit**

```bash
git add "src/app/(app)/caja/actions.ts" "src/app/(app)/caja/actions.itest.ts"
git commit -m "feat(caja): server actions de apertura, movimiento y cierre

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01EnFJHWm8zVoqgkmfwwcRHi"
```

---

## Task 9: Pantallas de operación — `/caja` y `/caja/cerrar`

**Files:**
- Create: `src/app/(app)/caja/page.tsx`, `src/app/(app)/caja/cerrar/page.tsx`
- Create: `src/app/(app)/caja/AbrirCajaForm.tsx`, `PanelCajaAbierta.tsx`, `CashMovementForm.tsx`, `CerrarCajaForm.tsx`
- Modify: `src/app/(app)/ventas/page.tsx` (aviso "No hay una caja abierta")

**Interfaces:**
- Consumes: `requirePermission` / `getCurrentUser`, `getOpenCashSession` / `getCashSession` (`@/lib/cash/sessions`), `abrirCajaAction` / `registrarMovimientoCajaAction` / `cerrarCajaAction` (Task 8), `fmtFechaMX` / `money` / `inputClass` (`@/app/(app)/ventas/types`), `PermissionGate`.
- Produces: rutas `/caja`, `/caja/cerrar`. Modifica `/ventas` para bloquear el flujo sin caja.

- [ ] **Step 1: `page.tsx` (server)** — `await requirePermission('caja.gestionar')` primera sentencia; `export const dynamic = 'force-dynamic'`. `const abierta = await getOpenCashSession();` Si `null` → `<AbrirCajaForm />` + `<Link href="/caja/historial">Ver historial de cortes</Link>`. Si no → `<PanelCajaAbierta session={await getCashSession(abierta.id)} />`.

- [ ] **Step 2: `AbrirCajaForm.tsx`** (`'use client'`) — `useActionState(abrirCajaAction, { ok: false })`; input `name="fondoApertura"` (number, min 0, step 0.01); `state.fieldErrors.fondoApertura` / `state.formError`; `useFormStatus` en el botón "Abrir caja".

- [ ] **Step 3: `PanelCajaAbierta.tsx`** (server-free, recibe `CashSessionDetail`) — cabecera (folio, "Abierta por {abiertaPorNombre}", `fmtFechaMX(abiertaEn)`, "Fondo {money(fondoApertura)}"). Lista de `movements` (badge tipo, `money(monto)`, motivo, actorNombre, `fmtFechaMX(createdAt)`) o "Sin movimientos". Dos `<CashMovementForm tipo="RETIRO" />` / `tipo="INGRESO"` (o un solo form con selector). `<Link href="/caja/cerrar">` botón destacado "Cerrar caja (arqueo)". `<Link href={`/ventas/historial?cashSessionId=${session.id}`}>Ver ventas de esta caja</Link>`. **No muestra esperado ni total de ventas.**

- [ ] **Step 4: `CashMovementForm.tsx`** (`'use client'`) — `useActionState(registrarMovimientoCajaAction, { ok: false })`; `<input type="hidden" name="tipo" value={tipo} />`; `name="monto"` + `name="motivo"`; muestra `state.formError` / `fieldErrors`; en `state.ok` limpia los inputs (o confía en el `revalidatePath`).

- [ ] **Step 5: `cerrar/page.tsx` (server)** — `requirePermission` primero; `const abierta = await getOpenCashSession(); if (!abierta) redirect('/caja');` (fuera de try/catch). `<CerrarCajaForm session={abierta} />`.

- [ ] **Step 6: `CerrarCajaForm.tsx`** (`'use client'`) — `useActionState(cerrarCajaAction, { ok: false })`. Muestra fondo y `fmtFechaMX(abiertaEn)`. Input `name="efectivoContado"` (number, min 0, step 0.01) + `<textarea name="notaCierre">`. Aviso "Cuenta el efectivo antes de confirmar; verás la diferencia después." `useFormStatus` botón "Confirmar cierre". **No calcula ni muestra el esperado.**

- [ ] **Step 7: `ventas/page.tsx`** — al inicio del cuerpo, tras `requirePermission('ventas.crear')`: `const cajaAbierta = await getOpenCashSession();` si `null`, renderizar `<div>` con "No hay una caja abierta" + `<Link href="/caja">Abrir caja</Link>` en lugar de `<CashierScreen>`. Cambio aditivo mínimo.

- [ ] **Step 8: Verificación + commit**

Run: `npm run typecheck && npm run lint && npm run build && npm run test:unit && npm run test:integration`

```bash
git add "src/app/(app)/caja/" "src/app/(app)/ventas/page.tsx"
git commit -m "feat(caja): pantallas de apertura, panel de sesión abierta y arqueo; guard en el flujo de cajero

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01EnFJHWm8zVoqgkmfwwcRHi"
```

---

## Task 10: Detalle / corte, historial y export

**Files:**
- Create: `src/app/(app)/caja/sesiones/[id]/page.tsx`, `src/app/(app)/caja/historial/page.tsx`, `src/app/(app)/caja/historial/export/route.ts` (+ `route.itest.ts`)
- Create: `src/app/(app)/caja/CorteView.tsx`, `src/app/(app)/caja/CajaSessionRow.tsx`
- Create: `src/app/caja-corte/[id]/page.tsx` (fuera de `(app)`)

**Interfaces:**
- Consumes: `requirePermission`, `getCashSession` / `listCashSessions` (`@/lib/cash/sessions`), `parseDateParam` (`@/lib/activity/query`), `fmtFechaMX` / `money` / `inputClass` (`@/app/(app)/ventas/types`), `PrintOnMount` (`@/app/(app)/ventas/PrintOnMount` — si no es importable desde ahí, duplicar el `useEffect(() => window.print(), [])`), `DataTable` / `Pagination`, el `esc` local (como en los export de Ventas), `db` (para el `findMany` de totales del export y el nombre del negocio).
- Produces: rutas `/caja/sesiones/[id]`, `/caja/historial`, `/caja/historial/export`, `/caja-corte/[id]`.

- [ ] **Step 1: `historial/export/route.itest.ts` (falla)** — mock `next/headers`; 403 sin `caja.gestionar` (sesión de Empleado o un rol sin la clave); 200 `text/csv` con una `CashSession` `CERRADA` sembrada (crear vía `openCashSession` + `closeCashSession`, o insertar directo con `db.cashSession.create` incluyendo los `total*`) — el folio `C-…` y la `diferencia` aparecen en el cuerpo. Cabecera exacta (spec §5.6). BOM.

- [ ] **Step 2: `historial/export/route.ts`** — idioma de `ventas/historial/export/route.ts`; `runtime='nodejs'`; gate `try/catch ForbiddenError → 403`; lee `estado`/`desde`/`hasta`; `listCashSessions({ ..., page:1, pageSize:5000 })`; para los totales de las cerradas un `db.cashSession.findMany({ where: { id: { in: ids } }, select: { …los total* + esperadoEfectivo + efectivoContado + diferencia + cerradaPor: { select: { nombre: true } } } })` mapeado por id. Fechas con `fmtFechaMX`. `content-disposition: attachment; filename="cortes-caja-<YYYY-MM-DD>.csv"`.

- [ ] **Step 3: `sesiones/[id]/page.tsx` (server)** — `requirePermission` primero; `getCashSession(id)` → `notFound()` si null. Si `estado === 'ABIERTA'`: cabecera + fondo + `movements` + aviso "Caja abierta; el arqueo se verá al cerrar." Si `CERRADA`: el corte completo (spec §5.3) reutilizando `<CorteView>` o un render inline; badge de diferencia (verde "Cuadra" si `0`, ámbar "Sobrante +$X" si `> 0`, rojo "Faltante −$X" si `< 0`). Botón "Imprimir corte" → `<Link href={`/caja-corte/${id}`}>`.

- [ ] **Step 4: `CorteView.tsx`** (render puro; recibe `CashSessionDetail` + `negocio: string`) — el desglose de §5.3 en formato tira ~80 mm con `<style>` `@media print`. Reutilizable por `sesiones/[id]/page.tsx` y por `caja-corte/[id]/page.tsx`.

- [ ] **Step 5: `caja-corte/[id]/page.tsx`** — **fuera de `(app)`**. `requirePermission('caja.gestionar')` primera sentencia; `getCashSession(id)` → `notFound()` si null o `estado !== 'CERRADA'`. Lee el nombre del negocio (`db.appSetting.findUnique({ where: { clave: 'negocio.nombre' } })` o el helper `getSetting` del Bloque 4 si existe; fallback `'Punto de venta'`). Renderiza `<main>` estrecho centrado + `<CorteView session={...} negocio={...} />` + `<PrintOnMount />`.

- [ ] **Step 6: `historial/page.tsx` (server)** — `requirePermission` primero; `searchParams` `estado`/`desde`/`hasta`/`page`; `listCashSessions({ estado: estado==='todas'?undefined:estado, desde, hasta, page, pageSize: 20 })`. `<form method="get">` con `<select name="estado">` + 2 `<input type="date">`. `<DataTable>` cols Folio / Estado (badge) / Apertura / Cierre / Abrió / Fondo / Contado / Diferencia (badge o "—"). `rowComponent={CajaSessionRow}`, `rowHref={(r) => `/caja/sesiones/${r.id}`}`. `<Pagination>`. Enlace "Exportar CSV" con los filtros.

- [ ] **Step 7: `CajaSessionRow.tsx`** — `{ href?, children }` (copia de `SaleRow.tsx`).

- [ ] **Step 8: Verificación + commit**

Run: `npm run typecheck && npm run lint && npm run build && npm run test:integration -- "src/app/(app)/caja/historial/export/route.itest.ts"` y suites completas.

```bash
git add "src/app/(app)/caja/" "src/app/caja-corte/"
git commit -m "feat(caja): detalle/corte de sesión, corte imprimible, historial y export CSV

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01EnFJHWm8zVoqgkmfwwcRHi"
```

---

## Task 11: E2E de caja + adaptación del E2E de ventas

**Files:**
- Create: `e2e/caja.spec.ts`
- Modify: `e2e/ventas.spec.ts` (anteponer "abrir caja" en cada escenario), `e2e/helpers.ts` (+ `abrirCaja`)

**Interfaces:**
- Consumes: helpers de `e2e/helpers.ts`; referencia `e2e/ventas.spec.ts` (login por rol, alta de productos por UI) y `e2e/clientes.spec.ts`.
- Produces: `abrirCaja(page: Page, fondo: number): Promise<void>` en `helpers.ts` — navega a `/caja`, rellena `fondoApertura`, "Abrir caja", espera el panel de sesión abierta.

- [ ] **Step 1: `e2e/helpers.ts` — `abrirCaja`** — función exportada; asume que el usuario logueado tiene `caja.gestionar` (Cajero y Gerente lo tienen).

- [ ] **Step 2: Adaptar `e2e/ventas.spec.ts`** — cada escenario que hace una venta antepone `await abrirCaja(page, 1000)` tras el login (o en un paso común). El escenario 5 del Bloque 4 ("cancelación mismo día") sigue pasando: la caja está abierta durante el test, así que `cancelSale` lo permite; el aserto de "estado Cancelada" y "stock reintegrado" no cambia. Verificar que NINGÚN aserto de negocio se toca — solo se añade el paso de abrir caja.

- [ ] **Step 3: `e2e/caja.spec.ts`** — los 7 escenarios del spec §6.3, con aserciones reales (valor del cambio, diferencia, badge, ausencia de controles, contenido del corte, ausencia de sidebar). Datos únicos por corrida; cada `test()` autónomo (login propio, productos propios). Productos sembrados vía UI (`/productos/nuevo`) como Administrador, como en `ventas.spec.ts`.

- [ ] **Step 4: Ejecutar** — `npm run test:e2e -- caja` y `npm run test:e2e -- ventas` → ambos verdes.

- [ ] **Step 5: Commit**

```bash
git add e2e/caja.spec.ts e2e/ventas.spec.ts e2e/helpers.ts
git commit -m "test(caja): E2E de apertura, arqueo, cancelación y corte; ventas E2E abren caja

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01EnFJHWm8zVoqgkmfwwcRHi"
```

---

## Verificación final del bloque (tras la revisión de rama completa)

- [ ] `npm run typecheck` → 0 · `npm run lint` → 0 · `npm run test:unit` → verde · `npm run test:integration` → verde y **estable en 3 corridas** · `npm run build` → OK · `npm run test` → verde · `npm run test:e2e` → verde.
- [ ] Revisión de seguridad e integridad: (a) toda Server Action de caja empieza con `requirePermission('caja.gestionar')`; (b) el esperado NUNCA se expone antes del cierre (grep de `computeExpectedCash` — solo se usa dentro de `closeCashSession`); (c) `openCashSession` toma el candado `FOR UPDATE` antes de comprobar sesión abierta — no puede haber 2 abiertas (test de concurrencia); (d) `createSale`/`createReturn` rechazan sin caja abierta y sellan `cashSessionId`; `cancelSale` exige sesión ABIERTA; (e) la fórmula del esperado excluye ventas `CANCELADA` y usa efectivo neto (con el cambio descontado); (f) folios `C` sin huecos (rollback revierte); (g) migración estrictamente aditiva (`migration.sql`, enums de Ventas intactos); (h) sin `console.*`, sin `any`, sin `new PrismaClient()` fuera de `seed.ts`.
- [ ] `docs/superpowers/decisions-bloque5.md` si el bloque tomó decisiones no evidentes (opcional).

---

## Global Self-Review (autor del plan)

**Cobertura del spec:**
- Modelo (`CashSession`/`CashMovement`, enums, `Sale/Return.cashSessionId?`, relaciones inversas, `FolioCounter` C) → Task 1.
- RBAC (`caja.gestionar`) + auditoría (3 acciones) + nav → Task 2.
- Validación Zod → Task 3.
- `nextFolio` serie C → Task 4.
- `getOpenCashSession` / `openCashSession` (unicidad con `FOR UPDATE`) / `recordCashMovement` → Task 5.
- Gating de Ventas (`createSale`/`createReturn` exigen caja; `cancelSale` sustituye `esMismoDiaMX`; campos de `SaleDetail`/`ReturnDetail`; adaptación de itests del Bloque 4) → Task 6.
- `computeExpectedCash` (interno) + `closeCashSession` (arqueo por agregación, canceladas excluidas, efectivo neto) + `getCashSession` + `listCashSessions` → Task 7.
- Server actions → Task 8.
- Pantallas de operación (`/caja`, `/caja/cerrar`, panel, forms) + guard en `/ventas` → Task 9.
- Detalle/corte + corte imprimible fuera de `(app)` + historial + export CSV → Task 10.
- E2E de caja + adaptación E2E de ventas → Task 11.
- Migración aditiva → Task 1.

**Consistencia de tipos:** `CashMovementInput` lo define Task 3 (`@/lib/validation/cash`) y lo consume Task 5 (`recordCashMovement`). `CashSessionLite` (Task 5) ↔ lo consumen `/caja` (Task 9). `CashSessionDetail` (Task 7) ↔ `PanelCajaAbierta`/`CorteView`/`sesiones/[id]` (Tasks 9–10). `computeExpectedCash` **no exportada** — solo `closeCashSession` la llama; el itest de Task 7 verifica el resultado a través de la fila `CashSession` cerrada, no llamándola directamente. `SaleDetail.cashSessionEstado` (Task 6) ↔ el gate del botón "Cancelar venta" en `/ventas/[id]` (Bloque 4, ya existente) — Task 6 Step 4 lo añade; el `[id]/page.tsx` del Bloque 4 ya usa un `esDelDia` para ese gate: **Task 6 debe además actualizar `src/app/(app)/ventas/[id]/page.tsx`** para que el gate use `sale.cashSessionEstado === 'ABIERTA'` en lugar de `esMismoDiaMX` (añadido a Task 6 Step 3 como sub-punto). *(Nota: si el implementer no lo hace en Task 6, el botón seguiría mostrándose por fecha aunque `cancelSale` lo rechace — la revisión de tarea debe pillarlo.)*

**Sin placeholders:** `sessions.ts` (apertura/movimientos completo; cierre con el algoritmo detallado paso a paso), los esquemas Zod, y el esqueleto de los cambios de Ventas están completos. Las pantallas (Tasks 9–10) se describen por contrato contra ficheros de referencia concretos de Bloques 3–4.

**Riesgo señalado:** Task 6 es la de mayor riesgo (toca 3 itests del Bloque 4 + `sales.ts`/`returns.ts` + la ficha de venta). Es acotada (anteponer apertura de caja, no cambiar aserciones) pero extensa; si desborda, el implementer reporta DONE_WITH_CONCERNS con el desglose. Task 7 es densa (algoritmo de agregación + itest compuesto) pero es un solo servicio.
