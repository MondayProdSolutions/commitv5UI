# Sistema POS — Bloque 2: Productos, Categorías e Inventario

Fecha: 2026-09-03
Estado: Aprobado para plan de implementación
Depende de: Bloque 1 (auth/usuarios/roles/auditoría), ya integrado en `master`.

## Contexto

Segundo sub-proyecto del sistema POS (descomposición de 9 bloques). Se integra en el
mismo proyecto Next.js y **reutiliza** del Bloque 1: `requirePermission` /
`requireUser` (`src/lib/auth/context.ts`), catálogo de permisos y `can()`
(`src/lib/auth/rbac.ts`), `logActivity` / `actionLabel` / `KNOWN_ACTIONS`
(`src/lib/audit.ts`), `queryActivity` / `ActivityRow` (`src/lib/activity/query.ts`),
`FormState` (`src/app/(auth)/setup/actions.ts`), `ValidationError` (`src/lib/errors.ts`),
`db` singleton (`src/lib/db.ts`), `getClientIp` (`src/lib/http.ts`), componentes
`DataTable` / `Pagination` / `PermissionGate` / `Field`, el shell `src/app/(app)/layout.tsx`
+ `nav.ts` / `Sidebar` y el gate `src/proxy.ts`.

### Stack (heredado del Bloque 1, sin cambios)

Next.js 16.3.4 (App Router; gate = `src/proxy.ts`), React 19.2, TypeScript strict,
PostgreSQL vía Prisma 7 + `@prisma/adapter-pg` (`src/lib/db.ts` es el único
`PrismaClient`; nunca `new PrismaClient()`), Zod 4 (`z.email()`, `.check()` en vez de
`.superRefine()` para reglas cruzadas), Tailwind v4, Vitest 4 (`*.test.ts` unit /
`*.itest.ts` integración con Postgres efímero vía `globalSetup`), Playwright.
Idioma UI: español. Sin envío de correos. Un solo negocio, 1 sucursal (sin stock por
ubicación).

### Decisiones de diseño (definitivas)

| Tema | Decisión |
|---|---|
| Modelo producto/variante | **Opción A**: todo `Product` tiene ≥1 `ProductVariant`. Producto SIMPLE = una variante `esDefault=true, nombre=null` (oculta en la UI; se edita en el propio formulario del producto). Producto CON_VARIANTES = 2+ variantes con nombre. Stock, SKU, código de barras, precios y `stockMinimo` viven **en la variante**. Todo movimiento de inventario referencia `variantId`. |
| Cantidades | Solo enteras (piezas). `stock` y `cantidad` son `Int`. |
| Costo | Costo fijo por variante (`precioCompra`), editable a mano. Una `ENTRADA` con `costoUnitario` actualiza ese campo. Sin promedio ponderado. |
| Categorías | Dos niveles: categoría raíz → subcategoría. `Category.parentId` self-relation; regla de servicio: una subcategoría no puede tener hijos (profundidad máx. 2). |
| Ciclo de vida producto | Archivado lógico (nunca borrado físico) + `disponible` (switch manual) + "agotado" derivado (`stock <= 0`, no se almacena). Restaurable. |
| Movimientos | `ENTRADA` / `SALIDA` / `AJUSTE`. Motivo obligatorio. **Sin stock negativo** (una `SALIDA` o `AJUSTE` que dejaría `stock < 0` se rechaza con `ValidationError`). El enum reserva `VENTA` / `DEVOLUCION` para el Bloque 4. |
| AJUSTE | El valor recibido es el **stock objetivo absoluto** (>= 0), no un delta. `InventoryMovement` y la auditoría registran `stockPrevio`, `stockNuevo` y `delta = stockNuevo − stockPrevio`. |
| Alertas de stock bajo | `stockMinimo` por variante (0 = sin alerta). Vista dedicada `/inventario/stock-bajo` (variantes con `stock <= stockMinimo` y `stockMinimo > 0`, más críticas primero). Badge en el ítem "Inventario" del sidebar = `stockAlertsCount()`. Sin correo. |
| Imágenes | `Product.imagenUrl` reservado; UI muestra placeholder. Subida real se difiere. |
| Permisos | Granular (ver tabla). |
| Impuestos | Tabla `TaxRate` (sembrada: "IVA 16%" default, "Exento" 0%). `Product.taxRateId` obligatorio. `ProductVariant.precioVenta` es la **base sin impuesto**; el impuesto se aplica al cobrar (Bloque 4). La UI de producto muestra el precio con impuesto como referencia calculada. |
| Roles sembrados (defaults) | **Administrador**: todo (blindaje del Bloque 1 → `ALL_PERMISSION_KEYS`). **Gerente**: todas las claves de este bloque. **Cajero**: `productos.ver`, `inventario.ver`. **Empleado**: `productos.ver`, `inventario.ver`. `inventario.entrada` / `inventario.salida` / `inventario.ajustar` quedan restringidos a Gerente y Administrador salvo habilitación explícita posterior desde `/admin/roles`. |
| Concurrencia de stock | `recordMovement` bloquea la fila de la variante (`SELECT ... FOR UPDATE`) dentro de la transacción antes de calcular el nuevo stock. (A diferencia de la carrera diferida en las guardas del Bloque 1, aquí sí se hace bien desde el inicio: hay stock y dinero en juego.) |
| Stock inicial | El stock inicial de una variante al crearla se registra como un `InventoryMovement` tipo `ENTRADA`, motivo "Alta de producto", no como un valor suelto. El historial cuadra desde el día 1. |
| Categoría archivada con productos | Archivar no mueve ni desasocia productos: conservan su `categoryId`. La UI advierte cuántos productos y subcategorías quedan bajo una categoría archivada y ofrece una vista para recategorizarlos después. Toda acción auditada. |

