# Sistema POS — Bloque 4: Ventas (Punto de venta)

Fecha: 2026-09-04
Estado: Aprobado para plan de implementación
Depende de: Bloque 1 (auth/usuarios/roles/auditoría), Bloque 2 (productos/inventario, `recordMovement` transaccional), Bloque 3 (clientes, `searchCustomers`, cliente "Público en General"). Todo en `master`.

## Contexto

Cuarto sub-proyecto del POS. Alcance acordado: **núcleo de venta + descuentos + devoluciones**. Fuera: arqueo/sesión de caja (Bloque 5), timbrado CFDI (bloque de facturación), ventas en espera, ventas a crédito, reportes agregados (Bloque 6).

Se integra en el mismo proyecto Next.js y **reutiliza**:
`requirePermission` / `requireUser` / `getCurrentUser` (`@/lib/auth/context`), `PERMISSIONS` / `can` / `ALL_PERMISSION_KEYS` / `PermissionKey` (`@/lib/auth/rbac`), `ROLE_PERMISSIONS` (`@/lib/auth/role-permissions` — fuente única compartida seed↔tests, del Bloque 3), `logActivity` / `actionLabel` / `KNOWN_ACTIONS` / `AuditAction` (`@/lib/audit`), `parseDateParam` (`@/lib/activity/query`), `type FormState` (`@/app/(auth)/setup/actions`), `AppError` / `ValidationError` / `ForbiddenError` (`@/lib/errors`), `db` (`@/lib/db`), `getClientIp` (`@/lib/http`), `recordMovement` / `MovementInput` (`@/lib/inventory/movements`), `computeStock` (`@/lib/inventory/stock-calc`), `searchProducts` (`@/lib/catalog/search`), `getProduct` / `listProducts` (`@/lib/catalog/products`), `listCategoryTree` (`@/lib/catalog/categories`), `searchCustomers` (`@/lib/customers/search`), `getCustomer` (`@/lib/customers/customers`), `crearClienteAction` (`@/app/(app)/clientes/actions`), `getTaxRates` / `precioConImpuesto` (`@/lib/taxes`), `DataTable` / `Column` / `Pagination` / `PermissionGate` / `forms/Field` (`@/components/*`), `visibleNav` / `NAV_ITEMS` (`@/lib/nav`), el helper de escape CSV local (`esc`, como en los export de Bloques 1–3).

### Stack (heredado, sin cambios)

Next.js 16.3.4 (App Router; gate `src/proxy.ts`), React 19.2, TypeScript strict (sin `any`), PostgreSQL vía Prisma 7 + `@prisma/adapter-pg` (`src/lib/db.ts` es el único `PrismaClient`; excepción: `prisma/seed.ts`), Zod 4 (`z.email()`, `.superRefine`, `z.coerce.number()`), Tailwind v4, Vitest 4 (`*.test.ts` unit sin BD / `*.itest.ts` integración con Postgres efímero vía `globalSetup`), Playwright (`workers:1`, PG efímero, `build`+`start` en :3100). UI en español. Un solo negocio, 1 sucursal, sin envío de correos, sin PAC/SAT.

### Decisiones de diseño (definitivas)

| Tema | Decisión |
|---|---|
| Alcance | Núcleo de venta + descuentos (línea y ticket) + devoluciones (parciales o totales contra una venta). Sin arqueo de caja. |
| Cálculo de IVA | `precioVenta` de la variante es **base sin impuesto** (como en el Bloque 2). IVA **añadido sobre la base, por línea**: `impuesto_i = round2(baseNeta_i · tasa_i)`. Venta: `subtotal = Σ baseNeta`, `impuestos = Σ impuesto`, `total = subtotal + impuestos`. |
| Descuentos | Reducen la **base**; el IVA se calcula sobre la **base neta**. Descuento de línea (monto o %) → base de esa línea. Descuento de ticket (monto o %) → se **prorratea entre líneas proporcional a su base**, y cada línea recalcula su IVA. Es el tratamiento fiscal correcto en México. |
| Autoridad de descuento | Una sola clave `ventas.descuento`, **sin tope**. El control es a qué rol se le asigna. Sin `AppSetting` de porcentaje máximo ni clave de override. |
| Pagos | Uno o varios `Payment` por venta (`EFECTIVO` / `TARJETA` / `TRANSFERENCIA` + `monto`). `Σ pagos ≥ total`. Sobrepago en efectivo → **cambio** (solo si hay un pago `EFECTIVO` que lo cubre; no se da cambio de tarjeta). La venta solo se registra si está pagada por completo. Sin crédito. |
| Redondeo | **Centavos exactos** (2 decimales). Sin redondeo a múltiplo de 5 ¢. |
| Ciclo de vida | Carrito **en el cliente** (sin persistencia servidor). Al cobrar, **una** `db.$transaction` crea la venta `COMPLETADA` de forma atómica. Una venta `COMPLETADA` puede **cancelarse el mismo día** (permiso `ventas.cancelar`) → reintegra stock, marca `CANCELADA`. Correcciones posteriores = devolución. |
| Devoluciones | Contra una venta previa: elegir líneas y cantidades (≤ vendido − ya devuelto). Crea `Return` + `ReturnLine[]` ligados a la `Sale`; `recordMovement(DEVOLUCION)` reintegra stock; registra el reembolso (`metodoReembolso`). Importes prorrateados de la línea original (devolución total de una línea = importes exactos de la `SaleLine`). Una venta `CANCELADA` no admite devolución. |
| Comprobante | Cada venta recibe **folio correlativo** (`V-000123`) de una secuencia dedicada (sin huecos por rollback). **Ticket imprimible** (HTML + `@media print` + `window.print()`). Flag `requiereFactura` cuando el cliente es facturable y lo pide → **snapshot** de sus 5 campos fiscales en `Sale.datosFiscales`. **Sin timbrado**; "Comprobante no fiscal". |
| Cliente en la venta | Opcional; por defecto el cliente `esGenerico` "Público en General". El genérico nunca es facturable. |
| Añadir al carrito | Input con foco permanente: código de barras **exacto** → añade la variante (cant 1, repetir suma); texto → lista de coincidencias → clic (selector de variante si aplica). **Además** rejilla navegable por categoría (botón por producto) para negocios sin lector. Solo variantes `disponible` y no archivadas. |
| Disponibilidad en checkout | El servicio revalida cada línea: variante inexistente / archivada / producto archivado / `disponible:false` / stock insuficiente → `ValidationError` (rechazo duro, toda la transacción revierte). Sin stock negativo (regla del Bloque 2, la impone `recordMovement`). |
| Presupuesto en vivo | El navegador **nunca** calcula dinero de forma autoritativa. Un *quote endpoint* (`POST /ventas/quote`) resuelve precios/tasas de BD y llama `computeSale`; el cliente lo invoca con debounce para pintar totales. El servidor recalcula de nuevo en el commit. |
| Migración | **Aditiva.** Tablas nuevas, enums nuevos (`SaleStatus`, `PaymentMethod`), relaciones inversas en `User`/`Customer`/`ProductVariant`. `MovementType` **no** cambia (ya tenía `VENTA`/`DEVOLUCION`). Nada existente se altera ni se borra. |
| Permisos | Grupo `ventas`: `ventas.crear` / `ventas.descuento` / `ventas.cancelar` / `ventas.devolver` / `ventas.ver`. Seed: Administrador todas · Gerente las 5 · Cajero `crear`+`ver`+`devolver` · Empleado ninguna. |

