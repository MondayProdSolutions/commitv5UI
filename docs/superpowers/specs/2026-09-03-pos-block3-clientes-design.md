# Sistema POS — Bloque 3: Clientes

Fecha: 2026-09-03
Estado: Aprobado para plan de implementación
Depende de: Bloque 1 (auth/usuarios/roles/auditoría) y Bloque 2 (productos/inventario), ambos en `master`.

## Contexto

Tercer sub-proyecto del sistema POS. Alcance acordado: **solo el núcleo de Clientes** — entidad, CRUD, búsqueda y datos fiscales (CFDI 4.0). Quedan **fuera** de este bloque (a bloques posteriores o al Bloque 4 de Ventas): historial de compras, compras a crédito / cuenta corriente, puntos / recompensas.

Se integra en el mismo proyecto Next.js y **reutiliza** del Bloque 1/2:
`requirePermission` / `requireUser` (`@/lib/auth/context`), `PERMISSIONS` / `can` / `ALL_PERMISSION_KEYS` (`@/lib/auth/rbac`), `logActivity` / `actionLabel` / `KNOWN_ACTIONS` / `AuditAction` (`@/lib/audit`), `queryActivity` (`@/lib/activity/query`), `type FormState` (`@/app/(auth)/setup/actions`), `ValidationError` / `ForbiddenError` (`@/lib/errors`), `db` (`@/lib/db`), `getClientIp` (`@/lib/http`), `parseDateParam` (`@/lib/activity/query`), `DataTable` / `Pagination` / `PermissionGate` / `forms/Field` (`@/components/*`), `visibleNav` / `NAV_ITEMS` (`@/lib/nav`), y el helper de escape CSV de `@/lib/activity/csv` (o un `esc` local equivalente).

### Stack (heredado, sin cambios)

Next.js 16.3.4 (App Router; gate = `src/proxy.ts`), React 19.2, TypeScript strict, PostgreSQL vía Prisma 7 + `@prisma/adapter-pg` (`src/lib/db.ts` es el único `PrismaClient`; nunca `new PrismaClient()`), Zod 4 (`z.email()`; para reglas cruzadas se usa el mismo idioma que los Bloques 1/2 — `.superRefine`/`.check`, consistente con el código existente), Tailwind v4, Vitest 4 (`*.test.ts` unit / `*.itest.ts` integración con Postgres efímero vía `globalSetup`), Playwright. UI en español. Un solo negocio, 1 sucursal. Sin envío de correos. Sin conexión a ningún PAC/SAT: los datos fiscales solo se almacenan.

### Decisiones de diseño (definitivas)

