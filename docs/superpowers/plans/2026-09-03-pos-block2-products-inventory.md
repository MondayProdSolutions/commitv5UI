# POS Bloque 2 (Productos, Categorías e Inventario) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Catálogo de productos (simples y con variantes), categorías de dos niveles e inventario con movimientos manuales trazables, sobre la base del Bloque 1.

**Architecture:** Mismo proyecto Next.js (App Router, gate `src/proxy.ts`). Todo producto tiene ≥1 `ProductVariant`; stock/SKU/código/precios viven en la variante. `src/lib/inventory/movements.ts::recordMovement` es el ÚNICO punto que escribe `ProductVariant.stock`, siempre dentro de una transacción con bloqueo de fila (`SELECT ... FOR UPDATE`), y es reutilizable por el Bloque 4 pasándole una `tx`. Los servicios de catálogo e inventario se consumen desde Server Actions con `requirePermission` como primera sentencia y auditoría dentro de la misma transacción que la mutación.

**Tech Stack:** Next.js 16.3.4, React 19.2, TypeScript strict, PostgreSQL + Prisma 7 + `@prisma/adapter-pg`, Zod 4, Tailwind v4, Vitest 4 (`*.test.ts` unit / `*.itest.ts` integración con Postgres efímero), Playwright.

**Spec:** `docs/superpowers/specs/2026-09-03-pos-block2-products-inventory-design.md`

## Global Constraints

- **Base ya construida (Bloque 1, en `master`):** reutiliza sin reescribir — `requirePermission`/`requireUser` (`@/lib/auth/context`), `PERMISSIONS`/`can`/`ALL_PERMISSION_KEYS` (`@/lib/auth/rbac`), `logActivity`/`actionLabel`/`KNOWN_ACTIONS`/`AuditAction` (`@/lib/audit`), `queryActivity`/`ActivityRow` (`@/lib/activity/query`), `type FormState` (`@/app/(auth)/setup/actions`), `ValidationError`/`ForbiddenError` (`@/lib/errors`), `db` (`@/lib/db`), `getClientIp`/`assertSameOrigin` (`@/lib/http`), `DataTable`/`Pagination`/`PermissionGate`/`forms/Field` (`@/components/*`), `visibleNav`/`NAV_ITEMS` (`@/lib/nav`), `parseDateParam` (`@/lib/activity/query`).
- **Prisma:** un solo cliente, `import { db } from '@/lib/db'` — NUNCA `new PrismaClient()`. `Prisma.PrismaClientKnownRequestError` con `.code === 'P2002'` para únicos. `Prisma.TransactionClient` para funciones que aceptan `tx`.
- **Migración:** puramente ADITIVA. Nuevas tablas (`TaxRate`, `Category`, `Product`, `ProductVariant`, `InventoryMovement`), nuevos enums (`ProductType`, `MovementType`), y UNA relación inversa nueva en `User` (`inventoryMovements InventoryMovement[]`). Ninguna columna/tabla existente se altera ni se borra. `npx prisma migrate dev --name bloque2_productos_inventario`.
- **Dinero:** `Decimal @db.Decimal(12,2)` para importes, `@db.Decimal(5,4)` para tasas. Los servicios reciben `number` (Zod `z.coerce.number()`), Prisma serializa a `Decimal`. Al devolver a la UI: `Number(value)` o `value.toФixed?` → usar `Number(v)` y formatear en el componente. Cantidades y stock: `Int`.
- **Stock:** `recordMovement` es el único escritor de `ProductVariant.stock`. Sin stock negativo (regla dura; `SALIDA`/`AJUSTE` que dejaría `< 0` → `ValidationError`). `AJUSTE` recibe el **stock objetivo absoluto**; persiste `stockPrevio`, `stockNuevo` y `cantidad = delta = stockNuevo − stockPrevio`.
- **Ciclo de vida:** sin borrado físico. `Product.archivado`, `ProductVariant.archivada`, `Category.archivada`. Archivar producto → cascada a sus variantes. Archivar categoría raíz → cascada lógica a subcategorías; los productos conservan su `categoryId` (nunca se mueven ni se desasocian).
- **Permisos nuevos** (grupos `productos`, `categorias`, `inventario` en `PERMISSIONS`): `productos.ver`, `productos.crear`, `productos.editar`, `productos.archivar`, `categorias.gestionar`, `inventario.ver`, `inventario.entrada`, `inventario.salida`, `inventario.ajustar`. Seed: Gerente ← las 9; Cajero ← `productos.ver` + `inventario.ver`; Empleado ← igual que Cajero. `inventario.entrada/salida/ajustar` NO se asignan a Cajero ni Empleado por defecto.
- **Autorización:** toda Server Action mutante empieza con `await requirePermission('<clave>')` ANTES de leer `formData` o tocar la BD. `movimientos/nuevo` valida el permiso correspondiente al `tipo` recibido (`ENTRADA→inventario.entrada`, `SALIDA→inventario.salida`, `AJUSTE→inventario.ajustar`), no "alguno de los tres".
- **Auditoría:** dentro de la misma `db.$transaction` que la mutación. Acciones nuevas (a `LABELS`/`KNOWN_ACTIONS` de `@/lib/audit`, y a la unión `AuditAction`): `categorias.crear`, `categorias.editar`, `categorias.archivar`, `categorias.restaurar`, `productos.crear`, `productos.editar`, `productos.precio_cambiado`, `productos.archivar`, `productos.restaurar`, `productos.disponibilidad`, `productos.variante_agregada`, `productos.variante_archivada`, `inventario.movimiento`.
- **UI:** español; server pages con `requirePermission(...)` primera sentencia y `export const dynamic = 'force-dynamic'` si leen cookies/searchParams; `redirect()` fuera de try/catch; React 19 `useActionState`; Zod 4 (`z.email()`, `.check()` no `.superRefine()`); Tailwind v4; sin `any`.
- **TDD:** test primero. `*.test.ts` unit (sin BD), `*.itest.ts` integración (globalSetup levanta Postgres efímero, aplica migraciones + seed). Ejecutar por tarea: `npm run typecheck && npm run lint && npm run test:unit && npm run test:integration && npm run build`, y pegar las colas en el reporte.
- **Commits:** Conventional Commits en español, terminando con:
  ```
  Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01EnFJHWm8zVoqgkmfwwcRHi
  ```
- **Sin push, sin remoto, sin deploy.** Todo local.

---

## Estructura de archivos

**Prisma**
- `prisma/schema.prisma` — + enums `ProductType`/`MovementType`, modelos `TaxRate`/`Category`/`Product`/`ProductVariant`/`InventoryMovement`, relación inversa `User.inventoryMovements`.
- `prisma/seed.ts` — extendido: upsert de `TaxRate` ("IVA 16%" default, "Exento"), y claves de permiso de este bloque en el mapa `ROLE_PERMISSIONS` de Gerente/Cajero/Empleado.
- `prisma/migrations/<ts>_bloque2_productos_inventario/` — generada.

**Librería**
- `src/lib/auth/rbac.ts` — + 3 grupos de permiso en `PERMISSIONS` (aditivo).
- `src/lib/audit.ts` — + 13 entradas en `LABELS`; `AuditAction` unión ampliada.
- `src/lib/nav.ts` — + ítems Productos/Categorías/Inventario; el de Inventario admite `badgeCount`.
- `src/lib/taxes.ts` — `getTaxRates()`, `getDefaultTaxRate()`, `precioConImpuesto(base:number, tasa:number): number`.
- `src/lib/inventory/stock-calc.ts` — `computeStock(tipo, stockPrevio, valor): { stockNuevo:number; delta:number }` (puro, sin BD).
- `src/lib/inventory/movements.ts` — `recordMovement(input, tx?)`.
- `src/lib/inventory/stock.ts` — `lowStockVariants(filtro)`, `stockAlertsCount()` (+ `invalidateStockAlertsCache()`).
- `src/lib/inventory/query.ts` — `listMovements(filtro)`.
- `src/lib/catalog/categories.ts` — `createCategory`, `updateCategory`, `archiveCategory`, `restoreCategory`, `listCategoryTree`, `productsInArchivedCategories`, `isRootCategory` (helper puro exportado para tests).
- `src/lib/catalog/products.ts` — `createProduct`, `updateProduct`, `archiveProduct`, `restoreProduct`, `setProductDisponible`, `getProduct`, `listProducts`.
- `src/lib/catalog/variants.ts` — `editVariant`, `addVariant`, `convertToVariants`, `archiveVariant`, `setVariantDisponible`.
- `src/lib/catalog/search.ts` — `searchProducts(q, opts)`.
- `src/lib/validation/{product,category,movement}.ts` — esquemas Zod + tipos inferidos.

**App**
- `src/app/(app)/categorias/{page.tsx,actions.ts}`, `CategoryTree.tsx`, `CategoryForm.tsx`, `sin-categoria-activa/page.tsx`.
- `src/app/(app)/productos/{page.tsx,actions.ts}`, `[id]/page.tsx`, `ProductForm.tsx`, `VariantEditor.tsx`, `ProductRow.tsx`.
- `src/app/(app)/inventario/{page.tsx,actions.ts}`, `stock-bajo/page.tsx`, `movimientos/page.tsx`, `movimientos/nuevo/{page.tsx,MovementForm.tsx}`, `movimientos/export/route.ts` (+ `route.itest.ts`).

**Tests**
- `*.test.ts` junto a cada módulo puro; `*.itest.ts` junto a cada servicio con BD.
- `e2e/productos-inventario.spec.ts`.

---

## Task 1: Esquema Prisma, migración y seed

**Files:**
- Modify: `prisma/schema.prisma` (aditivo), `prisma/seed.ts`
- Create: `prisma/migrations/<ts>_bloque2_productos_inventario/`
- Create: `src/lib/__tests__/seed-bloque2.itest.ts`

**Interfaces:**
- Consumes: esquema del Bloque 1 (modelo `User`).
- Produces: modelos `TaxRate`, `Category`, `Product`, `ProductVariant`, `InventoryMovement` con los nombres de campo del spec; enums `ProductType { SIMPLE CON_VARIANTES }`, `MovementType { ENTRADA SALIDA AJUSTE VENTA DEVOLUCION }`. `User.inventoryMovements`. Seed: `TaxRate` "IVA 16%" (`tasa: 0.16`, `esDefault: true`) y "Exento" (`tasa: 0`); permisos de bloque en Gerente/Cajero/Empleado.