## Arquitectura

Un solo proyecto Next.js. Server Actions + Route Handlers como backend. El módulo
`src/lib/inventory/movements.ts` es el **único** punto que modifica
`ProductVariant.stock` — cualquier cambio de existencias (manual en este bloque;
venta/devolución en el Bloque 4) pasa por `recordMovement`, que en una sola
transacción valida, actualiza el stock, escribe `InventoryMovement` y audita.

### Estructura de archivos (nuevos)

```
prisma/
  schema.prisma            # + TaxRate, Category, Product, ProductVariant, InventoryMovement, enums
  seed.ts                  # extendido: TaxRate + claves de permiso de este bloque en Gerente/Cajero/Empleado

src/lib/
  taxes.ts                 # getTaxRates(), getDefaultTaxRate()
  catalog/
    categories.ts          # createCategory, updateCategory, archiveCategory, restoreCategory, listCategoryTree, productsInArchivedCategories
    products.ts            # createProduct, updateProduct, archiveProduct, restoreProduct, setProductDisponible, getProduct, listProducts
    variants.ts            # addVariant, editVariant, archiveVariant, setVariantDisponible, convertToVariants
    search.ts             # searchProducts(q, opts) -> variantes+producto, exactBarcode flag
  inventory/
    movements.ts          # recordMovement({ variantId, tipo, cantidad, motivo, costoUnitario?, actorId, ip }, tx?)
    stock.ts             # lowStockVariants(filtro), stockAlertsCount() (cache ~30s en memoria)
    query.ts             # listMovements(filtro) -> filas de tabla
  validation/
    product.ts           # productSchema, variantSchema, editVariantSchema
    category.ts          # categorySchema
    movement.ts          # movementSchema (discrimina por tipo; AJUSTE => stockObjetivo)

src/app/(app)/
  productos/{page,actions}.tsx, [id]/page.tsx, ProductForm.tsx, VariantEditor.tsx, ProductRow.tsx
  categorias/{page,actions}.tsx, CategoryForm.tsx, CategoryTree.tsx
  inventario/
    page.tsx
    stock-bajo/page.tsx
    movimientos/page.tsx
    movimientos/nuevo/{page.tsx, MovementForm.tsx}
    movimientos/export/route.ts     # CSV, runtime nodejs, requirePermission('inventario.ver') -> 403
    actions.ts

src/lib/nav.ts             # + Productos / Categorías / Inventario (con badge)
src/lib/auth/rbac.ts       # + 9 claves de permiso (grupos "productos", "categorias", "inventario")
src/lib/audit.ts           # + 13 acciones en LABELS/KNOWN_ACTIONS
```