| Tema | Decisión |
|---|---|
| Alcance | Solo núcleo: entidad `Customer` + CRUD + búsqueda + datos fiscales CFDI 4.0. Sin crédito, sin puntos, sin historial de compras (gancho visual placeholder, nada más). |
| Datos fiscales | **Opción A**: columnas anulables en `Customer` (`rfc`, `razonSocial`, `regimenFiscalCode`, `usoCfdiCode`, `cpFiscal`, `correoFacturacion`). `facturable` es **derivado**, no se almacena. Catálogos SAT (`c_RegimenFiscal`, `c_UsoCFDI`) como **constantes en código** (`src/lib/sat/*`), no tablas. |
| Obligatoriedad fiscal | Opcional, "todos o ninguno": si CUALQUIER campo fiscal núcleo (`rfc`, `razonSocial`, `regimenFiscalCode`, `usoCfdiCode`, `cpFiscal`) trae valor, TODOS los núcleo son obligatorios y válidos. Si todos vacíos → cliente no facturable, válido. `correoFacturacion` es opcional incluso dentro del bloque. |
| Campos de contacto | `nombre` (obligatorio, trim, ≥2), `telefono`, `correo`, `direccion` (texto), `notas`. |
| Unicidad | `telefono` `@unique`, `correo` `@unique`, `rfc` `@unique`. Postgres permite múltiples `NULL` en índice único → "sin captura, sin choque" funciona sin lógica extra. |
| RFC | Formato validado: persona moral `^[A-ZÑ&]{3}\d{6}[A-Z0-9]{3}$` (12), persona física `^[A-ZÑ&]{4}\d{6}[A-Z0-9]{3}$` (13). Normalizado a mayúsculas, sin espacios/guiones. El RFC genérico `XAXX010101000` / `XEXX010101000` se **rechaza en alta/edición manual** (reservado al cliente sembrado). Regla cruzada suave: el `regimenFiscalCode` debe ser compatible con el tipo derivado del RFC (12→moral, 13→física); si no encaja → error de validación. |
| Ciclo de vida | Archivado lógico (`archivado: boolean`), nunca borrado físico. Restaurable. |
| Cliente por defecto | Se siembra "Público en General" con `esGenerico: true` y RFC genérico `XAXX010101000`. **No archivable**; sus campos clave (nombre, RFC y todo el bloque fiscal) no editables desde la UI ni los servicios; solo `notas`/`direccion`/`correo`/`telefono` editables. El Bloque 4 lo usará como cliente por defecto en ventas sin cliente. |
| Permisos | Granular (grupo `clientes`): `clientes.ver`, `clientes.crear`, `clientes.editar`, `clientes.archivar`. Seed: Administrador (todo, por blindaje) · Gerente (las 4) · Cajero (`clientes.ver` + `clientes.crear`) · Empleado (`clientes.ver`). |
| Auditoría | RFC **enmascarado** en `activity_log` (nunca el RFC completo). Acciones nuevas: `clientes.crear`, `clientes.editar`, `clientes.archivar`, `clientes.restaurar`, `clientes.datos_fiscales`. |
| Export CSV | `/clientes/export` bajo `clientes.ver` (403 en `ForbiddenError`); el RFC se exporta **completo** (export administrativo con permiso), a diferencia de la auditoría. |
| Búsqueda | `searchCustomers(q, opts)` por nombre / teléfono / correo / RFC — reutilizable directamente por la pantalla de cajero del Bloque 4. |
| Historial de compras | Fuera de alcance. `/clientes/[id]` muestra un placeholder ("disponible al activar Ventas"). El Bloque 4 añadirá `Sale.customerId → Customer` en su propia migración aditiva. |
| Migración | Puramente ADITIVA: **una tabla nueva** (`Customer`). Cero cambios a tablas/columnas/enums existentes. |

## Arquitectura

Un solo proyecto Next.js. Server Actions + Route Handlers como backend. `src/lib/customers/customers.ts` concentra el CRUD; `src/lib/customers/search.ts` la búsqueda reutilizable; `src/lib/customers/fiscal.ts` helpers puros de RFC/bloque fiscal. Los catálogos SAT viven en `src/lib/sat/` como constantes tipadas.

### Estructura de archivos (nuevos)

```
prisma/
  schema.prisma            # + model Customer
  seed.ts                  # + "Público en General" (upsert) + claves de permiso de bloque en ROLE_PERMISSIONS
  migrations/<ts>_bloque3_clientes/

src/lib/
  sat/
    regimenes-fiscales.ts  # REGIMENES_FISCALES: readonly {code,label,aplicaFisica,aplicaMoral}[]; getRegimenLabel(code)
    usos-cfdi.ts           # USOS_CFDI: readonly {code,label}[]; getUsoCfdiLabel(code)
  customers/
    fiscal.ts              # normalizarRfc, rfcEsValido, esFisica, esRfcGenerico, bloqueFiscalCompleto, bloqueFiscalVacio, enmascararRfc, regimenCompatibleConRfc
    customers.ts           # createCustomer, updateCustomer, archiveCustomer, restoreCustomer, getCustomer, listCustomers
    search.ts              # searchCustomers(q, opts) -> CustomerHit[]
  validation/
    customer.ts            # customerSchema (contacto + bloque fiscal condicional) + tipos inferidos

src/app/(app)/clientes/
  page.tsx                 # listado: buscar, filtrar (estado, soloFacturables), paginar, export
  actions.ts               # crearClienteAction / editarClienteAction / archivarClienteAction / restaurarClienteAction
  nuevo/page.tsx
  [id]/page.tsx            # detalle + edición + sección "Compras" (placeholder)
  CustomerForm.tsx         # contacto + bloque "Datos de facturación (CFDI)" plegable
  CustomerRow.tsx
  export/route.ts (+ route.itest.ts)

src/lib/nav.ts             # + ítem Clientes
src/lib/auth/rbac.ts       # + grupo 'clientes' (4 claves)
src/lib/audit.ts           # + 5 acciones en LABELS / AuditAction
```

## Modelo de datos (Prisma)