## Arquitectura

Un solo proyecto Next.js. Server Actions + Route Handlers como backend. `src/lib/sales/compute.ts` es la **única** fuente de verdad de los importes (pura, sin BD). `src/lib/sales/sales.ts` concentra `createSale` / `cancelSale` / `getSale` / `listSales`; `src/lib/sales/returns.ts` las devoluciones; `src/lib/sales/folio.ts` la numeración. El widening de `recordMovement` / `computeStock` para `VENTA`/`DEVOLUCION` es un prerrequisito mínimo. Toda mutación entra por una Server Action con `requirePermission` como primera sentencia y auditoría dentro de la misma transacción.

### Estructura de archivos (nuevos / modificados)

```
prisma/
  schema.prisma            # + Sale, SaleLine, Payment, Return, ReturnLine, FolioCounter; enums SaleStatus, PaymentMethod; relaciones inversas
  seed.ts                  # + upsert FolioCounter V/D
  migrations/<ts>_bloque4_ventas/

src/lib/
  auth/role-permissions.ts # + claves ventas.* en Gerente/Cajero (fuente única compartida)
  audit.ts                 # + ventas.crear / ventas.cancelar / ventas.devolver en AuditAction y LABELS
  nav.ts                   # + ítems "Punto de venta" y "Ventas"
  inventory/stock-calc.ts  # computeStock acepta VENTA / DEVOLUCION
  inventory/movements.ts   # MovementInput.tipo amplía a los 5 valores
  sales/
    compute.ts             # computeSale(input) + prorateReturnLine(saleLine, cantidad) — puro
    folio.ts               # nextFolio(tx, 'V' | 'D')
    sales.ts               # createSale, cancelSale, getSale, listSales + tipos SaleDetail/SaleRow/ListSalesFilter
    returns.ts             # createReturn, getReturn, listReturns + tipos ReturnDetail/ReturnRow
  validation/
    sale.ts                # createSaleSchema + tipos
    return.ts              # createReturnSchema + tipos

src/app/(app)/ventas/
  page.tsx                 # pantalla de cajero
  actions.ts               # crearVentaAction, cancelarVentaAction, crearDevolucionAction
  quote/route.ts (+ .itest.ts)
  historial/page.tsx
  historial/export/route.ts (+ .itest.ts)
  [id]/page.tsx            # detalle de venta
  [id]/ticket/page.tsx
  [id]/devolucion/page.tsx
  devoluciones/page.tsx
  devoluciones/[id]/page.tsx
  CashierScreen.tsx  ProductSearchInput.tsx  CategoryGrid.tsx  VariantPicker.tsx
  CartTable.tsx  DiscountPopover.tsx  CustomerPicker.tsx  PaymentPanel.tsx
  TotalsPanel.tsx  SaleRow.tsx  CancelSaleForm.tsx  ReturnForm.tsx
  TicketView.tsx  PrintOnMount.tsx

src/lib/__tests__/seed-bloque4.itest.ts
e2e/ventas.spec.ts
```

## Sección 1 — Modelo de datos (aditivo)

Migración `bloque4_ventas`. Ningún cambio a tablas existentes salvo relaciones inversas nuevas en `User`, `Customer`, `ProductVariant`. `MovementType` sin cambios.

### `Sale`

| campo | tipo | nota |
|---|---|---|
| `id` | `String @id @default(cuid())` | |
| `folio` | `String @unique` | `V-000123`, correlativo (secuencia dedicada) |
| `estado` | `SaleStatus @default(COMPLETADA)` | enum nuevo `{ COMPLETADA, CANCELADA }` |
| `customerId` | `String` | FK → `Customer`; por defecto el cliente `esGenerico` |
| `subtotal` | `Decimal @db.Decimal(12,2)` | Σ bases netas (tras descuentos, sin IVA) |
| `descuentoLineas` | `Decimal @db.Decimal(12,2)` | Σ descuentos de línea (informativo) |
| `descuentoTicket` | `Decimal @db.Decimal(12,2)` | descuento de ticket aplicado (informativo) |
| `impuestos` | `Decimal @db.Decimal(12,2)` | Σ IVA de línea |
| `total` | `Decimal @db.Decimal(12,2)` | `subtotal + impuestos` |
| `pagado` | `Decimal @db.Decimal(12,2)` | Σ `Payment.monto` |
| `cambio` | `Decimal @db.Decimal(12,2)` | `max(0, pagado − total)` |
| `requiereFactura` | `Boolean @default(false)` | |
| `datosFiscales` | `Json?` | snapshot `{ rfc, razonSocial, regimenFiscalCode, usoCfdiCode, cpFiscal }` si `requiereFactura` |
| `canceladaEn` | `DateTime?` | |
| `canceladaPorId` | `String?` | FK → `User` (`@relation("CanceladaPor")`) |
| `motivoCancelacion` | `String?` | |
| `cajeroId` | `String` | FK → `User` (`@relation("Cajero")`) |
| `createdAt` | `DateTime @default(now())` | |

Relaciones: `customer Customer @relation(fields:[customerId], references:[id])`, `cajero User @relation("Cajero", ...)`, `canceladaPor User? @relation("CanceladaPor", ...)`, `lines SaleLine[]`, `payments Payment[]`, `returns Return[]`.
Índices: `@@index([createdAt])`, `@@index([estado, createdAt])`, `@@index([customerId])`, `@@index([cajeroId])`.

### `SaleLine` (snapshot inmutable)

`id` cuid · `saleId String` (FK `onDelete: Cascade`) · `variantId String` (FK, `onDelete: Restrict` — solo referencia) · `productoNombre String` · `varianteNombre String?` · `sku String?` · `cantidad Int` · `precioUnitario Decimal(12,2)` (base sin IVA, snapshot) · `tasaImpuesto Decimal(5,4)` (snapshot) · `descuentoMonto Decimal(12,2)` (lo restado a la base bruta por el descuento de línea, ya resuelto de monto/%) · `descuentoTicketProrrateado Decimal(12,2)` · `baseNeta Decimal(12,2)` · `impuesto Decimal(12,2)` · `total Decimal(12,2)`.
Relaciones: `sale Sale`, `variant ProductVariant @relation(...)`, `returnLines ReturnLine[]`.
Índices: `@@index([saleId])`, `@@index([variantId])`.

