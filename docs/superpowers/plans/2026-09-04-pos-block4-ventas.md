# POS Bloque 4 (Ventas / Punto de venta) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Punto de venta sobre los Bloques 1–3: carrito en cliente → venta atómica `COMPLETADA` (Sale/SaleLine/Payment) con IVA por línea sobre base neta, descuentos de línea y ticket, pagos mixtos con cambio, folio correlativo sin huecos, ticket imprimible, snapshot fiscal, cancelación del mismo día y devoluciones parciales contra la venta.

**Architecture:** Mismo proyecto Next.js (App Router, gate `src/proxy.ts`). `src/lib/sales/compute.ts` (puro, sin BD) es la ÚNICA fuente de verdad de los importes; lo usan el *quote endpoint* y `createSale`, y el servidor SIEMPRE recalcula desde ids+cantidades+descuentos con precios/tasas frescos de BD dentro de una `db.$transaction`. `recordMovement` (Bloque 2) se amplía mínimamente para `VENTA`/`DEVOLUCION` y se llama con `tx` dentro de la transacción de venta/devolución. Toda mutación entra por una Server Action con `requirePermission` como primera sentencia y auditoría dentro de la misma transacción.

**Tech Stack:** Next.js 16.3.4, React 19.2, TypeScript strict, PostgreSQL + Prisma 7 + `@prisma/adapter-pg`, Zod 4, Tailwind v4, Vitest 4 (`*.test.ts` unit / `*.itest.ts` integración con Postgres efímero), Playwright.

**Spec:** `docs/superpowers/specs/2026-09-04-pos-block4-ventas-design.md`

## Global Constraints

- **Base ya construida (Bloques 1–3, en `master`):** reutiliza sin reescribir — `requirePermission`/`requireUser`/`getCurrentUser` (`@/lib/auth/context`), `PERMISSIONS`/`can`/`ALL_PERMISSION_KEYS`/`PermissionKey` (`@/lib/auth/rbac`), `ROLE_PERMISSIONS` (`@/lib/auth/role-permissions` — fuente única seed↔tests), `logActivity`/`actionLabel`/`KNOWN_ACTIONS`/`AuditAction` (`@/lib/audit`), `parseDateParam` (`@/lib/activity/query`), `type FormState` (`@/app/(auth)/setup/actions`), `AppError`/`ValidationError`/`ForbiddenError` (`@/lib/errors`), `db` (`@/lib/db`), `getClientIp` (`@/lib/http`), `recordMovement`/`MovementInput`/`MovementResult` (`@/lib/inventory/movements`), `computeStock` (`@/lib/inventory/stock-calc`), `invalidateStockAlertsCache` (`@/lib/inventory/stock`), `searchProducts`/`SearchHit` (`@/lib/catalog/search`), `getProduct`/`listProducts` (`@/lib/catalog/products`), `listCategoryTree` (`@/lib/catalog/categories`), `searchCustomers` (`@/lib/customers/search`), `getCustomer` (`@/lib/customers/customers`), `crearClienteAction` (`@/app/(app)/clientes/actions`), `getTaxRates`/`precioConImpuesto` (`@/lib/taxes`), `enmascararRfc` (`@/lib/customers/fiscal`), `DataTable`/`Column`/`Pagination`/`PermissionGate` (`@/components/*`), `visibleNav`/`NAV_ITEMS` (`@/lib/nav`).
- **Prisma:** un solo cliente, `import { db } from '@/lib/db'` — NUNCA `new PrismaClient()` (excepción: `prisma/seed.ts`). `Prisma.PrismaClientKnownRequestError` `.code === 'P2002'` para únicos; el campo se deduce del error como en `src/lib/customers/customers.ts::p2002Hints` (`e.meta?.target` viene vacío con `@prisma/adapter-pg`). `Prisma.TransactionClient` para funciones con `tx`.
- **Migración:** ADITIVA. Tablas nuevas (`Sale`, `SaleLine`, `Payment`, `Return`, `ReturnLine`, `FolioCounter`), enums nuevos (`SaleStatus`, `PaymentMethod`), relaciones inversas nuevas en `User`/`Customer`/`ProductVariant`. **`MovementType` NO cambia** (ya tiene `VENTA`/`DEVOLUCION`). Ninguna tabla/columna/enum existente se altera ni se borra. `npx prisma migrate dev --name bloque4_ventas`. Requiere la BD de desarrollo levantada: `npm run db:start` (foreground; arráncalo con `run_in_background`; PG en `localhost:54329`, db `pos_dev`).
- **Dinero:** `Decimal @db.Decimal(12,2)` para importes, `@db.Decimal(5,4)` para tasas. `computeSale` opera en centavos enteros internamente; `round2(x)` = half-up a 2 decimales sobre centavos (NO `toFixed`). Los servicios reciben/devuelven `number`; Prisma serializa a `Decimal`; al leer para la UI, `Number(value)`.
- **IVA:** por línea sobre base neta — `impuesto_i = round2(baseNeta_i · tasa_i)`. `precioVenta` de la variante es la base SIN impuesto (igual que Bloque 2).
- **Descuentos:** reducen la base; el IVA se calcula sobre base neta. Descuento de ticket se prorratea entre líneas proporcional a `baseTrasLinea`, con el residuo de centavos asignado a las líneas de mayor base (orden estable por índice) para que `Σ prorrateo == descTicketTotal` exacto.
- **Stock:** `recordMovement` es el único escritor de `ProductVariant.stock`. `VENTA` baja (como `SALIDA`), `DEVOLUCION` sube (como `ENTRADA`). Sin stock negativo (regla dura; `VENTA` que dejaría `< 0` → `ValidationError`, revierte toda la transacción). `recordMovement` llamado con `tx` NO invalida el caché de alertas de stock — `createSale`/`cancelSale`/`createReturn` llaman `invalidateStockAlertsCache()` **después** de que la transacción commitea.
- **Folios:** `FolioCounter` (`serie` PK, `valor` Int). `nextFolio(tx, 'V'|'D')` hace `UPDATE … SET valor = valor + 1 … RETURNING valor` dentro de la `tx` → un rollback revierte el incremento → **folios sin huecos**. Formato `V-000123` / `D-000045` (6 dígitos, `padStart`).
- **Ciclo de vida:** carrito en cliente (sin persistencia servidor). `createSale` crea `Sale` `COMPLETADA` atómica. `cancelSale` (mismo día, `ventas.cancelar`) reintegra stock + marca `CANCELADA`. Una venta `CANCELADA` no admite devolución; una venta con devoluciones no admite cancelación. Ninguna venta registrada se edita.
- **Pagos:** `Σ pagos ≥ total`. `cambio = round2(pagado − total)`; `cambio > 0` solo si hay un pago `EFECTIVO` con `monto ≥ cambio`. Sin crédito.
- **Snapshot fiscal:** si `requiereFactura`, el cliente debe tener el bloque fiscal completo (`bloqueFiscalCompleto`, `@/lib/customers/fiscal`) y no ser el genérico; se guarda `Sale.datosFiscales = { rfc, razonSocial, regimenFiscalCode, usoCfdiCode, cpFiscal }`. El RFC NUNCA aparece en metadata de `activity_log`; en pantalla/ticket va enmascarado (`enmascararRfc`).
- **Permisos nuevos** (grupo `ventas` en `PERMISSIONS`): `ventas.crear`, `ventas.descuento`, `ventas.cancelar`, `ventas.devolver`, `ventas.ver`. Reparto en `ROLE_PERMISSIONS` (`role-permissions.ts`): Gerente ← las 5; Cajero ← `ventas.crear` + `ventas.ver` + `ventas.devolver`; Empleado ← ninguna. Administrador vía `ALL_PERMISSION_KEYS`.
- **Autorización:** toda Server Action mutante empieza con `await requirePermission('<clave>')` ANTES de leer `formData` o tocar la BD. `crearVentaAction` además: si el payload trae descuento de línea o de ticket y el actor no tiene `ventas.descuento` → `ValidationError({ _form: 'No tienes permiso para aplicar descuentos.' })`. `redirect()` fuera de try/catch. Solo `ValidationError` se captura; `ForbiddenError` se propaga. El *quote endpoint* hace `try { await requirePermission('ventas.crear') } catch (e) { if (e instanceof ForbiddenError) return 403; throw e }`.
- **Auditoría:** dentro de la misma `db.$transaction` que la mutación. Acciones nuevas (a `AuditAction`, `LABELS`): `ventas.crear`, `ventas.cancelar`, `ventas.devolver`. `recordMovement` ya escribe su propia fila `inventario.movimiento` por movimiento (esperado; no se suprime).
- **UI:** español; server pages con `requirePermission(...)` primera sentencia y `export const dynamic = 'force-dynamic'`; `redirect()`/`notFound()` fuera de try/catch; React 19 `useActionState`/`useFormStatus`; Zod 4 (`z.email()`, `.superRefine()`); Tailwind v4; sin `any`; sin `console.*`.
- **TDD:** test primero. `*.test.ts` unit (sin BD), `*.itest.ts` integración (globalSetup levanta Postgres efímero en `localhost:54330` db `pos_test`, aplica migraciones + seed). Ejecutar por tarea: `npm run typecheck && npm run lint && npm run test:unit && npm run test:integration && npm run build`, y pegar las colas en el reporte.
- **Aislamiento FK en itests** (orden de limpieza en `beforeEach`/`afterAll`): `activityLog` → `payment` → `returnLine` → `return` → `saleLine` → `sale` → `inventoryMovement` → `productVariant` → `product` → usuarios de prueba. **Nunca** borrar el cliente `esGenerico`, los roles de sistema, `taxRate`, ni reiniciar `FolioCounter` a mano. Los itests que comprueban el número exacto de folio corren aislados y fijan el estado de `FolioCounter` ellos mismos; el resto asevera prefijo/formato (`/^V-\d{6}$/`), no el número.
- **Commits:** Conventional Commits en español, terminando EXACTAMENTE con:
  ```
  Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01EnFJHWm8zVoqgkmfwwcRHi
  ```
- **Sin push, sin remoto, sin deploy.** Todo local.

---

## Estructura de archivos

**Prisma**
- `prisma/schema.prisma` — + modelos `Sale`/`SaleLine`/`Payment`/`Return`/`ReturnLine`/`FolioCounter`; enums `SaleStatus`/`PaymentMethod`; relaciones inversas en `User`/`Customer`/`ProductVariant`.
- `prisma/seed.ts` — + upsert de `FolioCounter` `{serie:'V',valor:0}` y `{serie:'D',valor:0}` (idempotente).
- `prisma/migrations/<ts>_bloque4_ventas/` — generada.

**Librería**
- `src/lib/inventory/stock-calc.ts` — `computeStock` acepta `VENTA`/`DEVOLUCION`.
- `src/lib/inventory/movements.ts` — `MovementInput.tipo` amplía a los 5 valores.
- `src/lib/auth/rbac.ts` — + grupo `ventas` en `PERMISSIONS`.
- `src/lib/auth/role-permissions.ts` — + claves `ventas.*` en Gerente/Cajero.
- `src/lib/audit.ts` — + 3 acciones en `AuditAction` y `LABELS`.
- `src/lib/nav.ts` — + ítems "Punto de venta" y "Ventas".
- `src/lib/sales/compute.ts` — `computeSale`, `prorateReturnLine` (puro).
- `src/lib/sales/folio.ts` — `nextFolio(tx, prefijo)`.
- `src/lib/sales/sales.ts` — `createSale`, `getSale`, `cancelSale`, `listSales` + tipos.
- `src/lib/sales/returns.ts` — `createReturn`, `getReturn`, `listReturns` + tipos.
- `src/lib/validation/sale.ts`, `src/lib/validation/return.ts` — esquemas Zod + tipos.

**App**
- `src/app/(app)/ventas/{page.tsx,actions.ts}`, `quote/route.ts` (+ `route.itest.ts`).
- `src/app/(app)/ventas/historial/{page.tsx}`, `historial/export/route.ts` (+ `route.itest.ts`).
- `src/app/(app)/ventas/[id]/{page.tsx}`, `[id]/ticket/page.tsx`, `[id]/devolucion/page.tsx`.
- `src/app/(app)/ventas/devoluciones/{page.tsx,[id]/page.tsx}`.
- `src/app/(app)/ventas/*.tsx` — `CashierScreen`, `ProductSearchInput`, `CategoryGrid`, `VariantPicker`, `CartTable`, `DiscountPopover`, `CustomerPicker`, `PaymentPanel`, `TotalsPanel`, `SaleRow`, `CancelSaleForm`, `ReturnForm`, `TicketView`, `PrintOnMount`.