```prisma
model Customer {
  id                String   @id @default(cuid())
  nombre            String
  telefono          String?  @unique
  correo            String?  @unique
  direccion         String?
  notas             String?

  rfc               String?  @unique
  razonSocial       String?
  regimenFiscalCode String?
  usoCfdiCode       String?
  cpFiscal          String?
  correoFacturacion String?

  esGenerico        Boolean  @default(false)
  archivado         Boolean  @default(false)
  createdById       String?
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt

  @@index([archivado])
  @@index([nombre])
}
```

- `facturable` NO se persiste. Se deriva: `rfc && razonSocial && regimenFiscalCode && usoCfdiCode && cpFiscal` todos presentes.
- `@@unique` en `telefono`/`correo`/`rfc`: Postgres permite N `NULL`.
- Sin FK a ventas en este bloque.
- Migración: `CREATE TABLE "Customer"` + sus 3 índices únicos + 2 `@@index`. Nada más.

## Catálogos SAT (constantes)

- `src/lib/sat/regimenes-fiscales.ts` — `REGIMENES_FISCALES: readonly { code: string; label: string; aplicaFisica: boolean; aplicaMoral: boolean }[]`. Incluye al menos: 601 (General de Ley Personas Morales, moral), 603 (Personas Morales con Fines no Lucrativos, moral), 605 (Sueldos y Salarios, física), 606 (Arrendamiento, física), 607 (Régimen de Enajenación o Adquisición de Bienes, física), 608 (Demás ingresos, física), 610 (Residentes en el Extranjero, ambos), 611 (Ingresos por Dividendos, física), 612 (Personas Físicas con Actividades Empresariales y Profesionales, física), 614 (Ingresos por intereses, física), 615 (Régimen de los ingresos por obtención de premios, física), 616 (Sin obligaciones fiscales, física), 620 (Sociedades Cooperativas de Producción, moral), 621 (Incorporación Fiscal, física), 622 (Actividades Agrícolas/Ganaderas/Silvícolas/Pesqueras, ambos), 623 (Opcional para Grupos de Sociedades, moral), 624 (Coordinados, moral), 625 (Régimen de las Actividades Empresariales con ingresos a través de Plataformas Tecnológicas, física), 626 (Régimen Simplificado de Confianza — RESICO, ambos). `getRegimenLabel(code): string` con fallback al `code`.
- `src/lib/sat/usos-cfdi.ts` — `USOS_CFDI: readonly { code: string; label: string }[]`. Incluye: G01 (Adquisición de mercancías), G02 (Devoluciones, descuentos o bonificaciones), G03 (Gastos en general), I01–I08 (construcciones, mobiliario y equipo de oficina, equipo de transporte, equipo de cómputo, dados/troqueles/moldes, comunicaciones telefónicas, comunicaciones satelitales, otra maquinaria), D01–D10 (deducciones personales), S01 (Sin efectos fiscales), CP01 (Pagos), CN01 (Nómina). `getUsoCfdiLabel(code): string` con fallback.
- Ambos módulos exportan también un `Set` de códigos válidos para la validación Zod.

## Validación (`src/lib/customers/fiscal.ts` + `src/lib/validation/customer.ts`)

### `fiscal.ts` (puro)
- `normalizarRfc(rfc: string): string` — `rfc.toUpperCase().replace(/[\s-]/g, '')`.
- `rfcEsValido(rfc: string): boolean` — normaliza, luego `/^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/` con longitud 12 o 13.
- `esFisica(rfc: string): boolean` — `normalizarRfc(rfc).length === 13`.
- `esRfcGenerico(rfc: string): boolean` — normalizado ∈ `{ 'XAXX010101000', 'XEXX010101000' }`.
- `bloqueFiscalCompleto(x): boolean` / `bloqueFiscalVacio(x): boolean` sobre los 5 campos núcleo.
- `enmascararRfc(rfc: string): string` — `${n.slice(0,3)}${'*'.repeat(Math.max(0, n.length-6))}${n.slice(-3)}`.
- `regimenCompatibleConRfc(regimenCode: string, rfc: string): boolean` — busca el régimen en `REGIMENES_FISCALES`; `esFisica(rfc) ? r.aplicaFisica : r.aplicaMoral`. Si el código no está en el catálogo → `false`.