## Modelo de datos (Prisma)

```prisma
enum ProductType  { SIMPLE  CON_VARIANTES }
enum MovementType { ENTRADA SALIDA AJUSTE VENTA DEVOLUCION }

model TaxRate {
  id        String   @id @default(cuid())
  nombre    String   @unique
  tasa      Decimal  @db.Decimal(5, 4)   // 0.1600
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
  id          String    @id @default(cuid())
  nombre      String
  descripcion String?
  categoryId  String?
  category    Category? @relation(fields: [categoryId], references: [id])
  taxRateId   String
  taxRate     TaxRate   @relation(fields: [taxRateId], references: [id])
  tipo        ProductType @default(SIMPLE)
  imagenUrl   String?
  archivado   Boolean   @default(false)
  createdById String?
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt
  variants    ProductVariant[]
  @@index([categoryId])
  @@index([archivado])
  @@index([nombre])
}

model ProductVariant {
  id           String   @id @default(cuid())
  productId    String
  product      Product  @relation(fields: [productId], references: [id], onDelete: Cascade)
  nombre       String?          // null en la default de un SIMPLE
  esDefault    Boolean  @default(false)
  sku          String?  @unique
  codigoBarras String?  @unique
  precioVenta  Decimal  @db.Decimal(12, 2)          // base, sin impuesto
  precioCompra Decimal  @db.Decimal(12, 2) @default(0)
  stock        Int      @default(0)                  // SOLO recordMovement() lo escribe
  stockMinimo  Int      @default(0)                  // 0 = sin alerta
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
  id             String        @id @default(cuid())
  variantId      String
  variant        ProductVariant @relation(fields: [variantId], references: [id])
  tipo           MovementType
  cantidad       Int            // con signo: +ENTRADA, -SALIDA; en AJUSTE = delta aplicado (stockNuevo - stockPrevio)
  stockPrevio    Int
  stockNuevo     Int
  costoUnitario  Decimal?       @db.Decimal(12, 2)   // solo ENTRADA
  motivo         String
  referenciaTipo String?        // "Sale" en el Bloque 4
  referenciaId   String?
  actorId        String?
  actor          User?          @relation(fields: [actorId], references: [id])
  createdAt      DateTime       @default(now())
  @@index([variantId, createdAt])
  @@index([tipo, createdAt])
  @@index([createdAt])
}
```

Notas:
- `Decimal` para todo importe monetario; `Int` para cantidades.
- Sin borrado físico: `Product.archivado`, `ProductVariant.archivada`, `Category.archivada`.
- `User` gana la relación inversa `inventoryMovements InventoryMovement[]` (edición mínima al modelo del Bloque 1; no destructiva).
- La migración es puramente aditiva (nuevas tablas/enums + una relación inversa en `User`). Ninguna columna existente cambia.

## Permisos nuevos (`src/lib/auth/rbac.ts`)

| Clave | Módulo | Descripción |
|---|---|---|
| `productos.ver` | Productos | Ver catálogo y detalle |
| `productos.crear` | Productos | Alta de productos y variantes |
| `productos.editar` | Productos | Editar datos, precios, disponibilidad, variantes |
| `productos.archivar` | Productos | Archivar / restaurar productos y variantes |
| `categorias.gestionar` | Categorías | CRUD + archivar categorías y subcategorías |
| `inventario.ver` | Inventario | Ver stock, movimientos y alertas |
| `inventario.entrada` | Inventario | Registrar entradas |
| `inventario.salida` | Inventario | Registrar salidas |
| `inventario.ajustar` | Inventario | Ajustar stock a un valor |