**Tests**
- `*.test.ts` junto a cada módulo puro; `*.itest.ts` junto a cada servicio con BD.
- `src/lib/__tests__/seed-bloque4.itest.ts`.
- `e2e/ventas.spec.ts`.

---

## Task 1: Widening de inventario para VENTA / DEVOLUCION

**Files:**
- Modify: `src/lib/inventory/stock-calc.ts`, `src/lib/inventory/movements.ts`
- Modify: `src/lib/inventory/stock-calc.test.ts` (existe), `src/lib/inventory/movements.itest.ts` (existe)

**Interfaces:**
- Consumes: nada nuevo.
- Produces: `computeStock(tipo, stockPrevio, valor)` acepta `'ENTRADA' | 'SALIDA' | 'AJUSTE' | 'VENTA' | 'DEVOLUCION'`. `VENTA` → `{ stockNuevo: stockPrevio - valor, delta: -valor }`; `DEVOLUCION` → `{ stockNuevo: stockPrevio + valor, delta: +valor }`. `MovementInput.tipo` (en `movements.ts`) amplía a los 5 literales; `VENTA`/`DEVOLUCION` validan `valor` entero `> 0`.

- [ ] **Step 1: Añadir casos a `src/lib/inventory/stock-calc.test.ts` (falla)**

```ts
import { computeStock } from './stock-calc';
// ... dentro del describe existente:
it('VENTA baja el stock como SALIDA', () => {
  expect(computeStock('VENTA', 10, 3)).toEqual({ stockNuevo: 7, delta: -3 });
});
it('DEVOLUCION sube el stock como ENTRADA', () => {
  expect(computeStock('DEVOLUCION', 10, 3)).toEqual({ stockNuevo: 13, delta: 3 });
});
```

- [ ] **Step 2: Ejecutar y verificar que falla**

Run: `npm run test:unit -- src/lib/inventory/stock-calc.test.ts`
Expected: FAIL — `computeStock` lanza por `tipo` no soportado / TS error de tipo.

- [ ] **Step 3: Ampliar `computeStock` en `src/lib/inventory/stock-calc.ts`**

Cambiar la firma del parámetro `tipo` a `'ENTRADA' | 'SALIDA' | 'AJUSTE' | 'VENTA' | 'DEVOLUCION'` y añadir dos `case`:

```ts
    case 'VENTA':
      return { stockNuevo: stockPrevio - valor, delta: -valor };
    case 'DEVOLUCION':
      return { stockNuevo: stockPrevio + valor, delta: valor };
```

La guarda `default` con `const _exhaustive: never = tipo` se mantiene (ahora cubre los 5 `MovementType`).

- [ ] **Step 4: Ejecutar y verificar que pasa**

Run: `npm run test:unit -- src/lib/inventory/stock-calc.test.ts`
Expected: PASS.

- [ ] **Step 5: Ampliar `MovementInput.tipo` en `src/lib/inventory/movements.ts`**

```ts
export type MovementInput = {
  variantId: string;
  tipo: 'ENTRADA' | 'SALIDA' | 'AJUSTE' | 'VENTA' | 'DEVOLUCION';
  valor: number;
  // ...resto igual
};
```

En `run(...)`, la validación de `valor` entero `> 0` que hoy cubre `ENTRADA`/`SALIDA` debe cubrir también `VENTA`/`DEVOLUCION`:

```ts
  if (
    (input.tipo === 'ENTRADA' || input.tipo === 'SALIDA' ||
     input.tipo === 'VENTA' || input.tipo === 'DEVOLUCION') &&
    (!Number.isInteger(input.valor) || input.valor <= 0)
  )
    throw new ValidationError({ valor: 'La cantidad debe ser un entero mayor que 0.' });
```

El resto de `run` (bloqueo `FOR UPDATE`, `computeStock`, rechazo `stockNuevo < 0`, `tx.inventoryMovement.create`, `logActivity('inventario.movimiento')`) no cambia. `costoUnitario` sigue persistiéndose solo para `ENTRADA`.

- [ ] **Step 6: Añadir casos a `src/lib/inventory/movements.itest.ts` (fallan, luego pasan)**

```ts
it('VENTA baja el stock y registra el movimiento', async () => {
  const v = await seedVariant(5); // helper existente en el archivo; ajústalo si difiere
  const r = await recordMovement({
    variantId: v.id, tipo: 'VENTA', valor: 2, motivo: 'Venta V-000001', actorId: null,
    referenciaTipo: 'venta', referenciaId: 'sale-x',
  });
  expect(r.stockNuevo).toBe(3);
  const after = await db.productVariant.findUniqueOrThrow({ where: { id: v.id } });
  expect(after.stock).toBe(3);
  const mov = await db.inventoryMovement.findFirstOrThrow({ where: { variantId: v.id, tipo: 'VENTA' } });
  expect(mov.referenciaId).toBe('sale-x');
  expect(mov.cantidad).toBe(-2);
});

it('VENTA con stock insuficiente lanza y no muta', async () => {
  const v = await seedVariant(1);
  await expect(
    recordMovement({ variantId: v.id, tipo: 'VENTA', valor: 5, motivo: 'x', actorId: null }),
  ).rejects.toBeInstanceOf(ValidationError);
  const after = await db.productVariant.findUniqueOrThrow({ where: { id: v.id } });
  expect(after.stock).toBe(1);
});

it('DEVOLUCION sube el stock', async () => {
  const v = await seedVariant(2);
  const r = await recordMovement({ variantId: v.id, tipo: 'DEVOLUCION', valor: 3, motivo: 'Devolución D-000001', actorId: null });
  expect(r.stockNuevo).toBe(5);
});
```

Run: `npm run test:integration -- src/lib/inventory/movements.itest.ts`
Expected: primero FAIL (tipos), luego PASS tras Step 5. Los casos existentes de `ENTRADA`/`SALIDA`/`AJUSTE` deben seguir verdes.

- [ ] **Step 7: Suite completa + commit**

Run: `npm run typecheck && npm run lint && npm run test:unit && npm run test:integration && npm run build`
Expected: 0 errores; todo verde (sin regresiones en inventario del Bloque 2).

```bash
git add src/lib/inventory/stock-calc.ts src/lib/inventory/stock-calc.test.ts src/lib/inventory/movements.ts src/lib/inventory/movements.itest.ts
git commit -m "feat(ventas): recordMovement admite VENTA y DEVOLUCION

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01EnFJHWm8zVoqgkmfwwcRHi"
```

---

## Task 2: RBAC, auditoría y navegación (aditivo)

**Files:**
- Modify: `src/lib/auth/rbac.ts` (grupo `ventas` al final de `PERMISSIONS`)
- Modify: `src/lib/auth/role-permissions.ts` (claves `ventas.*` en Gerente y Cajero)
- Modify: `src/lib/audit.ts` (3 acciones a `AuditAction` y `LABELS`)
- Modify: `src/lib/nav.ts` (2 ítems)
- Create: `src/lib/auth/rbac-ventas.test.ts`, `src/lib/audit-ventas.test.ts`
- Modify: `src/lib/__tests__/seed-bloque3.itest.ts` NO se toca; el espejo de `admin.itest.ts` ya consume `ROLE_PERMISSIONS` (fuente única) — no hay copia que sincronizar.

**Interfaces:**
- Produces: claves `ventas.ver`/`ventas.crear`/`ventas.descuento`/`ventas.cancelar`/`ventas.devolver` (parte de `PermissionKey`/`ALL_PERMISSION_KEYS`, derivados). Acciones de auditoría `ventas.crear`/`ventas.cancelar`/`ventas.devolver` (parte de `AuditAction`/`KNOWN_ACTIONS`). `ROLE_PERMISSIONS.Gerente` +5 claves; `ROLE_PERMISSIONS.Cajero` +`['ventas.crear','ventas.ver','ventas.devolver']`.

- [ ] **Step 1: `src/lib/auth/rbac-ventas.test.ts` (falla)**

```ts
import { describe, it, expect } from 'vitest';
import { PERMISSIONS, ALL_PERMISSION_KEYS } from './rbac';

describe('grupo de permisos ventas', () => {
  it('existe el módulo ventas con 5 claves en orden', () => {
    const g = PERMISSIONS.find((x) => x.modulo === 'ventas');
    expect(g?.permisos.map((p) => p.key)).toEqual([
      'ventas.crear', 'ventas.descuento', 'ventas.cancelar', 'ventas.devolver', 'ventas.ver',
    ]);
  });
  it('las claves están en ALL_PERMISSION_KEYS', () => {
    for (const k of ['ventas.crear', 'ventas.descuento', 'ventas.cancelar', 'ventas.devolver', 'ventas.ver'])
      expect(ALL_PERMISSION_KEYS).toContain(k);
  });
});
```

- [ ] **Step 2: Ejecutar (FAIL), añadir el grupo en `rbac.ts`**

Insertar como último elemento del array `PERMISSIONS` (después de `clientes`, antes de `] as const;`):

```ts
  {
    modulo: 'ventas', label: 'Ventas',
    permisos: [
      { key: 'ventas.crear', label: 'Registrar ventas en el punto de venta' },
      { key: 'ventas.descuento', label: 'Aplicar descuentos (línea y ticket)' },
      { key: 'ventas.cancelar', label: 'Cancelar una venta del mismo día' },
      { key: 'ventas.devolver', label: 'Registrar devoluciones' },
      { key: 'ventas.ver', label: 'Ver historial y detalle de ventas y devoluciones' },
    ],
  },
```

Run: `npm run test:unit -- src/lib/auth/rbac-ventas.test.ts` → PASS.

- [ ] **Step 3: `src/lib/audit-ventas.test.ts` (falla)**

```ts
import { describe, it, expect } from 'vitest';
import { KNOWN_ACTIONS, actionLabel } from './audit';

describe('acciones de auditoría de ventas', () => {
  const acciones = ['ventas.crear', 'ventas.cancelar', 'ventas.devolver'];
  it('están en KNOWN_ACTIONS', () => {
    for (const a of acciones) expect(KNOWN_ACTIONS).toContain(a);
  });
  it('tienen etiqueta en español', () => {
    for (const a of acciones) expect(actionLabel(a)).not.toBe(a);
  });
});
```

- [ ] **Step 4: Ejecutar (FAIL), ampliar `audit.ts`**

En la unión `AuditAction`, añadir antes del `;` final:

```ts
  | 'ventas.crear' | 'ventas.cancelar' | 'ventas.devolver'
```

En `LABELS`, tras las entradas de `clientes.*`:

```ts
  'ventas.crear': 'Registro de venta',
  'ventas.cancelar': 'Cancelación de venta',
  'ventas.devolver': 'Devolución registrada',
```

Run: `npm run test:unit -- src/lib/audit-ventas.test.ts` → PASS.

- [ ] **Step 5: `role-permissions.ts` — añadir claves de ventas**

En `ROLE_PERMISSIONS.Gerente`, tras el bloque `// Bloque 3: Clientes`:

```ts
    // Bloque 4: Ventas
    'ventas.crear', 'ventas.descuento', 'ventas.cancelar', 'ventas.devolver', 'ventas.ver',
```

Cambiar `Cajero`:

```ts
  Cajero: [
    'productos.ver', 'inventario.ver', 'clientes.ver', 'clientes.crear',
    'ventas.crear', 'ventas.ver', 'ventas.devolver',
  ],
```

`Empleado` no cambia.

- [ ] **Step 6: `nav.ts` — 2 ítems**

Insertar entre el ítem `/clientes` y el ítem `/perfil`:

```ts
  { href: '/ventas', label: 'Punto de venta', permiso: 'ventas.crear' },
  { href: '/ventas/historial', label: 'Ventas', permiso: 'ventas.ver' },
```

- [ ] **Step 7: Suite completa + commit**

Run: `npm run typecheck && npm run lint && npm run test:unit && npm run test:integration`
Expected: 0 errores; `src/lib/roles/admin.itest.ts` sigue verde (consume `ROLE_PERMISSIONS`, se actualiza solo). El `seed-bloque3.itest.ts` sigue verde.

```bash
git add src/lib/auth/rbac.ts src/lib/auth/rbac-ventas.test.ts src/lib/auth/role-permissions.ts src/lib/audit.ts src/lib/audit-ventas.test.ts src/lib/nav.ts
git commit -m "feat(ventas): permisos, acciones de auditoría y navegación

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01EnFJHWm8zVoqgkmfwwcRHi"
```

---

## Task 3: Esquema Prisma, migración y seed

**Files:**
- Modify: `prisma/schema.prisma`, `prisma/seed.ts`
- Create: `prisma/migrations/<ts>_bloque4_ventas/migration.sql` (generada)
- Create: `src/lib/__tests__/seed-bloque4.itest.ts`