### `customer.ts` (Zod 4)
- `customerSchema` (para crear y — con `id` — editar):
  - `nombre: z.string().trim().min(2)`.
  - `telefono: z.string().trim().max(30).optional().or(z.literal('')).transform(v => v || null)`.
  - `correo: z.string().trim().toLowerCase().pipe(z.email()).optional().or(z.literal('')).transform(...)` — vacío → `null` (usar el mismo patrón que `validation/auth.ts`/`user.ts` del Bloque 1).
  - `direccion`, `notas`: `string().trim().max(500)` opcionales → `null`.
  - Bloque fiscal — cada campo opcional-string→null: `rfc`, `razonSocial`, `regimenFiscalCode`, `usoCfdiCode`, `cpFiscal`, `correoFacturacion`.
  - `.superRefine` (idioma del Bloque 1):
    1. Si `bloqueFiscalVacio` → ok (no más checks fiscales).
    2. Si NO vacío y NO `bloqueFiscalCompleto` → issue en cada campo núcleo faltante ("Completa todos los datos de facturación o déjalos vacíos").
    3. Si completo: `rfcEsValido(rfc)` → si no, issue en `rfc`. `esRfcGenerico(rfc)` → issue en `rfc` ("RFC reservado; usa el cliente Público en General"). `regimenFiscalCode ∈ REGIMENES set` → si no, issue. `usoCfdiCode ∈ USOS set` → si no, issue. `/^\d{5}$/.test(cpFiscal)` → si no, issue. `regimenCompatibleConRfc(regimenFiscalCode, rfc)` → si no, issue en `regimenFiscalCode` ("El régimen no corresponde al tipo de RFC").
  - Export `CustomerInput` (inferido) y `EditCustomerInput` (= `CustomerInput` + `id: string`).

## Servicios

Todas las funciones mutantes: la Server Action llama `requirePermission('clientes.<x>')` como primera sentencia; el servicio recibe el input ya validado por Zod y re-chequea invariantes de BD (unicidad) + reglas del cliente genérico; auditoría dentro de la misma `db.$transaction` que la mutación. `import { db }`, sin `new PrismaClient()`, sin `any`.

### `customers.ts`
- `createCustomer(actorId: string, input: CustomerInput, ip: string | null): Promise<{ id: string }>`
  - `rfc` se guarda ya normalizado (la action normaliza antes de validar, o el servicio normaliza).
  - `db.$transaction`: `tx.customer.create({ data: { ...contacto, ...fiscal, createdById: actorId } })`.
  - `Prisma` P2002 → `ValidationError({ [campo]: 'Ya está en uso.' })` según `e.meta.target` (`telefono` / `correo` / `rfc`).
  - `logActivity('clientes.crear', { nombre: input.nombre, facturable: bloqueFiscalCompleto(input) }, tx)`; si `bloqueFiscalCompleto(input)` → además `logActivity('clientes.datos_fiscales', { despues: { rfc: enmascararRfc(input.rfc), razonSocial: input.razonSocial, regimenFiscalCode: input.regimenFiscalCode, usoCfdiCode: input.usoCfdiCode, cpFiscal: input.cpFiscal } }, tx)`.
  - Devuelve `{ id }`.
- `updateCustomer(actorId: string, id: string, input: EditCustomerInput, ip): Promise<void>`
  - Carga el cliente actual (`findUniqueOrThrow` → si no existe, `ValidationError({ _form })`).
  - Si `current.esGenerico`: solo `telefono`/`correo`/`direccion`/`notas` pueden cambiar. Si el input trae un `nombre` distinto, o CUALQUIER campo fiscal con valor distinto al actual → `ValidationError({ _form: 'El cliente Público en General tiene campos fijos.' })`.
  - `db.$transaction`: `tx.customer.update({ where: { id }, data: {...} })`. P2002 → `ValidationError` por campo.
  - Auditoría:
    - `clientes.editar` con `{ antes, despues }` SOLO de los campos de contacto que cambiaron (`nombre`/`telefono`/`correo`/`direccion`/`notas`).
    - Si cambió CUALQUIER campo del bloque fiscal (incluye pasar de facturable↔no facturable) → `clientes.datos_fiscales` con `{ antes, despues }` **enmascarando `rfc`** en ambos lados; los demás campos fiscales sin enmascarar.