`ALL_PERMISSION_KEYS` se recalcula solo (deriva de `PERMISSIONS`). El blindaje del
Administrador del Bloque 1 sigue vigente. `seed.ts` se extiende para asignar:
Gerente ← las 9 claves; Cajero ← `productos.ver` + `inventario.ver`; Empleado ← lo
mismo que Cajero.

## Acciones de auditoría nuevas (`src/lib/audit.ts`)

`categorias.crear`, `categorias.editar`, `categorias.archivar`, `categorias.restaurar`,
`productos.crear`, `productos.editar`, `productos.precio_cambiado`, `productos.archivar`,
`productos.restaurar`, `productos.disponibilidad`, `productos.variante_agregada`,
`productos.variante_archivada`, `inventario.movimiento` — cada una con su etiqueta
legible en español en `LABELS`. `KNOWN_ACTIONS = Object.keys(LABELS)` las recoge para
el filtro del visor de auditoría del Bloque 1.

## Servicios y reglas de negocio

### `lib/taxes.ts`
- `getTaxRates()` → activas, ordenadas, con la default primero.
- `getDefaultTaxRate()` → la `esDefault`; si falta, la primera activa; si no hay, error de configuración.

### `lib/catalog/categories.ts`
- `createCategory({ nombre, parentId? })` — si `parentId`: el padre debe existir, no estar archivado y ser raíz (`parent.parentId === null`), si no `ValidationError`. `@@unique([parentId, nombre])` → P2002 ⇒ `ValidationError({ nombre })`. Audita `categorias.crear`.
- `updateCategory(id, { nombre, parentId? })` — no permite convertir en subcategoría una categoría que tiene hijos. Cambiar `parentId` de raíz→sub o mover entre padres permitido si respeta la profundidad. Audita `categorias.editar` con `{ antes, despues }`.
- `archiveCategory(id)` — marca `archivada=true`; si es raíz, marca también todas sus subcategorías (`archivada=true`) en la misma transacción. **No toca productos.** Devuelve `{ subcategoriasArchivadas, productosAfectados }` para que la UI lo muestre. Audita `categorias.archivar` con esos conteos.
- `restoreCategory(id)` — restaura la categoría; si es raíz, NO restaura automáticamente las subcategorías (se restauran individualmente) — se documenta en la UI. Audita `categorias.restaurar`.
- `listCategoryTree({ incluirArchivadas })` → árbol de 2 niveles, cada nodo con `productosCount` (productos no archivados con ese `categoryId` directo).
- `productsInArchivedCategories({ page, pageSize })` → productos no archivados cuyo `categoryId` apunta a una categoría (o subcategoría) archivada; para la vista de recategorización.

### `lib/catalog/products.ts` + `variants.ts`
- `createProduct(actorId, input, ip)` — `input`: `{ nombre, descripcion?, categoryId?, taxRateId, tipo, imagenUrl?, variantes: VariantInput[] }`.
  - `SIMPLE`: exige exactamente 1 `VariantInput` sin `nombre`; crea `Product` + `ProductVariant { esDefault:true, nombre:null, ... }`.
  - `CON_VARIANTES`: exige ≥2 `VariantInput` con `nombre` no vacío y únicos entre sí.
  - Cada `VariantInput`: `{ nombre?, sku?, codigoBarras?, precioVenta, precioCompra?, stockMinimo?, stockInicial? }`. `precioVenta >= 0`, enteros `>= 0` donde aplica.
  - SKU / código de barras duplicados (contra la BD) → `ValidationError` en el campo, indicando qué variante.
  - Para cada variante con `stockInicial > 0`: `recordMovement({ variantId, tipo: ENTRADA, cantidad: stockInicial, motivo: 'Alta de producto', costoUnitario: precioCompra || undefined, actorId }, tx)` dentro de la misma transacción.
  - Audita `productos.crear` con `{ nombre, tipo, categoryId, nVariantes }`.