### `Payment`

`id` cuid · `saleId String` (FK Cascade) · `metodo PaymentMethod` (enum nuevo `{ EFECTIVO, TARJETA, TRANSFERENCIA }`) · `monto Decimal(12,2)` · `createdAt DateTime @default(now())`.
Índice: `@@index([saleId])`.

### `Return`

`id` cuid · `folio String @unique` (`D-000045`) · `saleId String` (FK `onDelete: Restrict`) · `subtotal Decimal(12,2)` · `impuestos Decimal(12,2)` · `total Decimal(12,2)` (importes devueltos, positivos) · `metodoReembolso PaymentMethod` · `motivo String` · `cajeroId String` (FK → `User`) · `createdAt DateTime @default(now())`.
Relaciones: `sale Sale`, `cajero User`, `lines ReturnLine[]`.
Índices: `@@index([saleId])`, `@@index([createdAt])`.

### `ReturnLine`

`id` cuid · `returnId String` (FK Cascade) · `saleLineId String` (FK `onDelete: Restrict`) · `variantId String` · `cantidad Int` · `baseNeta Decimal(12,2)` · `impuesto Decimal(12,2)` · `total Decimal(12,2)`.
Relaciones: `return Return`, `saleLine SaleLine`.
Índices: `@@index([returnId])`, `@@index([saleLineId])`.

### `FolioCounter` (infraestructura)

`serie String @id` · `valor Int @default(0)`. Sembrada con `{'V',0}` y `{'D',0}`.

### Enums nuevos

`enum SaleStatus { COMPLETADA CANCELADA }` · `enum PaymentMethod { EFECTIVO TARJETA TRANSFERENCIA }`.

### Relaciones inversas nuevas (no tocan columnas)

`User`: `ventas Sale[] @relation("Cajero")`, `ventasCanceladas Sale[] @relation("CanceladaPor")`, `devoluciones Return[]`.
`Customer`: `compras Sale[]`.
`ProductVariant`: `saleLines SaleLine[]`, `returnLines ReturnLine[]`.

### Vínculo con inventario

Cada `recordMovement` de venta/devolución usa `referenciaTipo: 'venta' | 'devolucion'` y `referenciaId: sale.id | return.id` (campos libres ya existentes en `InventoryMovement`, sin FK). El historial de compras del cliente (placeholder del Bloque 3) se resuelve con `Sale.where({ customerId })`.

## Sección 2 — Cálculo de importes (`src/lib/sales/compute.ts`, puro)

Determinista, única fuente de verdad. La usan el *quote endpoint* y `createSale` (el servidor resuelve `precioUnitario`/`tasaImpuesto` de BD antes de llamarla). Internamente opera en **centavos enteros** para evitar deriva de coma flotante; `round2(x)` = half-up a 2 decimales sobre centavos (no `toFixed`).

### Entrada

```ts
type DescuentoInput = { tipo: 'monto' | 'porcentaje'; valor: number } | null | undefined;

type SaleLineInput = {
  variantId: string;
  cantidad: number;        // entero > 0
  precioUnitario: number;  // base sin IVA, resuelto por el caller
  tasaImpuesto: number;    // p.ej. 0.16, resuelto por el caller
  descuento?: DescuentoInput;
};
type SaleComputeInput = { lineas: SaleLineInput[]; descuentoTicket?: DescuentoInput };
```

### Algoritmo

1. **Base bruta de línea:** `bruta_i = round2(precioUnitario_i · cantidad_i)`.
2. **Descuento de línea:** `descLinea_i = tipo==='porcentaje' ? round2(bruta_i · valor/100) : round2(valor)`, acotado a `[0, bruta_i]`. `baseTrasLinea_i = bruta_i − descLinea_i`.
3. **Descuento de ticket:** `descTicketTotal = tipo==='porcentaje' ? round2(ΣbaseTrasLinea · valor/100) : round2(valor)`, acotado a `[0, ΣbaseTrasLinea]`. Reparto proporcional a `baseTrasLinea_i`: `descTicket_i = round2(descTicketTotal · baseTrasLinea_i / ΣbaseTrasLinea)`. El **residuo** (`descTicketTotal − Σ descTicket_i`, en centavos) se asigna de a un centavo a las líneas de mayor `baseTrasLinea_i` (orden estable por índice para empates) hasta agotarlo → `Σ descTicket_i == descTicketTotal` exacto.
4. **Base neta:** `baseNeta_i = baseTrasLinea_i − descTicket_i` (≥ 0).
5. **IVA por línea:** `impuesto_i = round2(baseNeta_i · tasaImpuesto_i)`.
6. **Total de línea:** `total_i = baseNeta_i + impuesto_i`.
7. **Venta:** `subtotal = Σ baseNeta_i` · `impuestos = Σ impuesto_i` · `total = subtotal + impuestos` · `descuentoLineas = Σ descLinea_i` · `descuentoTicket = descTicketTotal`.

### Salida

```ts
type SaleComputeResultLine = {
  variantId: string; cantidad: number; precioUnitario: number; tasaImpuesto: number;
  baseBruta: number; descuentoLinea: number; descuentoTicketProrrateado: number;
  baseNeta: number; impuesto: number; total: number;
};
type SaleComputeResult = {
  lineas: SaleComputeResultLine[];
  subtotal: number; descuentoLineas: number; descuentoTicket: number;
  impuestos: number; total: number;
};
```

### Reglas y errores

- Lista vacía, `cantidad ≤ 0` o no entera, `precioUnitario < 0`, `tasaImpuesto < 0`, `descuento.valor ≤ 0` → `ValidationError` con la clave del campo (`lineas.${i}.cantidad`, etc.).
- `descuento` que **excede** la base disponible se **acota** (no lanza): 100 % es válido y deja base 0.
- Si el `total` resultante es `≤ 0` → `ValidationError({ _form: 'El total de la venta debe ser mayor que 0.' })`.
- La función **no** conoce permisos, stock, ni si la variante existe. Solo aritmética.

### Devoluciones — `prorateReturnLine(saleLine, cantidadDevuelta)`

