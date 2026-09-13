# Sistema POS — Bloque 5: Caja (sesión de caja / arqueo)

Fecha: 2026-09-04
Estado: Aprobado para plan de implementación
Depende de: Bloque 1 (auth/usuarios/roles/auditoría), Bloque 2 (productos/inventario), Bloque 3 (clientes), Bloque 4 (ventas — `createSale`/`createReturn`/`cancelSale`, `FolioCounter`, `Payment`, `Sale`, `Return`). Todo en `master`.

## Contexto

Quinto sub-proyecto del POS. Alcance: **núcleo de caja** — sesión de caja única, apertura con fondo, retiros e ingresos manuales, cierre con arqueo a ciegas, corte imprimible, historial y export. Cada venta y cada devolución del Bloque 4 pasa a pertenecer a una sesión de caja.

Fuera: caja chica / gastos con catálogo, desglose por denominación, múltiples cajas simultáneas, conteo intermedio ("X"), conciliación bancaria/datáfono, justificación obligatoria de diferencias, reportes agregados de cortes (Bloque 6), reapertura/edición de un corte cerrado, impresión térmica ESC/POS.

### Reutiliza (Bloques 1–4, en `master`)

`requirePermission`/`getCurrentUser` (`@/lib/auth/context`), `PERMISSIONS`/`can`/`ALL_PERMISSION_KEYS`/`PermissionKey` (`@/lib/auth/rbac`), `ROLE_PERMISSIONS` (`@/lib/auth/role-permissions` — fuente única seed↔tests), `logActivity`/`actionLabel`/`KNOWN_ACTIONS`/`AuditAction` (`@/lib/audit`), `parseDateParam` (`@/lib/activity/query`), `type FormState` (`@/app/(auth)/setup/actions`), `ValidationError`/`ForbiddenError` (`@/lib/errors`), `db` (`@/lib/db`), `getClientIp` (`@/lib/http`), `nextFolio` (`@/lib/sales/folio` — se reutiliza el mecanismo de `FolioCounter`), `fmtFechaMX`/`money` (`@/app/(app)/ventas/types`), `listSales`/`getSale` (`@/lib/sales/sales`), `DataTable`/`Column`/`Pagination`/`PermissionGate` (`@/components/*`), `visibleNav`/`NAV_ITEMS` (`@/lib/nav`), el helper de escape CSV local (`esc`).

### Stack (heredado, sin cambios)

Next.js 16.3.4 (App Router; gate `src/proxy.ts`), React 19.2, TypeScript strict (sin `any`), PostgreSQL vía Prisma 7 + `@prisma/adapter-pg` (`src/lib/db.ts` único `PrismaClient`; excepción `prisma/seed.ts`), Zod 4, Tailwind v4, Vitest 4 (`*.test.ts` unit sin BD / `*.itest.ts` integración con Postgres efímero), Playwright (`workers:1`, PG efímero, `build`+`start` :3100). UI en español. Un solo negocio, 1 sucursal, sin PAC/SAT.

### Decisiones de diseño (definitivas)

| Tema | Decisión |
|---|---|
| Gating | Una sesión de caja `ABIERTA` es **requisito para CUALQUIER venta o devolución**, sin importar el método de pago. `createSale`/`createReturn` sin sesión abierta → `ValidationError`. Toda `Sale` y toda `Return` se sellan con `cashSessionId`. |
| Simultaneidad | **Una sola sesión abierta en todo el negocio.** La abre un cajero (queda como titular); hasta que se cierre nadie puede abrir otra. `createSale` usa "la sesión abierta" (hay como mucho una). Cualquier usuario con `caja.gestionar` puede cobrar sobre ella. |
| Cierre / arqueo | **Conteo a ciegas, monto único.** El cajero introduce el efectivo contado SIN ver el esperado. El sistema calcula el esperado y muestra la diferencia (sobrante/faltante) DESPUÉS. Sin desglose por denominación. |
| Movimientos de sesión | Al abrir: `fondoApertura` (efectivo inicial). Durante la sesión: `RETIRO` (sacar efectivo) e `INGRESO` (meter efectivo), cada uno con `monto > 0` + `motivo`, auditados. Sin caja chica / gasto categorizado. |
| Fórmula del esperado | `esperadoEfectivo = fondoApertura + totalEfectivoVentas − totalReembolsosEfectivo − totalRetiros + totalIngresos`. `totalEfectivoVentas` = efectivo **neto** retenido = `Σ Payment.monto(EFECTIVO) − Σ Sale.cambio` sobre las ventas `COMPLETADA` de la sesión. Ventas `CANCELADA` se excluyen (su efectivo entró y salió en la misma caja). Tarjeta/transferencia se totalizan **informativos**, no entran en el esperado. |
| Permiso | Una sola clave `caja.gestionar` (abrir, cerrar, mover efectivo, ver, exportar). Seed: Administrador todas · Gerente `caja.gestionar` · Cajero `caja.gestionar` · Empleado ninguna. |
| Cancelar vs caja | `cancelSale` exige que la sesión de la venta siga `ABIERTA` (revierte el efectivo en esa misma caja). Si ya se cortó → devolución. **Sustituye** la regla actual de "mismo día en `America/Mexico_City`" (una venta cuya sesión sigue abierta es del turno en curso). |
| Devolución vs caja | La `Return` se ata a la **sesión abierta actual** (no a la de la venta original); el reembolso en efectivo sale del cajón de ahora, aunque la venta sea de otro día. Reembolso en efectivo también exige caja abierta. |
| Comprobante | El cierre genera un **corte** con folio `C-000045` (serie `C` del `FolioCounter`). Vista imprimible en `/caja-corte/[id]` (fuera del grupo `(app)`, como `/ventas-ticket`). Historial de sesiones + detalle + export CSV bajo `caja.gestionar`. |
| Blind real | El esperado se calcula **dentro** de `closeCashSession`. Ningún endpoint ni pantalla lo expone antes de cerrar. El panel de "caja abierta" muestra solo el fondo y los movimientos manuales. |
| Migración | **Aditiva.** 2 tablas nuevas, 2 enums nuevos, columnas **anulables** `Sale.cashSessionId` / `Return.cashSessionId` (a nivel BD; el servicio las garantiza siempre para filas nuevas — las filas de prueba de Bloques 1–4 quedan `null` y no cuentan en ningún arqueo). `SaleStatus`/`PaymentMethod`/`MovementType` intactos. |