- `archiveCustomer(actorId, id, ip): Promise<void>` — carga; si `esGenerico` → `ValidationError({ _form: 'No se puede archivar el cliente Público en General.' })`. `db.$transaction`: `update { archivado: true }` + `logActivity('clientes.archivar', { customerId: id }, tx)`. Idempotente.
- `restoreCustomer(actorId, id, ip): Promise<void>` — `update { archivado: false }` + `logActivity('clientes.restaurar', ...)`.
- `getCustomer(id: string): Promise<CustomerDetail | null>` — `CustomerDetail` = todos los campos + `facturable: boolean` (derivado) + `regimenLabel: string | null` + `usoCfdiLabel: string | null` + `esGenerico`. `null` si no existe.
- `listCustomers(filtro: { q?: string; estado?: 'activos' | 'archivados' | 'todos'; soloFacturables?: boolean; page: number; pageSize: number }): Promise<{ rows: CustomerRow[]; total: number }>`
  - `CustomerRow = { id; nombre; telefono: string | null; correo: string | null; rfc: string | null; facturable: boolean; esGenerico: boolean; estado: 'activo' | 'archivado' }`.
  - `estado` → `activos` (default) = `archivado:false`; `archivados` = `archivado:true`; `todos` = sin filtro.
  - `soloFacturables` → `where` con `rfc: { not: null }` + `razonSocial: { not: null }` + `regimenFiscalCode: { not: null }` + `usoCfdiCode: { not: null }` + `cpFiscal: { not: null }`.
  - `q` presente → `const ids = (await searchCustomers(q, { incluirArchivados: true, limit: 200 })).map(h => h.id); where.id = { in: ids }` (si `ids` vacío → `{ rows: [], total: 0 }`).
  - Orden: `esGenerico` primero (`orderBy: [{ esGenerico: 'desc' }, { nombre: 'asc' }]`), luego `nombre` asc. `total` = `count({ where })`.

### `search.ts`
- `searchCustomers(q: string, opts?: { incluirArchivados?: boolean; limit?: number }): Promise<CustomerHit[]>`
  - `CustomerHit = { id; nombre; telefono: string | null; correo: string | null; rfc: string | null; facturable: boolean; esGenerico: boolean }`.
  - `q.trim()` vacío → `[]`.
  - `const rfcNorm = normalizarRfc(term)`.
  - `where.OR`: `{ nombre: { contains: term, mode: 'insensitive' } }`, `{ telefono: { contains: term } }`, `{ correo: { contains: term, mode: 'insensitive' } }`, `{ rfc: { startsWith: rfcNorm } }`.
  - Salvo `incluirArchivados` → `where.archivado = false`.
  - Sobre-lee `Math.min(Math.max((limit ?? 20) * 3, limit ?? 20), 500)` (patrón corregido del Bloque 2 — un `limit` explícito grande se respeta), ordena en memoria: `esGenerico` primero → coincidencia exacta de `rfc`/`telefono` → `nombre` asc; recorta a `limit ?? 20`.
  - `facturable` derivado por fila.

## Pantallas

Responsive, español, `DataTable` + `Pagination` + `PermissionGate`. Cada page server component: `requirePermission(...)` primera sentencia, `export const dynamic = 'force-dynamic'`. `redirect()` fuera de try/catch. `useActionState` en los forms client. No `any`.