- `frac = cantidadDevuelta / saleLine.cantidad`.
- Si `cantidadDevuelta === saleLine.cantidad` (devolución total de la línea) → `{ baseNeta: saleLine.baseNeta, impuesto: saleLine.impuesto, total: saleLine.total }` exactos (sin recalcular).
- Si parcial → `baseNeta = round2(saleLine.baseNeta · frac)`, `impuesto = round2(saleLine.impuesto · frac)`, `total = baseNeta + impuesto`.
- `cantidadDevuelta ≤ 0`, no entera, o `> saleLine.cantidad` → `ValidationError`.
- **Residuo de redondeo entre parciales:** `prorateReturnLine` redondea cada parcial de forma independiente contra la línea original, por lo que varias devoluciones parciales sucesivas pueden desviarse ±1¢ respecto a lo vendido (p. ej. tres devoluciones de 1u sobre una línea de 3 con `baseNeta` que no divide exacto entre 3). Para evitarlo, `createReturn` hace que la devolución que **agota** la línea (contando las previas ya persistidas) tome como importe el **residuo exacto** — `saleLine.baseNeta − Σ(ReturnLine.baseNeta previas)`, ídem impuesto y total —, de modo que una línea totalmente devuelta reconcilia al centavo (`Σ ReturnLine.baseNeta == SaleLine.baseNeta`).

### Pruebas unitarias (`compute.test.ts`, sin BD)

1 línea sin descuento; varias líneas con tasas 16 % y 0 %; descuento de línea monto; descuento de línea %; descuento de ticket % con residuo de centavos que debe cuadrar exacto (`Σ descTicket_i == descTicketTotal`); descuento de línea + ticket combinados; descuento del 100 % (base 0, IVA 0); descuento que excede la base (acotado, no lanza); `total` resultante 0 → error `_form`; `cantidad` 0 / negativa / decimal → error de campo; `precioUnitario` negativo → error; `prorateReturnLine` parcial (2 de 3) y total (3 de 3 == importes originales); `prorateReturnLine` con `cantidad > vendida` → error; property test ligero sobre entradas aleatorias: `round2(Σ baseNeta + Σ impuesto) == total` y `Σ descuentoTicketProrrateado == descuentoTicket`.

## Sección 3 — Capa de servicio

### 3.1 Widening de inventario (prerrequisito)

- `src/lib/inventory/stock-calc.ts` — `computeStock(tipo, stockPrevio, valor)` acepta `'ENTRADA' | 'SALIDA' | 'AJUSTE' | 'VENTA' | 'DEVOLUCION'`. `VENTA` → `{ stockNuevo: stockPrevio − valor, delta: −valor }`; `DEVOLUCION` → `{ stockNuevo: stockPrevio + valor, delta: +valor }`. Se mantiene la guarda exhaustiva `never` (ahora sin ningún `MovementType` sin `case`).
- `src/lib/inventory/movements.ts` — `MovementInput.tipo` amplía a los 5 valores. `VENTA`/`DEVOLUCION` validan `valor` entero `> 0` (rama junto a `ENTRADA`/`SALIDA`). El rechazo `stockNuevo < 0` → `ValidationError` ya cubre `VENTA`. Firma pública, bloqueo `FOR UPDATE` y aceptación de `tx` **sin cambios**.
- No se tocan `AJUSTE` ni las pantallas de inventario del Bloque 2. Se añaden a `movements.itest.ts` casos `VENTA` (baja stock; rechaza si insuficiente) y `DEVOLUCION` (sube stock). Tests de inventario existentes deben seguir verdes.

### 3.2 `src/lib/sales/folio.ts`

`nextFolio(tx: Prisma.TransactionClient, prefijo: 'V' | 'D'): Promise<string>`.
Dentro de la `tx`: `UPDATE "FolioCounter" SET valor = valor + 1 WHERE serie = $1 RETURNING valor` (raw; atómico, serializa por fila). Formatea `${prefijo}-${String(valor).padStart(6, '0')}`. Un rollback de la venta revierte el incremento → folios **sin huecos**. Si la fila no existe → error (el seed la garantiza; los itests siembran vía `globalSetup`).

### 3.3 `src/lib/sales/sales.ts`

**`createSale(actorId: string, input: CreateSaleInput, ip: string | null): Promise<{ id: string; folio: string }>`**

Una `db.$transaction`:
1. `customerId ?? ` id del cliente `esGenerico` (`db.customer.findFirstOrThrow({ where: { esGenerico: true } })`).
2. `tx.productVariant.findMany({ where: { id: { in: [...ids] } }, include: { product: { include: { taxRate: true } } } })`. Falta alguna → `ValidationError({ [`lineas.${i}.variantId`]: 'El producto ya no está disponible.' })`. `variant.archivada` / `variant.product.archivado` / `variant.disponible === false` → `ValidationError` por línea.
3. `computeSale({ lineas: <con precioUnitario = Number(variant.precioVenta), tasaImpuesto = Number(variant.product.taxRate.tasa)>, descuentoTicket })` → desglose autoritativo. Los importes del cliente **no** se usan.
4. Validar pagos: `pagado = round2(Σ input.pagos.monto)`. `pagado < result.total` → `ValidationError({ _form: 'El pago no cubre el total.' })`. `cambio = round2(pagado − result.total)`. Si `cambio > 0` y **no** hay un pago `EFECTIVO` con `monto ≥ cambio` → `ValidationError({ _form: 'El cambio solo se entrega en efectivo.' })`.
5. Snapshot fiscal: si `input.requiereFactura` → cargar `customer`; si el cliente **no** tiene el bloque fiscal completo (o es genérico) → `ValidationError({ _form: 'El cliente no tiene datos de facturación completos.' })`; si lo tiene → `datosFiscales = { rfc, razonSocial, regimenFiscalCode, usoCfdiCode, cpFiscal }`.
6. `folio = await nextFolio(tx, 'V')`.
7. `tx.sale.create({ data: { folio, estado: 'COMPLETADA', customerId, cajeroId: actorId, subtotal, descuentoLineas, descuentoTicket, impuestos, total, pagado, cambio, requiereFactura, datosFiscales, lines: { create: [...snapshots] }, payments: { create: input.pagos } } })`.
8. Por línea: `recordMovement({ variantId, tipo: 'VENTA', valor: cantidad, motivo: `Venta ${folio}`, actorId, referenciaTipo: 'venta', referenciaId: sale.id }, tx)`. Cualquier fallo (stock insuficiente) revierte **toda** la transacción, folio incluido.
9. `logActivity({ actorId, accion: 'ventas.crear', entidad: 'Sale', entidadId: sale.id, metadata: { folio, total, nLineas: lines.length, customerId, metodos: [...distinct] }, ip }, tx)`.
10. Devuelve `{ id: sale.id, folio }`.