## Arquitectura

Un solo proyecto Next.js. Server Actions como backend. `src/lib/cash/sessions.ts` concentra el ciclo de la sesión y el cálculo del esperado (todo por agregación al cerrar, sin saldo corriente en la fila). `src/lib/cash/movements.ts` (o el mismo archivo) los retiros/ingresos. Los cambios en Ventas (`sales.ts`/`returns.ts`) son aditivos: una guarda + una columna de `data`. Toda mutación entra por una Server Action con `requirePermission('caja.gestionar')` primera sentencia y auditoría dentro de la misma `db.$transaction`.

### Estructura de archivos (nuevos / modificados)

```
prisma/
  schema.prisma            # + CashSession, CashMovement; enums CashSessionStatus, CashMovementType; Sale.cashSessionId?, Return.cashSessionId?; relaciones inversas en User
  seed.ts                  # + upsert FolioCounter { serie: 'C' }
  migrations/<ts>_bloque5_caja/

src/lib/
  auth/rbac.ts             # + grupo 'caja' (1 clave)
  auth/role-permissions.ts # + caja.gestionar en Gerente y Cajero
  audit.ts                 # + caja.abrir / caja.cerrar / caja.movimiento
  nav.ts                   # + ítem "Caja"
  cash/
    sessions.ts            # getOpenCashSession, openCashSession, closeCashSession, computeExpectedCash (interno), getCashSession, listCashSessions
    movements.ts           # recordCashMovement  (o dentro de sessions.ts)
  validation/cash.ts       # openCashSessionSchema, cashMovementSchema, closeCashSessionSchema + tipos
  sales/sales.ts           # createSale: guarda de sesión abierta + cashSessionId; cancelSale: precondición sesión ABIERTA (sustituye esMismoDiaMX); getSale/SaleDetail: + cashSession{Id,Folio,Estado}
  sales/returns.ts         # createReturn: guarda de sesión abierta + cashSessionId; getReturn/ReturnDetail: + cashSession{Id,Folio}
  sales/__testutil.ts      # + helper conCajaAbierta()

src/app/(app)/caja/
  page.tsx                 # enrutador de estado (abrir | panel abierta)
  actions.ts               # abrirCajaAction, registrarMovimientoCajaAction, cerrarCajaAction
  cerrar/page.tsx
  sesiones/[id]/page.tsx   # detalle / corte
  historial/page.tsx
  historial/export/route.ts (+ route.itest.ts)
  AbrirCajaForm.tsx  PanelCajaAbierta.tsx  CashMovementForm.tsx  CerrarCajaForm.tsx
  CorteView.tsx  CajaSessionRow.tsx

src/app/caja-corte/[id]/page.tsx   # corte imprimible, fuera de (app)

src/app/(app)/ventas/page.tsx      # aviso "No hay una caja abierta" + botón "Abrir caja" cuando getOpenCashSession() es null

src/lib/__tests__/seed-bloque5.itest.ts
e2e/caja.spec.ts
e2e/ventas.spec.ts        # + paso "abrir caja" al inicio de cada escenario (helper abrirCaja)
```

## Sección 1 — Modelo de datos (aditivo)

Migración `bloque5_caja`. 2 tablas nuevas, 2 enums nuevos, columnas anulables en `Sale`/`Return`, relaciones inversas en `User`. `FolioCounter` gana la serie `'C'` (dato, no schema).

### `CashSession`

| campo | tipo | nota |
|---|---|---|
| `id` | `String @id @default(cuid())` | |
| `folio` | `String @unique` | `C-000045`, correlativo (serie `C`) |
| `estado` | `CashSessionStatus @default(ABIERTA)` | enum nuevo `{ ABIERTA, CERRADA }` |
| `fondoApertura` | `Decimal @db.Decimal(12,2)` | efectivo inicial capturado al abrir |
| `abiertaPorId` | `String` | FK → `User` (`@relation("AbiertaPor")`) |
| `abiertaEn` | `DateTime @default(now())` | |
| `cerradaPorId` | `String?` | FK → `User` (`@relation("CerradaPor")`) |
| `cerradaEn` | `DateTime?` | |
| `efectivoContado` | `Decimal? @db.Decimal(12,2)` | monto contado a ciegas (se fija al cerrar) |
| `esperadoEfectivo` | `Decimal? @db.Decimal(12,2)` | calculado al cerrar |
| `diferencia` | `Decimal? @db.Decimal(12,2)` | `efectivoContado − esperadoEfectivo` (+ sobrante / − faltante) |
| `totalEfectivoVentas` | `Decimal? @db.Decimal(12,2)` | efectivo neto de ventas (Σ Payment EFECTIVO − Σ cambio), snapshot al cerrar |
| `totalTarjeta` | `Decimal? @db.Decimal(12,2)` | informativo, snapshot al cerrar |
| `totalTransferencia` | `Decimal? @db.Decimal(12,2)` | informativo, snapshot al cerrar |
| `totalReembolsosEfectivo` | `Decimal? @db.Decimal(12,2)` | Σ `Return.total` con `metodoReembolso = EFECTIVO` atadas a la sesión |
| `totalRetiros` | `Decimal? @db.Decimal(12,2)` | Σ `CashMovement` `RETIRO` |
| `totalIngresos` | `Decimal? @db.Decimal(12,2)` | Σ `CashMovement` `INGRESO` |
| `nVentas` | `Int?` | recuento de ventas `COMPLETADA` de la sesión (informativo) |
| `notaCierre` | `String?` | libre, opcional |