- `updateProduct(actorId, id, input, ip)` — `{ nombre, descripcion?, categoryId?, taxRateId, imagenUrl? }`. Si cambia `taxRateId` → además audita `productos.editar` reflejando `{ taxRateAntes, taxRateDespues }`. **No** toca stock ni precios de variante.
- `setProductDisponible(actorId, id, disponible, ip)` — pone `disponible` en todas las variantes del producto (atajo). Audita `productos.disponibilidad`.
- `archiveProduct(actorId, id, ip)` / `restoreProduct(...)` — `archivado` + `archivada` en cascada a sus variantes, en una transacción. Audita `productos.archivar` / `productos.restaurar`.
- `getProduct(id)` — producto + variantes (incl. archivadas, marcadas) + `taxRate` + últimos 10 `InventoryMovement` por variante. Añade `precioConImpuesto` calculado por variante.
- `listProducts({ q?, categoryId?, estado, soloStockBajo?, page, pageSize })` — `estado ∈ {activos, archivados, todos}` (default `activos`). Filas: `{ id, nombre, categoriaNombre, nVariantes, precioMin, precioMax, stockTotal, estado }` donde `estado ∈ {activo, no_disponible, agotado, archivado}` (prioridad: archivado > agotado(stockTotal<=0) > no_disponible(todas las variantes no disponibles) > activo). `q` usa `search.ts`.
- `variants.ts`:
  - `editVariant(actorId, variantId, input, ip)` — `{ nombre?, sku?, codigoBarras?, precioVenta, precioCompra, stockMinimo, disponible }`. Si `precioVenta` o `precioCompra` cambian → audita `productos.precio_cambiado` con `{ antes, despues }`. **Nunca** cambia `stock` (eso es AJUSTE). Duplicado de sku/código → `ValidationError`.
  - `addVariant(actorId, productId, input, ip)` — solo si el producto ya es `CON_VARIANTES`; exige `nombre`. Con `stockInicial > 0` → `ENTRADA`. Audita `productos.variante_agregada`.
  - `convertToVariants(actorId, productId, nuevasVariantes, ip)` — de `SIMPLE` a `CON_VARIANTES`: la variante default deja de ser `esDefault` y recibe un `nombre` (obligatorio en el input), y se añaden las nuevas. Transacción. Audita `productos.editar` con nota de conversión.
  - `archiveVariant(actorId, variantId, ip)` — impide archivar la última variante **activa** de un producto (mensaje: "archiva el producto entero"). Audita `productos.variante_archivada`.
  - `setVariantDisponible(...)` — audita `productos.disponibilidad`.

### `lib/catalog/search.ts`
- `searchProducts(q, { incluirArchivados = false, soloDisponibles = false, limit = 20 })`:
  - `q` vacío → `[]`.
  - match: `Product.nombre` contains (insensitive) OR `ProductVariant.sku` equals/startsWith `q` OR `ProductVariant.codigoBarras` equals `q`.
  - Devuelve `{ variantId, productId, productoNombre, varianteNombre, sku, codigoBarras, precioVenta, precioConImpuesto, stock, disponible, exactBarcode }[]` — `exactBarcode = (codigoBarras === q)`.
  - Orden: `exactBarcode` primero, luego coincidencia de prefijo de SKU, luego nombre.
  - Excluye variantes/productos archivados salvo `incluirArchivados`. `soloDisponibles` filtra `disponible && !archivada && !producto.archivado`.

### `lib/inventory/movements.ts`
```
recordMovement(input: {
  variantId: string
  tipo: 'ENTRADA' | 'SALIDA' | 'AJUSTE'
  cantidad: number       // ENTRADA/SALIDA: entero > 0; AJUSTE: stock objetivo, entero >= 0
  motivo: string         // trim, no vacío
  costoUnitario?: number // solo ENTRADA, >= 0
  actorId: string | null
  ip?: string | null
}, tx?: Prisma.TransactionClient): Promise<InventoryMovementResult>
```
- Si no recibe `tx`, abre `db.$transaction`. Si lo recibe (Bloque 4), opera dentro.
- Paso 1: `SELECT ... FOR UPDATE` sobre la variante (`$queryRaw` con `FOR UPDATE`, o `tx.$executeRaw` de lock + `findUniqueOrThrow`). Variante archivada o de producto archivado → `ValidationError` ("variante no disponible para movimientos").
- Paso 2: `stockPrevio = variant.stock`; calcular:
  - `ENTRADA`: `stockNuevo = stockPrevio + cantidad`; `delta = +cantidad`.
  - `SALIDA`: `delta = -cantidad`; `stockNuevo = stockPrevio - cantidad`; si `stockNuevo < 0` → `ValidationError('Stock insuficiente: disponible {stockPrevio}')`.
  - `AJUSTE`: `stockNuevo = cantidad`; `delta = stockNuevo - stockPrevio`; `cantidad` requerida `>= 0`.