**Interfaces:**
- Consumes: esquema de Bloques 1–3 (`User`, `Customer`, `ProductVariant`).
- Produces: modelos `Sale`/`SaleLine`/`Payment`/`Return`/`ReturnLine`/`FolioCounter`; enums `SaleStatus { COMPLETADA CANCELADA }`, `PaymentMethod { EFECTIVO TARJETA TRANSFERENCIA }`; relaciones inversas `User.ventas`/`User.ventasCanceladas`/`User.devoluciones`, `Customer.compras`, `ProductVariant.saleLines`/`ProductVariant.returnLines`. Seed: `FolioCounter` con filas `V` y `D` (`valor` inicial 0).

- [ ] **Step 1: Añadir modelos a `prisma/schema.prisma`** (al final; enums junto a `MovementType`)

```prisma
enum SaleStatus {
  COMPLETADA
  CANCELADA
}

enum PaymentMethod {
  EFECTIVO
  TARJETA
  TRANSFERENCIA
}

model Sale {
  id                 String     @id @default(cuid())
  folio              String     @unique
  estado             SaleStatus @default(COMPLETADA)
  customerId         String
  customer           Customer   @relation(fields: [customerId], references: [id])
  subtotal           Decimal    @db.Decimal(12, 2)
  descuentoLineas    Decimal    @db.Decimal(12, 2)
  descuentoTicket    Decimal    @db.Decimal(12, 2)
  impuestos          Decimal    @db.Decimal(12, 2)
  total              Decimal    @db.Decimal(12, 2)
  pagado             Decimal    @db.Decimal(12, 2)
  cambio             Decimal    @db.Decimal(12, 2)
  requiereFactura    Boolean    @default(false)
  datosFiscales      Json?
  canceladaEn        DateTime?
  canceladaPorId     String?
  canceladaPor       User?      @relation("CanceladaPor", fields: [canceladaPorId], references: [id])
  motivoCancelacion  String?
  cajeroId           String
  cajero             User       @relation("Cajero", fields: [cajeroId], references: [id])
  createdAt          DateTime   @default(now())
  lines              SaleLine[]
  payments           Payment[]
  returns            Return[]

  @@index([createdAt])
  @@index([estado, createdAt])
  @@index([customerId])
  @@index([cajeroId])
}

model SaleLine {
  id                          String         @id @default(cuid())
  saleId                      String
  sale                        Sale           @relation(fields: [saleId], references: [id], onDelete: Cascade)
  variantId                   String
  variant                     ProductVariant @relation(fields: [variantId], references: [id], onDelete: Restrict)
  productoNombre              String
  varianteNombre              String?
  sku                         String?
  cantidad                    Int
  precioUnitario              Decimal        @db.Decimal(12, 2)
  tasaImpuesto                Decimal        @db.Decimal(5, 4)
  descuentoMonto              Decimal        @db.Decimal(12, 2)
  descuentoTicketProrrateado  Decimal        @db.Decimal(12, 2)
  baseNeta                    Decimal        @db.Decimal(12, 2)
  impuesto                    Decimal        @db.Decimal(12, 2)
  total                       Decimal        @db.Decimal(12, 2)
  returnLines                 ReturnLine[]

  @@index([saleId])
  @@index([variantId])
}

model Payment {
  id        String        @id @default(cuid())
  saleId    String
  sale      Sale          @relation(fields: [saleId], references: [id], onDelete: Cascade)
  metodo    PaymentMethod
  monto     Decimal       @db.Decimal(12, 2)
  createdAt DateTime      @default(now())

  @@index([saleId])
}

model Return {
  id              String        @id @default(cuid())
  folio           String        @unique
  saleId          String
  sale            Sale          @relation(fields: [saleId], references: [id], onDelete: Restrict)
  subtotal        Decimal       @db.Decimal(12, 2)
  impuestos       Decimal       @db.Decimal(12, 2)
  total           Decimal       @db.Decimal(12, 2)
  metodoReembolso PaymentMethod
  motivo          String
  cajeroId        String
  cajero          User          @relation(fields: [cajeroId], references: [id])
  createdAt       DateTime      @default(now())
  lines           ReturnLine[]

  @@index([saleId])
  @@index([createdAt])
}

model ReturnLine {
  id         String   @id @default(cuid())
  returnId   String
  return     Return   @relation(fields: [returnId], references: [id], onDelete: Cascade)
  saleLineId String
  saleLine   SaleLine @relation(fields: [saleLineId], references: [id], onDelete: Restrict)
  variantId  String
  cantidad   Int
  baseNeta   Decimal  @db.Decimal(12, 2)
  impuesto   Decimal  @db.Decimal(12, 2)
  total      Decimal  @db.Decimal(12, 2)

  @@index([returnId])
  @@index([saleLineId])
}

model FolioCounter {
  serie String @id
  valor Int    @default(0)
}
```

Añadir las relaciones inversas en los modelos existentes (solo campos de relación, sin columnas nuevas):
- `model User { … ventas Sale[] @relation("Cajero")  ventasCanceladas Sale[] @relation("CanceladaPor")  devoluciones Return[] }`
- `model Customer { … compras Sale[] }`
- `model ProductVariant { … saleLines SaleLine[]  returnLines ReturnLine[] }`

- [ ] **Step 2: Levantar la BD de desarrollo (background)**

Run (con `run_in_background`): `npm run db:start` (PG en `localhost:54329`). Espera a que reporte listo; `npm run db:status` si hace falta.

- [ ] **Step 3: Generar la migración**

Run: `npx prisma migrate dev --name bloque4_ventas`
Revisar `prisma/migrations/<ts>_bloque4_ventas/migration.sql`: debe contener solo `CREATE TYPE "SaleStatus"`, `CREATE TYPE "PaymentMethod"`, `CREATE TABLE` de las 6 tablas nuevas, sus índices, y `ALTER TABLE … ADD CONSTRAINT … FOREIGN KEY` de las nuevas FK. **NO** debe alterar/borrar ninguna tabla/columna/enum existente ni tocar `MovementType`. Si lo hace → STOP, reportar BLOCKED. `npx prisma generate` si el migrate no regeneró el cliente.

- [ ] **Step 4: `src/lib/__tests__/seed-bloque4.itest.ts` (falla)**

```ts
import { describe, it, expect } from 'vitest';
import { db } from '@/lib/db';

describe('seed bloque 4', () => {
  it('siembra FolioCounter con V y D', async () => {
    const series = (await db.folioCounter.findMany()).map((c) => c.serie).sort();
    expect(series).toEqual(['D', 'V']);
  });

  it('Gerente tiene las 5 claves de ventas', async () => {
    const rol = await db.role.findUniqueOrThrow({ where: { nombre: 'Gerente' }, include: { permissions: true } });
    const keys = rol.permissions.map((p) => p.permiso);
    for (const k of ['ventas.crear', 'ventas.descuento', 'ventas.cancelar', 'ventas.devolver', 'ventas.ver'])
      expect(keys).toContain(k);
  });

  it('Cajero crea/ve/devuelve pero no descuenta ni cancela; Empleado nada', async () => {
    const cajero = await db.role.findUniqueOrThrow({ where: { nombre: 'Cajero' }, include: { permissions: true } });
    const ck = cajero.permissions.map((p) => p.permiso);
    expect(ck).toContain('ventas.crear');
    expect(ck).toContain('ventas.ver');
    expect(ck).toContain('ventas.devolver');
    expect(ck).not.toContain('ventas.descuento');
    expect(ck).not.toContain('ventas.cancelar');

    const empleado = await db.role.findUniqueOrThrow({ where: { nombre: 'Empleado' }, include: { permissions: true } });
    const ek = empleado.permissions.map((p) => p.permiso);
    expect(ek.some((k) => k.startsWith('ventas.'))).toBe(false);
  });
});
```

Run: `npm run test:integration -- src/lib/__tests__/seed-bloque4.itest.ts` → FAIL (no hay `FolioCounter` sembrado; las claves `ventas.*` ya las puso Task 2 así que esos casos podrían pasar — el que falla es el de `FolioCounter`).

- [ ] **Step 5: Ampliar `prisma/seed.ts`**

Tras el bloque de `taxRates` / cliente genérico (antes del `console.log` final):

```ts
  // --- Bloque 4: contadores de folio ---
  for (const serie of ['V', 'D']) {
    await db.folioCounter.upsert({
      where: { serie },
      update: {},
      create: { serie, valor: 0 },
    });
  }
```

- [ ] **Step 6: Aplicar migración + seed al entorno de test y ejecutar**

Run: `npm run test:integration -- src/lib/__tests__/seed-bloque4.itest.ts` → PASS.

- [ ] **Step 7: Suite completa + commit**

Run: `npm run typecheck && npm run lint && npm run test:unit && npm run test:integration && npm run build`

```bash
git add prisma/schema.prisma prisma/seed.ts prisma/migrations/ src/lib/__tests__/seed-bloque4.itest.ts
git commit -m "feat(ventas): esquema de venta/devolución, migración aditiva y contadores de folio

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01EnFJHWm8zVoqgkmfwwcRHi"
```

---

## Task 4: Cálculo de importes (`src/lib/sales/compute.ts`, puro)

**Files:**
- Create: `src/lib/sales/compute.ts`, `src/lib/sales/compute.test.ts`

**Interfaces:**
- Consumes: `ValidationError` (`@/lib/errors`).
- Produces:
  - `type DescuentoInput = { tipo: 'monto' | 'porcentaje'; valor: number } | null | undefined`
  - `type SaleLineInput = { variantId: string; cantidad: number; precioUnitario: number; tasaImpuesto: number; descuento?: DescuentoInput }`
  - `type SaleComputeInput = { lineas: SaleLineInput[]; descuentoTicket?: DescuentoInput }`
  - `type SaleComputeResultLine = { variantId; cantidad; precioUnitario; tasaImpuesto; baseBruta; descuentoLinea; descuentoTicketProrrateado; baseNeta; impuesto; total }` (todos `number`)
  - `type SaleComputeResult = { lineas: SaleComputeResultLine[]; subtotal; descuentoLineas; descuentoTicket; impuestos; total }` (todos `number`)
  - `computeSale(input: SaleComputeInput): SaleComputeResult`
  - `prorateReturnLine(saleLine: { cantidad: number; baseNeta: number; impuesto: number; total: number }, cantidadDevuelta: number): { baseNeta: number; impuesto: number; total: number }`

- [ ] **Step 1: `src/lib/sales/compute.test.ts` (falla)**