Relaciones: `abiertaPor User @relation("AbiertaPor", fields:[abiertaPorId], references:[id])`, `cerradaPor User? @relation("CerradaPor", fields:[cerradaPorId], references:[id])`, `movements CashMovement[]`, `sales Sale[]`, `returns Return[]`.
Índices: `@@index([estado])`, `@@index([abiertaEn])`.
La unicidad de "una sola abierta" NO se expresa con índice único parcial (Prisma no lo modela bien); la impone `openCashSession` con `SELECT … FOR UPDATE` sobre `FolioCounter['C']` (Sección 2.1).

### `CashMovement`

`id` cuid · `sessionId String` (FK `onDelete: Cascade`) · `tipo CashMovementType` (enum nuevo `{ RETIRO, INGRESO }`) · `monto Decimal @db.Decimal(12,2)` (siempre `> 0`) · `motivo String` · `actorId String` (FK → `User`) · `createdAt DateTime @default(now())`.
Relaciones: `session CashSession @relation(...)`, `actor User @relation("ActorMovimientoCaja", ...)`.
Índice: `@@index([sessionId])`.

### Enums nuevos

`enum CashSessionStatus { ABIERTA CERRADA }` · `enum CashMovementType { RETIRO INGRESO }`.

### Columnas nuevas en tablas existentes (anulables, sin default)

- `Sale.cashSessionId String?` + `Sale.cashSession CashSession? @relation(fields:[cashSessionId], references:[id])` + `@@index([cashSessionId])`.
- `Return.cashSessionId String?` + relación análoga + `@@index([cashSessionId])`.

`onDelete` por defecto de Prisma para una FK opcional es `SetNull` — aceptable (borrar una sesión en un test deja las ventas con `cashSessionId` nulo; en producción no se borran sesiones).

### Relaciones inversas nuevas en `User`

`cajasAbiertas CashSession[] @relation("AbiertaPor")`, `cajasCerradas CashSession[] @relation("CerradaPor")`, `movimientosCaja CashMovement[] @relation("ActorMovimientoCaja")`.

### `FolioCounter`

`prisma/seed.ts` añade `upsert { where: { serie: 'C' }, update: {}, create: { serie: 'C', valor: 0 } }` (junto a `V`/`D`, idempotente).

## Sección 2 — Servicios y fórmula del esperado (`src/lib/cash/sessions.ts`)

`import { db }`, sin `new PrismaClient()`, sin `any`, sin `console.*`. Toda mutación: `requirePermission('caja.gestionar')` en la Server Action (Sección 6), auditoría dentro de la misma `db.$transaction`.

### 2.1 Unicidad de "una sola sesión abierta"

`openCashSession`, dentro de su `db.$transaction`, hace **antes** de comprobar si hay sesión abierta:
`await tx.$queryRaw\`SELECT valor FROM "FolioCounter" WHERE serie = 'C' FOR UPDATE\``
Así dos aperturas concurrentes se serializan y la segunda ve la primera ya creada → `ValidationError`. El mismo `SELECT … FOR UPDATE` precede al `UPDATE … SET valor = valor + 1` que consume el folio (`C-<n>`), de modo que un rollback no deja hueco (patrón `nextFolio` del Bloque 4 — se puede reutilizar `nextFolio(tx, 'C')` si se amplía su tipo `prefijo` a `'V' | 'D' | 'C'`; ver Plan).

### 2.2 `getOpenCashSession(): Promise<CashSessionLite | null>`

`db.cashSession.findFirst({ where: { estado: 'ABIERTA' } })`, mapeado a `{ id, folio, fondoApertura: number, abiertaPorId, abiertaPorNombre, abiertaEn }`. Solo lectura, sin candado. Lo usan `createSale`/`createReturn`/`cancelSale` (Sección 3) y las pantallas.

### 2.3 `openCashSession(actorId: string, fondoApertura: number, ip: string | null): Promise<{ id: string; folio: string }>`

`db.$transaction`:
1. `SELECT … FOR UPDATE` de `FolioCounter['C']` (candado).
2. `tx.cashSession.findFirst({ where: { estado: 'ABIERTA' } })` → si existe → `ValidationError({ _form: 'Ya hay una caja abierta.' })`.
3. `fondoApertura < 0` → `ValidationError({ fondoApertura: 'El fondo no puede ser negativo.' })` (Zod ya lo cubre; el servicio revalida).
4. Consumir el folio: `UPDATE "FolioCounter" SET valor = valor + 1 WHERE serie = 'C' RETURNING valor`; `folio = 'C-' + String(valor).padStart(6, '0')`.
5. `tx.cashSession.create({ data: { folio, estado: 'ABIERTA', fondoApertura, abiertaPorId: actorId } })`.
6. `logActivity({ actorId, accion: 'caja.abrir', entidad: 'CashSession', entidadId: session.id, metadata: { folio, fondoApertura }, ip }, tx)`.
7. Devuelve `{ id, folio }`.

### 2.4 `recordCashMovement(actorId: string, input: CashMovementInput, ip: string | null): Promise<{ id: string }>`

`CashMovementInput = { tipo: 'RETIRO' | 'INGRESO'; monto: number; motivo: string }`.
`db.$transaction`:
1. `session = tx.cashSession.findFirst({ where: { estado: 'ABIERTA' } })`. Ninguna → `ValidationError({ _form: 'No hay una caja abierta.' })`.
2. `!(monto > 0)` → `ValidationError({ monto: 'El monto debe ser mayor que 0.' })`. `motivo.trim() === ''` → `ValidationError({ motivo: 'Indica el motivo.' })`.
3. Un `RETIRO` que dejaría el efectivo esperado en negativo **se permite** (el arqueo lo reflejará como descuadre); no se bloquea.
4. `tx.cashMovement.create({ data: { sessionId: session.id, tipo: input.tipo, monto: input.monto, motivo: input.motivo.trim(), actorId } })`.
5. `logActivity({ actorId, accion: 'caja.movimiento', entidad: 'CashMovement', entidadId: mov.id, metadata: { sessionFolio: session.folio, tipo: input.tipo, monto: input.monto, motivo: input.motivo.trim() }, ip }, tx)`.