- [ ] **Step 1: Escribir `src/lib/__tests__/seed-bloque2.itest.ts` (falla)**

```ts
import { describe, it, expect } from 'vitest';
import { db } from '@/lib/db';

describe('seed bloque 2', () => {
  it('siembra las tasas de impuesto', async () => {
    const rates = await db.taxRate.findMany({ orderBy: { tasa: 'desc' } });
    expect(rates.map((r) => r.nombre)).toEqual(['IVA 16%', 'Exento']);
    const def = rates.find((r) => r.esDefault);
    expect(def?.nombre).toBe('IVA 16%');
    expect(Number(def?.tasa)).toBeCloseTo(0.16);
  });

  it('asigna los permisos de bloque 2 a Gerente (las 9)', async () => {
    const gerente = await db.role.findUniqueOrThrow({
      where: { nombre: 'Gerente' },
      include: { permissions: true },
    });
    const keys = gerente.permissions.map((p) => p.permiso);
    for (const k of [
      'productos.ver', 'productos.crear', 'productos.editar', 'productos.archivar',
      'categorias.gestionar', 'inventario.ver', 'inventario.entrada',
      'inventario.salida', 'inventario.ajustar',
    ]) expect(keys).toContain(k);
  });

  it('Cajero y Empleado solo obtienen ver, no movimientos', async () => {
    for (const nombre of ['Cajero', 'Empleado']) {
      const rol = await db.role.findUniqueOrThrow({ where: { nombre }, include: { permissions: true } });
      const keys = rol.permissions.map((p) => p.permiso);
      expect(keys).toContain('productos.ver');
      expect(keys).toContain('inventario.ver');
      expect(keys).not.toContain('inventario.entrada');
      expect(keys).not.toContain('inventario.ajustar');
      expect(keys).not.toContain('productos.crear');
    }
  });
});
```

> Este test importa claves que Task 2 añade a `rbac.ts`. El seed las referencia por string, así que Task 1 puede escribir el mapa `ROLE_PERMISSIONS` con las claves literales; Task 2 sólo debe mantener `rbac.ts` en sincronía. Ejecuta ambas en orden.

- [ ] **Step 2: Añadir al `schema.prisma`** (al final, sin tocar lo existente salvo la línea inversa en `User`)

```prisma
enum ProductType  { SIMPLE  CON_VARIANTES }
enum MovementType { ENTRADA SALIDA AJUSTE VENTA DEVOLUCION }

model TaxRate {
  id        String   @id @default(cuid())
  nombre    String   @unique
  tasa      Decimal  @db.Decimal(5, 4)
  activa    Boolean  @default(true)
  esDefault Boolean  @default(false)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  products  Product[]
}

model Category {
  id        String     @id @default(cuid())
  nombre    String
  parentId  String?
  parent    Category?  @relation("Subcats", fields: [parentId], references: [id])
  hijos     Category[] @relation("Subcats")
  archivada Boolean    @default(false)
  createdAt DateTime   @default(now())
  updatedAt DateTime   @updatedAt
  products  Product[]

  @@unique([parentId, nombre])
  @@index([parentId])
  @@index([archivada])
}

model Product {
  id          String      @id @default(cuid())
  nombre      String
  descripcion String?
  categoryId  String?
  category    Category?   @relation(fields: [categoryId], references: [id])
  taxRateId   String
  taxRate     TaxRate     @relation(fields: [taxRateId], references: [id])
  tipo        ProductType @default(SIMPLE)
  imagenUrl   String?
  archivado   Boolean     @default(false)
  createdById String?
  createdAt   DateTime    @default(now())
  updatedAt   DateTime    @updatedAt
  variants    ProductVariant[]

  @@index([categoryId])
  @@index([archivado])
  @@index([nombre])
}

model ProductVariant {
  id           String   @id @default(cuid())
  productId    String
  product      Product  @relation(fields: [productId], references: [id], onDelete: Cascade)
  nombre       String?
  esDefault    Boolean  @default(false)
  sku          String?  @unique
  codigoBarras String?  @unique
  precioVenta  Decimal  @db.Decimal(12, 2)
  precioCompra Decimal  @db.Decimal(12, 2) @default(0)
  stock        Int      @default(0)
  stockMinimo  Int      @default(0)
  disponible   Boolean  @default(true)
  archivada    Boolean  @default(false)
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
  movements    InventoryMovement[]

  @@index([productId])
  @@index([archivada])
  @@index([sku])
  @@index([codigoBarras])
}

model InventoryMovement {
  id             String         @id @default(cuid())
  variantId      String
  variant        ProductVariant @relation(fields: [variantId], references: [id])
  tipo           MovementType
  cantidad       Int
  stockPrevio    Int
  stockNuevo     Int
  costoUnitario  Decimal?       @db.Decimal(12, 2)
  motivo         String
  referenciaTipo String?
  referenciaId   String?
  actorId        String?
  actor          User?          @relation("ActorMovimientos", fields: [actorId], references: [id])
  createdAt      DateTime       @default(now())

  @@index([variantId, createdAt])
  @@index([tipo, createdAt])
  @@index([createdAt])
}
```

En el modelo `User` (Bloque 1) añadir SOLO esta línea entre sus relaciones:
```prisma
  inventoryMovements InventoryMovement[] @relation("ActorMovimientos")
```

- [ ] **Step 3: Extender `prisma/seed.ts`**

Tras el bloque de roles/permisos existente, antes del `console.log` final:

```ts
// --- Bloque 2: tasas de impuesto ---
const taxRates = [
  { nombre: 'IVA 16%', tasa: 0.16, esDefault: true },
  { nombre: 'Exento', tasa: 0, esDefault: false },
];
for (const t of taxRates) {
  await db.taxRate.upsert({
    where: { nombre: t.nombre },
    update: { tasa: t.tasa, esDefault: t.esDefault, activa: true },
    create: { nombre: t.nombre, tasa: t.tasa, esDefault: t.esDefault },
  });
}
```

Y en el mapa `ROLE_PERMISSIONS` del seed, añadir a los arrays existentes:
- `Gerente`: `'productos.ver','productos.crear','productos.editar','productos.archivar','categorias.gestionar','inventario.ver','inventario.entrada','inventario.salida','inventario.ajustar'`
- `Cajero`: `'productos.ver','inventario.ver'`
- `Empleado`: `'productos.ver','inventario.ver'`
- `Administrador`: (no tocar — toma `ALL_PERMISSION_KEYS`)

> El seed re-aplica permisos idempotentemente (`deleteMany` + `createMany` por rol, patrón del Bloque 1). Verifica que ese patrón sigue vigente; si el seed hace `upsert` incremental, añade las claves sin duplicar.

- [ ] **Step 4: Generar la migración**

```bash
npm run db:start   # background; esperar "Corriendo"
npx prisma migrate dev --name bloque2_productos_inventario
```
Expected: crea la carpeta de migración, aplica a `pos_dev`, regenera el cliente. Verifica que el SQL sólo hace `CREATE TABLE`/`CREATE TYPE`/`ALTER TABLE "InventoryMovement" ADD CONSTRAINT ... "User"` — ninguna columna existente alterada.

- [ ] **Step 5: Ejecutar seed + tests de integración**

```bash
npm run db:seed
npm run test:integration -- seed-bloque2
```
Expected: 3 tests PASS. (El `globalSetup` reaplica migración + seed a `pos_test`.)

- [ ] **Step 6: Verificación completa + commit**

Run: `npm run typecheck && npm run lint && npm run test:unit && npm run test:integration && npm run build` — todo limpio.
```bash
git add -A
git commit -m "feat: esquema Prisma del Bloque 2 (productos, variantes, categorías, inventario) + seed"
```

---

## Task 2: Extender rbac.ts, audit.ts y nav.ts

**Files:**
- Modify: `src/lib/auth/rbac.ts`, `src/lib/audit.ts`, `src/lib/nav.ts`
- Modify: `src/lib/auth/rbac.test.ts`, `src/lib/nav.test.ts` (añadir casos)
- Create: `src/lib/audit.test.ts` si no existe un unit test de `actionLabel` (Bloque 1 lo prueba en `audit.itest.ts`; basta añadir casos ahí — ver Step 3)

**Interfaces:**
- Consumes: `PERMISSIONS` array (Bloque 1), `LABELS` map (Bloque 1), `NAV_ITEMS` (Bloque 1).
- Produces:
  - `PERMISSIONS` incluye 3 grupos nuevos: `productos` (`productos.ver/crear/editar/archivar`), `categorias` (`categorias.gestionar`), `inventario` (`inventario.ver/entrada/salida/ajustar`). `PermissionKey` y `ALL_PERMISSION_KEYS` se amplían solos (derivados).
  - `AuditAction` unión + `LABELS` incluyen las 13 acciones nuevas del spec.
  - `NAV_ITEMS` incluye `{ href: '/productos', label: 'Productos', permiso: 'productos.ver' }`, `{ href: '/categorias', label: 'Categorías', permiso: 'categorias.gestionar' }`, `{ href: '/inventario', label: 'Inventario', permiso: 'inventario.ver' }`. El tipo de `NAV_ITEMS` gana un `badge?: 'stock'` opcional en el ítem de Inventario; `Sidebar` (Bloque 1) resolverá el número (Task 14 lo cablea; aquí sólo el marcador de tipo, sin romper `visibleNav`).

- [ ] **Step 1: Ampliar `rbac.test.ts`**

Añadir:
```ts
it('incluye las claves del Bloque 2', () => {
  for (const k of [
    'productos.ver','productos.crear','productos.editar','productos.archivar',
    'categorias.gestionar',
    'inventario.ver','inventario.entrada','inventario.salida','inventario.ajustar',
  ]) expect(ALL_PERMISSION_KEYS).toContain(k);
});
it('los grupos productos/categorias/inventario están en PERMISSIONS', () => {
  const modulos = PERMISSIONS.map((g) => g.modulo);
  expect(modulos).toEqual(expect.arrayContaining(['productos', 'categorias', 'inventario']));
});
```