**`cancelSale(actorId: string, saleId: string, motivo: string, ip: string | null): Promise<void>`**
- Carga `sale` con `lines` y `returns`. `estado !== 'COMPLETADA'` → `ValidationError({ _form: 'Solo se puede cancelar una venta completada.' })`. Si `sale.createdAt` no cae en la fecha local de hoy (America/Mexico_City) → `ValidationError({ _form: 'Solo se cancelan ventas del mismo día; usa una devolución.' })`. Si `sale.returns.length > 0` → `ValidationError({ _form: 'La venta tiene devoluciones; no se puede cancelar.' })`. `motivo.trim()` vacío → `ValidationError({ motivo: 'Indica el motivo.' })`.
- `tx`: por línea `recordMovement({ variantId, tipo: 'DEVOLUCION', valor: cantidad, motivo: `Cancelación ${folio}`, actorId, referenciaTipo: 'venta', referenciaId: saleId }, tx)`; `tx.sale.update({ where: { id: saleId }, data: { estado: 'CANCELADA', canceladaEn: new Date(), canceladaPorId: actorId, motivoCancelacion: motivo.trim() } })`; `logActivity('ventas.cancelar', { folio, total, motivo }, tx)`. Los `Payment` no se tocan.

**`getSale(id: string): Promise<SaleDetail | null>`** — `SaleDetail` = campos de `Sale` (importes como `number`) + `clienteNombre` + `cajeroNombre` + `canceladaPorNombre?` + `lines: SaleLineDetail[]` + `payments: { metodo, monto }[]` + `returns: { id, folio, total, createdAt }[]` + `devuelto: { [saleLineId]: number }` (cantidades ya devueltas por línea, para la pantalla de devolución). `null` si no existe.

**`listSales(filtro: ListSalesFilter): Promise<{ rows: SaleRow[]; total: number }>`**
`ListSalesFilter = { q?: string; estado?: 'COMPLETADA' | 'CANCELADA' | 'todas'; cajeroId?: string; customerId?: string; desde?: Date; hasta?: Date; page: number; pageSize: number }`.
`SaleRow = { id, folio, fecha: Date, cliente: string, cajero: string, nLineas: number, total: number, estado: SaleStatus }`.
`where`: `estado` (salvo `'todas'`); `cajeroId`; `customerId`; `createdAt` entre `desde`/`hasta`; `q` → `OR: [{ folio: { contains: term, mode: 'insensitive' } }, { customer: { nombre: { contains: term, mode: 'insensitive' } } }]`. Orden `createdAt desc`. `total` de `count(where)`. Paginación `skip`/`take`.

### 3.4 `src/lib/sales/returns.ts`

**`createReturn(actorId: string, input: CreateReturnInput, ip: string | null): Promise<{ id: string; folio: string }>`**
`db.$transaction`:
1. `tx.sale.findUnique({ where: { id: input.saleId }, include: { lines: true, returns: { include: { lines: true } } } })`. No existe → `ValidationError({ _form: 'La venta no existe.' })`. `estado === 'CANCELADA'` o `!== 'COMPLETADA'` → `ValidationError({ _form: '…' })`.
2. Por cada `{ saleLineId, cantidad }`: localizar la `SaleLine` (debe pertenecer a la venta, si no → `ValidationError` por línea). `yaDevuelto = Σ (ReturnLine.cantidad de esa saleLineId en sale.returns)`. `cantidad > saleLine.cantidad − yaDevuelto` → `ValidationError({ [`lineas.${i}.cantidad`]: `Máximo devolvible: ${disp}.` })`.
3. `prorateReturnLine(saleLine, cantidad)` por línea. `subtotal = Σ baseNeta`, `impuestos = Σ impuesto`, `total = Σ total`.
4. `folio = await nextFolio(tx, 'D')`. `tx.return.create({ data: { folio, saleId, cajeroId: actorId, subtotal, impuestos, total, metodoReembolso: input.metodoReembolso, motivo: input.motivo.trim(), lines: { create: [...] } } })`.
5. Por línea: `recordMovement({ variantId, tipo: 'DEVOLUCION', valor: cantidad, motivo: `Devolución ${folioD} de ${folioV}`, actorId, referenciaTipo: 'devolucion', referenciaId: return.id }, tx)`.
6. `logActivity('ventas.devolver', { folioD, folioV, total, metodoReembolso, nLineas }, tx)`.

**`getReturn(id: string): Promise<ReturnDetail | null>`** — devolución + líneas (con `productoNombre` vía la `SaleLine`) + `{ ventaId, ventaFolio }`.
**`listReturns(filtro): Promise<{ rows: ReturnRow[]; total: number }>`** — `ReturnRow = { id, folio, fecha, ventaFolio, total, cajero }`; filtros `saleId?`, `desde?`, `hasta?`, `page`, `pageSize`; orden `createdAt desc`.

### 3.5 Tests de integración (`sales.itest.ts`, `returns.itest.ts`, `folio.itest.ts`)

Aislamiento: `beforeEach`/`afterAll` limpian en orden FK-seguro (`activityLog` → `payment` → `returnLine` → `return` → `saleLine` → `sale` → `inventoryMovement` → `productVariant` → `product` → `user` de prueba); **nunca** borran el cliente `esGenerico`, los roles de sistema, `taxRate`, ni reinician `FolioCounter` a mano (se restaura su valor canónico si un test lo consume — o se acepta el avance monotónico y los asserts comprueban prefijo/formato, no el número exacto, salvo el test dedicado de folios que corre aislado).

Casos:
- `createSale` 1 línea → `Sale` COMPLETADA; `SaleLine`/`Payment` correctos; stock de la variante baja exactamente `cantidad`; `InventoryMovement` `VENTA` con `referenciaId = sale.id`; auditoría `ventas.crear`; `getSale` devuelve el desglose.
- Multi-línea, tasas 16 % y 0 %, descuento de línea + descuento de ticket → importes de `Sale`/`SaleLine` == `computeSale`; `pagado`/`cambio` con sobrepago en efectivo.
- Pago insuficiente → `ValidationError`; nada creado (rollback); `FolioCounter` **no** avanzó.
- Stock insuficiente en 1 de 3 líneas → rollback total; ninguna venta ni movimiento; folio no consumido.
- Variante archivada / producto archivado / `disponible:false` → `ValidationError` por línea.
- `requiereFactura` con cliente facturable → `datosFiscales` snapshot; con cliente genérico o sin bloque fiscal → `ValidationError`.
- `cancelSale`: mismo día → `CANCELADA`, stock reintegrado (movimientos `DEVOLUCION`), auditoría; venta de "ayer" (se fuerza `createdAt`) → `ValidationError`; venta con devolución previa → `ValidationError`.
- `createReturn`: parcial (2 de 3) → `Return` + líneas, stock sube 2, importes prorrateados; total (3 de 3) → importes == `SaleLine`; exceder lo devolvible → `ValidationError`; segunda devolución que agota el resto → OK; sobre venta `CANCELADA` → `ValidationError`; auditoría `ventas.devolver`.
- `nextFolio`: dos ventas seguidas → `…001`, `…002`; venta con rollback entre medias no deja hueco (test aislado que fija el estado de `FolioCounter`).
- Concurrencia: dos `createSale` en paralelo sobre una variante con stock 1 → una gana, la otra `ValidationError` (lo garantiza `FOR UPDATE` de `recordMovement`).
- `listSales` / `listReturns`: filtros `estado`, `cajeroId`, rango de fechas, `q` por folio y por nombre de cliente; orden `createdAt desc`; `total` de `count`.
- Visor de auditoría del Bloque 1: `ventas.crear` / `ventas.cancelar` / `ventas.devolver` en `KNOWN_ACTIONS`, `actionLabel` las traduce.