### 2.5 `computeExpectedCash(sessionId: string, tx: Prisma.TransactionClient)` — helper interno

Agregaciones sobre las filas de **esa** sesión (todo `Decimal`; se devuelve `number` con `round2 = (x) => Math.round(x * 100) / 100`):

```
ventasCompletadas = Sale WHERE cashSessionId = sessionId AND estado = 'COMPLETADA'
pagosEfectivoBruto      = Σ Payment.monto      WHERE payment.saleId ∈ ventasCompletadas AND payment.metodo = 'EFECTIVO'
cambioEfectivo          = Σ Sale.cambio        WHERE sale ∈ ventasCompletadas AND (la venta tuvo algún Payment EFECTIVO)
totalEfectivoVentas     = round2(pagosEfectivoBruto − cambioEfectivo)
totalTarjeta            = round2(Σ Payment.monto WHERE … metodo = 'TARJETA' AND sale ∈ ventasCompletadas)
totalTransferencia      = round2(Σ Payment.monto WHERE … metodo = 'TRANSFERENCIA' AND sale ∈ ventasCompletadas)
totalReembolsosEfectivo = round2(Σ Return.total  WHERE return.cashSessionId = sessionId AND return.metodoReembolso = 'EFECTIVO')
totalRetiros            = round2(Σ CashMovement.monto WHERE sessionId = … AND tipo = 'RETIRO')
totalIngresos           = round2(Σ CashMovement.monto WHERE sessionId = … AND tipo = 'INGRESO')
nVentas                 = count(ventasCompletadas)
```

> **`cambioEfectivo`:** solo se descuenta el cambio de ventas que tuvieron al menos un `Payment` `EFECTIVO` (una venta 100 % tarjeta con `cambio = 0` no aporta nada; el modelo del Bloque 4 solo permite `cambio > 0` si hay un pago EFECTIVO que lo cubre, así que en la práctica `cambio > 0 ⇒ hubo EFECTIVO`, pero la condición se deja explícita).

```
esperadoEfectivo = round2(
  fondoApertura
  + totalEfectivoVentas
  − totalReembolsosEfectivo
  − totalRetiros
  + totalIngresos
)
```

Devuelve `{ esperadoEfectivo, totalEfectivoVentas, totalTarjeta, totalTransferencia, totalReembolsosEfectivo, totalRetiros, totalIngresos, nVentas }`.

### 2.6 `closeCashSession(actorId: string, efectivoContado: number, notaCierre: string | null, ip: string | null): Promise<{ id: string; folio: string; diferencia: number }>`

`db.$transaction`:
1. `session = tx.cashSession.findFirst({ where: { estado: 'ABIERTA' } })`. Ninguna → `ValidationError({ _form: 'No hay una caja abierta.' })`.
2. `efectivoContado < 0` → `ValidationError({ efectivoContado: 'El efectivo contado no puede ser negativo.' })`.
3. `t = await computeExpectedCash(session.id, tx)`.
4. `diferencia = round2(efectivoContado − t.esperadoEfectivo)`.
5. `tx.cashSession.update({ where: { id: session.id }, data: { estado: 'CERRADA', cerradaPorId: actorId, cerradaEn: new Date(), efectivoContado, esperadoEfectivo: t.esperadoEfectivo, diferencia, totalEfectivoVentas: t.totalEfectivoVentas, totalTarjeta: t.totalTarjeta, totalTransferencia: t.totalTransferencia, totalReembolsosEfectivo: t.totalReembolsosEfectivo, totalRetiros: t.totalRetiros, totalIngresos: t.totalIngresos, nVentas: t.nVentas, notaCierre: notaCierre?.trim() || null } })`.
6. `logActivity({ actorId, accion: 'caja.cerrar', entidad: 'CashSession', entidadId: session.id, metadata: { folio: session.folio, esperadoEfectivo: t.esperadoEfectivo, efectivoContado, diferencia }, ip }, tx)`.
7. Devuelve `{ id: session.id, folio: session.folio, diferencia }`.

**Blind:** `computeExpectedCash` NO se exporta ni se expone por ningún endpoint/pantalla antes del cierre. La pantalla de "caja abierta" muestra solo el fondo y los movimientos manuales.

### 2.7 `getCashSession(id: string): Promise<CashSessionDetail | null>`

`db.cashSession.findUnique({ where: { id }, include: { abiertaPor: { select: { nombre: true } }, cerradaPor: { select: { nombre: true } }, movements: { include: { actor: { select: { nombre: true } } }, orderBy: { createdAt: 'asc' } } } })`.
`CashSessionDetail` = campos de `CashSession` (importes `number`, `null` los `*?` de una sesión abierta) + `abiertaPorNombre` + `cerradaPorNombre: string | null` + `movements: { id; tipo; monto: number; motivo; actorNombre: string; createdAt: Date }[]`. `null` si no existe.

### 2.8 `listCashSessions(filtro: ListCashSessionsFilter): Promise<{ rows: CashSessionRow[]; total: number }>`

`ListCashSessionsFilter = { estado?: 'ABIERTA' | 'CERRADA' | 'todas'; desde?: Date; hasta?: Date; page: number; pageSize: number }`.
`CashSessionRow = { id; folio; estado: 'ABIERTA' | 'CERRADA'; abiertaEn: Date; cerradaEn: Date | null; abiertaPor: string; fondoApertura: number; efectivoContado: number | null; diferencia: number | null }`.
`where`: `estado` (salvo `'todas'`); `abiertaEn` entre `desde`/`hasta` (solo claves presentes). `Promise.all([count(where), findMany({ where, include: { abiertaPor: { select: { nombre: true } } }, orderBy: { abiertaEn: 'desc' }, skip, take })])`. `total` de `count(where)`.