- Paso 3: `UPDATE ProductVariant SET stock = stockNuevo, updatedAt = now()`.
- Paso 4: si `ENTRADA` y `costoUnitario != null` → `UPDATE ProductVariant SET precioCompra = costoUnitario`.
- Paso 5: `INSERT InventoryMovement { variantId, tipo, cantidad: delta, stockPrevio, stockNuevo, costoUnitario, motivo, referenciaTipo, referenciaId, actorId }`.
- Paso 6: `logActivity({ actorId, accion: 'inventario.movimiento', entidad: 'ProductVariant', entidadId: variantId, metadata: { tipo, delta, stockPrevio, stockNuevo, motivo, costoUnitario }, ip }, tx)`.
- Devuelve `{ movementId, stockPrevio, stockNuevo, delta }`.

### `lib/inventory/stock.ts`
- `lowStockVariants({ page, pageSize })` → variantes con `stockMinimo > 0 && stock <= stockMinimo`, `!archivada`, producto `!archivado`. Orden por `(stock - stockMinimo)` ascendente, luego `nombre`. Filas: producto+variante, stock, mínimo, déficit.
- `stockAlertsCount()` → `count` de lo anterior. Cache en memoria de módulo, TTL 30 s (aceptable ir algo desfasado; el badge no es crítico). Se invalida (mejor esfuerzo) tras cada `recordMovement`.

### `lib/inventory/query.ts`
- `listMovements({ variantId?, productId?, tipo?, desde?, hasta?, actorId?, page, pageSize })` → `{ rows, total }`. Filas: `{ id, createdAt, productoNombre, varianteNombre, tipo, tipoLabel, cantidad, stockPrevio, stockNuevo, motivo, actorNombre, costoUnitario }`. `include` del actor `{ select: { nombre: true } }` y de la variante→producto. Orden `createdAt desc`. Fechas malformadas se ignoran (patrón `parseDateParam` del Bloque 1).

## Pantallas

Responsive, español, `DataTable` + `Pagination` + `PermissionGate`. Cada page server
component llama `requirePermission(...)` como primera sentencia y declara
`export const dynamic = 'force-dynamic'` si lee cookies/parametros.