## Sección 4 — Validación y Server Actions

### 4.1 `src/lib/validation/sale.ts` (Zod 4)

```ts
const descuentoSchema = z
  .object({ tipo: z.enum(['monto', 'porcentaje']), valor: z.coerce.number().gt(0) })
  .nullable()
  .optional();

const saleLineSchema = z.object({
  variantId: z.string().min(1),
  cantidad: z.coerce.number().int().gt(0),
  descuento: descuentoSchema,
});

const pagoSchema = z.object({
  metodo: z.enum(['EFECTIVO', 'TARJETA', 'TRANSFERENCIA']),
  monto: z.coerce.number().gt(0),
});

export const createSaleSchema = z
  .object({
    customerId: z.string().optional().or(z.literal('')).transform((v) => v || null),
    lineas: z.array(saleLineSchema).min(1, 'Agrega al menos un producto.'),
    descuentoTicket: descuentoSchema,
    pagos: z.array(pagoSchema).min(1, 'Registra al menos un pago.'),
    requiereFactura: z.coerce.boolean().default(false),
  })
  .superRefine((d, ctx) => {
    for (const [i, l] of d.lineas.entries())
      if (l.descuento?.tipo === 'porcentaje' && l.descuento.valor > 100)
        ctx.addIssue({ code: 'custom', path: ['lineas', i, 'descuento', 'valor'], message: 'Máximo 100 %.' });
    if (d.descuentoTicket?.tipo === 'porcentaje' && d.descuentoTicket.valor > 100)
      ctx.addIssue({ code: 'custom', path: ['descuentoTicket', 'valor'], message: 'Máximo 100 %.' });
  });
export type CreateSaleInput = z.infer<typeof createSaleSchema>;
```

`src/lib/validation/return.ts`:

```ts
export const createReturnSchema = z.object({
  saleId: z.string().min(1),
  lineas: z
    .array(z.object({ saleLineId: z.string().min(1), cantidad: z.coerce.number().int().gt(0) }))
    .min(1, 'Selecciona al menos una línea.'),
  metodoReembolso: z.enum(['EFECTIVO', 'TARJETA', 'TRANSFERENCIA']),
  motivo: z.string().trim().min(3, 'Indica el motivo.').max(300),
});
export type CreateReturnInput = z.infer<typeof createReturnSchema>;
```

El descuento se persiste **ya resuelto a monto** en `SaleLine.descuentoMonto` / `Sale.descuentoTicket` (la venta guarda importes, no fórmulas — historial inmutable). `computeSale` hace la resolución.

### 4.2 `src/app/(app)/ventas/actions.ts` (`'use server'`)

Idioma de Bloques 1–3: `fieldErrorsFrom(ZodError)`, `fromValidationError(ValidationError): FormState` (split `{ _form, ...fieldErrors }`), `ip()` = `getClientIp(await headers())`. `requirePermission(...)` **primera sentencia**; `redirect()` fuera de try/catch; solo `ValidationError` capturado, `ForbiddenError` se propaga.

| Action | Permiso (1ª línea) | Comportamiento | Devuelve |
|---|---|---|---|
| `crearVentaAction(_prev, formData)` | `ventas.crear` | Parsea `payload = JSON.parse(formData.get('payload'))` en try/catch → `ValidationError({ payload: 'Datos de venta inválidos.' })`. Si `payload` trae descuento de línea o de ticket **y** el actor no tiene `ventas.descuento` → `ValidationError({ _form: 'No tienes permiso para aplicar descuentos.' })`. `createSaleSchema.safeParse` → `createSale(actor.id, data, ip)` → `revalidatePath('/ventas/historial')` → `redirect('/ventas/<id>')`. | redirige |
| `cancelarVentaAction(_prev, formData)` | `ventas.cancelar` | lee `saleId` + `motivo`; `cancelSale`; `revalidatePath('/ventas/historial')` + `/ventas/<id>`; `{ ok: true }`. | `FormState` |
| `crearDevolucionAction(_prev, formData)` | `ventas.devolver` | `payload` JSON → `createReturnSchema` → `createReturn` → `revalidatePath` → `redirect('/ventas/devoluciones/<id>')`. | redirige |

### 4.3 `src/app/(app)/ventas/quote/route.ts` — presupuesto en vivo

`export const runtime = 'nodejs'`. `POST`. Gate: `try { await requirePermission('ventas.crear') } catch (e) { if (e instanceof ForbiddenError) return NextResponse.json({ error: e.message }, { status: 403 }); throw e }`.
Body JSON `{ lineas: [{ variantId, cantidad, descuento? }], descuentoTicket? }`. Resuelve `precioUnitario`/`tasaImpuesto` con un `db.productVariant.findMany({ where: { id: { in } }, include: { product: { include: { taxRate: true } } } })`; variante inexistente/archivada/no disponible → `NextResponse.json({ error, campo }, { status: 400 })`. Llama `computeSale`; devuelve `SaleComputeResult` como JSON (200). Errores de `computeSale` (`ValidationError`) → 400 con `fieldErrors`.
`route.itest.ts`: 403 sin `ventas.crear`; 200 con desglose correcto para 2 líneas (tasas mixtas + descuento de ticket); variante inexistente → 400.

### 4.4 Tests de integración de actions (`actions.itest.ts`)

Mock de `next/headers`, `next/cache` (`revalidatePath`), `next/navigation` (`redirect` → lanza `REDIRECT:<url>`). Aislamiento como en Bloques 2–3 (siembra usuario por rol de sistema, limpia `sale`/`payment`/`return*`/`saleLine`/`inventoryMovement` y usuarios de prueba; nunca borra el genérico ni roles de sistema).
- Sesión **Empleado** → `crearVentaAction` → `ForbiddenError`, nada creado.
- Sesión **Cajero** (sin `ventas.descuento`): venta sin descuento → `REDIRECT:/ventas/…`; venta con descuento de línea o ticket en el payload → `_form` "No tienes permiso para aplicar descuentos.", nada creado; `cancelarVentaAction` → `ForbiddenError`.
- Sesión **Cajero** → `crearDevolucionAction` sobre una venta previa → `REDIRECT:/ventas/devoluciones/…`.
- Sesión **Gerente**: crear con descuento, cancelar, devolver → todas OK.
- Zod: `payload` con `lineas: []` → `fieldErrors.lineas`, sin redirect. Pago que no cubre el total → `_form`, sin redirect, `FolioCounter` intacto.