### 2.9 Tests de integración (`sessions.itest.ts`)

Aislamiento (orden FK-seguro en `beforeEach`/`afterAll`): `activityLog` → `payment` → `returnLine` → `return` → `saleLine` → `sale` → `cashMovement` → `cashSession` → `inventoryMovement` → `productVariant` → `product` → usuarios de prueba. Nunca borrar el cliente `esGenerico`, roles de sistema, `taxRate`; `FolioCounter` serie `'C'` se restaura a un valor conocido en los tests que aseveran el número exacto de folio (corren aislados), el resto asevera `/^C-\d{6}$/`.

Casos:
- `openCashSession` sin ninguna abierta → `ABIERTA`, folio `C-000001`, audita `caja.abrir` con `metadata.fondoApertura`. Con una ya abierta → `ValidationError`, `FolioCounter['C']` no avanzó.
- Concurrencia: dos `openCashSession` en paralelo (`Promise.allSettled`) → exactamente una cumple, la otra `ValidationError` (candado `FOR UPDATE`).
- `recordCashMovement` `RETIRO`/`INGRESO` con caja abierta → crea, audita `caja.movimiento`; sin caja abierta → `ValidationError({ _form })`; `monto: 0` → `ValidationError({ monto })`; `motivo: '  '` → `ValidationError({ motivo })`.
- `closeCashSession` — escenario compuesto: fondo 1000; 3 ventas en efectivo (una con `cambio > 0`); 1 venta con tarjeta; 1 venta cancelada (`cancelSale`); 1 devolución en efectivo (`createReturn`); 1 `RETIRO` 300; 1 `INGRESO` 50. Assert: `esperadoEfectivo` == la fórmula calculada a mano en el test; `totalEfectivoVentas` == efectivo neto (con el cambio descontado); `totalTarjeta` refleja la venta con tarjeta; la venta cancelada **no** cuenta en `totalEfectivoVentas` ni en `nVentas`; `totalReembolsosEfectivo` == la devolución; `diferencia` con `efectivoContado` deliberadamente sobrante (`+X`) y, en otro sub-test, faltante (`−Y`); `estado='CERRADA'`, todos los `total*` fotografiados, audita `caja.cerrar`.
- `closeCashSession` sin caja abierta → `ValidationError`.
- Tras cerrar: `getOpenCashSession()` → `null`; una nueva `openCashSession` funciona y da `C-000002`.
- `getCashSession` de una sesión abierta → `esperado*`/`contado`/`diferencia`/`total*` en `null`, `movements` presentes; de una cerrada → todos presentes. `listCashSessions` filtra por `estado` y rango de fechas; orden `abiertaEn desc`; `total` de `count`.
- Visor de auditoría del Bloque 1: `caja.abrir`/`caja.cerrar`/`caja.movimiento` en `KNOWN_ACTIONS`, `actionLabel` las traduce.

## Sección 3 — Cambios en Ventas (Bloque 4), aditivos

### 3.1 `src/lib/sales/sales.ts`

**`createSale`** — dentro de la `db.$transaction`, ANTES de resolver el cliente y las variantes:
```ts
const session = await tx.cashSession.findFirst({ where: { estado: 'ABIERTA' } });
if (!session) {
  throw new ValidationError({ _form: 'No hay una caja abierta. Abre la caja para registrar ventas.' });
}
```
`tx.sale.create({ data: { …, cashSessionId: session.id } })`. Sin otro cambio (importes, `recordMovement`, cambio, snapshot fiscal, auditoría, `invalidateStockAlertsCache()` tras el commit — todo igual).

**`cancelSale`** — cargar la venta con `include: { lines: true, returns: true, cashSession: { select: { estado: true, folio: true } } }`. Nueva precondición, tras el chequeo de `estado === 'COMPLETADA'` y ANTES del de devoluciones:
```ts
if (sale.cashSession?.estado !== 'ABIERTA') {
  throw new ValidationError({ _form: 'La caja de esta venta ya se cerró; registra una devolución.' });
}
```
**Se elimina** el chequeo de `esMismoDiaMX(sale.createdAt, new Date())` y su import en `sales.ts` (la sesión abierta es la condición vinculante). `esMismoDiaMX` y su test unitario se conservan en `@/lib/sales/fecha`. El resto de `cancelSale` no cambia.

**`getSale` / `SaleDetail`** — `SaleDetail` gana `cashSessionId: string | null`, `cashSessionFolio: string | null`, `cashSessionEstado: 'ABIERTA' | 'CERRADA' | null` (via `include: { cashSession: { select: { folio: true, estado: true } } }`).

**`listSales` / `ListSalesFilter`** — `ListSalesFilter` gana `cashSessionId?: string` (filtro directo `where.cashSessionId`). Firma pública por lo demás sin cambios; sus itests se actualizan solo para anteponer la apertura de caja (§3.3).

### 3.2 `src/lib/sales/returns.ts`

**`createReturn`** — dentro de la `db.$transaction`, tras cargar la venta y validar su `estado`:
```ts
const session = await tx.cashSession.findFirst({ where: { estado: 'ABIERTA' } });
if (!session) {
  throw new ValidationError({ _form: 'No hay una caja abierta. Abre la caja para registrar devoluciones.' });
}
```
`tx.return.create({ data: { …, cashSessionId: session.id } })`. La devolución se ata a la **sesión abierta actual**, no a la de la venta original. Aplica a cualquier `metodoReembolso`; solo `EFECTIVO` entra en `esperadoEfectivo` (Sección 2.5), tarjeta/transferencia quedan como informativo del corte.

**`getReturn` / `ReturnDetail`** — `ReturnDetail` gana `cashSessionId: string | null`, `cashSessionFolio: string | null`.
**`listReturns`** — filtro opcional `cashSessionId?`.

### 3.3 Impacto en tests existentes del Bloque 4 (adaptación obligatoria, sin cambiar aserciones de negocio)