- [ ] **Step 2: Añadir los 3 grupos a `PERMISSIONS` en `rbac.ts`** (mismo shape que los del Bloque 1: `{ modulo, label, permisos: [{ key, label }] }`). Labels en español (ver tabla del spec). No tocar `PermissionKey`/`ALL_PERMISSION_KEYS` (derivados).

- [ ] **Step 3: `audit.ts`** — añadir a `LABELS` las 13 claves con etiquetas:
```
'categorias.crear': 'Creación de categoría',
'categorias.editar': 'Edición de categoría',
'categorias.archivar': 'Archivado de categoría',
'categorias.restaurar': 'Restauración de categoría',
'productos.crear': 'Alta de producto',
'productos.editar': 'Edición de producto',
'productos.precio_cambiado': 'Cambio de precio',
'productos.archivar': 'Archivado de producto',
'productos.restaurar': 'Restauración de producto',
'productos.disponibilidad': 'Cambio de disponibilidad',
'productos.variante_agregada': 'Variante agregada',
'productos.variante_archivada': 'Variante archivada',
'inventario.movimiento': 'Movimiento de inventario',
```
Añadir esas 13 a la unión de tipo `AuditAction`. En `audit.itest.ts` añadir: `expect(actionLabel('inventario.movimiento')).toBe('Movimiento de inventario')` y que `KNOWN_ACTIONS` las contiene.

- [ ] **Step 4: `nav.ts` + `nav.test.ts`** — añadir los 3 ítems; test: `visibleNav(user(['productos.ver']))` incluye `/productos` y no `/inventario`; `visibleNav(user([]))` no incluye ninguno de los 3.

- [ ] **Step 5: Verificación + commit**

Run: `npm run typecheck && npm run lint && npm run test:unit && npm run test:integration && npm run build`
```bash
git add -A
git commit -m "feat: permisos, acciones de auditoría y navegación del Bloque 2"
```

---

## Task 3: `lib/taxes.ts` + helpers puros de cálculo

**Files:**
- Create: `src/lib/taxes.ts`, `src/lib/taxes.itest.ts`
- Create: `src/lib/inventory/stock-calc.ts`, `src/lib/inventory/stock-calc.test.ts`
- Create: `src/lib/catalog/category-depth.ts`, `src/lib/catalog/category-depth.test.ts`

**Interfaces:**
- Produces:
  - `taxes.ts`: `getTaxRates(): Promise<{ id:string; nombre:string; tasa:number; esDefault:boolean }[]>` (activas, default primero); `getDefaultTaxRate(): Promise<{ id:string; nombre:string; tasa:number }>` (la `esDefault`; si no hay, la primera activa; si no hay ninguna → `throw new Error('No hay tasas de impuesto configuradas')`); `precioConImpuesto(base: number, tasa: number): number` — `Math.round(base * (1 + tasa) * 100) / 100`.
  - `stock-calc.ts`: `computeStock(tipo: 'ENTRADA'|'SALIDA'|'AJUSTE', stockPrevio: number, valor: number): { stockNuevo: number; delta: number }` — ENTRADA `{ stockNuevo: prev+valor, delta: +valor }`; SALIDA `{ stockNuevo: prev-valor, delta: -valor }`; AJUSTE `{ stockNuevo: valor, delta: valor-prev }`. NO valida negativos (eso es responsabilidad de `recordMovement`); es aritmética pura.
  - `category-depth.ts`: `assertParentIsRoot(parent: { parentId: string | null } | null): void` — `throw new ValidationError({ parentId: '...' })` si `parent === null` o `parent.parentId !== null`. `canHaveChildren(cat: { parentId: string | null }): boolean` = `cat.parentId === null`.

- [ ] **Step 1: Tests unit (fallan)** — `stock-calc.test.ts` (los 3 tipos, incl. `AJUSTE` de 5→2 da `delta:-3` y de 2→8 da `delta:+6`); `category-depth.test.ts` (`assertParentIsRoot(null)` lanza, `{parentId:null}` pasa, `{parentId:'x'}` lanza; `canHaveChildren`); `precioConImpuesto` en `taxes.itest.ts` como unit-style (`precioConImpuesto(100, 0.16) === 116`, `precioConImpuesto(9.99, 0.16) === 11.59`).

- [ ] **Step 2: Test integración `taxes.itest.ts` (falla)** — con el seed: `getTaxRates()` devuelve 2, default primero; `getDefaultTaxRate().nombre === 'IVA 16%'` y `tasa === 0.16`.

- [ ] **Step 3: Implementar los 3 módulos.** `getTaxRates`/`getDefaultTaxRate` mapean `Number(row.tasa)`.

- [ ] **Step 4: Verificación + commit**

```bash
npm run typecheck && npm run lint && npm run test:unit && npm run test:integration && npm run build
git add -A && git commit -m "feat: módulo de tasas de impuesto y helpers puros de stock/categorías"
```

---

## Task 4: Esquemas de validación Zod

**Files:**
- Create: `src/lib/validation/product.ts` (+ `.test.ts`), `src/lib/validation/category.ts` (+ `.test.ts`), `src/lib/validation/movement.ts` (+ `.test.ts`)

**Interfaces:**
- Produces (Zod 4; `z.coerce.number()` para numéricos que vienen de `FormData`; `.check()` para reglas cruzadas):
  - `product.ts`:
    - `variantInputSchema` = `{ nombre?: string(trim).optional(), sku?: string(trim).optional().or(literal('')).transform(v=>v||null), codigoBarras?: idem, precioVenta: coerce.number().min(0), precioCompra: coerce.number().min(0).default(0), stockMinimo: coerce.number().int().min(0).default(0), stockInicial: coerce.number().int().min(0).default(0) }`.
    - `createProductSchema` = `{ nombre: string(trim).min(2), descripcion?: string(trim).max(500).optional().or(literal('')).transform(v=>v||null), categoryId?: string.optional().or(literal('')).transform(v=>v||null), taxRateId: string.min(1), tipo: enum(['SIMPLE','CON_VARIANTES']), imagenUrl?: (placeholder — acepta string|null), variantes: array(variantInputSchema).min(1) }` + `.check()`: si `tipo==='SIMPLE'` ⇒ `variantes.length === 1` y `variantes[0].nombre` vacío/ausente; si `CON_VARIANTES` ⇒ `variantes.length >= 2`, todos con `nombre` no vacío, y nombres únicos entre sí (issue en `variantes`).
    - `updateProductSchema` = `{ id, nombre, descripcion?, categoryId?, taxRateId, imagenUrl? }`.
    - `editVariantSchema` = `{ id, nombre?, sku?, codigoBarras?, precioVenta: coerce.number().min(0), precioCompra: coerce.number().min(0), stockMinimo: coerce.number().int().min(0), disponible: coerce.boolean() }`.
    - Tipos inferidos exportados.
  - `category.ts`: `createCategorySchema` = `{ nombre: string(trim).min(2), parentId?: string.optional().or(literal('')).transform(v=>v||null) }`; `updateCategorySchema` = `{ id, nombre, parentId? }`.
  - `movement.ts`: `movementSchema` = `z.object({ variantId: string.min(1), tipo: enum(['ENTRADA','SALIDA','AJUSTE']), valor: coerce.number().int(), motivo: string(trim).min(1,'El motivo es obligatorio'), costoUnitario: coerce.number().min(0).optional() }).check(ctx => { const {tipo,valor,costoUnitario}=ctx.value; if ((tipo==='ENTRADA'||tipo==='SALIDA') && valor<=0) issue en 'valor' ('debe ser mayor que 0'); if (tipo==='AJUSTE' && valor<0) issue en 'valor' ('no puede ser negativo'); if (tipo!=='ENTRADA' && costoUnitario!=null) issue en 'costoUnitario' ('solo aplica a entradas'); })`. (`valor` = cantidad para ENTRADA/SALIDA, stock objetivo para AJUSTE.)

- [ ] **Step 1: Tests (fallan)** — casos válidos e inválidos por esquema. En especial `movementSchema`: ENTRADA `valor:0` → error en `valor`; AJUSTE `valor:-1` → error; AJUSTE `valor:0` → OK; SALIDA con `costoUnitario` → error; `motivo:''` → error. `createProductSchema`: SIMPLE con 2 variantes → error; CON_VARIANTES con nombres repetidos → error; CON_VARIANTES con 1 variante → error.

- [ ] **Step 2: Implementar los 3 esquemas.**

- [ ] **Step 3: Verificación + commit**

```bash
npm run typecheck && npm run lint && npm run test:unit && npm run test:integration && npm run build
git add -A && git commit -m "feat: esquemas de validación de productos, categorías y movimientos"
```

---

## Task 5: `lib/inventory/movements.ts` — `recordMovement` (núcleo)

**Files:**
- Create: `src/lib/inventory/movements.ts`, `src/lib/inventory/movements.itest.ts`

**Interfaces:**
- Consumes: `db` (T1), `computeStock` (T3), `logActivity` (T2), `ValidationError` (B1), `invalidateStockAlertsCache` (T6 — importa perezosamente o expórtalo desde `stock.ts` que se crea en T6; para T5, define un no-op local si T6 aún no existe y sustitúyelo en T6). Ruling: T5 crea también `src/lib/inventory/stock.ts` mínimo con `export function invalidateStockAlertsCache(){}` para no bloquear; T6 lo completa.
- Produces:
  - `type MovementInput = { variantId: string; tipo: 'ENTRADA'|'SALIDA'|'AJUSTE'; valor: number; motivo: string; costoUnitario?: number | null; actorId: string | null; ip?: string | null; referenciaTipo?: string; referenciaId?: string }`.
  - `type MovementResult = { movementId: string; stockPrevio: number; stockNuevo: number; delta: number }`.
  - `recordMovement(input: MovementInput, tx?: Prisma.TransactionClient): Promise<MovementResult>`.

- [ ] **Step 1: Escribir `movements.itest.ts` (falla)**

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '@/lib/db';
import { recordMovement } from './movements';
import { ValidationError } from '@/lib/errors';

async function seedVariant(stock = 0, precioCompra = 0) {
  const tax = await db.taxRate.findFirstOrThrow({ where: { esDefault: true } });
  const p = await db.product.create({
    data: {
      nombre: `P-${Math.random()}`, taxRateId: tax.id, tipo: 'SIMPLE',
      variants: { create: { esDefault: true, precioVenta: 10, precioCompra, stock } },
    },
    include: { variants: true },
  });
  return p.variants[0];
}