## Sección 5 — Pantallas

Español, Tailwind v4, RSC + client components. Cada page server: `requirePermission(...)` primera sentencia, `export const dynamic = 'force-dynamic'`, `redirect()`/`notFound()` fuera de try/catch. `useActionState` en los forms. Sin `any`, sin `console.*`.

### 5.1 `/ventas` — Pantalla de cajero (`ventas.crear`)

Dos columnas.

**Izquierda — añadir productos.**
- `ProductSearchInput` con **foco permanente** (re-enfoca tras cada acción). Al confirmar (Enter/scan): si el valor casa con un código de barras **exacto** (`searchProducts`, `exactBarcode === true`) → añade esa variante al carrito con cantidad 1 (si ya está, suma 1) y limpia el input; si no, muestra la lista de coincidencias (nombre, SKU, precio con IVA vía `precioConImpuesto`, stock) y clic añade. Si el producto tiene >1 variante activa → `VariantPicker` antes de añadir. Variantes `disponible:false` / archivadas / producto archivado no aparecen.
- `CategoryGrid`: navegación categoría raíz → subcategoría (`listCategoryTree`) y botones de producto (nombre + precio con IVA). Clic = mismo flujo de añadir (con `VariantPicker` si aplica).

**Derecha — carrito y cobro.**
- `CartTable`: producto · variante · precio unit. con IVA (informativo) · cantidad (± y edición directa, entero > 0) · descuento de línea (`DiscountPopover`, monto o %) · importe de línea · quitar.
- `TotalsPanel`: Subtotal · Descuentos · IVA · **Total**, recalculado por `POST /ventas/quote` con **debounce ~250 ms** tras cada cambio del carrito. Nunca se calcula dinero en el navegador de forma autoritativa (se muestran los números que devuelve el endpoint).
- Descuento de ticket (`DiscountPopover`) y todos los controles de descuento envueltos en `<PermissionGate permiso="ventas.descuento" user={actor}>`.
- `CustomerPicker`: por defecto "Público en General"; "Cambiar cliente" abre buscador (`searchCustomers`) con opción "Nuevo cliente" en `<PermissionGate permiso="clientes.crear">` (reutiliza `crearClienteAction`). Casilla **"Requiere factura"** visible solo si el cliente elegido es facturable.
- `PaymentPanel` (al pulsar "Cobrar"): filas `metodo + monto` (añadir/quitar), "Pagado" y "Cambio" en vivo (cálculo local solo para feedback; el servidor manda), atajo "Efectivo exacto" (rellena el total). "Confirmar venta" → `crearVentaAction` con `payload` JSON (`{ customerId, lineas, descuentoTicket, pagos, requiereFactura }`). Éxito → redirige a `/ventas/<id>`.
- Errores de `FormState` (`_form` y por campo `lineas.i…`) se muestran junto al panel; el **carrito no se pierde** (estado React en cliente). Recargar la página lo vacía (aceptado).

### 5.2 `/ventas/historial` — Historial (`ventas.ver`)

`DataTable`: Folio · Fecha · Cliente · Cajero · Nº líneas · Total · Estado (badge `Completada` verde / `Cancelada` gris). Filtros GET: `q` (folio o cliente), `estado` (select `todas`/`COMPLETADA`/`CANCELADA`), `cajero` (select de usuarios activos), `desde`/`hasta` (`parseDateParam`). `Pagination`. Fila → `/ventas/<id>`. "Exportar CSV" `<a href="/ventas/historial/export?<filtros>">`.

### 5.3 `/ventas/historial/export/route.ts` (`ventas.ver`)

`runtime='nodejs'`; gate `try/catch` `ForbiddenError` → 403. Lee `q`/`estado`/`cajero`/`desde`/`hasta`; `listSales({ ..., page:1, pageSize:5000 })`. CSV con BOM `﻿`, cabecera `Folio,Fecha,Cliente,Cajero,Nº líneas,Subtotal,Descuentos,IVA,Total,Estado,Métodos de pago`. El RFC del snapshot fiscal **no** se exporta en este CSV (solo folio/cliente/importes). `content-disposition: attachment; filename="ventas-<YYYY-MM-DD>.csv"`. `route.itest.ts`: 403 sin permiso; 200 `text/csv` con una venta sembrada (folio y total en el cuerpo).

### 5.4 `/ventas/[id]` — Detalle de venta (`ventas.ver`)

`getSale(id)` → `notFound()` si null. Cabecera: folio, fecha, estado, cliente, cajero. Badges (`Cancelada` con motivo y quién, `Requiere factura`). Secciones: líneas (snapshots + importes), totales, pagos + cambio, datos fiscales snapshot (RFC **enmascarado** en pantalla vía `enmascararRfc`), devoluciones asociadas (folio D, fecha, total, enlace a `/ventas/devoluciones/<id>`).
Acciones:
- **"Imprimir ticket"** (siempre) → `/ventas/[id]/ticket`.
- **"Cancelar venta"** en `<PermissionGate permiso="ventas.cancelar">`, visible solo si `estado==='COMPLETADA'` **y** es del día **y** sin devoluciones; `CancelSaleForm` pide `motivo` + `confirm()` → `cancelarVentaAction`.
- **"Registrar devolución"** en `<PermissionGate permiso="ventas.devolver">`, visible si `estado==='COMPLETADA'` y queda algo devolvible → enlace a `/ventas/[id]/devolucion`.

### 5.5 `/ventas/[id]/ticket` — Ticket imprimible (`ventas.ver`)

Página server con layout minimal (ancho tira ~80 mm, sin nav), CSS `@media print`, `PrintOnMount` (client) llama `window.print()` al montar. Contenido: nombre del negocio (`AppSetting` — si no existe, texto genérico "Punto de venta"), folio, fecha/hora, cajero, cliente, líneas (`cant × precio (− desc) → importe`), subtotal, descuentos, IVA, **TOTAL**, pagos por método, **CAMBIO**, y si `requiereFactura` un aviso "Solicitó factura — RFC ******" (enmascarado). Pie: "Comprobante no fiscal".

### 5.6 `/ventas/[id]/devolucion` — Nueva devolución (`ventas.devolver`)

`getSale(id)` → `notFound()` si null o `estado!=='COMPLETADA'`. `ReturnForm` (client): tabla de líneas de la venta con `vendido`, `ya devuelto` (de `getSale().devuelto`), **cantidad a devolver** (input, máx = `vendido − yaDevuelto`), importe estimado a reembolsar (prorrateo en vivo, cálculo local solo informativo). Select `metodoReembolso`, campo `motivo`. "Confirmar devolución" → `crearDevolucionAction` (`payload` JSON) → redirige a `/ventas/devoluciones/<id>`.