`src/lib/sales/__testutil.ts` gana `export async function conCajaAbierta(actorId: string): Promise<string>` que llama `openCashSession(actorId, 0, null)` y devuelve el `id` (o no-op si ya hay una). Los `beforeEach` de `sales.itest.ts`, `returns.itest.ts` y `src/app/(app)/ventas/actions.itest.ts` la invocan tras sembrar el cajero; la limpieza añade `cashMovement`/`cashSession` en el orden FK-seguro (tras `sale`/`return`). Los itests de `folio.itest.ts` no se tocan (no crean ventas). Los asertos de importe, folio y auditoría del Bloque 4 no cambian.

`e2e/ventas.spec.ts` — cada escenario antepone `await abrirCaja(page, 1000)` (helper nuevo en `e2e/helpers.ts` o en el propio spec, compartido con `e2e/caja.spec.ts`): navega a `/caja`, rellena el fondo, "Abrir caja". Los escenarios de cancelación del Bloque 4 (el que probaba "mismo día") siguen pasando porque la sesión sigue abierta durante el test; el aserto de "estado Cancelada" y "stock reintegrado" no cambia.

## Sección 4 — RBAC, auditoría, seed, validación, migración

### 4.1 Permiso (grupo `caja` en `src/lib/auth/rbac.ts`)

```ts
{
  modulo: 'caja', label: 'Caja',
  permisos: [
    { key: 'caja.gestionar', label: 'Abrir y cerrar caja, registrar movimientos y ver cortes' },
  ],
}
```

`PermissionKey` / `ALL_PERMISSION_KEYS` derivados (no se editan a mano). **Reparto** en `src/lib/auth/role-permissions.ts` (`ROLE_PERMISSIONS`, fuente única): Administrador todas (vía `ALL_PERMISSION_KEYS`); **Gerente** += `caja.gestionar`; **Cajero** += `caja.gestionar`; **Empleado** sin cambios.

### 4.2 Auditoría (`src/lib/audit.ts`)

`AuditAction` y `LABELS` += `'caja.abrir'` ("Apertura de caja"), `'caja.cerrar'` ("Cierre de caja"), `'caja.movimiento'` ("Movimiento de caja"). `KNOWN_ACTIONS` derivado. Escritura dentro de la misma `db.$transaction` que la mutación. `metadata` lleva folios y montos, ningún dato sensible.

### 4.3 Navegación (`src/lib/nav.ts`)

`+ { href: '/caja', label: 'Caja', permiso: 'caja.gestionar' }` entre `/ventas/historial` y `/perfil`. Sin badge.

### 4.4 Seed (`prisma/seed.ts`)

- `db.folioCounter.upsert({ where: { serie: 'C' }, update: {}, create: { serie: 'C', valor: 0 } })` (junto a `V`/`D`, idempotente).
- Claves `caja.*` en `role-permissions.ts` (§4.1).
- **No** se siembra ninguna `CashSession`.
- `src/lib/__tests__/seed-bloque5.itest.ts`: `FolioCounter` tiene fila `C`; Gerente y Cajero tienen `caja.gestionar`; Empleado no; `db.cashSession.count()` === 0.

### 4.5 Validación (`src/lib/validation/cash.ts`, Zod 4)

```ts
import { z } from 'zod';

export const openCashSessionSchema = z.object({
  fondoApertura: z.coerce.number().min(0, 'El fondo no puede ser negativo.').max(1_000_000),
});
export type OpenCashSessionInput = z.infer<typeof openCashSessionSchema>;

export const cashMovementSchema = z.object({
  tipo: z.enum(['RETIRO', 'INGRESO']),
  monto: z.coerce.number().gt(0, 'El monto debe ser mayor que 0.').max(1_000_000),
  motivo: z.string().trim().min(3, 'Indica el motivo.').max(300),
});
export type CashMovementInput = z.infer<typeof cashMovementSchema>;

export const closeCashSessionSchema = z.object({
  efectivoContado: z.coerce.number().min(0, 'El efectivo contado no puede ser negativo.').max(1_000_000),
  notaCierre: z.string().trim().max(500).optional().or(z.literal('')).transform((v) => v || null),
});
export type CloseCashSessionInput = z.infer<typeof closeCashSessionSchema>;
```

`sessions.ts` importa `CashMovementInput` de aquí para la firma de `recordCashMovement` (o declara localmente un shape idéntico si el orden de tareas lo requiere y lo cambia después — ver Plan).

### 4.6 Migración

`npx prisma migrate dev --name bloque5_caja`. **Aditiva:** `CREATE TYPE "CashSessionStatus"` / `"CashMovementType"`; `CREATE TABLE "CashSession"` / `"CashMovement"` + índices + FKs; `ALTER TABLE "Sale" ADD COLUMN "cashSessionId" TEXT` + FK + índice; `ALTER TABLE "Return" ADD COLUMN "cashSessionId" TEXT` + FK + índice. Ninguna columna/tabla/enum existente se altera ni se borra; `SaleStatus`/`PaymentMethod`/`MovementType` intactos. Revisar el `migration.sql` generado (solo `CREATE TYPE` / `CREATE TABLE` / `CREATE INDEX` / `ALTER TABLE … ADD COLUMN` / `ADD CONSTRAINT … FOREIGN KEY`).

## Sección 5 — Pantallas

Español, Tailwind v4, RSC + client components. Cada page server: `requirePermission('caja.gestionar')` primera sentencia, `export const dynamic = 'force-dynamic'`, `redirect()`/`notFound()` fuera de try/catch. `useActionState` en los forms. Sin `any`, sin `console.*`.

### 5.1 `/caja` — enrutador de estado