```ts
import { describe, it, expect } from 'vitest';
import { computeSale, prorateReturnLine } from './compute';

const linea = (over = {}) => ({
  variantId: 'v1', cantidad: 1, precioUnitario: 100, tasaImpuesto: 0.16, ...over,
});

describe('computeSale', () => {
  it('1 línea sin descuento: base·1, IVA 16 %', () => {
    const r = computeSale({ lineas: [linea({ cantidad: 2 })] });
    expect(r.subtotal).toBe(200);
    expect(r.impuestos).toBe(32);
    expect(r.total).toBe(232);
    expect(r.lineas[0].baseNeta).toBe(200);
    expect(r.lineas[0].impuesto).toBe(32);
  });

  it('tasas mixtas 16 % y 0 %', () => {
    const r = computeSale({ lineas: [linea(), linea({ variantId: 'v2', tasaImpuesto: 0 })] });
    expect(r.subtotal).toBe(200);
    expect(r.impuestos).toBe(16);
    expect(r.total).toBe(216);
  });

  it('descuento de línea monto reduce la base; IVA sobre base neta', () => {
    const r = computeSale({ lineas: [linea({ precioUnitario: 100, cantidad: 1, descuento: { tipo: 'monto', valor: 20 } })] });
    expect(r.lineas[0].descuentoLinea).toBe(20);
    expect(r.lineas[0].baseNeta).toBe(80);
    expect(r.lineas[0].impuesto).toBe(12.8);
    expect(r.total).toBe(92.8);
  });

  it('descuento de línea %', () => {
    const r = computeSale({ lineas: [linea({ descuento: { tipo: 'porcentaje', valor: 10 } })] });
    expect(r.lineas[0].baseNeta).toBe(90);
    expect(r.lineas[0].impuesto).toBe(14.4);
  });

  it('descuento de ticket % se prorratea y el residuo de centavos cuadra exacto', () => {
    // 3 líneas de bases 33.33 / 33.33 / 33.34 → total 100; 10 % ticket = 10.00
    const r = computeSale({
      lineas: [
        linea({ variantId: 'a', precioUnitario: 33.33, cantidad: 1, tasaImpuesto: 0 }),
        linea({ variantId: 'b', precioUnitario: 33.33, cantidad: 1, tasaImpuesto: 0 }),
        linea({ variantId: 'c', precioUnitario: 33.34, cantidad: 1, tasaImpuesto: 0 }),
      ],
      descuentoTicket: { tipo: 'porcentaje', valor: 10 },
    });
    const sumaProrrateo = r.lineas.reduce((s, l) => s + l.descuentoTicketProrrateado, 0);
    expect(Math.round(sumaProrrateo * 100) / 100).toBe(r.descuentoTicket);
    expect(r.descuentoTicket).toBe(10);
    expect(r.subtotal).toBe(90);
  });

  it('descuento de línea + ticket combinados', () => {
    const r = computeSale({
      lineas: [linea({ precioUnitario: 100, cantidad: 1, tasaImpuesto: 0, descuento: { tipo: 'monto', valor: 10 } })],
      descuentoTicket: { tipo: 'porcentaje', valor: 50 },
    });
    // base tras línea = 90; ticket 50 % = 45; base neta = 45
    expect(r.lineas[0].baseNeta).toBe(45);
    expect(r.total).toBe(45);
  });

  it('descuento del 100 % deja base 0 e IVA 0', () => {
    const r = computeSale({ lineas: [linea({ descuento: { tipo: 'porcentaje', valor: 100 } })] });
    // total 0 → error
    // (ver siguiente test) — aquí comprobamos que no lanza por el acotado del 100%
  });

  it('total resultante 0 → ValidationError _form', () => {
    expect(() => computeSale({ lineas: [linea({ descuento: { tipo: 'porcentaje', valor: 100 } })] }))
      .toThrowError(/mayor que 0/);
  });

  it('descuento que excede la base se acota (no lanza)', () => {
    const r = computeSale({ lineas: [
      linea({ precioUnitario: 100, cantidad: 1, tasaImpuesto: 0, descuento: { tipo: 'monto', valor: 500 } }),
      linea({ variantId: 'v2', precioUnitario: 100, cantidad: 1, tasaImpuesto: 0 }),
    ]});
    expect(r.lineas[0].baseNeta).toBe(0);
    expect(r.total).toBe(100);
  });

  it('cantidad 0 / negativa / decimal → error de campo', () => {
    expect(() => computeSale({ lineas: [linea({ cantidad: 0 })] })).toThrow();
    expect(() => computeSale({ lineas: [linea({ cantidad: -1 })] })).toThrow();
    expect(() => computeSale({ lineas: [linea({ cantidad: 1.5 })] })).toThrow();
  });

  it('lista vacía → error', () => {
    expect(() => computeSale({ lineas: [] })).toThrow();
  });

  it('precioUnitario negativo → error', () => {
    expect(() => computeSale({ lineas: [linea({ precioUnitario: -1 })] })).toThrow();
  });

  it('invariante: Σ baseNeta + Σ impuesto == total, para entradas variadas', () => {
    for (let i = 0; i < 50; i++) {
      const n = 1 + (i % 4);
      const lineas = Array.from({ length: n }, (_, k) => linea({
        variantId: `v${k}`,
        cantidad: 1 + ((i + k) % 5),
        precioUnitario: 1 + ((i * 7 + k * 13) % 999) + ((k % 2) ? 0.99 : 0.5),
        tasaImpuesto: (k % 2) ? 0.16 : 0,
      }));
      const r = computeSale({ lineas, descuentoTicket: i % 3 ? { tipo: 'porcentaje', valor: (i % 30) + 1 } : null });
      expect(Math.round((r.subtotal + r.impuestos) * 100) / 100).toBe(r.total);
      const sp = Math.round(r.lineas.reduce((s, l) => s + l.descuentoTicketProrrateado, 0) * 100) / 100;
      expect(sp).toBe(r.descuentoTicket);
    }
  });
});

describe('prorateReturnLine', () => {
  const sl = { cantidad: 3, baseNeta: 90, impuesto: 14.4, total: 104.4 };
  it('devolución total de la línea = importes exactos', () => {
    expect(prorateReturnLine(sl, 3)).toEqual({ baseNeta: 90, impuesto: 14.4, total: 104.4 });
  });
  it('devolución parcial 2 de 3', () => {
    const r = prorateReturnLine(sl, 2);
    expect(r.baseNeta).toBe(60);
    expect(r.impuesto).toBe(9.6);
    expect(r.total).toBe(69.6);
  });
  it('cantidad > vendida → error', () => {
    expect(() => prorateReturnLine(sl, 4)).toThrow();
  });
  it('cantidad 0 o decimal → error', () => {
    expect(() => prorateReturnLine(sl, 0)).toThrow();
    expect(() => prorateReturnLine(sl, 1.5)).toThrow();
  });
});
```

- [ ] **Step 2: Ejecutar y verificar que falla**

Run: `npm run test:unit -- src/lib/sales/compute.test.ts` → FAIL (módulo inexistente).

- [ ] **Step 3: Escribir `src/lib/sales/compute.ts`**

```ts
import { ValidationError } from '@/lib/errors';

export type DescuentoInput = { tipo: 'monto' | 'porcentaje'; valor: number } | null | undefined;

export type SaleLineInput = {
  variantId: string;
  cantidad: number;
  precioUnitario: number;
  tasaImpuesto: number;
  descuento?: DescuentoInput;
};
export type SaleComputeInput = { lineas: SaleLineInput[]; descuentoTicket?: DescuentoInput };

export type SaleComputeResultLine = {
  variantId: string;
  cantidad: number;
  precioUnitario: number;
  tasaImpuesto: number;
  baseBruta: number;
  descuentoLinea: number;
  descuentoTicketProrrateado: number;
  baseNeta: number;
  impuesto: number;
  total: number;
};
export type SaleComputeResult = {
  lineas: SaleComputeResultLine[];
  subtotal: number;
  descuentoLineas: number;
  descuentoTicket: number;
  impuestos: number;
  total: number;
};

// Centavos enteros para evitar deriva de coma flotante.
const toCents = (x: number) => Math.round(x * 100);
const fromCents = (c: number) => c / 100;
const round2 = (x: number) => fromCents(Math.round(x * 100 + (x >= 0 ? 1e-6 : -1e-6)));

function descuentoEnCentavos(d: DescuentoInput, baseCents: number, path: string): number {
  if (d == null) return 0;
  if (!(d.valor > 0)) throw new ValidationError({ [path]: 'El descuento debe ser mayor que 0.' });
  const raw = d.tipo === 'porcentaje'
    ? Math.round((baseCents * d.valor) / 100)
    : toCents(d.valor);
  return Math.max(0, Math.min(raw, baseCents)); // acotado a [0, base]
}

export function computeSale(input: SaleComputeInput): SaleComputeResult {
  const { lineas, descuentoTicket } = input;
  if (!lineas.length) throw new ValidationError({ lineas: 'Agrega al menos un producto.' });

  // 1-2: base bruta y descuento de línea
  const brutaCents: number[] = [];
  const descLineaCents: number[] = [];
  const baseTrasLineaCents: number[] = [];
  lineas.forEach((l, i) => {
    if (!Number.isInteger(l.cantidad) || l.cantidad <= 0)
      throw new ValidationError({ [`lineas.${i}.cantidad`]: 'La cantidad debe ser un entero mayor que 0.' });
    if (!(l.precioUnitario >= 0))
      throw new ValidationError({ [`lineas.${i}.precioUnitario`]: 'Precio no válido.' });
    if (!(l.tasaImpuesto >= 0))
      throw new ValidationError({ [`lineas.${i}.tasaImpuesto`]: 'Tasa no válida.' });
    const bruta = Math.round(toCents(l.precioUnitario) * l.cantidad);
    const dl = descuentoEnCentavos(l.descuento, bruta, `lineas.${i}.descuento.valor`);
    brutaCents.push(bruta);
    descLineaCents.push(dl);
    baseTrasLineaCents.push(bruta - dl);
  });

  // 3: descuento de ticket prorrateado
  const sumBaseTras = baseTrasLineaCents.reduce((s, c) => s + c, 0);
  const descTicketTotalCents = descuentoEnCentavos(descuentoTicket, sumBaseTras, 'descuentoTicket.valor');
  const prorrateoCents = new Array<number>(lineas.length).fill(0);
  if (descTicketTotalCents > 0 && sumBaseTras > 0) {
    let asignado = 0;
    for (let i = 0; i < lineas.length; i++) {
      prorrateoCents[i] = Math.round((descTicketTotalCents * baseTrasLineaCents[i]) / sumBaseTras);
      asignado += prorrateoCents[i];
    }
    // residuo: repartir de a 1 centavo a las líneas de mayor baseTrasLinea (orden estable)
    let residuo = descTicketTotalCents - asignado;
    const orden = baseTrasLineaCents
      .map((c, i) => ({ c, i }))
      .sort((a, b) => (b.c - a.c) || (a.i - b.i))
      .map((x) => x.i);
    let k = 0;
    while (residuo !== 0) {
      const idx = orden[k % orden.length];
      const paso = residuo > 0 ? 1 : -1;
      prorrateoCents[idx] += paso;
      residuo -= paso;
      k++;
    }
  }

  // 4-6: base neta, IVA, total por línea
  const resultLines: SaleComputeResultLine[] = lineas.map((l, i) => {
    const baseNetaCents = baseTrasLineaCents[i] - prorrateoCents[i];
    const impuestoCents = Math.round((baseNetaCents * l.tasaImpuesto));
    return {
      variantId: l.variantId,
      cantidad: l.cantidad,
      precioUnitario: l.precioUnitario,
      tasaImpuesto: l.tasaImpuesto,
      baseBruta: fromCents(brutaCents[i]),
      descuentoLinea: fromCents(descLineaCents[i]),
      descuentoTicketProrrateado: fromCents(prorrateoCents[i]),
      baseNeta: fromCents(baseNetaCents),
      impuesto: fromCents(impuestoCents),
      total: fromCents(baseNetaCents + impuestoCents),
    };
  });

  const subtotalCents = resultLines.reduce((s, l) => s + toCents(l.baseNeta), 0);
  const impuestosCents = resultLines.reduce((s, l) => s + toCents(l.impuesto), 0);
  const totalCents = subtotalCents + impuestosCents;
  if (totalCents <= 0)
    throw new ValidationError({ _form: 'El total de la venta debe ser mayor que 0.' });

  return {
    lineas: resultLines,
    subtotal: fromCents(subtotalCents),
    descuentoLineas: fromCents(descLineaCents.reduce((s, c) => s + c, 0)),
    descuentoTicket: fromCents(descTicketTotalCents),
    impuestos: fromCents(impuestosCents),
    total: fromCents(totalCents),
  };
}

export function prorateReturnLine(
  saleLine: { cantidad: number; baseNeta: number; impuesto: number; total: number },
  cantidadDevuelta: number,
): { baseNeta: number; impuesto: number; total: number } {
  if (!Number.isInteger(cantidadDevuelta) || cantidadDevuelta <= 0)
    throw new ValidationError({ cantidad: 'La cantidad debe ser un entero mayor que 0.' });
  if (cantidadDevuelta > saleLine.cantidad)
    throw new ValidationError({ cantidad: `Máximo devolvible: ${saleLine.cantidad}.` });
  if (cantidadDevuelta === saleLine.cantidad)
    return { baseNeta: saleLine.baseNeta, impuesto: saleLine.impuesto, total: saleLine.total };
  const frac = cantidadDevuelta / saleLine.cantidad;
  const baseNeta = round2(saleLine.baseNeta * frac);
  const impuesto = round2(saleLine.impuesto * frac);
  return { baseNeta, impuesto, total: round2(baseNeta + impuesto) };
}
```

> Nota: `round2` con corrección de épsilon evita `Math.round(0.145*100) === 14` en algunos casos. Si el implementer prefiere `Number(x.toFixed(2))` documentado como excepción, debe justificar por qué no deriva; el idioma del repo (`precioConImpuesto` usa `Math.round(x*100)/100`) es la referencia.

- [ ] **Step 4: Ejecutar y verificar que pasa**

Run: `npm run test:unit -- src/lib/sales/compute.test.ts` → PASS.

- [ ] **Step 5: typecheck + lint + commit**

```bash
git add src/lib/sales/compute.ts src/lib/sales/compute.test.ts
git commit -m "feat(ventas): cálculo puro de importes (IVA por línea, prorrateo de descuento de ticket)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01EnFJHWm8zVoqgkmfwwcRHi"
```

---

## Task 5: Numeración de folios (`src/lib/sales/folio.ts`)

**Files:**
- Create: `src/lib/sales/folio.ts`, `src/lib/sales/folio.itest.ts`

**Interfaces:**
- Consumes: `db` (`@/lib/db`), `Prisma.TransactionClient`.
- Produces: `nextFolio(tx: Prisma.TransactionClient, prefijo: 'V' | 'D'): Promise<string>` — incrementa `FolioCounter[prefijo]` de forma atómica dentro de `tx` y devuelve `${prefijo}-${String(valor).padStart(6, '0')}`.