- **`/clientes`** (`clientes.ver`) — `<DataTable>` cols: Nombre, Teléfono, Correo, RFC, Facturable (badge Sí/No), Estado (badge). Filtros GET: `q`, `<select>` estado (activos/archivados/todos), checkbox "solo facturables". "Nuevo cliente" en `<PermissionGate permiso="clientes.crear">` → `/clientes/nuevo`. Filas → `/clientes/[id]`. `<Pagination>`. `<a>` "Exportar CSV" → `/clientes/export?<filtros>`.
- **`/clientes/nuevo`** (`clientes.crear`) — `<CustomerForm mode="crear">`.
- **`/clientes/[id]`** (`clientes.ver`) — `getCustomer(id)` → `notFound()` si null. Datos + `<CustomerForm mode="editar" initial>` (submit gated `clientes.editar`; si el usuario no tiene el permiso, se muestra en modo lectura). Botones "Archivar"/"Restaurar" en `<PermissionGate permiso="clientes.archivar">`, **ocultos si `esGenerico`**, con diálogo de confirmación. Sección "Compras" con un placeholder: *"El historial de compras estará disponible cuando se active el módulo de Ventas."*
- **`CustomerForm.tsx`** (`'use client'`) — sección "Datos de contacto" (nombre, teléfono, correo, dirección, notas). Sección plegable **"Datos de facturación (CFDI)"** colapsada por defecto, con nota "Deja esta sección vacía si el cliente no requiere factura."; campos RFC, razón social, `<select>` régimen fiscal (opciones del catálogo; si ya hay RFC escrito, se pueden filtrar por `aplicaFisica`/`aplicaMoral` según longitud — o mostrarlas todas, decisión de implementación de bajo riesgo), `<select>` uso de CFDI, CP fiscal, correo de facturación. Errores por campo desde `state.fieldErrors`. En modo "editar" de un cliente `esGenerico`, la sección fiscal y el `nombre` se renderizan `readOnly`/`disabled`.
- **`/clientes/export`** (`route.ts`, `runtime='nodejs'`) — `try { await requirePermission('clientes.ver') } catch (e) { if (e instanceof ForbiddenError) return NextResponse.json({ error: e.message }, { status: 403 }); throw e }`. Lee filtros de `req.nextUrl.searchParams` (`q`, `estado`, `soloFacturables`); `listCustomers({ ..., page: 1, pageSize: 5000 })`; CSV con BOM `﻿`, cabecera `Nombre,Teléfono,Correo,RFC,Razón social,Régimen,Uso CFDI,CP fiscal,Facturable,Estado`, escape de comas/comillas/salto de línea. El **RFC se exporta completo**. `content-type: text/csv; charset=utf-8`; `content-disposition: attachment; filename="clientes-<fecha>.csv"`.

## Manejo de errores y seguridad transversal

- Validación Zod en servidor antes de tocar la BD, en toda Server Action / Route Handler.
- Toda Server Action mutante: `requirePermission('clientes.<x>')` como primera sentencia.
- Auditoría dentro de la misma `db.$transaction` que la mutación.
- **RFC enmascarado** en `activity_log` (nunca completo). Export CSV con RFC completo solo bajo `clientes.ver`.
- Cliente genérico protegido: no archivable, `nombre` y bloque fiscal no editables (servicio + UI).
- RFC genérico rechazado en alta/edición manual.
- Sin borrado físico (`archivado`).
- `ValidationError` → `FormState` (`fieldErrors` / `formError`); `ForbiddenError` se propaga (no lo capturan los handlers de `ValidationError`), lo audita `requirePermission` como `auth.forbidden`, lo pinta `src/app/(app)/error.tsx`.
- `redirect()` fuera de try/catch. `import { db } from '@/lib/db'`, nunca `new PrismaClient()`. Sin `any`. Sin `console.*`.
- Cabeceras de seguridad ya globales (Bloque 1).

## Testing

TDD. `*.test.ts` unit (sin BD), `*.itest.ts` integración (Postgres efímero).

### Unit (Vitest)
- `fiscal.ts`: `normalizarRfc` (minúsculas, espacios, guiones); `rfcEsValido` (moral 12 válido, física 13 válido, longitud 11/14 inválida, caracteres inválidos); `esFisica`; `esRfcGenerico` (`XAXX010101000`, `xexx010101000`, otro → false); `bloqueFiscalCompleto`/`bloqueFiscalVacio` (parcial → ninguno de los dos true); `enmascararRfc` (`ABC010101XYZ` → `ABC******XYZ`); `regimenCompatibleConRfc` (601 con RFC moral → true, 601 con RFC física → false, 605 con RFC física → true, código inexistente → false).
- `sat/*`: catálogos sin códigos duplicados; `getRegimenLabel`/`getUsoCfdiLabel` con fallback al code; el `Set` de códigos coincide con el array.
- `customer.ts`: contacto válido parsea; correo inválido → error; bloque fiscal parcial (solo `rfc`) → errores en los 4 campos faltantes; bloque vacío → ok, sin errores fiscales; RFC mal formado con bloque completo → error en `rfc`; RFC genérico manual → error en `rfc`; `regimenFiscalCode` fuera del catálogo → error; `cpFiscal` de 4 dígitos → error; régimen moral (601) con RFC física → error en `regimenFiscalCode`.