Server page. `const abierta = await getOpenCashSession();`
- **Sin sesión abierta** → `<AbrirCajaForm />` (input `fondoApertura`) + enlace "Ver historial de cortes" → `/caja/historial`.
- **Con sesión abierta** → `<PanelCajaAbierta session={await getCashSession(abierta.id)} />`: cabecera (folio `C-…`, abierta por, hora de apertura con `fmtFechaMX`, fondo). Lista de movimientos manuales (`movements`: tipo con badge, monto, motivo, quién, hora). Botones "Registrar retiro" / "Registrar ingreso" → `<CashMovementForm tipo="RETIRO"|"INGRESO">` (monto + motivo). Botón destacado "Cerrar caja (arqueo)" → `/caja/cerrar`. Enlace "Ver ventas de esta caja" → `/ventas/historial?cashSessionId=<id>`. **No se muestra** ningún esperado, total de ventas ni saldo.

### 5.2 `/caja/cerrar` — arqueo

Server page. `getOpenCashSession()` → si `null`, `redirect('/caja')`. `<CerrarCajaForm session={...} />` (client, `useActionState(cerrarCajaAction)`): muestra fondo y hora de apertura; input **"Efectivo contado en el cajón"** + textarea "Nota (opcional)". Aviso: "Cuenta el efectivo antes de confirmar; verás la diferencia después." "Confirmar cierre" → `cerrarCajaAction` → redirige a `/caja/sesiones/<id>`. El form NO calcula ni muestra el esperado.

### 5.3 `/caja/sesiones/[id]` — detalle / corte

Server page. `getCashSession(id)` → `notFound()` si null.
- **Abierta:** cabecera + fondo + movimientos manuales + aviso "Caja abierta; el arqueo se verá al cerrar." Sin totales.
- **Cerrada:** el corte completo — Fondo de apertura; **Ventas**: efectivo (neto), tarjeta, transferencia, nº de ventas; **Reembolsos en efectivo**; **Retiros** e **Ingresos** (con su lista de movimientos); **Esperado en efectivo**; **Contado**; **Diferencia** con badge (verde "Cuadra" si `0`, ámbar "Sobrante +$X" si `> 0`, rojo "Faltante −$X" si `< 0`); abierta por / cerrada por / horas (`fmtFechaMX`); nota. Botón "Imprimir corte" → `/caja-corte/[id]`.

### 5.4 `/caja-corte/[id]` — corte imprimible

Ruta **fuera del grupo `(app)`** (`src/app/caja-corte/[id]/page.tsx`), sin sidebar (como `/ventas-ticket`). `requirePermission('caja.gestionar')` primera sentencia; `getCashSession(id)` → `notFound()` si null o `estado !== 'CERRADA'`. La page lee el nombre del negocio (`AppSetting 'negocio.nombre'` o `'Punto de venta'`) y lo pasa como prop. `<CorteView session={...} negocio={...} />` + `<PrintOnMount />` (reutilizar el del Bloque 4 si es importable desde `@/app/(app)/ventas/PrintOnMount`, o duplicar el `useEffect(() => window.print(), [])` de 3 líneas). Contenido tira ~80 mm: negocio, "CORTE DE CAJA", folio `C-…`, apertura y cierre (`fmtFechaMX`), abierta/cerrada por, y el mismo desglose que §5.3. Pie "Documento interno — no fiscal". CSS `@media print` (oculta botones).

### 5.5 `/caja/historial` — listado de sesiones

Server page. `listCashSessions({ estado, desde, hasta, page, pageSize: 20 })`. `<form method="get">`: `<select name="estado">` (todas/ABIERTA/CERRADA), `<input type="date" name="desde"/"hasta">`, submit + "Limpiar". `<DataTable>` cols: Folio, Estado (badge), Apertura, Cierre, Abrió, Fondo, Contado, Diferencia (badge sobrante/faltante/cuadra, o "—" si abierta). `rowComponent={CajaSessionRow}` (`{ href?, children }`, copia de `SaleRow`). Fila → `/caja/sesiones/<id>`. `<Pagination>`. Enlace "Exportar CSV" → `/caja/historial/export?<filtros>`.

### 5.6 `/caja/historial/export/route.ts` (+ `route.itest.ts`)

`runtime='nodejs'`; gate `try { await requirePermission('caja.gestionar') } catch (e) { if (e instanceof ForbiddenError) return NextResponse.json({ error: e.message }, { status: 403 }); throw e }`. Lee `estado`/`desde`/`hasta`; `listCashSessions({ ..., page: 1, pageSize: 5000 })`; los totales de las cerradas se leen directo de la fila (ya fotografiados) con un `db.cashSession.findMany({ where: { id: { in: ids } }, select: { …los total* } })`. CSV con BOM `'﻿'`, cabecera `Folio,Estado,Apertura,Cierre,Abrió,Cerró,Fondo,Efectivo ventas,Tarjeta,Transferencia,Reembolsos efectivo,Retiros,Ingresos,Esperado,Contado,Diferencia,Nº ventas`, `esc` local, fechas con `fmtFechaMX`. `content-disposition: attachment; filename="cortes-caja-<YYYY-MM-DD>.csv"`. **itest** (mock `next/headers`): 403 para una sesión sin `caja.gestionar` (rol sin la clave / Empleado); 200 `text/csv` con una sesión cerrada sembrada — el folio y la diferencia aparecen en el cuerpo.

### 5.7 Componentes nuevos bajo `src/app/(app)/caja/`

`AbrirCajaForm.tsx` (`'use client'`, `useActionState(abrirCajaAction)`, input `fondoApertura`), `PanelCajaAbierta.tsx` (server-free, recibe `CashSessionDetail`), `CashMovementForm.tsx` (`'use client'`, `useActionState(registrarMovimientoCajaAction)`, `<input type="hidden" name="tipo">`, monto + motivo), `CerrarCajaForm.tsx` (`'use client'`, `useActionState(cerrarCajaAction)`), `CorteView.tsx` (render puro), `CajaSessionRow.tsx` (`{ href?, children }`).

### 5.8 Guard en el flujo del cajero (Bloque 4)