beforeEach(async () => {
  await db.inventoryMovement.deleteMany();
  await db.activityLog.deleteMany();
  await db.productVariant.deleteMany();
  await db.product.deleteMany();
});

describe('recordMovement', () => {
  it('ENTRADA suma stock y registra el movimiento + auditoría', async () => {
    const v = await seedVariant(0);
    const r = await recordMovement({ variantId: v.id, tipo: 'ENTRADA', valor: 10, motivo: 'compra', actorId: null });
    expect(r).toMatchObject({ stockPrevio: 0, stockNuevo: 10, delta: 10 });
    const after = await db.productVariant.findUniqueOrThrow({ where: { id: v.id } });
    expect(after.stock).toBe(10);
    const mov = await db.inventoryMovement.findUniqueOrThrow({ where: { id: r.movementId } });
    expect(mov).toMatchObject({ tipo: 'ENTRADA', cantidad: 10, stockPrevio: 0, stockNuevo: 10, motivo: 'compra' });
    const log = await db.activityLog.findFirstOrThrow({ where: { accion: 'inventario.movimiento' } });
    expect(log.metadata).toMatchObject({ tipo: 'ENTRADA', delta: 10, stockPrevio: 0, stockNuevo: 10 });
  });

  it('ENTRADA con costoUnitario actualiza precioCompra', async () => {
    const v = await seedVariant(0, 5);
    await recordMovement({ variantId: v.id, tipo: 'ENTRADA', valor: 3, motivo: 'x', costoUnitario: 7.5, actorId: null });
    const after = await db.productVariant.findUniqueOrThrow({ where: { id: v.id } });
    expect(Number(after.precioCompra)).toBe(7.5);
  });

  it('SALIDA resta stock', async () => {
    const v = await seedVariant(10);
    const r = await recordMovement({ variantId: v.id, tipo: 'SALIDA', valor: 4, motivo: 'merma', actorId: null });
    expect(r).toMatchObject({ stockPrevio: 10, stockNuevo: 6, delta: -4 });
    const mov = await db.inventoryMovement.findUniqueOrThrow({ where: { id: r.movementId } });
    expect(mov.cantidad).toBe(-4);
  });

  it('SALIDA que dejaría stock negativo se rechaza sin efectos', async () => {
    const v = await seedVariant(3);
    await expect(recordMovement({ variantId: v.id, tipo: 'SALIDA', valor: 5, motivo: 'x', actorId: null }))
      .rejects.toBeInstanceOf(ValidationError);
    const after = await db.productVariant.findUniqueOrThrow({ where: { id: v.id } });
    expect(after.stock).toBe(3);
    expect(await db.inventoryMovement.count()).toBe(0);
  });

  it('AJUSTE fija el stock al objetivo y guarda el delta', async () => {
    const v = await seedVariant(5);
    const r = await recordMovement({ variantId: v.id, tipo: 'AJUSTE', valor: 2, motivo: 'recuento', actorId: null });
    expect(r).toMatchObject({ stockPrevio: 5, stockNuevo: 2, delta: -3 });
    const mov = await db.inventoryMovement.findUniqueOrThrow({ where: { id: r.movementId } });
    expect(mov).toMatchObject({ tipo: 'AJUSTE', cantidad: -3, stockPrevio: 5, stockNuevo: 2 });
  });

  it('AJUSTE a un objetivo negativo se rechaza', async () => {
    const v = await seedVariant(5);
    await expect(recordMovement({ variantId: v.id, tipo: 'AJUSTE', valor: -1, motivo: 'x', actorId: null }))
      .rejects.toBeInstanceOf(ValidationError);
  });

  it('rechaza movimientos sobre una variante archivada', async () => {
    const v = await seedVariant(1);
    await db.productVariant.update({ where: { id: v.id }, data: { archivada: true } });
    await expect(recordMovement({ variantId: v.id, tipo: 'ENTRADA', valor: 1, motivo: 'x', actorId: null }))
      .rejects.toBeInstanceOf(ValidationError);
  });

  it('respeta una tx externa que hace rollback', async () => {
    const v = await seedVariant(0);
    await db.$transaction(async (tx) => {
      await recordMovement({ variantId: v.id, tipo: 'ENTRADA', valor: 9, motivo: 'x', actorId: null }, tx);
      throw new Error('rollback');
    }).catch(() => {});
    const after = await db.productVariant.findUniqueOrThrow({ where: { id: v.id } });
    expect(after.stock).toBe(0);
    expect(await db.inventoryMovement.count()).toBe(0);
  });

  it('dos movimientos concurrentes sobre la misma variante no se pisan (FOR UPDATE)', async () => {
    const v = await seedVariant(3);
    await Promise.all([
      recordMovement({ variantId: v.id, tipo: 'ENTRADA', valor: 10, motivo: 'a', actorId: null }),
      recordMovement({ variantId: v.id, tipo: 'SALIDA', valor: 5, motivo: 'b', actorId: null }),
    ]);
    const after = await db.productVariant.findUniqueOrThrow({ where: { id: v.id } });
    expect(after.stock).toBe(8); // 3 +10 -5, en cualquier orden
    expect(await db.inventoryMovement.count()).toBe(2);
  });
});
```

- [ ] **Step 2: Ejecutar y ver fallar**

Run: `npm run test:integration -- movements`
Expected: FAIL (módulo inexistente).

- [ ] **Step 3: Implementar `src/lib/inventory/movements.ts`**

```ts
import type { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { computeStock } from './stock-calc';
import { logActivity } from '@/lib/audit';
import { ValidationError } from '@/lib/errors';
import { invalidateStockAlertsCache } from './stock';

export type MovementInput = {
  variantId: string;
  tipo: 'ENTRADA' | 'SALIDA' | 'AJUSTE';
  valor: number;
  motivo: string;
  costoUnitario?: number | null;
  actorId: string | null;
  ip?: string | null;
  referenciaTipo?: string;
  referenciaId?: string;
};

export type MovementResult = {
  movementId: string;
  stockPrevio: number;
  stockNuevo: number;
  delta: number;
};

async function run(tx: Prisma.TransactionClient, input: MovementInput): Promise<MovementResult> {
  const motivo = input.motivo.trim();
  if (!motivo) throw new ValidationError({ motivo: 'El motivo es obligatorio.' });
  if ((input.tipo === 'ENTRADA' || input.tipo === 'SALIDA') && (!Number.isInteger(input.valor) || input.valor <= 0))
    throw new ValidationError({ valor: 'La cantidad debe ser un entero mayor que 0.' });
  if (input.tipo === 'AJUSTE' && (!Number.isInteger(input.valor) || input.valor < 0))
    throw new ValidationError({ valor: 'El stock objetivo no puede ser negativo.' });

  // Bloqueo de fila: serializa movimientos concurrentes sobre la misma variante.
  const locked = await tx.$queryRaw<{ id: string; stock: number; archivada: boolean }[]>`
    SELECT v.id, v.stock, (v.archivada OR p.archivado) AS archivada
    FROM "ProductVariant" v JOIN "Product" p ON p.id = v."productId"
    WHERE v.id = ${input.variantId}
    FOR UPDATE OF v`;
  const row = locked[0];
  if (!row) throw new ValidationError({ variantId: 'La variante no existe.' });
  if (row.archivada) throw new ValidationError({ variantId: 'La variante o su producto están archivados.' });

  const stockPrevio = Number(row.stock);
  const { stockNuevo, delta } = computeStock(input.tipo, stockPrevio, input.valor);
  if (stockNuevo < 0)
    throw new ValidationError({ valor: `Stock insuficiente: disponible ${stockPrevio}.` });

  await tx.productVariant.update({
    where: { id: input.variantId },
    data: {
      stock: stockNuevo,
      ...(input.tipo === 'ENTRADA' && input.costoUnitario != null
        ? { precioCompra: input.costoUnitario }
        : {}),
    },
  });

  const mov = await tx.inventoryMovement.create({
    data: {
      variantId: input.variantId,
      tipo: input.tipo,
      cantidad: delta,
      stockPrevio,
      stockNuevo,
      costoUnitario: input.tipo === 'ENTRADA' ? (input.costoUnitario ?? null) : null,
      motivo,
      referenciaTipo: input.referenciaTipo ?? null,
      referenciaId: input.referenciaId ?? null,
      actorId: input.actorId,
    },
  });

  await logActivity(
    {
      actorId: input.actorId,
      accion: 'inventario.movimiento',
      entidad: 'ProductVariant',
      entidadId: input.variantId,
      metadata: { tipo: input.tipo, delta, stockPrevio, stockNuevo, motivo, costoUnitario: input.costoUnitario ?? null },
      ip: input.ip ?? null,
    },
    tx,
  );

  return { movementId: mov.id, stockPrevio, stockNuevo, delta };
}

export async function recordMovement(
  input: MovementInput,
  tx?: Prisma.TransactionClient,
): Promise<MovementResult> {
  const result = tx ? await run(tx, input) : await db.$transaction((t) => run(t, input));
  invalidateStockAlertsCache();
  return result;
}
```

- [ ] **Step 4: Ejecutar y ver pasar**

Run: `npm run test:integration -- movements` → PASS (todos, incl. concurrencia y rollback).

- [ ] **Step 5: Verificación + commit**

```bash
npm run typecheck && npm run lint && npm run test:unit && npm run test:integration && npm run build
git add -A && git commit -m "feat: recordMovement — único escritor de stock, transaccional, con bloqueo de fila"
```

---

## Task 6: `lib/inventory/stock.ts` — alertas de stock bajo

**Files:**
- Modify: `src/lib/inventory/stock.ts` (T5 lo dejó como stub con `invalidateStockAlertsCache`)
- Create: `src/lib/inventory/stock.itest.ts`

**Interfaces:**
- Produces:
  - `type LowStockRow = { variantId:string; productId:string; productoNombre:string; varianteNombre:string|null; stock:number; stockMinimo:number; deficit:number }`.
  - `lowStockVariants({ page=1, pageSize=50 }): Promise<{ rows: LowStockRow[]; total: number }>` — variantes con `stockMinimo > 0 && stock <= stockMinimo`, `!archivada`, `product.archivado === false`. Orden: `(stock - stockMinimo)` asc, luego `productoNombre`.
  - `stockAlertsCount(): Promise<number>` — cuenta lo anterior, con cache de módulo TTL 30 000 ms.
  - `invalidateStockAlertsCache(): void` — limpia el cache (llamado por `recordMovement`).

- [ ] **Step 1: `stock.itest.ts` (falla)** — 3 variantes: (`min 5, stock 5` → aparece, `deficit 0`), (`min 5, stock 6` → no), (`min 0, stock 0` → no). Una variante archivada con `min 5, stock 1` → no aparece. Producto archivado → no aparece. `stockAlertsCount()` = 1. Tras `recordMovement` que sube el stock por encima del mínimo + `invalidateStockAlertsCache()` implícito → `stockAlertsCount()` refleja el cambio (llamar directo, el cache se invalidó).

- [ ] **Step 2: Implementar.** `lowStockVariants` con `db.productVariant.findMany({ where: { archivada:false, stockMinimo: { gt: 0 }, product: { archivado:false } }, include: { product: { select:{ nombre:true, id:true } } } })` y filtrar `stock <= stockMinimo` + `orderBy` en memoria por `deficit` (o `Prisma.sql` raw si el volumen lo exige — a este tamaño, en memoria está bien; documenta el límite). Cache: `let cache: { value:number; at:number } | null`.

- [ ] **Step 3: Verificación + commit**

```bash
npm run typecheck && npm run lint && npm run test:unit && npm run test:integration && npm run build
git add -A && git commit -m "feat: alertas de stock bajo (vista + contador con cache)"
```

---

## Task 7: `lib/inventory/query.ts` — historial de movimientos

**Files:**
- Create: `src/lib/inventory/query.ts`, `src/lib/inventory/query.itest.ts`

**Interfaces:**
- Consumes: `db`, `actionLabel`-style etiqueta local para `MovementType` (`ENTRADA→'Entrada'`, etc.), `parseDateParam` (`@/lib/activity/query`).
- Produces:
  - `type MovementRow = { id:string; createdAt:Date; productoNombre:string; varianteNombre:string|null; tipo:string; tipoLabel:string; cantidad:number; stockPrevio:number; stockNuevo:number; motivo:string; actorNombre:string|null; costoUnitario:number|null }`.
  - `listMovements(filtro: { variantId?:string; productId?:string; tipo?:string; desde?:Date; hasta?:Date; actorId?:string; page:number; pageSize:number }): Promise<{ rows: MovementRow[]; total:number }>` — `orderBy createdAt desc`, `include` variant→product y actor `{ select:{ nombre:true } }`, paginado.

- [ ] **Step 1: `query.itest.ts` (falla)** — crear 3 movimientos (ENTRADA, SALIDA, AJUSTE) sobre 2 variantes; `listMovements({ page:1, pageSize:2 })` devuelve 2 filas + `total:3`, orden desc; filtro `tipo:'AJUSTE'` → 1; filtro `productId` → los de ese producto; `tipoLabel` traducido; `actorNombre` poblado cuando hay actor.

- [ ] **Step 2: Implementar.**

- [ ] **Step 3: Verificación + commit**

```bash
npm run typecheck && npm run lint && npm run test:unit && npm run test:integration && npm run build
git add -A && git commit -m "feat: consulta paginada del historial de movimientos de inventario"
```

---

## Task 8: `lib/catalog/categories.ts`

**Files:**
- Create: `src/lib/catalog/categories.ts`, `src/lib/catalog/categories.itest.ts`

**Interfaces:**
- Consumes: `db`, `logActivity`, `ValidationError`, `assertParentIsRoot`/`canHaveChildren` (T3), `Prisma` P2002.
- Produces:
  - `createCategory(actorId:string, input:{ nombre:string; parentId:string|null }, ip:string|null): Promise<{ id:string }>` — si `parentId`: cargar el padre; `assertParentIsRoot(parent)`; si `parent.archivada` → `ValidationError`. P2002 en `@@unique([parentId,nombre])` → `ValidationError({ nombre:'Ya existe una categoría con ese nombre en ese nivel.' })`. Audita `categorias.crear` en la tx.
  - `updateCategory(actorId, id, input:{ nombre:string; parentId:string|null }, ip): Promise<void>` — si se intenta poner `parentId` no-null en una categoría que TIENE hijos → `ValidationError`. Si `parentId` no-null: `assertParentIsRoot` sobre el nuevo padre y que no sea sí misma. Audita `categorias.editar` `{ antes, despues }`.
  - `archiveCategory(actorId, id, ip): Promise<{ subcategoriasArchivadas:number; productosAfectados:number }>` — en una tx: marcar la categoría `archivada:true`; si es raíz, `updateMany` sus hijos a `archivada:true`; contar `productos` (no archivados) cuyo `categoryId` ∈ {la categoría} ∪ {sus subcategorías}. NO toca productos. Audita `categorias.archivar` con esos conteos. Idempotente (archivar una ya archivada no falla).
  - `restoreCategory(actorId, id, ip): Promise<void>` — sólo la categoría (no restaura hijos automáticamente). Si es subcategoría y su padre está archivado → `ValidationError('Restaura primero la categoría padre.')`. Audita `categorias.restaurar`.
  - `listCategoryTree({ incluirArchivadas=false }): Promise<CategoryNode[]>` — `CategoryNode = { id; nombre; archivada; productosCount; hijos: CategoryNode[] }`. `productosCount` = productos `archivado:false` con ese `categoryId` directo.
  - `productsInArchivedCategories({ page, pageSize }): Promise<{ rows:{ id:string; nombre:string; categoriaNombre:string }[]; total:number }>` — productos `archivado:false` cuyo `category.archivada === true`.

- [ ] **Step 1: `categories.itest.ts` (falla)** — cubre: crear raíz; crear subcategoría (padre raíz OK); crear subcategoría de una subcategoría → `ValidationError`; nombre duplicado en el mismo nivel → `ValidationError`, distinto nivel OK; `updateCategory` convertir en sub una categoría con hijos → `ValidationError`; `archiveCategory` raíz con 2 subcategorías y 3 productos → devuelve `{ subcategoriasArchivadas:2, productosAfectados:3 }`, productos conservan `categoryId`, subcategorías quedan `archivada:true`, audita con los conteos; `restoreCategory` de una sub cuyo padre sigue archivado → `ValidationError`; `listCategoryTree` estructura + `productosCount`; `productsInArchivedCategories` los lista.

- [ ] **Step 2: Implementar.**

- [ ] **Step 3: Verificación + commit**

```bash
npm run typecheck && npm run lint && npm run test:unit && npm run test:integration && npm run build
git add -A && git commit -m "feat: servicio de categorías (2 niveles, archivado en cascada, sin tocar productos)"
```

---

## Task 9: `lib/catalog/search.ts` — `searchProducts`

**Files:**
- Create: `src/lib/catalog/search.ts`, `src/lib/catalog/search.itest.ts`

**Interfaces:**
- Consumes: `db`, `precioConImpuesto` (T3).
- Produces:
  - `type SearchHit = { variantId:string; productId:string; productoNombre:string; varianteNombre:string|null; sku:string|null; codigoBarras:string|null; precioVenta:number; precioConImpuesto:number; stock:number; disponible:boolean; exactBarcode:boolean }`.
  - `searchProducts(q: string, opts?: { incluirArchivados?:boolean; soloDisponibles?:boolean; limit?:number }): Promise<SearchHit[]>`:
    - `q.trim()` vacío → `[]`.
    - `where`: `OR: [{ product: { nombre: { contains: q, mode:'insensitive' } } }, { sku: { equals: q } }, { sku: { startsWith: q } }, { codigoBarras: { equals: q } }]`.
    - salvo `incluirArchivados`: `archivada:false`, `product: { archivado:false }`.
    - `soloDisponibles`: además `disponible:true`.
    - `include: { product: { include: { taxRate: true } } }`, `take: (limit ?? 20) + <margen para reordenar>` (p.ej. `limit*3`, cap 60), luego ordenar en memoria: `exactBarcode` primero, luego SKU que hace `startsWith(q)`, luego por `productoNombre`; recortar a `limit`.
    - `precioConImpuesto = precioConImpuesto(Number(v.precioVenta), Number(v.product.taxRate.tasa))`.
    - `exactBarcode = v.codigoBarras === q`.

- [ ] **Step 1: `search.itest.ts` (falla)** — sembrar: producto "Coca Cola 600ml" con variante `sku:'CC-600'`, `codigoBarras:'7501055300019'`; producto "Cacahuates" `sku:'CAC-1'`. Casos: `searchProducts('coca')` → encuentra por nombre; `searchProducts('CC-600')` → por SKU exacto; `searchProducts('CC-')` → por prefijo SKU; `searchProducts('7501055300019')` → `exactBarcode:true` y primero en la lista aunque haya otros matches; `searchProducts('')` → `[]`; producto archivado no aparece salvo `incluirArchivados:true`; variante no disponible se excluye con `soloDisponibles:true`; `precioConImpuesto` correcto.

- [ ] **Step 2: Implementar.**

- [ ] **Step 3: Verificación + commit**

```bash
npm run typecheck && npm run lint && npm run test:unit && npm run test:integration && npm run build
git add -A && git commit -m "feat: búsqueda de productos por nombre/SKU/código de barras (reutilizable por el POS)"
```

---

## Task 10: `lib/catalog/products.ts`

**Files:**
- Create: `src/lib/catalog/products.ts`, `src/lib/catalog/products.itest.ts`

**Interfaces:**
- Consumes: `db`, `recordMovement` (T5), `logActivity`, `ValidationError`, `precioConImpuesto` (T3), `Prisma` P2002, tipos de `@/lib/validation/product` (T4).
- Produces:
  - `createProduct(actorId:string, input: CreateProductInput, ip:string|null): Promise<{ productId:string; variantIds:string[] }>`:
    - Validación de forma ya la hizo Zod en la action; aquí re-chequea invariantes de negocio que Zod no puede (unicidad contra BD).
    - En `db.$transaction`:
      1. Crea `Product { nombre, descripcion, categoryId, taxRateId, tipo, imagenUrl, createdById: actorId }`.
      2. Para cada `variante` del input: crea `ProductVariant { productId, nombre: tipo==='SIMPLE' ? null : v.nombre, esDefault: tipo==='SIMPLE', sku: v.sku, codigoBarras: v.codigoBarras, precioVenta: v.precioVenta, precioCompra: v.precioCompra, stockMinimo: v.stockMinimo, stock: 0 }`. Captura P2002 → `ValidationError({ [`variantes.${i}.sku`|`.codigoBarras`]: 'Ya está en uso.' })`.
      3. Para cada variante con `v.stockInicial > 0`: `await recordMovement({ variantId, tipo:'ENTRADA', valor: v.stockInicial, motivo:'Alta de producto', costoUnitario: v.precioCompra || null, actorId }, tx)`.
      4. `logActivity('productos.crear', { nombre, tipo, categoryId, nVariantes: input.variantes.length }, tx)`.
    - Devuelve ids.
  - `updateProduct(actorId, id, input: UpdateProductInput, ip): Promise<void>` — carga el producto (con `taxRate`); `db.$transaction`: `update` de `{ nombre, descripcion, categoryId, taxRateId, imagenUrl }`; `logActivity('productos.editar', { antes:{...campos cambiados}, despues:{...} }, tx)` (incluye `taxRate` antes/después si cambió). No toca variantes.
  - `setProductDisponible(actorId, id, disponible:boolean, ip): Promise<void>` — `updateMany` de todas las variantes del producto `{ disponible }`; audita `productos.disponibilidad` `{ productId:id, disponible }`.
  - `archiveProduct(actorId, id, ip): Promise<void>` — `db.$transaction`: `product.update {archivado:true}` + `productVariant.updateMany { where:{productId:id}, data:{archivada:true} }`; audita `productos.archivar`.
  - `restoreProduct(actorId, id, ip): Promise<void>` — inverso; audita `productos.restaurar`.
  - `getProduct(id): Promise<ProductDetail | null>` — producto + `taxRate` + `variants` (todas, con flag `archivada`) cada una con `precioConImpuesto` y sus últimos 10 `movements` (desc). `null` si no existe.
  - `listProducts(filtro: { q?:string; categoryId?:string; estado?:'activos'|'archivados'|'todos'; soloStockBajo?:boolean; page:number; pageSize:number }): Promise<{ rows: ProductListRow[]; total:number }>`:
    - `ProductListRow = { id; nombre; categoriaNombre:string|null; nVariantes:number; precioMin:number; precioMax:number; stockTotal:number; estado:'activo'|'no_disponible'|'agotado'|'archivado' }`.
    - `estado`: `archivado` si `product.archivado`; si no, `agotado` si `stockTotal <= 0`; si no, `no_disponible` si TODAS las variantes no archivadas tienen `disponible:false`; si no, `activo`.
    - `estado` filtro: `activos` → `archivado:false`; `archivados` → `archivado:true`; `todos` → sin filtro.
    - `q` → resolver a un set de `productId` vía `searchProducts(q, { incluirArchivados:true, limit:200 })` y `where.id.in`.
    - `soloStockBajo` → sólo productos que tienen ≥1 variante con `stockMinimo>0 && stock<=stockMinimo`.
    - `categoryId` → `where.categoryId` (incluye si el producto está en esa categoría directa; NO expande a subcategorías en este bloque — documenta).

- [ ] **Step 1: `products.itest.ts` (falla)** — cubre:
  - `createProduct` SIMPLE con `stockInicial:20` → 1 variante `esDefault:true, nombre:null`, `stock:20`, existe un `InventoryMovement` ENTRADA "Alta de producto" con `stockNuevo:20`, audita `productos.crear`.
  - `createProduct` CON_VARIANTES con 2 variantes, una con `stockInicial:5` → 2 variantes con nombre, 1 movimiento inicial.
  - SKU duplicado entre el input y una variante existente → `ValidationError` con la clave de campo correcta; no se crea nada (rollback).
  - `updateProduct` cambia `taxRateId` → auditoría refleja antes/después.
  - `archiveProduct` → `product.archivado` y todas las variantes `archivada:true`; `restoreProduct` revierte; los `InventoryMovement` siguen ahí.
  - `getProduct` incluye `precioConImpuesto` y movimientos.
  - `listProducts`: `estado` derivado (crear uno archivado, uno con stock 0, uno con todas las variantes no disponibles, uno normal → 4 estados); filtro `q` por nombre; `soloStockBajo`.
  - `setProductDisponible(false)` → todas las variantes `disponible:false`; `listProducts` lo marca `no_disponible`.

- [ ] **Step 2: Implementar.**

- [ ] **Step 3: Verificación + commit**

```bash
npm run typecheck && npm run lint && npm run test:unit && npm run test:integration && npm run build
git add -A && git commit -m "feat: servicio de productos (alta simple/con variantes, edición, archivado, listado con estado derivado)"
```

---

## Task 11: `lib/catalog/variants.ts`

**Files:**
- Create: `src/lib/catalog/variants.ts`, `src/lib/catalog/variants.itest.ts`

**Interfaces:**
- Consumes: `db`, `recordMovement` (T5), `logActivity`, `ValidationError`, `Prisma` P2002, `EditVariantInput` (T4).
- Produces:
  - `editVariant(actorId, variantId, input: EditVariantInput, ip): Promise<void>` — carga la variante; `db.$transaction`: `update { nombre, sku, codigoBarras, precioVenta, precioCompra, stockMinimo, disponible }`. Si `precioVenta` o `precioCompra` cambiaron → `logActivity('productos.precio_cambiado', { variantId, antes:{ precioVenta, precioCompra }, despues:{...} }, tx)`; si cambió algo más → `logActivity('productos.editar', { variantId, antes, despues }, tx)`. **Nunca** toca `stock`. P2002 → `ValidationError`.
  - `addVariant(actorId, productId, input: VariantInput & { nombre: string }, ip): Promise<{ variantId:string }>` — el producto debe ser `CON_VARIANTES` (si es `SIMPLE` → `ValidationError('Convierte el producto a "con variantes" primero.')`). `nombre` obligatorio y no duplicado entre las variantes activas del producto. Crea la variante; si `stockInicial>0` → `recordMovement ENTRADA` en la tx. Audita `productos.variante_agregada`.
  - `convertToVariants(actorId, productId, input: { defaultNombre:string; nuevas: (VariantInput & { nombre:string })[] }, ip): Promise<void>` — el producto debe ser `SIMPLE`. En tx: `product.update { tipo:'CON_VARIANTES' }`; la variante `esDefault` pasa a `{ esDefault:false, nombre: input.defaultNombre }`; se crean las `nuevas` (cada `stockInicial>0` → `recordMovement`). Audita `productos.editar` `{ conversion:'SIMPLE→CON_VARIANTES', nuevasVariantes: input.nuevas.length }`.
  - `archiveVariant(actorId, variantId, ip): Promise<void>` — si es la última variante **activa** (`archivada:false`) de su producto → `ValidationError('Es la única variante activa; archiva el producto entero.')`. Si no, `update { archivada:true }`; audita `productos.variante_archivada`.
  - `setVariantDisponible(actorId, variantId, disponible:boolean, ip): Promise<void>` — audita `productos.disponibilidad` `{ variantId, disponible }`.

- [ ] **Step 1: `variants.itest.ts` (falla)** — cubre: `editVariant` cambia precio → audita `productos.precio_cambiado`; cambia sólo `stockMinimo` → audita `productos.editar`, `stock` intacto; SKU duplicado → `ValidationError`; `addVariant` sobre un `SIMPLE` → `ValidationError`; sobre `CON_VARIANTES` con `stockInicial` → crea + movimiento; nombre duplicado → `ValidationError`; `convertToVariants` de `SIMPLE` → `tipo` pasa a `CON_VARIANTES`, la default recibe nombre y `esDefault:false`, se crean las nuevas; `archiveVariant` de la última activa → `ValidationError`; de una de varias → OK.

- [ ] **Step 2: Implementar.**

- [ ] **Step 3: Verificación + commit**

```bash
npm run typecheck && npm run lint && npm run test:unit && npm run test:integration && npm run build
git add -A && git commit -m "feat: servicio de variantes (editar precios, añadir, convertir, archivar)"
```

---

## Task 12: UI de Categorías

**Files:**
- Create: `src/app/(app)/categorias/page.tsx`, `actions.ts`, `CategoryTree.tsx`, `CategoryForm.tsx`, `sin-categoria-activa/page.tsx`

**Interfaces:**
- Consumes: `listCategoryTree`/`createCategory`/`updateCategory`/`archiveCategory`/`restoreCategory`/`productsInArchivedCategories` (T8), `requirePermission`, `PermissionGate`, `DataTable`, `Pagination`, `Field`, `FormState`, `updateProduct` (T10, para recategorizar).

**Patrón (idéntico al de `/admin/roles` del Bloque 1):**
- `actions.ts` — `'use server'`; `crearCategoriaAction`/`editarCategoriaAction`/`archivarCategoriaAction`/`restaurarCategoriaAction`/`recategorizarProductoAction` — cada una: `await requirePermission('categorias.gestionar')` primera sentencia (la de recategorizar usa `productos.editar`); Zod (`createCategorySchema`/`updateCategorySchema`); llama al servicio; `catch (ValidationError)` → `FormState`; `revalidatePath('/categorias')`. `archivarCategoriaAction` devuelve `{ ok:true, subcategoriasArchivadas, productosAfectados }` para el aviso.
- `page.tsx` — server; `await requirePermission('categorias.gestionar')`; `dynamic='force-dynamic'`; `listCategoryTree({ incluirArchivadas: searchParams.archivadas === '1' })`; render `<CategoryTree>` + botón "Nueva categoría raíz"; enlace a `/categorias/sin-categoria-activa` con el conteo si `> 0`.
- `CategoryTree.tsx` — client; muestra raíces y sus hijos (indentado), `productosCount` por nodo, badge "Archivada" en gris; por nodo: "Editar", "Añadir subcategoría" (sólo en raíces no archivadas), "Archivar"/"Restaurar". Al archivar una raíz: `useActionState` → si `state.productosAfectados > 0`, mostrar aviso "N subcategorías archivadas · M productos quedaron bajo una categoría archivada; conservan su categoría. Recategorízalos en «Productos sin categoría activa»." con enlace.
- `CategoryForm.tsx` — client; `useActionState`; campos `nombre`, `parentId` (`<select>` de raíces no archivadas, sólo al crear/editar subcategoría). Reusable para crear/editar.
- `sin-categoria-activa/page.tsx` — server; `await requirePermission('categorias.gestionar')`; `productsInArchivedCategories({ page, pageSize:20 })`; `DataTable` (producto, categoría archivada actual, acción "Cambiar categoría" → un `<form>` con `<select>` de categorías activas → `recategorizarProductoAction`); `Pagination`.

- [ ] **Step 1: Implementar los 5 archivos** siguiendo el patrón. `redirect()` fuera de try/catch (aquí no hay redirects; las actions devuelven `FormState`).
- [ ] **Step 2: Verificar** — `npm run typecheck && npm run lint && npm run build`. Manual: `npm run db:start` (bg) + `npm run build && npm run start -p <libre>`; `curl -I /categorias` sin cookie → 307 `/login`. Kill + `db:stop`.
- [ ] **Step 3: Commit** — `feat: UI de categorías (árbol de 2 niveles, archivado con aviso, recategorización)`

---

## Task 13: UI de Productos

**Files:**
- Create: `src/app/(app)/productos/page.tsx`, `actions.ts`, `[id]/page.tsx`, `ProductForm.tsx`, `VariantEditor.tsx`, `ProductRow.tsx`

**Interfaces:**
- Consumes: `listProducts`/`getProduct`/`createProduct`/`updateProduct`/`archiveProduct`/`restoreProduct`/`setProductDisponible` (T10), `editVariant`/`addVariant`/`convertToVariants`/`archiveVariant`/`setVariantDisponible` (T11), `listCategoryTree` (T8), `getTaxRates` (T3), `createProductSchema`/`updateProductSchema`/`editVariantSchema` (T4), `requirePermission`, `PermissionGate`, `DataTable`, `Pagination`, `Field`, `FormState`.

**Patrón (como `/admin/usuarios` del Bloque 1):**
- `actions.ts` — `'use server'`; cada action con `await requirePermission('productos.<x>')` primera sentencia:
  - `crearProductoAction` (`productos.crear`) — parsea `createProductSchema` (con `variantes` como JSON en un hidden input o campos indexados; el form las serializa a JSON → un `z.preprocess`/`JSON.parse` en la action). `catch(ValidationError)` → `FormState`. Éxito → `redirect('/productos/' + productId)` (fuera de try/catch).
  - `editarProductoAction` (`productos.editar`), `archivarProductoAction`/`restaurarProductoAction` (`productos.archivar`), `disponibilidadProductoAction` (`productos.editar`).
  - `editarVarianteAction`/`agregarVarianteAction`/`convertirAVariantesAction`/`archivarVarianteAction`/`disponibilidadVarianteAction` — `productos.editar` (o `productos.archivar` para archivar variante).
  - Todas `revalidatePath('/productos')` y `revalidatePath('/productos/[id]', 'page')` donde aplique.
- `page.tsx` — server; `await requirePermission('productos.ver')`; `dynamic='force-dynamic'`; lee `searchParams` (`q`, `categoryId`, `estado`, `soloStockBajo`, `page`); `listProducts(...)`; `<DataTable>` (Nombre, Categoría, Nº variantes, Precio (rango `precioMin`–`precioMax`), Stock total, Estado como badge); filtros GET (buscador, `<select>` categoría de `listCategoryTree`, `<select>` estado, checkbox stock bajo); "Nuevo producto" en `<PermissionGate permiso="productos.crear">` → enlace a `/productos/nuevo` (o abre `ProductForm` en la misma página — a elección; si es página aparte, `/productos/nuevo/page.tsx` con `requirePermission('productos.crear')`). Filas → `/productos/[id]`.
- `[id]/page.tsx` — server; `await requirePermission('productos.ver')`; `getProduct(id)` → `notFound()` si null; muestra datos + `<ProductForm>` de edición (gated `productos.editar`); `<VariantEditor>` (tabla de variantes: nombre, SKU, código, precio venta, `precioConImpuesto` (sólo lectura), precio compra, stock (sólo lectura — "ajústalo desde Inventario"), stock mínimo, disponible; edición inline por variante → `editarVarianteAction`); si `tipo==='CON_VARIANTES'`: botón "Añadir variante"; si `SIMPLE`: botón "Convertir a producto con variantes" (pide nombre para la variante actual + al menos una nueva); botones archivar/restaurar producto (gated `productos.archivar`) con diálogo de confirmación; switch disponibilidad; sección "Últimos movimientos" por variante (de `getProduct`).
- `ProductForm.tsx` / `VariantEditor.tsx` / `ProductRow.tsx` — client; `useActionState`; el `ProductForm` de alta tiene el interruptor SIMPLE/CON_VARIANTES que muestra 1 fila de variante (sin nombre) o N filas (con nombre); `taxRateId` `<select>` de `getTaxRates()` con el default preseleccionado; `categoryId` `<select>` (opcional). Serializa las variantes a un hidden `<input name="variantes">` con `JSON.stringify`.

- [ ] **Step 1: Implementar los 6 (o 7 con `/nuevo`) archivos.**
- [ ] **Step 2: Verificar** — `typecheck && lint && build`. Manual: `curl -I /productos` sin cookie → 307.
- [ ] **Step 3: Commit** — `feat: UI de productos (listado con filtros, alta simple/variantes, editor de variantes, archivado)`

---

## Task 14: UI de Inventario (panel + stock bajo + badge)

**Files:**
- Create: `src/app/(app)/inventario/page.tsx`, `actions.ts`, `stock-bajo/page.tsx`
- Modify: `src/components/Sidebar.tsx` (resolver el badge de "Inventario")

**Interfaces:**
- Consumes: `lowStockVariants`/`stockAlertsCount` (T6), `listProducts`/`getProduct` (T10) o una consulta de stock dedicada, `requirePermission`, `DataTable`, `Pagination`, `visibleNav` (T2).

- [ ] **Step 1:**
  - `inventario/page.tsx` — server; `await requirePermission('inventario.ver')`; `dynamic='force-dynamic'`; panel con 3 tarjetas: nº variantes activas, nº agotadas (`stock<=0`), nº en stock bajo (`stockAlertsCount()`, enlace a `/inventario/stock-bajo`); tabla de stock actual (producto+variante, stock, mínimo, estado) con filtros `q`/`categoryId`/`soloAgotados`/`soloStockBajo`. Reutiliza `listProducts` expandido o una función `listStock` — si hace falta, añádela a `src/lib/inventory/query.ts` con su itest en esta tarea.
  - `stock-bajo/page.tsx` — server; `await requirePermission('inventario.ver')`; `lowStockVariants({ page, pageSize:50 })`; `DataTable` (producto+variante, stock, mínimo, déficit); enlace "Registrar movimiento" por fila → `/inventario/movimientos/nuevo?variantId=...`.
  - `Sidebar.tsx` — donde pinta el ítem de Inventario, si `item.badge === 'stock'` y el usuario tiene `inventario.ver`, resolver `await stockAlertsCount()` y pintar un badge si `> 0`. (Sidebar es server component en el Bloque 1 — mantenerlo así.)
- [ ] **Step 2: Verificar** — `typecheck && lint && build`; si añadiste `listStock`, su `*.itest.ts` verde.
- [ ] **Step 3: Commit** — `feat: UI de inventario (panel, stock bajo, badge en navegación)`

---

## Task 15: UI de Movimientos de inventario

**Files:**
- Create: `src/app/(app)/inventario/movimientos/page.tsx`, `nuevo/page.tsx`, `nuevo/MovementForm.tsx`, `export/route.ts`, `export/route.itest.ts`
- Modify: `src/app/(app)/inventario/actions.ts` (o crear `movimientos/actions.ts`)

**Interfaces:**
- Consumes: `listMovements` (T7), `recordMovement` (T5), `searchProducts` (T9), `movementSchema` (T4), `requirePermission`, `getClientIp`, `assertSameOrigin`, `DataTable`, `Pagination`, `Field`, `FormState`, `parseDateParam`.

- [ ] **Step 1:**
  - `registrarMovimientoAction(prev, formData)` — `'use server'`. Lee `tipo` primero; `await requirePermission(tipo === 'ENTRADA' ? 'inventario.entrada' : tipo === 'SALIDA' ? 'inventario.salida' : 'inventario.ajustar')` — **antes** de cualquier otra cosa. Valida `movementSchema`. `recordMovement({ ...parsed, actorId: user.id, ip: getClientIp(await headers()) })`. `catch(ValidationError)` → `FormState`. Éxito → `redirect('/inventario/movimientos')` (fuera de try/catch).
  - `movimientos/page.tsx` — server; `await requirePermission('inventario.ver')`; `dynamic='force-dynamic'`; `listMovements` con filtros de `searchParams` (`productId`, `tipo`, `desde`, `hasta`, `actorId`, `page`); `DataTable` (Fecha/hora, Producto·Variante, Tipo, Cantidad con signo, Stock previo→nuevo, Motivo, Usuario); `Pagination`; enlace "Registrar movimiento" (visible si el usuario tiene alguna de las 3 claves de movimiento); botón "Exportar CSV" → `<a href="/inventario/movimientos/export?<mismos filtros>">`.
  - `nuevo/page.tsx` — server; exige `requirePermission` de **al menos una** de `inventario.entrada`/`salida`/`ajustar` (intenta cada una en try/catch, si las 3 lanzan → re-lanza `ForbiddenError`); pasa a `MovementForm` la lista de tipos permitidos y el `variantId` de `searchParams` si viene.
  - `MovementForm.tsx` — client; `useActionState`; buscador de variante (input → llama una `route.ts` GET `/api/productos/buscar?q=` que envuelve `searchProducts` con `requirePermission('inventario.ver')`, o un server action de búsqueda; devuelve máx 10); `<select>` tipo (sólo los permitidos); campo "cantidad" (o "stock objetivo" si AJUSTE, con texto "actual: X → nuevo: Y" calculado en cliente); "motivo" obligatorio; "costo unitario" sólo si ENTRADA; resumen de confirmación antes de enviar.
  - `export/route.ts` — `runtime='nodejs'`; `try { await requirePermission('inventario.ver') } catch(ForbiddenError){ return 403 json }`; `listMovements` con `pageSize:5000, page:1` y los filtros; CSV con BOM `'﻿'`, cabecera `Fecha,Producto,Variante,Tipo,Cantidad,Stock previo,Stock nuevo,Motivo,Usuario,Costo unitario`, escape de comas/comillas (patrón `toCsv` del Bloque 1 — extrae/reutiliza el `esc` helper si es práctico); `Content-Disposition: attachment; filename="movimientos-<fecha>.csv"`.
  - `export/route.itest.ts` — 403 con sesión de Cajero sin `inventario.ver`... (Cajero SÍ tiene `inventario.ver` por el seed) → usa un rol sin él, p.ej. crea un usuario con un rol vacío; 200 + `text/csv` + contiene una fila esperada con sesión de Gerente.
- [ ] **Step 2: Verificar** — `typecheck && lint && test:integration -- movimientos/export && build`. Manual: `curl -I /inventario/movimientos` y `/inventario/movimientos/export` sin cookie → 307.
- [ ] **Step 3: Commit** — `feat: UI de movimientos de inventario (historial, registro con permiso por tipo, export CSV)`

---

## Task 16: Pruebas E2E

**Files:**
- Create: `e2e/productos-inventario.spec.ts`
- Modify: `e2e/helpers.ts` si hace falta un helper `loginComoAdmin` reutilizable (el Bloque 1 ya tiene `doSetup`/`login`).

**Interfaces:**
- Consumes: la app completa. El `globalSetup` de Playwright (Bloque 1) ya levanta `pos_e2e` con migraciones + seed (incluye ahora las tablas y el seed del Bloque 2).

- [ ] **Step 1: `e2e/productos-inventario.spec.ts`** (workers:1, ya configurado):
  - `test('alta de producto simple con stock inicial')` — `doSetup` (crea Admin) → ir a `/productos` → "Nuevo producto" → nombre "Agua 1L", tipo SIMPLE, precio 12, stock inicial 20, tasa por defecto → guardar → detalle muestra stock 20; volver a `/productos` → fila "Agua 1L" con stock 20 y estado "activo".
  - `test('registrar una entrada actualiza el stock y aparece en el historial')` — (continúa o recrea) → `/inventario/movimientos/nuevo` → buscar "Agua", tipo Entrada, cantidad 10, motivo "compra" → confirmar → `/inventario/movimientos` muestra la fila (Entrada, +10, 20→30); el detalle del producto muestra stock 30.
  - `test('un ajuste por debajo del mínimo lo lleva a Stock bajo con badge')` — editar la variante para `stockMinimo=5` → registrar Ajuste con objetivo 2 → `/inventario/stock-bajo` lista "Agua 1L"; el ítem "Inventario" del sidebar muestra un badge.
  - `test('un rol sin permisos de catálogo no ve las acciones')` — Admin crea un usuario con rol "Cajero" → login como ese cajero → `/productos` carga (tiene `productos.ver`) pero no aparece "Nuevo producto"; navegar directo a `/productos/nuevo` → "No tienes permiso".
  - Emails únicos por test; `test.setTimeout` generoso donde haya varias navegaciones.
- [ ] **Step 2: Ejecutar** `npm run test:e2e` → todos verdes (los 4 nuevos + los 7 del Bloque 1). Pegar el resumen.
- [ ] **Step 3: Commit** — `test: E2E de productos e inventario (alta, entrada, ajuste/stock bajo, RBAC)`

---

## Task 17: Verificación final, auditoría de seguridad/integridad y documentación

**Files:**
- Modify: `README.md` (sección "Desarrollo" — añadir los módulos del Bloque 2), `docs/superpowers/` (nota de decisiones si procede)
- Modify: `.github/workflows/ci.yml` sólo si los nuevos globs de test no quedaran cubiertos (no deberían: `src/**/*.itest.ts` ya los recoge) — confirmar, no cambiar por cambiar.

- [ ] **Step 1: Suite completa en verde**
  Run: `npm run typecheck && npm run lint && npm run test:unit && npm run test:integration && npm run build` y `npm run test:e2e`. Pegar todas las colas. Correr `npm run test:integration` **3 veces seguidas** para descartar flakiness de aislamiento (patrón del Bloque 1: cualquier `*.itest.ts` que mute estado compartido — p.ej. `TaxRate.esDefault`, permisos de rol — debe restaurarlo en `afterAll`/`beforeEach`).
- [ ] **Step 2: Revisión de seguridad e integridad** (checklist, arreglar lo que falle):
  - Toda Server Action mutante de este bloque: `requirePermission('<clave>')` es la PRIMERA sentencia. `movimientos/nuevo` valida el permiso del `tipo` concreto.
  - `recordMovement` es el único que hace `UPDATE ... stock`. Grep `\.stock\s*[:=]` y `stock:` en `src/lib` fuera de `movements.ts`/tests/`stock-calc.ts` → sólo lecturas.
  - Ninguna ruta que devuelva datos de catálogo/inventario sin `requirePermission`.
  - Auditoría dentro de la transacción en cada mutación (no después del commit).
  - Sin `new PrismaClient()`; sin `any`; `redirect()` fuera de try/catch.
  - Migración revisada: sólo aditiva.
  - `Decimal` en todos los importes; ningún cálculo monetario en float que se persista.
  - `ForbiddenError` no lo capturan los handlers de `ValidationError`.
  - `searchProducts` excluye archivados por defecto.
  - Sin stock negativo alcanzable por ninguna ruta.
- [ ] **Step 3: Documentación** — actualizar `README.md` (nuevos comandos/pantallas si aplica) y añadir una nota breve en el spec o un `docs/superpowers/decisions-bloque2.md` con las decisiones tomadas autónomamente durante la implementación (lista corta).
- [ ] **Step 4: Commit** — `chore: verificación final del Bloque 2 y documentación`

---

## Cobertura del spec (self-review)

| Requisito del spec | Tarea(s) |
|---|---|
| Modelos TaxRate/Category/Product/ProductVariant/InventoryMovement + enums + relación inversa en User; migración aditiva | 1 |
| Seed: tasas de impuesto + permisos de bloque por rol (Empleado sin movimientos) | 1 |
| 9 permisos nuevos en `PERMISSIONS`; 13 acciones de auditoría; 3 ítems de navegación | 2 |
| `getTaxRates`/`getDefaultTaxRate`/`precioConImpuesto` | 3 |
| Helpers puros: `computeStock` (ENTRADA/SALIDA/AJUSTE), profundidad de categoría | 3 |
| Esquemas Zod product/variant/category/movement (AJUSTE = stock objetivo; motivo obligatorio) | 4 |
| `recordMovement`: único escritor de stock, transaccional, `FOR UPDATE`, sin negativos, AJUSTE con delta, tx-aware, audita, actualiza `precioCompra` en ENTRADA con costo | 5 |
| Alertas de stock bajo por variante + contador con cache + badge | 6, 14 |
| Historial de movimientos paginado y filtrable + export CSV | 7, 15 |
| Categorías 2 niveles; archivado en cascada a subcategorías; productos conservan `categoryId`; aviso con conteos; recategorización | 8, 12 |
| Búsqueda por nombre/SKU/código de barras con prioridad de código exacto (reutilizable POS) | 9 |
| Alta de producto simple y con variantes; `ENTRADA` inicial "Alta de producto"; SKU/código únicos; estado derivado (activo/no_disponible/agotado/archivado) | 10 |
| Editar precios (audita `precio_cambiado`), añadir/convertir/archivar variantes; no se puede archivar la última variante activa | 11 |
| UI: /categorias, /productos (+[id]), /inventario, /inventario/stock-bajo, /inventario/movimientos (+nuevo, +export) | 12-15 |
| RBAC en toda acción mutante; `movimientos/nuevo` valida el permiso del tipo | 4-15 (transversal), verificado en 17 |
| E2E: alta simple con stock, entrada, ajuste→stock bajo→badge, RBAC | 16 |
| Verificación final + revisión de seguridad/integridad + docs | 17 |

**Placeholder scan:** sin `TBD`/`TODO`. Las referencias a "Bloque 4" y "diferido" son límites explícitos del spec.

**Consistencia de tipos:** `MovementInput.valor` (número que teclea el usuario: cantidad o stock objetivo) es el mismo concepto que `movementSchema.valor` (T4) y el `valor` de `computeStock` (T3). `recordMovement` persiste `InventoryMovement.cantidad = delta` (con signo) en los 3 tipos — consistente entre T5, T7 (lo lee) y los tests. `FormState` se reimporta de `@/app/(auth)/setup/actions` en todas las actions. `SearchHit` (T9) lo consumen T10 (`listProducts` para `q`) y T15 (`MovementForm`).

## Notas de ejecución

- **Orden y dependencias:** T1→T2 (seed referencia claves que T2 formaliza en `rbac.ts`); T3 antes de T5 (`computeStock`) y T9/T10 (`precioConImpuesto`); T5 crea un stub de `stock.ts` que T6 completa; T5 antes de T10/T11 (`recordMovement` para el stock inicial); T8/T9/T10/T11 antes de sus UIs (T12/T13); T2 (`nav.ts` badge marker) antes de T14 (`Sidebar` lo resuelve).
- **Postgres local:** `npm run db:start` en background para `prisma migrate dev` / `db:seed`. Los `test:integration` traen su propio Postgres efímero.
- **Aislamiento de tests:** cualquier `*.itest.ts` que cambie `TaxRate.esDefault`, permisos de rol, o cree categorías/productos debe limpiar en `beforeEach`/`afterAll` (patrón Bloque 1). No borrar los roles `esSistema` ni las `TaxRate` sembradas sin restaurarlas.
- **Concurrencia:** el test de `recordMovement` concurrente puede ser sensible al aislamiento de Postgres; si resulta flaky, envolver cada `recordMovement` del test en su propia transacción explícita y verificar el resultado agregado, nunca debilitar la aserción.
- **Sin push / sin deploy.** Integración local a `master` sólo tras revisión final limpia.