- [ ] **Step 1: `src/lib/sales/folio.itest.ts` (falla)**

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '@/lib/db';
import { nextFolio } from './folio';

// Este itest fija el estado de FolioCounter para poder aseverar el número exacto.
beforeEach(async () => {
  await db.folioCounter.update({ where: { serie: 'V' }, data: { valor: 0 } });
});

describe('nextFolio', () => {
  it('incrementa y formatea a 6 dígitos', async () => {
    const a = await db.$transaction((tx) => nextFolio(tx, 'V'));
    const b = await db.$transaction((tx) => nextFolio(tx, 'V'));
    expect(a).toBe('V-000001');
    expect(b).toBe('V-000002');
  });

  it('un rollback de la transacción revierte el incremento (sin huecos)', async () => {
    await db.$transaction((tx) => nextFolio(tx, 'V')); // V-000001
    await expect(
      db.$transaction(async (tx) => {
        await nextFolio(tx, 'V'); // consumiría V-000002
        throw new Error('abort');
      }),
    ).rejects.toThrow('abort');
    const next = await db.$transaction((tx) => nextFolio(tx, 'V'));
    expect(next).toBe('V-000002'); // no se saltó a 000003
  });
});
```

- [ ] **Step 2: Ejecutar (FAIL), escribir `src/lib/sales/folio.ts`**

```ts
import type { Prisma } from '@prisma/client';