`src/app/(app)/ventas/page.tsx` — cambio aditivo: al cargar, `const abierta = await getOpenCashSession();` si `null`, en vez de `<CashierScreen>` renderiza un aviso "No hay una caja abierta" + `<Link href="/caja">Abrir caja</Link>`. El servicio ya rechaza la venta; esto es mejor UX.

### 5.9 Testing de UI

Sin unit tests de RSC (patrón de Bloques 2–4). Verificación por tarea: `typecheck` + `lint` + `build` + suites completas. Cobertura funcional por E2E (§6.3).

## Sección 6 — Server Actions, E2E y fuera de alcance

### 6.1 `src/app/(app)/caja/actions.ts` (`'use server'`)

Idioma de Bloques 3–4: `fieldErrorsFrom(z.ZodError)`, `fromValidationError(ValidationError): FormState`, `ip()` = `getClientIp(await headers())`. `requirePermission('caja.gestionar')` **primera sentencia**; `redirect()` fuera de try/catch; solo `ValidationError` capturado, `ForbiddenError` se propaga.

| Action | Comportamiento | Devuelve |
|---|---|---|
| `abrirCajaAction(_prev, formData)` | `openCashSessionSchema.safeParse(Object.fromEntries(formData))` → `openCashSession(actor.id, data.fondoApertura, await ip())` → `revalidatePath('/caja')` → `redirect('/caja')` | redirige |
| `registrarMovimientoCajaAction(_prev, formData)` | `cashMovementSchema.safeParse(...)` → `recordCashMovement(actor.id, data, await ip())` → `revalidatePath('/caja')` → `{ ok: true }` | `FormState` |
| `cerrarCajaAction(_prev, formData)` | `closeCashSessionSchema.safeParse(...)` → `{ id } = await closeCashSession(actor.id, data.efectivoContado, data.notaCierre, await ip())` → `revalidatePath('/caja')` + `revalidatePath('/caja/historial')` → `redirect('/caja/sesiones/<id>')` | redirige |

### 6.2 Tests de integración de actions (`src/app/(app)/caja/actions.itest.ts`)

Mock de `next/headers`, `next/cache` (`revalidatePath: () => {}`), `next/navigation` (`redirect: (u) => { throw new Error('REDIRECT:' + u); }`). Siembra usuarios por rol de sistema. Aislamiento FK-seguro.
- Sesión **Empleado** → `abrirCajaAction` → rechaza `ForbiddenError`, nada creado.
- Sesión **Cajero**: `abrirCajaAction` con `fondoApertura: 500` → rechaza `/REDIRECT:\/caja/`; segunda `abrirCajaAction` → `{ ok: false, formError: 'Ya hay una caja abierta.' }`, no crea otra.
- `registrarMovimientoCajaAction` `{ tipo: 'RETIRO', monto: 200, motivo: 'banco' }` → `{ ok: true }`; `{ monto: 0 }` → `{ ok: false, fieldErrors: { monto } }`, sin redirect.
- `cerrarCajaAction` `{ efectivoContado: 700 }` → rechaza `/REDIRECT:\/caja\/sesiones\//`; segunda llamada (ya no hay abierta) → `{ ok: false, formError }`.
- Zod: `abrirCajaAction` `{ fondoApertura: -1 }` → `{ ok: false, fieldErrors: { fondoApertura } }`, sin redirect.

### 6.3 E2E (`e2e/caja.spec.ts`, Playwright)

Datos únicos por corrida; cada `test` autónomo (login propio). `abrirCaja(page, fondo)` es un helper compartido (también lo usa `e2e/ventas.spec.ts`).
1. **Vender exige caja:** login Cajero → `/ventas` → aviso "No hay una caja abierta" + botón "Abrir caja"; no aparece la pantalla de cobro. Abrir caja (fondo 1000) desde `/caja` → volver a `/ventas` → ya aparece la pantalla de cajero.
2. **Ciclo con arqueo cuadrado:** abrir (fondo 1000) → 1 venta de $232 en efectivo exacto → `/caja` → "Registrar retiro" 500 "depósito" → "Cerrar caja" → contar `1000 + 232 − 500 = 732` → el corte muestra **Esperado 732.00 / Contado 732.00 / Diferencia 0.00** badge "Cuadra"; Ventas efectivo 232.00, Retiros 500.00.
3. **Arqueo con faltante:** abrir (fondo 500) → 1 venta $116 efectivo exacto → cerrar contando 600 → corte **Diferencia −16.00** badge rojo "Faltante".
4. **No se abre una segunda caja:** con una abierta, `/caja` muestra el panel de la sesión abierta (no el form de abrir).
5. **Cancelar con caja cerrada:** abrir → venta → cerrar → abrir otra → ir a la ficha de la venta de la sesión anterior → "Cancelar venta" **no aparece**; "Registrar devolución" sí.
6. **Devolución sale de la caja actual:** abrir caja A → venta de 3 uds ($348) → cerrar A → abrir caja B → devolución de 1 ud ($116) en efectivo → cerrar B contando `fondoB − 116` → el corte de B muestra **Reembolsos efectivo 116.00** y el esperado descontándolo.
7. **Corte imprimible:** abrir/mover/cerrar → `/caja-corte/<id>` contiene "CORTE DE CAJA", el folio `C-…`, "Esperado", "Diferencia", y **no** aparece la barra lateral.

### 6.4 Fuera de alcance (bloques posteriores)

- Caja chica / gastos con efectivo del cajón + catálogo de conceptos.
- Desglose por denominación (billetes/monedas) al contar.
- Múltiples cajas simultáneas / por cajero / por terminal.
- Conteo intermedio ("X" sin cerrar) o retiros con doble firma.
- Conciliación con estado de cuenta bancario o con el datáfono.
- Justificación obligatoria de diferencias sobre un umbral configurable.
- Reportes agregados de cortes por periodo (Bloque 6 — Reportes).
- Reapertura de una caja cerrada / edición de un corte.
- Impresión térmica ESC/POS (aquí `window.print` sobre HTML).