### Integración (Vitest + PG efímero)
- Seed: existe "Público en General" (`esGenerico:true`, `rfc = 'XAXX010101000'`, `archivado:false`); Gerente tiene las 4 claves de `clientes`, Cajero tiene `clientes.ver`+`clientes.crear`, Empleado tiene `clientes.ver` (y NO `clientes.crear`).
- `createCustomer` sin datos fiscales → cliente creado, `getCustomer(id).facturable === false`; audita `clientes.crear` con `{ facturable: false }`; NO audita `clientes.datos_fiscales`.
- `createCustomer` con bloque fiscal completo y válido → `facturable === true`; audita `clientes.crear` con `{ facturable: true }` y `clientes.datos_fiscales` cuyo `metadata.despues.rfc` está **enmascarado** (no contiene el RFC completo).
- `telefono` duplicado / `correo` duplicado / `rfc` duplicado → `ValidationError` con la clave de campo correcta; nada creado (rollback).
- `updateCustomer` sobre el cliente genérico: cambiar `notas` → OK; intentar cambiar `nombre` o `rfc` → `ValidationError({ _form })`, sin cambios.
- `updateCustomer` que cambia solo `telefono` → audita `clientes.editar` con `{ antes, despues }` de `telefono`; NO audita `clientes.datos_fiscales`.
- `updateCustomer` que completa el bloque fiscal de un cliente antes no facturable → `facturable` pasa a true; audita `clientes.datos_fiscales` con `rfc` enmascarado en `despues`.
- `archiveCustomer` sobre el genérico → `ValidationError`; sobre uno normal → `archivado:true`, audita; `restoreCustomer` revierte.
- `listCustomers`: filtro `estado` (crear uno archivado + uno activo); `soloFacturables` (uno con bloque completo, uno sin) → solo el facturable; `q` por nombre; el genérico aparece SIEMPRE primero.
- `searchCustomers`: por nombre parcial; por teléfono; por correo; por RFC (prefijo, normalizando minúsculas del término); el genérico primero; respeta `incluirArchivados` (archivado no aparece por defecto).
- RBAC: sesión de **Empleado** → `crearClienteAction` → 403 (`ForbiddenError`), sin efecto, `auth.forbidden` auditado. Sesión de **Cajero** → `crearClienteAction` OK; `editarClienteAction` / `archivarClienteAction` → 403. Sesión de **Gerente** → todo OK.
- `/clientes/export` route: sesión de un rol sin `clientes.ver` (crear un rol vacío o usar el mecanismo del `admin/auditoria/export/route.itest.ts` del Bloque 1) → 403; sesión de Gerente con un cliente sembrado → 200, `content-type` contiene `text/csv`, el cuerpo contiene el nombre y el RFC **completo**.
- Extensión del visor de auditoría del Bloque 1: las 5 acciones nuevas aparecen en `KNOWN_ACTIONS` y `actionLabel` las traduce.

### E2E (Playwright)
- Login como Administrador → `/clientes` → "Nuevo cliente" → nombre "María López" + teléfono "5544332211", sección CFDI vacía → guardar → aparece en `/clientes` con Facturable = "No".
- Abrir ese cliente → editar → abrir "Datos de facturación", rellenar RFC válido (persona física, p. ej. `LOAM8001011X3`), razón social, régimen 612, uso G03, CP 06000 → guardar → el detalle/listado muestra Facturable = "Sí".
- Crear otro cliente con el mismo teléfono "5544332211" → error de campo "Ya está en uso".
- El cliente "Público en General" aparece **primero** en `/clientes` y su detalle NO muestra el botón "Archivar"; el `nombre` y la sección CFDI se ven en solo lectura.
- Un Cajero (creado por el admin, rol Cajero) ve el botón "Nuevo cliente" y puede crear uno; al abrir `/clientes/<id>` NO ve la acción de guardar cambios (form en lectura) y el acceso directo a archivar → pantalla "No tienes permiso".

## Fuera de alcance (bloques posteriores)

- Historial de compras del cliente (Bloque 4 — añadirá `Sale.customerId`).
- Compras a crédito / cuenta corriente / estados de cuenta.
- Puntos / recompensas / lealtad.
- Facturación real (timbrado CFDI ante un PAC / SAT) — este bloque solo almacena los datos.
- Importación masiva de clientes (CSV de entrada).
- Direcciones múltiples por cliente / libreta de direcciones estructurada.
- Segmentación / etiquetas / campañas de marketing.
- Deduplicación / fusión de fichas de cliente.