export async function nextFolio(
  tx: Prisma.TransactionClient,
  prefijo: 'V' | 'D',
): Promise<string> {
  const rows = await tx.$queryRaw<{ valor: number }[]>`
    UPDATE "FolioCounter" SET valor = valor + 1 WHERE serie = ${prefijo} RETURNING valor`;
  const valor = rows[0]?.valor;
  if (valor == null) throw new Error(`FolioCounter '${prefijo}' no existe`);
  return `${prefijo}-${String(valor).padStart(6, '0')}`;
}
```

- [ ] **Step 3: Ejecutar y verificar que pasa**

Run: `npm run test:integration -- src/lib/sales/folio.itest.ts` → PASS.

- [ ] **Step 4: typecheck + lint + commit**

```bash
git add src/lib/sales/folio.ts src/lib/sales/folio.itest.ts
git commit -m "feat(ventas): nextFolio — folios correlativos sin huecos por rollback

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01EnFJHWm8zVoqgkmfwwcRHi"
```

---

## Task 6: Servicio de ventas — `createSale` y `getSale`

**Files:**
- Create: `src/lib/sales/sales.ts`, `src/lib/sales/sales.itest.ts`

**Interfaces:**
- Consumes: `db`, `logActivity` (`@/lib/audit`), `ValidationError` (`@/lib/errors`), `recordMovement` (`@/lib/inventory/movements`), `invalidateStockAlertsCache` (`@/lib/inventory/stock`), `computeSale` + tipos (`@/lib/sales/compute`), `nextFolio` (`@/lib/sales/folio`), `bloqueFiscalCompleto` (`@/lib/customers/fiscal`), `CreateSaleInput` (`@/lib/validation/sale` — Task 9; para Task 6 define el tipo localmente e impórtalo desde `sale.ts` cuando exista, o acepta un tipo estructural equivalente y ajústalo en Task 9).
- Produces:
  - `type SaleLineDetail` (snapshot + importes como `number`)
  - `type SaleDetail` (campos de `Sale` como `number` + `clienteNombre` + `cajeroNombre` + `canceladaPorNombre?` + `lines: SaleLineDetail[]` + `payments: { metodo; monto }[]` + `returns: { id; folio; total; createdAt }[]` + `devuelto: Record<string, number>`)
  - `createSale(actorId: string, input: CreateSaleInput, ip: string | null): Promise<{ id: string; folio: string }>`
  - `getSale(id: string): Promise<SaleDetail | null>`

> **Nota de secuencia:** `CreateSaleInput` lo define Task 9 (`src/lib/validation/sale.ts`). Para no bloquear, Task 6 declara en `sales.ts` un `type CreateSaleInput` estructural idéntico al inferido de `createSaleSchema` (customerId `string | null`, `lineas: {variantId; cantidad; descuento?}[]`, `descuentoTicket?`, `pagos: {metodo; monto}[]`, `requiereFactura: boolean`) y Task 9 lo reemplaza por `import type { CreateSaleInput } from '@/lib/validation/sale'` (mismo shape → sin cambios de firma).

- [ ] **Step 1: `src/lib/sales/sales.itest.ts` — cobertura de create + get (falla)**

Helper de siembra (usa lo del Bloque 2/3): crea un `Product` `SIMPLE` con `taxRate` default (16 %) y una variante con `precioVenta` y `stock` dados; una segunda con `taxRate` "Exento" (0 %). Siembra un usuario `Cajero`. `ACTOR` = id de ese usuario (FK real, como en `customers.itest.ts`). Limpieza en orden FK-seguro (ver Global Constraints); nunca borra el genérico ni roles/taxRate.

```ts
// Casos:
it('venta simple 1 línea: Sale COMPLETADA, stock baja, movimiento VENTA, auditoría, folio V-...');
//   - crea variante stock 5; createSale 2 uds pago efectivo 232 (precio 100, IVA 16%)
//   - Sale.total == 232, subtotal 200, impuestos 32; pagado 232; cambio 0
//   - variant.stock == 3; InventoryMovement tipo VENTA, referenciaTipo 'venta', referenciaId == sale.id, cantidad -2
//   - activityLog tiene 'ventas.crear' con metadata.folio y metadata.total
//   - folio casa /^V-\d{6}$/
it('multi-línea tasas mixtas + descuento de línea + descuento de ticket: importes == computeSale');
//   - compara Sale/SaleLine contra computeSale(<mismos inputs con precios/tasas de BD>)
it('sobrepago en efectivo calcula cambio');
//   - pago efectivo 300 sobre total 232 → cambio 68
it('cambio > 0 sin pago EFECTIVO suficiente → ValidationError _form');
//   - total 232, pago único TARJETA 300 → error 'El cambio solo se entrega en efectivo.'
it('pago insuficiente → ValidationError _form, nada creado, FolioCounter no avanzó');
//   - fija FolioCounter V a un valor conocido, intenta venta con pago < total, verifica sin Sale y valor intacto
it('stock insuficiente en 1 de 3 líneas → rollback total, sin Sale ni movimientos');
it('variante archivada / producto archivado / disponible:false → ValidationError por línea');
it('requiereFactura con cliente facturable → datosFiscales snapshot presente y sin RFC en auditoría');
//   - crea cliente con bloque fiscal completo (createCustomer del Bloque 3); Sale.datosFiscales.rfc == su RFC
//   - ninguna fila de activityLog de esta venta contiene el RFC completo en metadata
it('requiereFactura con cliente genérico o sin bloque fiscal → ValidationError _form');
it('customerId omitido usa el cliente Público en General');
it('getSale devuelve null si no existe; devuelve desglose y devuelto:{} para una venta sin devoluciones');
```

- [ ] **Step 2: Ejecutar y verificar que falla** — `npm run test:integration -- src/lib/sales/sales.itest.ts` → FAIL (módulo inexistente).

- [ ] **Step 3: Escribir `src/lib/sales/sales.ts` (solo `createSale` + `getSale` + tipos)**

Esqueleto (rellenar; seguir el idioma transaccional de `src/lib/catalog/products.ts` y `src/lib/customers/customers.ts`):

```ts
import { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { logActivity } from '@/lib/audit';
import { ValidationError } from '@/lib/errors';
import { recordMovement } from '@/lib/inventory/movements';
import { invalidateStockAlertsCache } from '@/lib/inventory/stock';
import { computeSale, type SaleComputeInput } from '@/lib/sales/compute';
import { nextFolio } from '@/lib/sales/folio';
import { bloqueFiscalCompleto } from '@/lib/customers/fiscal';

export type CreateSaleInput = {
  customerId: string | null;
  lineas: { variantId: string; cantidad: number; descuento?: { tipo: 'monto' | 'porcentaje'; valor: number } | null }[];
  descuentoTicket?: { tipo: 'monto' | 'porcentaje'; valor: number } | null;
  pagos: { metodo: 'EFECTIVO' | 'TARJETA' | 'TRANSFERENCIA'; monto: number }[];
  requiereFactura: boolean;
};

// ...SaleLineDetail, SaleDetail...

const round2 = (x: number) => Math.round(x * 100) / 100;

export async function createSale(actorId: string, input: CreateSaleInput, ip: string | null): Promise<{ id: string; folio: string }> {
  const result = await db.$transaction(async (tx) => {
    const genericId = input.customerId
      ?? (await tx.customer.findFirstOrThrow({ where: { esGenerico: true } })).id;

    const ids = input.lineas.map((l) => l.variantId);
    const variants = await tx.productVariant.findMany({
      where: { id: { in: ids } },
      include: { product: { include: { taxRate: true } } },
    });
    const byId = new Map(variants.map((v) => [v.id, v]));
    const computeLines = input.lineas.map((l, i) => {
      const v = byId.get(l.variantId);
      if (!v) throw new ValidationError({ [`lineas.${i}.variantId`]: 'El producto ya no está disponible.' });
      if (v.archivada || v.product.archivado || v.disponible === false)
        throw new ValidationError({ [`lineas.${i}.variantId`]: 'El producto ya no está disponible.' });
      return {
        variantId: v.id,
        cantidad: l.cantidad,
        precioUnitario: Number(v.precioVenta),
        tasaImpuesto: Number(v.product.taxRate.tasa),
        descuento: l.descuento ?? null,
      };
    });

    const computed = computeSale({ lineas: computeLines, descuentoTicket: input.descuentoTicket ?? null } satisfies SaleComputeInput);

    const pagado = round2(input.pagos.reduce((s, p) => s + p.monto, 0));
    if (pagado < computed.total) throw new ValidationError({ _form: 'El pago no cubre el total.' });
    const cambio = round2(pagado - computed.total);
    if (cambio > 0) {
      const efectivoOk = input.pagos.some((p) => p.metodo === 'EFECTIVO' && p.monto >= cambio);
      if (!efectivoOk) throw new ValidationError({ _form: 'El cambio solo se entrega en efectivo.' });
    }

    let datosFiscales: Prisma.InputJsonValue | undefined;
    if (input.requiereFactura) {
      const c = await tx.customer.findUniqueOrThrow({ where: { id: genericId } });
      if (c.esGenerico || !bloqueFiscalCompleto(c))
        throw new ValidationError({ _form: 'El cliente no tiene datos de facturación completos.' });
      datosFiscales = { rfc: c.rfc, razonSocial: c.razonSocial, regimenFiscalCode: c.regimenFiscalCode, usoCfdiCode: c.usoCfdiCode, cpFiscal: c.cpFiscal } as Prisma.InputJsonValue;
    }

    const folio = await nextFolio(tx, 'V');

    const variantMap = byId;
    const sale = await tx.sale.create({
      data: {
        folio, estado: 'COMPLETADA', customerId: genericId, cajeroId: actorId,
        subtotal: computed.subtotal, descuentoLineas: computed.descuentoLineas,
        descuentoTicket: computed.descuentoTicket, impuestos: computed.impuestos,
        total: computed.total, pagado, cambio, requiereFactura: input.requiereFactura,
        datosFiscales,
        lines: {
          create: computed.lineas.map((cl) => {
            const v = variantMap.get(cl.variantId)!;
            return {
              variantId: cl.variantId,
              productoNombre: v.product.nombre,
              varianteNombre: v.nombre ?? null,
              sku: v.sku ?? null,
              cantidad: cl.cantidad,
              precioUnitario: cl.precioUnitario,
              tasaImpuesto: cl.tasaImpuesto,
              descuentoMonto: cl.descuentoLinea,
              descuentoTicketProrrateado: cl.descuentoTicketProrrateado,
              baseNeta: cl.baseNeta,
              impuesto: cl.impuesto,
              total: cl.total,
            };
          }),
        },
        payments: { create: input.pagos.map((p) => ({ metodo: p.metodo, monto: p.monto })) },
      },
    });

    for (const cl of computed.lineas) {
      await recordMovement(
        { variantId: cl.variantId, tipo: 'VENTA', valor: cl.cantidad, motivo: `Venta ${folio}`, actorId, referenciaTipo: 'venta', referenciaId: sale.id },
        tx,
      );
    }

    await logActivity(
      { actorId, accion: 'ventas.crear', entidad: 'Sale', entidadId: sale.id, metadata: { folio, total: computed.total, nLineas: computed.lineas.length, customerId: genericId, metodos: [...new Set(input.pagos.map((p) => p.metodo))] }, ip },
      tx,
    );

    return { id: sale.id, folio };
  });
  invalidateStockAlertsCache();
  return result;
}
```

`getSale(id)` — `db.sale.findUnique({ where: { id }, include: { customer: true, cajero: true, canceladaPor: true, lines: true, payments: true, returns: { include: { lines: true } } } })`; mapea importes con `Number(...)`; `devuelto` = por cada `SaleLine`, suma de `ReturnLine.cantidad` de esa `saleLineId` en `sale.returns`.

- [ ] **Step 4: Ejecutar y verificar que pasa** — `npm run test:integration -- src/lib/sales/sales.itest.ts` → PASS.

- [ ] **Step 5: Suite completa + commit**

```bash
git add src/lib/sales/sales.ts src/lib/sales/sales.itest.ts
git commit -m "feat(ventas): createSale y getSale — venta atómica con inventario y auditoría

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01EnFJHWm8zVoqgkmfwwcRHi"
```

---

## Task 7: Servicio de ventas — `cancelSale` y `listSales`

**Files:**
- Modify: `src/lib/sales/sales.ts` (añadir `cancelSale`, `listSales` + tipos `SaleRow`/`ListSalesFilter`)
- Modify: `src/lib/sales/sales.itest.ts` (añadir describe blocks)

**Interfaces:**
- Consumes: lo de Task 6.
- Produces:
  - `cancelSale(actorId: string, saleId: string, motivo: string, ip: string | null): Promise<void>`
  - `type SaleRow = { id; folio; fecha: Date; cliente: string; cajero: string; nLineas: number; total: number; estado: 'COMPLETADA' | 'CANCELADA' }`
  - `type ListSalesFilter = { q?: string; estado?: 'COMPLETADA' | 'CANCELADA' | 'todas'; cajeroId?: string; customerId?: string; desde?: Date; hasta?: Date; page: number; pageSize: number }`
  - `listSales(filtro: ListSalesFilter): Promise<{ rows: SaleRow[]; total: number }>`

- [ ] **Step 1: Añadir tests a `sales.itest.ts` (fallan)**

```ts
describe('cancelSale', () => {
  it('mismo día: CANCELADA, stock reintegrado (movimientos DEVOLUCION), auditoría ventas.cancelar');
  it('venta con createdAt de ayer (forzado con db.sale.update) → ValidationError');
  it('venta con una devolución previa → ValidationError');
  it('estado != COMPLETADA → ValidationError');
  it('motivo vacío → ValidationError({ motivo })');
});
describe('listSales', () => {
  it('filtro estado (COMPLETADA / CANCELADA / todas)');
  it('filtro cajeroId');
  it('filtro rango de fechas desde/hasta');
  it('q por folio (prefijo) y por nombre de cliente');
  it('orden createdAt desc; total = count(where)');
});
```

- [ ] **Step 2: Ejecutar (FAIL), implementar en `sales.ts`**

`cancelSale`: `db.$transaction` — carga `sale` con `lines` + `returns`; valida (`estado`, mismo día en `America/Mexico_City` comparando `toLocaleDateString('en-CA', { timeZone: 'America/Mexico_City' })` de `sale.createdAt` vs `new Date()`, `returns.length === 0`, `motivo.trim()`); por línea `recordMovement({ tipo: 'DEVOLUCION', valor: cantidad, motivo: 'Cancelación ' + folio, referenciaTipo: 'venta', referenciaId: saleId }, tx)`; `tx.sale.update({ estado: 'CANCELADA', canceladaEn: new Date(), canceladaPorId: actorId, motivoCancelacion })`; `logActivity('ventas.cancelar', { folio, total, motivo }, tx)`. Tras el `$transaction`: `invalidateStockAlertsCache()`.

`listSales`: `where` con `estado` (salvo `'todas'`), `cajeroId`, `customerId`, `createdAt: { gte: desde, lte: hasta }` (solo las claves presentes), `q` → `OR: [{ folio: { contains: term, mode: 'insensitive' } }, { customer: { nombre: { contains: term, mode: 'insensitive' } } }]`. `Promise.all([db.sale.count({ where }), db.sale.findMany({ where, include: { customer: { select: { nombre: true } }, cajero: { select: { nombre: true } }, _count: { select: { lines: true } } }, orderBy: { createdAt: 'desc' }, skip, take })])`. Map a `SaleRow`.

- [ ] **Step 3: Ejecutar y verificar que pasa** — `npm run test:integration -- src/lib/sales/sales.itest.ts` → PASS.

- [ ] **Step 4: Suite completa + commit**

```bash
git add src/lib/sales/sales.ts src/lib/sales/sales.itest.ts
git commit -m "feat(ventas): cancelSale (mismo día) y listSales con filtros

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01EnFJHWm8zVoqgkmfwwcRHi"
```

---

## Task 8: Servicio de devoluciones (`src/lib/sales/returns.ts`)

**Files:**
- Create: `src/lib/sales/returns.ts`, `src/lib/sales/returns.itest.ts`

**Interfaces:**
- Consumes: `db`, `logActivity`, `ValidationError`, `recordMovement`, `invalidateStockAlertsCache`, `prorateReturnLine` (`@/lib/sales/compute`), `nextFolio`, `CreateReturnInput` (`@/lib/validation/return` — Task 9; misma nota de secuencia que Task 6: declara el tipo localmente y Task 9 lo reemplaza por el import).
- Produces:
  - `createReturn(actorId: string, input: CreateReturnInput, ip: string | null): Promise<{ id: string; folio: string }>`
  - `getReturn(id: string): Promise<ReturnDetail | null>` — devolución + líneas (con `productoNombre` vía `SaleLine`) + `{ ventaId; ventaFolio }`
  - `listReturns(filtro: { saleId?: string; desde?: Date; hasta?: Date; page: number; pageSize: number }): Promise<{ rows: ReturnRow[]; total: number }>` — `ReturnRow = { id; folio; fecha: Date; ventaFolio: string; total: number; cajero: string }`

- [ ] **Step 1: `src/lib/sales/returns.itest.ts` (falla)**

Reusa el helper de siembra de `sales.itest.ts` (extráelo a un `src/lib/sales/__testutil.ts` si conviene, o duplica — decisión del implementer; no romper `sales.itest.ts`). Casos:

```ts
it('devolución parcial 2 de 3: Return + líneas, stock sube 2, importes prorrateados, auditoría ventas.devolver');
it('devolución total 3 de 3: importes == SaleLine originales');
it('exceder lo devolvible → ValidationError({ lineas.0.cantidad }) con "Máximo devolvible: N."');
it('segunda devolución que agota el resto → OK; una tercera → ValidationError');
it('sobre venta CANCELADA → ValidationError _form');
it('sobre venta inexistente → ValidationError _form');
it('saleLineId que no pertenece a la venta → ValidationError por línea');
it('getReturn devuelve líneas con productoNombre y la venta origen; null si no existe');
it('listReturns filtra por saleId y rango de fechas; orden createdAt desc');
```

- [ ] **Step 2: Ejecutar (FAIL), escribir `src/lib/sales/returns.ts`**

`createReturn`: `db.$transaction` — carga `sale` con `lines` + `returns.include(lines)`; valida estado; por cada `{ saleLineId, cantidad }` localiza la `SaleLine` (pertenece a la venta), calcula `yaDevuelto`, valida `cantidad <= disponible`; `prorateReturnLine`; `nextFolio(tx, 'D')`; `tx.return.create({ data: { folio, saleId, cajeroId: actorId, subtotal, impuestos, total, metodoReembolso, motivo, lines: { create: [...] } } })`; por línea `recordMovement({ tipo: 'DEVOLUCION', valor: cantidad, motivo: 'Devolución ' + folioD + ' de ' + folioV, referenciaTipo: 'devolucion', referenciaId: return.id }, tx)`; `logActivity('ventas.devolver', { folioD, folioV, total, metodoReembolso, nLineas }, tx)`. Tras el `$transaction`: `invalidateStockAlertsCache()`.

- [ ] **Step 3: Ejecutar y verificar que pasa** — `npm run test:integration -- src/lib/sales/returns.itest.ts` → PASS.

- [ ] **Step 4: Suite completa + commit**

```bash
git add src/lib/sales/returns.ts src/lib/sales/returns.itest.ts src/lib/sales/__testutil.ts
git commit -m "feat(ventas): createReturn/getReturn/listReturns — devoluciones prorrateadas contra la venta

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01EnFJHWm8zVoqgkmfwwcRHi"
```

---

## Task 9: Esquemas de validación (`src/lib/validation/{sale,return}.ts`)

**Files:**
- Create: `src/lib/validation/sale.ts`, `src/lib/validation/sale.test.ts`
- Create: `src/lib/validation/return.ts`, `src/lib/validation/return.test.ts`
- Modify: `src/lib/sales/sales.ts` y `src/lib/sales/returns.ts` — reemplazar el `type CreateSaleInput` / `type CreateReturnInput` local por `import type { CreateSaleInput } from '@/lib/validation/sale'` / `'@/lib/validation/return'` (mismo shape; solo cambia el origen del tipo).

**Interfaces:**
- Consumes: `zod`.
- Produces: `createSaleSchema` + `type CreateSaleInput` (`z.infer`), `createReturnSchema` + `type CreateReturnInput`. Shapes exactamente los del spec §4.1 (idioma de `src/lib/validation/product.ts`: `.superRefine`, `z.coerce.number()`).

- [ ] **Step 1: `src/lib/validation/sale.test.ts` y `return.test.ts` (fallan)**

Unit (sin BD). Casos `sale`:
```ts
it('venta mínima válida (1 línea, 1 pago, sin descuento) parsea; customerId "" → null; requiereFactura default false');
it('lineas vacío → issue en "lineas"');
it('pagos vacío → issue en "pagos"');
it('cantidad 0 / decimal / negativa → issue en lineas.0.cantidad');
it('descuento de línea porcentaje > 100 → issue en lineas.0.descuento.valor');
it('descuento de ticket porcentaje > 100 → issue en descuentoTicket.valor');
it('monto de pago <= 0 → issue');
it('metodo de pago fuera del enum → issue');
```
Casos `return`:
```ts
it('devolución válida parsea');
it('lineas vacío → issue');
it('cantidad <= 0 / decimal → issue en lineas.0.cantidad');
it('motivo < 3 → issue en motivo');
it('metodoReembolso fuera del enum → issue');
```

- [ ] **Step 2: Ejecutar (FAIL), escribir los esquemas** (copiar del spec §4.1 verbatim). `export type CreateSaleInput = z.infer<typeof createSaleSchema>` etc.

- [ ] **Step 3: Reemplazar los tipos locales en `sales.ts` / `returns.ts`** por los `import type`. Verificar que `createSale`/`createReturn` compilan sin cambios de cuerpo (el shape es idéntico).

- [ ] **Step 4: Suite completa + commit**

```bash
git add src/lib/validation/sale.ts src/lib/validation/sale.test.ts src/lib/validation/return.ts src/lib/validation/return.test.ts src/lib/sales/sales.ts src/lib/sales/returns.ts
git commit -m "feat(ventas): esquemas Zod de venta y devolución

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01EnFJHWm8zVoqgkmfwwcRHi"
```

---

## Task 10: Server Actions y quote endpoint

**Files:**
- Create: `src/app/(app)/ventas/actions.ts`, `src/app/(app)/ventas/actions.itest.ts`
- Create: `src/app/(app)/ventas/quote/route.ts`, `src/app/(app)/ventas/quote/route.itest.ts`

**Interfaces:**
- Consumes: `requirePermission` (`@/lib/auth/context`), `getClientIp` (`@/lib/http`), `ValidationError`/`ForbiddenError` (`@/lib/errors`), `createSaleSchema`/`createReturnSchema` (`@/lib/validation/*`), `createSale`/`cancelSale` (`@/lib/sales/sales`), `createReturn` (`@/lib/sales/returns`), `computeSale` (`@/lib/sales/compute`), `db`, `type FormState` (`@/app/(auth)/setup/actions`).
- Produces (actions, todas `(_prev: FormState, formData: FormData) => Promise<FormState>`): `crearVentaAction`, `cancelarVentaAction`, `crearDevolucionAction`. Route handler `POST` en `quote/route.ts`.

- [ ] **Step 1: Tests (fallan)**

`actions.itest.ts` — mock `next/headers`, `next/cache` (`revalidatePath: () => {}`), `next/navigation` (`redirect: (u) => { throw new Error('REDIRECT:' + u) }`). Siembra usuarios por rol de sistema; helper para crear una venta previa (llamando `createSale` directo) para los tests de cancelar/devolver. Aislamiento FK-seguro. Casos:
```ts
it('Empleado → crearVentaAction → ForbiddenError, nada creado');
it('Cajero sin descuento: venta sin descuento → REDIRECT:/ventas/<id>');
it('Cajero: venta con descuento de línea en payload → _form "No tienes permiso para aplicar descuentos.", nada creado');
it('Cajero: venta con descuento de ticket en payload → mismo _form');
it('Cajero → cancelarVentaAction → ForbiddenError');
it('Cajero → crearDevolucionAction sobre venta previa → REDIRECT:/ventas/devoluciones/<id>');
it('Gerente: crear con descuento, cancelar, devolver → todas OK');
it('payload con lineas:[] → fieldErrors.lineas, sin redirect');
it('pago que no cubre el total → _form, sin redirect, FolioCounter intacto');
it('payload no-JSON → ValidationError({ payload })');
```

`quote/route.itest.ts` — mock `next/headers`. Casos:
```ts
it('403 sin ventas.crear');
it('200 con desglose correcto para 2 líneas (tasas mixtas + descuento de ticket)');
it('variante inexistente → 400 con campo');
```

- [ ] **Step 2: Ejecutar (FAIL), escribir `actions.ts`**

Idioma de `src/app/(app)/clientes/actions.ts`. `crearVentaAction`:
```ts
export async function crearVentaAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const actor = await requirePermission('ventas.crear');
  let payload: unknown;
  try { payload = JSON.parse(String(formData.get('payload') ?? '')); }
  catch { return { ok: false, fieldErrors: { payload: 'Datos de venta inválidos.' } }; }

  const parsed = createSaleSchema.safeParse(payload);
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsFrom(parsed.error) };

  const traeDescuento =
    parsed.data.lineas.some((l) => l.descuento) || parsed.data.descuentoTicket != null;
  if (traeDescuento && !can(actor, 'ventas.descuento'))
    return { ok: false, formError: 'No tienes permiso para aplicar descuentos.' };

  let saleId: string;
  try {
    saleId = (await createSale(actor.id, parsed.data, await ip())).id;
  } catch (e) {
    if (e instanceof ValidationError) return fromValidationError(e);
    throw e;
  }
  revalidatePath('/ventas/historial');
  redirect(`/ventas/${saleId}`);
}
```
`cancelarVentaAction` (`ventas.cancelar`): lee `saleId` + `motivo`; `cancelSale`; `revalidatePath('/ventas/historial')` + `/ventas/<id>`; `{ ok: true }`.
`crearDevolucionAction` (`ventas.devolver`): `payload` JSON → `createReturnSchema` → `createReturn` → `revalidatePath` → `redirect('/ventas/devoluciones/<id>')`.
(`can` de `@/lib/auth/rbac`.)

`quote/route.ts`:
```ts
export const runtime = 'nodejs';
export async function POST(req: Request) {
  try { await requirePermission('ventas.crear'); }
  catch (e) { if (e instanceof ForbiddenError) return NextResponse.json({ error: e.message }, { status: 403 }); throw e; }
  const body = await req.json().catch(() => null);
  // valida shape mínimo; resuelve variantes; computeSale; 200 con SaleComputeResult
  // variante inexistente/archivada/no disponible → 400 { error, campo }
  // ValidationError de computeSale → 400 { fieldErrors }
}
```

- [ ] **Step 3: Ejecutar y verificar que pasa** — `npm run test:integration -- "src/app/(app)/ventas/actions.itest.ts" "src/app/(app)/ventas/quote/route.itest.ts"` → PASS.

- [ ] **Step 4: Suite completa + commit**

```bash
git add "src/app/(app)/ventas/actions.ts" "src/app/(app)/ventas/actions.itest.ts" "src/app/(app)/ventas/quote/"
git commit -m "feat(ventas): server actions de venta/cancelación/devolución y endpoint de presupuesto

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01EnFJHWm8zVoqgkmfwwcRHi"
```

---

## Task 11: Pantalla de cajero (`/ventas`)

**Files:**
- Create: `src/app/(app)/ventas/page.tsx`
- Create: `src/app/(app)/ventas/CashierScreen.tsx`, `ProductSearchInput.tsx`, `CategoryGrid.tsx`, `VariantPicker.tsx`, `CartTable.tsx`, `DiscountPopover.tsx`, `CustomerPicker.tsx`, `PaymentPanel.tsx`, `TotalsPanel.tsx`

**Interfaces:**
- Consumes: `requirePermission`/`getCurrentUser`, `can`, `listCategoryTree` (`@/lib/catalog/categories`), `searchProducts` (`@/lib/catalog/search`) vía una server action ligera o el quote/otros; `searchCustomers` (`@/lib/customers/search`), `crearClienteAction` (`@/app/(app)/clientes/actions`), `crearVentaAction` (Task 10), el quote endpoint `POST /ventas/quote`, `precioConImpuesto` (`@/lib/taxes`), `PermissionGate`.
- Produces: ruta `/ventas`. No exporta símbolos para tareas posteriores.

**Contrato de componentes (todos `'use client'` salvo `page.tsx`):**
- `page.tsx` (server): `const actor = await requirePermission('ventas.crear')`; `export const dynamic = 'force-dynamic'`; carga `listCategoryTree({ incluirArchivadas: false })` y el id/nombre del cliente `esGenerico`; renderiza `<CashierScreen tree={...} genericCustomer={...} canDescuento={can(actor,'ventas.descuento')} canCrearCliente={can(actor,'clientes.crear')} />`.
- **Búsqueda de productos:** necesita `searchProducts` desde el cliente. Crear una server action `buscarProductosAction(q: string): Promise<SearchHit[]>` en `src/app/(app)/ventas/actions.ts` (gated `ventas.crear`, `soloDisponibles: true`, `incluirArchivados: false`, `limit: 20`) — el `ProductSearchInput` la llama con debounce. El atajo de "código exacto" comprueba `hits.length === 1 && hits[0].exactBarcode` (o `hits.some(h => h.exactBarcode)` y toma esa).
- `CashierScreen`: estado del carrito `Array<{ key; variantId; productoNombre; varianteNombre; sku; precioUnitario; tasaImpuesto; precioConImpuesto; stock; cantidad; descuento? }>`; cliente seleccionado; `requiereFactura`. Al cambiar el carrito/descuentos → `POST /ventas/quote` con debounce ~250 ms → guarda el `SaleComputeResult` para `TotalsPanel` y los importes por línea de `CartTable`. "Cobrar" abre `PaymentPanel`. "Confirmar venta" arma el `payload` `{ customerId, lineas: [{variantId,cantidad,descuento}], descuentoTicket, pagos, requiereFactura }` y lo envía por `crearVentaAction` (`useActionState`, campo `<input type="hidden" name="payload">`). Muestra `state.formError` / `state.fieldErrors`. El carrito no se limpia ante error.
- `ProductSearchInput`: input con `ref` y re-focus en `useEffect` tras cada `onAdd`. Enter → `buscarProductosAction`; si hay match exacto de código → `onAdd(hit)`; si no → lista desplegable con clic. Si `hit` es de un producto con >1 variante activa → `onNeedsVariant(productId)` → `VariantPicker`.
- `CategoryGrid`: pestañas de categoría raíz → subcategoría (del `tree`), y botones de producto (nombre + `precioConImpuesto`). Para obtener los productos de una categoría con sus variantes: server action `productosDeCategoriaAction(categoryId): Promise<...>` (gated `ventas.crear`) o reutiliza `listProducts({ categoryId, estado:'activos', page:1, pageSize:100 })` envuelto en una action. Clic → `onAdd` (con `VariantPicker` si aplica).
- `VariantPicker`: modal; lista variantes activas y disponibles del producto (nombre, precio con IVA, stock); clic → `onPick(variant)`.
- `CartTable`: fila por línea; `± cantidad` y edición directa (entero ≥ 1); botón de descuento de línea → `DiscountPopover` (envuelto en `<PermissionGate permiso="ventas.descuento">`); importe de línea del `SaleComputeResult`; quitar.
- `DiscountPopover`: `tipo` (monto/%) + `valor`; `onApply({tipo,valor})` / `onClear()`.
- `CustomerPicker`: muestra el cliente actual (por defecto genérico); "Cambiar" → buscador (`searchCustomers` vía una action `buscarClientesAction`), lista, seleccionar; "Nuevo cliente" en `<PermissionGate permiso="clientes.crear">` (form inline que llama `crearClienteAction`; al volver `ok`, refresca la selección). Casilla "Requiere factura" visible solo si el cliente elegido es facturable (`facturable` viene de `searchCustomers`/`getCustomer`).
- `PaymentPanel`: filas `metodo + monto` (añadir/quitar); "Pagado" y "Cambio" calculados localmente **solo para feedback**; atajo "Efectivo exacto" (rellena `EFECTIVO` = total del `SaleComputeResult`). "Confirmar venta" dispara el submit.
- `TotalsPanel`: Subtotal / Descuentos / IVA / **Total** del `SaleComputeResult`.

- [ ] **Step 1:** Añadir a `src/app/(app)/ventas/actions.ts` las server actions de apoyo (`buscarProductosAction`, `productosDeCategoriaAction`, `buscarClientesAction`), todas `await requirePermission('ventas.crear')` primera sentencia, devolviendo datos serializables. Sin tests dedicados (se cubren en E2E); typecheck/lint/build las valida.

- [ ] **Step 2..N:** Implementar `page.tsx` y los 9 componentes según el contrato. Seguir el idioma visual de `src/app/(app)/productos/*` y `src/app/(app)/clientes/*` (clases Tailwind, `PermissionGate`, `useActionState`, `useFormStatus`).

- [ ] **Step final: Verificación**

Run: `npm run typecheck && npm run lint && npm run build` (sin unit tests de RSC, patrón de Bloques 2–3). Luego `npm run test:unit && npm run test:integration` para confirmar cero regresión.

Si el conjunto de la pantalla desborda el alcance de una tarea, reportar **DONE_WITH_CONCERNS** con lo que falta — no partir archivos sin guía.

```bash
git add "src/app/(app)/ventas/"
git commit -m "feat(ventas): pantalla de cajero — buscador, rejilla, carrito, descuentos, cobro

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01EnFJHWm8zVoqgkmfwwcRHi"
```

---

## Task 12: Historial, detalle y ticket

**Files:**
- Create: `src/app/(app)/ventas/historial/page.tsx`
- Create: `src/app/(app)/ventas/historial/export/route.ts` (+ `route.itest.ts`)
- Create: `src/app/(app)/ventas/[id]/page.tsx`, `src/app/(app)/ventas/[id]/ticket/page.tsx`
- Create: `src/app/(app)/ventas/SaleRow.tsx`, `CancelSaleForm.tsx`, `TicketView.tsx`, `PrintOnMount.tsx`

**Interfaces:**
- Consumes: `requirePermission`/`getCurrentUser`, `can`, `listSales`/`getSale` (`@/lib/sales/sales`), `cancelarVentaAction` (Task 10), `enmascararRfc` (`@/lib/customers/fiscal`), `parseDateParam`, `DataTable`/`Pagination`/`PermissionGate`, el `esc` local (como en `inventario/movimientos/export/route.ts`). `db.user.findMany` para el select de cajeros.
- Produces: rutas `/ventas/historial`, `/ventas/historial/export`, `/ventas/[id]`, `/ventas/[id]/ticket`.

- [ ] **Step 1: `historial/export/route.itest.ts` (falla)** — mock `next/headers`; 403 sin `ventas.ver`; 200 `text/csv` con una venta sembrada (folio y total en el cuerpo). BOM `﻿`; cabecera `Folio,Fecha,Cliente,Cajero,Nº líneas,Subtotal,Descuentos,IVA,Total,Estado,Métodos de pago`. Sin RFC.

- [ ] **Step 2: `historial/export/route.ts`** — idioma de `inventario/movimientos/export/route.ts`; `runtime='nodejs'`; gate `try/catch ForbiddenError → 403`; lee filtros; `listSales({ ..., page:1, pageSize:5000 })`; para "Métodos de pago" re-consulta `db.payment.groupBy` o incluye en `listSales` una agregación (decisión del implementer; no cambiar la firma pública de `listSales` sin actualizar sus tests). `content-disposition: attachment; filename="ventas-<YYYY-MM-DD>.csv"`.

- [ ] **Step 3: `historial/page.tsx`** — server; `requirePermission('ventas.ver')`; `dynamic='force-dynamic'`; `searchParams` `q`/`estado`/`cajero`/`desde`/`hasta`/`page`; `listSales(...)`; `<form method="get">` con inputs + selects (`estado`: todas/COMPLETADA/CANCELADA; `cajero`: `db.user.findMany({ where: { activo: true } })`); `<DataTable>` cols Folio/Fecha/Cliente/Cajero/Nº líneas/Total/Estado (badge); `rowComponent={SaleRow}`, `rowHref={r => `/ventas/${r.id}`}`; `<Pagination>`; enlace "Exportar CSV" con los filtros.

- [ ] **Step 4: `SaleRow.tsx`** — client, `{ href?, children }` (contrato de `DataTable.rowComponent`, como `CustomerRow` del Bloque 3). Badge de estado verde/gris.

- [ ] **Step 5: `[id]/page.tsx`** — server; `requirePermission('ventas.ver')`; `getSale(id)` → `notFound()` si null; `getCurrentUser` + `can`. Cabecera (folio, fecha, estado, cliente, cajero) + badges (`Cancelada` con motivo + `canceladaPorNombre`, `Requiere factura`). Secciones: líneas (snapshots + importes), totales, pagos + cambio, datos fiscales snapshot (RFC `enmascararRfc`), devoluciones asociadas (enlace a `/ventas/devoluciones/<id>`). Acciones: "Imprimir ticket" (`Link` a `/ventas/[id]/ticket`); `<CancelSaleForm>` en `<PermissionGate permiso="ventas.cancelar">` solo si `estado==='COMPLETADA'` && es del día (comparar fecha local MX en el server) && `returns.length===0`; "Registrar devolución" (`Link` a `/ventas/[id]/devolucion`) en `<PermissionGate permiso="ventas.devolver">` si `estado==='COMPLETADA'` y queda algo devolvible (`lines.some(l => l.cantidad > (devuelto[l.id] ?? 0))`).

- [ ] **Step 6: `CancelSaleForm.tsx`** — client; `useActionState(cancelarVentaAction)`; `<input type="hidden" name="saleId">`; textarea `motivo`; botón con `confirm()`; muestra `state.formError`.

- [ ] **Step 7: `[id]/ticket/page.tsx` + `TicketView.tsx` + `PrintOnMount.tsx`** — page server (`requirePermission('ventas.ver')`, `getSale`, `notFound` si null) con layout minimal SIN el chrome de `(app)` (usar su propio `<div>` de ancho ~80mm; no depende del layout de nav — si el grupo `(app)` fuerza el sidebar, poner el ticket bajo una ruta que no herede ese layout, p. ej. `src/app/ventas-ticket/[id]/page.tsx`, o un `layout.tsx` propio en `[id]/ticket/`). `TicketView` (server o client) pinta el contenido; `PrintOnMount` (`'use client'`, `useEffect(() => window.print(), [])`). Contenido: negocio (de `AppSetting` `clave:'negocio.nombre'` si existe, si no "Punto de venta"), folio, fecha/hora, cajero, cliente, líneas, subtotal, descuentos, IVA, **TOTAL**, pagos por método, **CAMBIO**, aviso de factura enmascarado si aplica, pie "Comprobante no fiscal". CSS `@media print` (ocultar botones).

- [ ] **Step 8: Verificación + commit**

Run: `npm run typecheck && npm run lint && npm run build && npm run test:integration -- "src/app/(app)/ventas/historial/export/route.itest.ts"` y `npm run test:unit && npm run test:integration` completos.

```bash
git add "src/app/(app)/ventas/"
git commit -m "feat(ventas): historial, detalle de venta, ticket imprimible y export CSV

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01EnFJHWm8zVoqgkmfwwcRHi"
```

---

## Task 13: Pantallas de devoluciones

**Files:**
- Create: `src/app/(app)/ventas/[id]/devolucion/page.tsx`, `src/app/(app)/ventas/ReturnForm.tsx`
- Create: `src/app/(app)/ventas/devoluciones/page.tsx`, `src/app/(app)/ventas/devoluciones/[id]/page.tsx`

**Interfaces:**
- Consumes: `requirePermission`, `getSale` (`@/lib/sales/sales`), `getReturn`/`listReturns` (`@/lib/sales/returns`), `crearDevolucionAction` (Task 10), `prorateReturnLine` (`@/lib/sales/compute` — solo para el estimado en vivo del cliente), `DataTable`/`Pagination`, `parseDateParam`.
- Produces: rutas `/ventas/[id]/devolucion`, `/ventas/devoluciones`, `/ventas/devoluciones/[id]`.

- [ ] **Step 1: `[id]/devolucion/page.tsx`** — server; `requirePermission('ventas.devolver')`; `getSale(id)` → `notFound()` si null o `estado!=='COMPLETADA'`; renderiza `<ReturnForm sale={...} />` con las líneas y `devuelto`.

- [ ] **Step 2: `ReturnForm.tsx`** — client; `useActionState(crearDevolucionAction)`. Tabla de líneas: producto, vendido, ya devuelto, **input cantidad a devolver** (0..`vendido−yaDevuelto`), estimado a reembolsar (calcula con `prorateReturnLine` en cliente, solo informativo). `select metodoReembolso`, textarea `motivo`. Arma `payload` `{ saleId, lineas: [{saleLineId,cantidad}] (cantidad>0), metodoReembolso, motivo }` en `<input type="hidden" name="payload">`. Muestra `state.formError`/`fieldErrors`.

- [ ] **Step 3: `devoluciones/page.tsx`** — server; `requirePermission('ventas.ver')`; `listReturns({ desde, hasta, page, pageSize })`; `<DataTable>` cols Folio D/Fecha/Venta origen/Total/Cajero; fila → `/ventas/devoluciones/<id>`; `<Pagination>`; filtro GET `desde`/`hasta`.

- [ ] **Step 4: `devoluciones/[id]/page.tsx`** — server; `requirePermission('ventas.ver')`; `getReturn(id)` → `notFound()` si null; líneas prorrateadas (producto, cantidad, base, IVA, total), método de reembolso, motivo, enlace a `/ventas/<ventaId>`.

- [ ] **Step 5: Verificación + commit**

Run: `npm run typecheck && npm run lint && npm run build && npm run test:unit && npm run test:integration`.

```bash
git add "src/app/(app)/ventas/"
git commit -m "feat(ventas): pantallas de devolución (alta, listado, detalle)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01EnFJHWm8zVoqgkmfwwcRHi"
```

---

## Task 14: E2E de ventas (Playwright)

**Files:**
- Create: `e2e/ventas.spec.ts`

**Interfaces:**
- Consumes: helpers de `e2e/helpers.ts`; referencia `e2e/productos-inventario.spec.ts` (login admin, alta de productos, creación de usuarios por rol) y `e2e/clientes.spec.ts`.
- Produces: nada (suite terminal).

- [ ] **Step 1: Escribir `e2e/ventas.spec.ts`** — datos únicos por corrida; cada `test()` autónomo (login propio). Necesita al menos un producto SIMPLE con código de barras y stock, y un producto CON_VARIANTES con stock — créalos vía UI (`/productos/nuevo`) o vía un helper de siembra si `helpers.ts` lo ofrece; documenta la elección en el reporte. Cubrir los 7 escenarios del spec §6.5:

1. Venta con lector: Cajero → `/ventas` → teclear código de barras → línea cant 1 → repetir → cant 2 → Cobrar → efectivo con sobrepago → Confirmar → detalle con folio `V-…`, total/IVA/cambio correctos; stock de la variante bajó 2 (comprobar en `/productos/<id>`).
2. Venta con rejilla + variante + descuento (Gerente): añadir por `CategoryGrid` → elegir variante → cantidad 3 → 10 % descuento de ticket → totales reflejan descuento e IVA sobre base neta → cobrar mixto → detalle correcto.
3. Cajero no ve controles de descuento en `/ventas`.
4. Pago insuficiente → error visible, sin redirección, carrito intacto.
5. Cancelación mismo día (Gerente): crear venta → detalle → "Cancelar venta" → motivo → confirmar → estado `Cancelada`, stock reintegrado.
6. Devolución parcial (Cajero): venta de 3 uds → `/ventas/[id]/devolucion` → devolver 1 → confirmar → devolución con total prorrateado, stock sube 1; intentar devolver 3 más → error "Máximo devolvible: 2".
7. Ticket: `/ventas/[id]/ticket` contiene folio, TOTAL y CAMBIO.

- [ ] **Step 2: Ejecutar** — `npm run test:e2e -- ventas` → verde. (Levanta build + PG efímero; lento.)

- [ ] **Step 3: Commit**

```bash
git add e2e/ventas.spec.ts
git commit -m "test(ventas): E2E de venta, descuentos, permisos, cancelación, devolución y ticket

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01EnFJHWm8zVoqgkmfwwcRHi"
```

---

## Verificación final del bloque (tras la revisión de rama completa)

- [ ] `npm run typecheck` → 0 · `npm run lint` → 0 · `npm run test:unit` → verde · `npm run test:integration` → verde y **estable en 3 corridas** (sin flakes por orden de archivos ni por avance de `FolioCounter`) · `npm run build` → OK · `npm run test` (unit+integración) → verde · `npm run test:e2e` → verde.
- [ ] Revisión de seguridad e integridad: (a) toda Server Action mutante empieza con `requirePermission`; (b) `crearVentaAction` bloquea descuentos sin `ventas.descuento`; (c) el RFC nunca aparece completo en `activity_log` (grep en itests); en pantalla/ticket va enmascarado; (d) `createSale` recalcula importes con `computeSale` y precios/tasas de BD — los importes del cliente no se confían; (e) stock nunca negativo; venta con stock insuficiente revierte por completo, folio incluido; (f) folios sin huecos (test dedicado); (g) migración estrictamente aditiva (revisar `migration.sql`, `MovementType` intacto); (h) `invalidateStockAlertsCache()` se llama tras `createSale`/`cancelSale`/`createReturn`; (i) sin `console.*`, sin `any`, sin `new PrismaClient()` fuera de `seed.ts`.
- [ ] `docs/`: añadir `docs/superpowers/decisions-bloque4.md` si el bloque tomó decisiones no evidentes del spec (opcional, como `decisions-bloque2.md`).

---

## Global Self-Review (autor del plan)

**Cobertura del spec:**
- Modelo de datos (Sale/SaleLine/Payment/Return/ReturnLine/FolioCounter, enums, relaciones inversas) → Task 3.
- `computeSale` (IVA por línea, descuentos, prorrateo con residuo exacto) + `prorateReturnLine` → Task 4.
- Widening `recordMovement`/`computeStock` para VENTA/DEVOLUCION → Task 1.
- Folios sin huecos → Task 5.
- `createSale` (atómica, snapshot fiscal, cambio, rechazo de stock, auditoría) / `getSale` → Task 6.
- `cancelSale` (mismo día) / `listSales` → Task 7.
- `createReturn`/`getReturn`/`listReturns` → Task 8.
- Esquemas Zod → Task 9.
- Server actions (RBAC-primero, bloqueo de descuento) + quote endpoint → Task 10.
- Pantalla de cajero (buscador + rejilla + carrito + descuentos + cliente + cobro) → Task 11.
- Historial + detalle + ticket + export CSV → Task 12.
- Devoluciones UI → Task 13.
- RBAC (grupo `ventas`, reparto por rol) + auditoría (3 acciones) + nav + seed `FolioCounter` → Task 2 + Task 3.
- E2E (7 escenarios) → Task 14.
- Migración aditiva → Task 3.

**Consistencia de tipos:** `CreateSaleInput`/`CreateReturnInput` se declaran estructuralmente en Task 6/8 y se reemplazan por el `z.infer` en Task 9 con shape idéntico (nota de secuencia explícita en cada tarea). `SaleComputeResultLine.descuentoLinea` (compute) ↔ `SaleLine.descuentoMonto` (persistencia): el mapeo está explícito en el esqueleto de `createSale` (Task 6, Step 3). `SaleRow`/`SaleDetail`/`ReturnRow`/`ReturnDetail` tienen shapes distintos y deliberados. `round2` aparece en `compute.ts` (con épsilon) y como helper local en `sales.ts` para la suma de pagos — ambos documentados; el implementer puede exportar uno desde `compute.ts` si prefiere DRY.

**Sin placeholders:** `compute.ts`, `folio.ts`, los esquemas Zod, el esqueleto transaccional de `createSale` y las server actions están completos o con esqueleto ejecutable. Las pantallas (Tasks 11–13) se describen por contrato de componente contra ficheros de referencia concretos de los Bloques 2–3, que es el nivel correcto para UI de presentación; el flujo de datos (carrito → quote → payload → action) sí está especificado end to end.

**Riesgo señalado:** Task 11 es grande (10 archivos). Es una pantalla coherente; si desborda, el implementer reporta DONE_WITH_CONCERNS con el desglose y el controlador parte la tarea. Las Tasks 6 y 8 también son densas (transacción + itest extenso) pero cada una es un servicio con una responsabilidad.