### 5.7 `/ventas/devoluciones` y `/ventas/devoluciones/[id]` (`ventas.ver`)

Listado (`DataTable`: Folio D · Fecha · Venta origen · Total · Cajero; filtros `desde`/`hasta`; `Pagination`; fila → detalle). Detalle: líneas prorrateadas (producto, cantidad, base, IVA, total), método de reembolso, motivo, enlace a la venta. Sin ticket dedicado (el navegador imprime el detalle).

### 5.8 Navegación (`src/lib/nav.ts`)

`+ { href: '/ventas', label: 'Punto de venta', permiso: 'ventas.crear' }` y `+ { href: '/ventas/historial', label: 'Ventas', permiso: 'ventas.ver' }`. Sin badge.

### 5.9 Componentes nuevos bajo `src/app/(app)/ventas/`

`CashierScreen.tsx` (client, orquesta carrito + quote + cobro), `ProductSearchInput.tsx`, `CategoryGrid.tsx`, `VariantPicker.tsx`, `CartTable.tsx`, `DiscountPopover.tsx`, `CustomerPicker.tsx`, `PaymentPanel.tsx`, `TotalsPanel.tsx`, `SaleRow.tsx`, `CancelSaleForm.tsx`, `ReturnForm.tsx`, `TicketView.tsx`, `PrintOnMount.tsx`.

### 5.10 Testing de UI

Sin unit tests de RSC (patrón de Bloques 2–3). Verificación por tarea: `typecheck` + `lint` + `build` + suites completas. Cobertura funcional por **E2E** (§6.5).

## Sección 6 — RBAC, auditoría, seed, migración, E2E, fuera de alcance

### 6.1 Permisos (grupo `ventas` en `src/lib/auth/rbac.ts`)

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
}
```

`PermissionKey` / `ALL_PERMISSION_KEYS` derivados (no se editan a mano).

**Reparto** — en `src/lib/auth/role-permissions.ts` (`ROLE_PERMISSIONS`, fuente única compartida seed↔`admin.itest.ts`, creada en el Bloque 3): Administrador todas (vía `ALL_PERMISSION_KEYS`); **Gerente** += las 5; **Cajero** += `ventas.crear`, `ventas.ver`, `ventas.devolver`; **Empleado** sin cambios (ninguna clave de ventas).

### 6.2 Auditoría (`src/lib/audit.ts`)

`AuditAction` y `LABELS` += `'ventas.crear'` ("Registro de venta"), `'ventas.cancelar'` ("Cancelación de venta"), `'ventas.devolver'` ("Devolución registrada"). `KNOWN_ACTIONS` derivado. Escritura dentro de la misma `db.$transaction` que la mutación. El RFC **no** aparece en metadata de auditoría (el snapshot fiscal vive en `Sale.datosFiscales`; en pantalla/ticket va enmascarado).

### 6.3 Seed (`prisma/seed.ts`)

- `upsert` de `FolioCounter` `{ serie: 'V' }` y `{ serie: 'D' }` con `create: { valor: 0 }` y `update: {}` (idempotente, **no** reinicia).
- Las claves `ventas.*` se añaden a los arrays de rol en `role-permissions.ts` (§6.1) — el espejo de `admin.itest.ts` queda cubierto por la fuente única.
- `src/lib/__tests__/seed-bloque4.itest.ts`: `FolioCounter` tiene filas `V` y `D`; Gerente tiene las 5 claves `ventas.*`; Cajero tiene `crear`/`ver`/`devolver` y **no** `descuento`/`cancelar`; Empleado no tiene ninguna.

### 6.4 Migración

`npx prisma migrate dev --name bloque4_ventas`. **Aditiva:** tablas nuevas (`Sale`, `SaleLine`, `Payment`, `Return`, `ReturnLine`, `FolioCounter`), enums nuevos (`SaleStatus`, `PaymentMethod`), relaciones inversas en `User`/`Customer`/`ProductVariant`. `MovementType` no cambia. Ninguna columna/tabla/enum existente se altera ni se borra. Revisar el `migration.sql` generado antes de aceptar (debe ser solo `CREATE TABLE` / `CREATE TYPE` / `CREATE INDEX` / `ALTER TABLE … ADD CONSTRAINT … FOREIGN KEY` de las nuevas).

### 6.5 E2E (`e2e/ventas.spec.ts`, Playwright)

Datos únicos por corrida; cada `test` autónomo (login propio); reutiliza helpers y el seed de productos/clientes.
1. **Venta con lector:** login Cajero → `/ventas` → teclear el código de barras de una variante sembrada → línea cant 1 → repetir → cant 2 → "Cobrar" → efectivo con sobrepago → "Confirmar venta" → detalle con folio `V-…`, total e IVA correctos, **cambio** correcto; el stock de la variante bajó 2 (verificable en `/productos/<id>`).
2. **Venta con rejilla + variante + descuento (Gerente):** añadir vía `CategoryGrid` un producto con variantes → elegir variante → cantidad 3 → 10 % de descuento de ticket → totales reflejan descuento e IVA sobre base neta → cobrar mixto (tarjeta + efectivo) → detalle correcto.
3. **Cajero no puede descontar:** login Cajero → `/ventas` → los controles de descuento **no** aparecen.
4. **Pago insuficiente:** cobrar con un pago menor al total → error visible, sin redirección, carrito intacto.
5. **Cancelación mismo día (Gerente):** crear venta → detalle → "Cancelar venta" → motivo → confirmar → estado `Cancelada`, stock reintegrado.
6. **Devolución parcial (Cajero):** crear venta de 3 uds → `/ventas/[id]/devolucion` → devolver 1 → confirmar → devolución con total prorrateado, stock sube 1; intentar devolver 3 más → error "Máximo devolvible: 2".
7. **Ticket:** abrir `/ventas/[id]/ticket` → contiene folio, TOTAL y CAMBIO.

### 6.6 Fuera de alcance (bloques posteriores)

- Arqueo / sesión de caja (apertura, cierre, conteo, diferencias) — Bloque 5.
- Timbrado CFDI / PAC — bloque de facturación; aquí solo `requiereFactura` + snapshot.
- Ventas en espera / múltiples tickets abiertos.
- Ventas a crédito / cuenta corriente / abonos.
- Redondeo a 5 ¢, propinas, comisiones de tarjeta, multi-moneda, multi-sucursal/caja.
- Reimpresión con folio fiscal, notas de crédito CFDI.
- Reportes agregados (ventas por día/cajero/producto) — Bloque 6.
- Impresión térmica ESC/POS (aquí `window.print` sobre HTML).
- Edición de una venta ya registrada (cualquier corrección es cancelación el mismo día o devolución).