- **`/productos`** (`productos.ver`) — tabla (nombre, categoría, nº variantes, precio [rango], stock total, estado como badge). Filtros GET: `q`, `categoryId`, `estado`, `soloStockBajo`. "Nuevo producto" en `PermissionGate productos.crear`. Fila → `/productos/[id]`.
- **`/productos/[id]`** (`productos.ver`) — datos + edición (`productos.editar`); interruptor SIMPLE↔CON_VARIANTES (llama `convertToVariants`); `VariantEditor` (tabla de variantes con edición inline por variante, "añadir variante" si CON_VARIANTES); switches de disponibilidad; archivar/restaurar (`productos.archivar`); últimos movimientos por variante; `precioConImpuesto` mostrado como referencia. Diálogos de confirmación para archivar.
- **`/categorias`** (`categorias.gestionar` para ver y gestionar) — `CategoryTree` de 2 niveles con `productosCount`; crear raíz / crear subcategoría / editar / archivar / restaurar. Archivar raíz → diálogo: "Se archivarán N subcategorías. M productos quedarán bajo una categoría archivada y conservarán su categoría; podrás recategorizarlos en «Productos sin categoría activa»." Enlace a esa vista.
- **`/categorias/sin-categoria-activa`** (`categorias.gestionar`) — `productsInArchivedCategories`; permite cambiar el `categoryId` de cada producto (reusa `updateProduct`).
- **`/inventario`** (`inventario.ver`) — panel: nº variantes activas, nº agotadas, nº en stock bajo (enlace a la vista); tabla de stock actual con filtros (`q`, `categoryId`, `soloStockBajo`, `soloAgotados`).
- **`/inventario/stock-bajo`** (`inventario.ver`) — `lowStockVariants`, más críticas primero. Badge del sidebar = `stockAlertsCount()`.
- **`/inventario/movimientos`** (`inventario.ver`) — historial paginado con filtros (producto, tipo, rango de fechas, usuario). Enlace "Registrar movimiento". Botón "Exportar CSV" → `/inventario/movimientos/export?<filtros>`.
- **`/inventario/movimientos/nuevo`** (`inventario.entrada` OR `inventario.salida` OR `inventario.ajustar` — la página exige al menos una; el `<select>` de tipo solo ofrece los tipos permitidos por rol) — `MovementForm`: buscador de variante (usa `searchProducts`), tipo, cantidad (o "stock objetivo" en AJUSTE con previsualización `delta = objetivo − actual`), motivo obligatorio, costo unitario (solo ENTRADA). Resumen de confirmación antes de aplicar. La `action` vuelve a comprobar el permiso específico del `tipo` elegido.
- **`/inventario/movimientos/export`** — Route Handler `runtime = 'nodejs'`; `requirePermission('inventario.ver')` en try/catch → 403 JSON; CSV con BOM; `Content-Disposition: attachment`.

## Manejo de errores y seguridad transversal

- Validación Zod en servidor antes de tocar la BD, en toda Server Action / Route Handler.
- Toda Server Action mutante: `requirePermission('<clave>')` como primera sentencia (antes de leer `formData` o la BD). `movimientos/nuevo` valida el permiso correspondiente al `tipo` recibido, no solo "alguna" de las tres.
- Auditoría dentro de la misma `db.$transaction` que la mutación.
- `recordMovement` es el único que escribe `stock`; bloqueo de fila para serializar movimientos concurrentes sobre la misma variante.
- Sin stock negativo (regla dura). Sin borrado físico (archivado en las 3 entidades).
- `ValidationError` → `FormState` con `fieldErrors` / `formError`; `ForbiddenError` se propaga (no lo capturan los handlers de `ValidationError`), lo audita `requirePermission` como `auth.forbidden` y lo pinta `src/app/(app)/error.tsx`.
- `Decimal` en importes: los servicios reciben `number` desde Zod (`z.coerce.number()`), Prisma los convierte a `Decimal`; al devolver a la UI se serializan con `.toNumber()` / `.toFixed(2)`. Ningún cálculo monetario en coma flotante que se persista (los importes se guardan como se reciben; el Bloque 4 hará el cálculo de venta con cuidado decimal).
- `redirect()` fuera de try/catch. `import { db } from '@/lib/db'`, nunca `new PrismaClient()`.
- Cabeceras de seguridad ya globales (Bloque 1, `next.config.ts`).

## Testing

TDD. `*.test.ts` unit, `*.itest.ts` integración (Postgres efímero).

### Unit (Vitest)
- `validation/product.ts`, `variant.ts`, `category.ts`, `movement.ts` — casos válidos e inválidos; `movementSchema` discrimina por `tipo` y exige `stockObjetivo >= 0` en AJUSTE, `cantidad > 0` en ENTRADA/SALIDA, `costoUnitario` solo con ENTRADA, `motivo` no vacío.
- Cálculo puro de `stockNuevo` / `delta` para ENTRADA / SALIDA / AJUSTE (función extraída y testeable sin BD).
- Regla de profundidad de categoría (helper puro: "¿este `parentId` es raíz?").
- `precioConImpuesto(base, tasa)` — redondeo a 2 decimales.

### Integración (Vitest + PG efímero)
- Seed: `TaxRate` "IVA 16%" (default) + "Exento"; permisos de bloque en Gerente/Cajero/Empleado según los defaults.
- `createProduct` SIMPLE: crea producto + 1 variante default + (si `stockInicial>0`) un `InventoryMovement` ENTRADA "Alta de producto"; `stock` de la variante = `stockInicial`; audita `productos.crear`.
- `createProduct` CON_VARIANTES: ≥2 variantes; cada `stockInicial` genera su ENTRADA; nombres de variante duplicados → `ValidationError`.
- SKU / código de barras duplicado (en alta y en `editVariant`) → `ValidationError` en el campo.
- `recordMovement`:
  - ENTRADA suma; `costoUnitario` actualiza `precioCompra`.
  - SALIDA resta; SALIDA que dejaría `stock < 0` → `ValidationError`, sin escribir movimiento ni cambiar stock.
  - AJUSTE fija el stock al objetivo; `InventoryMovement.cantidad` = `delta`; `stockPrevio`/`stockNuevo` correctos; auditoría con `{ tipo:'AJUSTE', delta, stockPrevio, stockNuevo }`.
  - Concurrencia: dos `recordMovement` en paralelo sobre la misma variante (uno ENTRADA +10, otro SALIDA -5 partiendo de 3) → resultado final consistente (8), sin pérdida de actualización; el segundo ve el stock del primero gracias al `FOR UPDATE`. (Test con dos transacciones explícitas.)
  - Llamado con `tx` externa que hace rollback → no queda movimiento ni cambio de stock (prepara el Bloque 4).
- `archiveProduct` → todas sus variantes `archivada=true`; `restoreProduct` revierte; movimientos históricos intactos.
- `archiveCategory` raíz → subcategorías `archivada=true`; productos conservan `categoryId`; devuelve conteos; audita con los conteos. `productsInArchivedCategories` los lista.
- `searchProducts`: por nombre (parcial), por SKU (exacto y prefijo), por código de barras (exacto con `exactBarcode:true` y prioridad); respeta `incluirArchivados` / `soloDisponibles`.
- `lowStockVariants` / `stockAlertsCount`: variante con `stockMinimo=5`, `stock=5` aparece; `stock=6` no; `stockMinimo=0` nunca aparece.
- RBAC: sesión de Cajero → `createProduct` / `updateProduct` / `archiveProduct` / `recordMovement`-actions / `createCategory` → 403 (`ForbiddenError`), sin efecto, con `auth.forbidden` auditado. Sesión de Empleado → `recordMovement` ENTRADA action → 403 (por los defaults). Sesión de Gerente → todo OK.
- Extensión del visor de auditoría del Bloque 1: las nuevas acciones aparecen en `KNOWN_ACTIONS` y `actionLabel` las traduce.

### E2E (Playwright)
- Login como Administrador (o Gerente) → crear producto simple con stock inicial 20 → aparece en `/productos` con stock 20 y estado "activo".
- Registrar una ENTRADA de 10 para ese producto → `/inventario/movimientos` muestra la fila (ENTRADA, +10, 20→30) y el detalle del producto muestra stock 30.
- Registrar un AJUSTE a 2 (objetivo) → stock 2; el producto (con `stockMinimo` 5) aparece en `/inventario/stock-bajo` y el badge del sidebar "Inventario" muestra ≥1.
- Un Cajero navegando a `/productos/nuevo` (o al botón) no ve la acción de crear; navegar directo a una acción mutante → pantalla "No tienes permiso".

## Fuera de alcance (bloques posteriores o diferido)

- Descuento de stock por venta / devolución (Bloque 4 — usará `recordMovement` con `tx` y `tipo` `VENTA`/`DEVOLUCION`).
- Cálculo de subtotal/impuestos/total de una venta (Bloque 4).
- Subida real de imágenes de producto.
- Costo promedio ponderado / valuación de inventario (FIFO/PEPS).
- Stock por sucursal / ubicación (Bloque 9).
- Órdenes de compra / proveedores como entidad.
- Importación masiva de catálogo (CSV) — candidata a una tarea futura, no en este bloque.
- Reportes de inventario valorizado y productos más vendidos (Bloque 6).
- Retención/purga del historial de movimientos.
