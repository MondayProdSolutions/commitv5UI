# Fundación multi-tenant SaaS — diseño

**Fecha:** 2026-09-13
**Estado:** Aprobado en brainstorming, listo para plan de implementación.

## Contexto y motivación

Se pidió planificar CFDI real (timbrado de facturas). Al definir requisitos surgió que
el plan comercial no es "un negocio, un deploy": es una plataforma que varios negocios
usan bajo un mismo sistema, con una capa de Super Admin que crea/administra esas
cuentas (tenants), gestiona licencias, y da soporte — todo desde una sola instalación,
para mantener el costo de hosting bajo (un VPS, una base de datos).

El sistema hoy es de un solo inquilino: ninguna tabla tiene noción de "a qué negocio
pertenece esta fila". CFDI por tenant no se puede diseñar razonablemente sin resolver
esto primero — el CSD y la configuración de PAC de cada negocio necesitan un lugar
aislado donde vivir. Este documento cubre **solo la fundación multi-tenant**. CFDI es
un proyecto separado que sigue a este, y se beneficia directamente: una vez que existe
`Tenant`, la configuración fiscal es una tabla más colgada de él.

## Alcance de esta versión

**Incluido:**
- Modelo `Tenant` + `Plan`, aislamiento de datos en todas las tablas existentes.
- Resolución de tenant por subdominio (`negocio1.tuapp.com`).
- Dos planos de autenticación separados: usuarios de tenant (como hoy) y Super Admin
  (nuevo, sin relación con los roles de ningún tenant).
- Panel de Super Admin: crear/suspender/reactivar tenants, gestionar planes, ver
  estado de uso contra límites del plan.
- Límites de plan (número de usuarios; número de sucursales, aunque el módulo de
  sucursales en sí no exista todavía — el límite queda listo para cuando exista).
- Acceso de Super Admin sin fricción a los datos operativos de cualquier tenant
  (confirmado explícitamente), **excepto** el material criptográfico fiscal (CSD),
  que queda cifrado de forma que ni Super Admin puede leerlo en claro.
- Row-Level Security de Postgres como segunda capa de aislamiento, además del filtro
  a nivel de aplicación.

**Fuera de alcance en esta versión (decisiones explícitas, no descuidos):**
- Alta de tenants por autoservicio (registro público). Solo Super Admin da de alta
  negocios nuevos por ahora.
- Cobro/facturación automática de suscripciones (pasarela de pago). Los planes
  limitan uso; el cobro se maneja fuera del sistema.
- Flujo de impersonación con motivo obligatorio/auditoría de soporte — se decidió
  acceso total sin ese flujo. Si más adelante se requiere auditoría de accesos de
  soporte, es una extensión aditiva (una tabla de log + un gate en la UI), no un
  cambio de arquitectura.
- CFDI real (PAC, timbrado, cancelación, complementos de pago) — proyecto siguiente,
  ya con este modelo de datos disponible.
- Migración de datos de producción existentes: no hay clientes reales hoy, así que no
  se necesita un script de migración; los datos de desarrollo actuales se descartan o
  se convierten en un tenant de prueba al implementar.

## Modelo de datos

```prisma
model Tenant {
  id        String       @id @default(cuid())
  slug      String       @unique  // subdominio: slug.tuapp.com
  nombre    String
  estado    TenantStatus @default(PRUEBA)
  planId    String
  plan      Plan         @relation(fields: [planId], references: [id])
  createdAt DateTime     @default(now())
  updatedAt DateTime     @updatedAt
}

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
  tenants       Tenant[]
}

model TenantFiscalConfig {
  tenantId                String   @id
  tenant                  Tenant   @relation(fields: [tenantId], references: [id])
  rfcEmisor               String
  razonSocial             String
  regimenFiscalCode       String
  csdCertificado          Bytes
  csdLlaveCifrada         Bytes    // cifrado con llave maestra fuera de la BD
  csdPasswordCifrada      Bytes    // cifrado con llave maestra fuera de la BD
  pacProveedor            String
  pacCredencialesCifradas Bytes    // cifrado con llave maestra fuera de la BD
  createdAt               DateTime @default(now())
  updatedAt               DateTime @updatedAt
}

model PlatformAdmin {
  id           String   @id @default(cuid())
  nombre       String
  email        String   @unique
  passwordHash String
  createdAt    DateTime @default(now())
}

model PlatformAdminSession {
  id              String   @id @default(cuid())
  platformAdminId String
  platformAdmin   PlatformAdmin @relation(fields: [platformAdminId], references: [id])
  tokenHash       String   @unique
  ip              String?
  userAgent       String?
  createdAt       DateTime @default(now())
  expiresAt       DateTime
}
```

Cada tabla actual que guarda datos de negocio (`User`, `Role`, `RolePermission`,
`Session`, `ActivityLog`, `AppSetting`, `TaxRate`, `Category`, `Product`,
`ProductVariant`, `InventoryMovement`, `Customer`, `Sale`, `SaleLine`, `Payment`,
`Return`, `ReturnLine`, `FolioCounter`, `CashSession`, `CashMovement`,
`AttendanceRecord`) gana una columna `tenantId String` con índice — **incluidas las
tablas "hijas"** (`SaleLine`, `Payment`, `ReturnLine`, `CashMovement`), no solo sus
padres, porque RLS necesita la columna directamente en cada tabla para poder filtrar
sin depender de un join.

`TenantFiscalConfig`, `PlatformAdmin` y `PlatformAdminSession` son las únicas tablas
nuevas de esta versión aparte de `Tenant`/`Plan`; `TenantFiscalConfig` se crea vacía
ahora y la llena el proyecto de CFDI — se incluye aquí porque su forma (qué campos, y
que van cifrados) es una decisión de aislamiento, no de CFDI en sí.

## Aislamiento de datos

**Mecanismo de dos capas:**

1. **Capa de aplicación — `src/lib/db.ts` se vuelve tenant-aware sin tocar los ~20
   archivos de `src/lib/*` que ya lo importan.** Se usa `AsyncLocalStorage` de Node
   para guardar el `tenantId` de la request activa, y el `db` exportado deja de ser el
   `PrismaClient` crudo — pasa a ser una extensión de Prisma (`$extends`) que en cada
   query a un modelo con `tenantId` inyecta automáticamente `where: { tenantId }` (o
   `data.tenantId` al crear). Como el nombre y la forma de `db` no cambian, código
   existente como `db.user.findMany(...)` sigue funcionando igual, ahora filtrado.
   Un helper `withTenant(tenantId, fn)` establece ese contexto async; se invoca una
   vez por cada punto de entrada (Route Handlers, Server Actions, el layout raíz),
   no en cada archivo de lib.
2. **Capa de base de datos — Row-Level Security de Postgres**, como red de seguridad
   independiente del código de la aplicación. Cada tabla con `tenantId` activa RLS:

   ```sql
   ALTER TABLE "Sale" ENABLE ROW LEVEL SECURITY;
   ALTER TABLE "Sale" FORCE ROW LEVEL SECURITY; -- aplica incluso al dueño de la tabla
   CREATE POLICY tenant_isolation ON "Sale"
     USING ("tenantId" = current_setting('app.tenant_id', true));
   ```

   Postgres pool las conexiones entre requests, `SET LOCAL` (que dura solo la
   transacción activa) no se puede fijar una vez "al abrir la request" — hay que
   garantizarlo por consulta. La extensión de Prisma envuelve cada operación en su
   propia transacción implícita: `SET LOCAL app.tenant_id = $1` seguido de inmediato
   por la consulta real, como una unidad atómica (`$transaction([...])`). Tiene un
   costo de una ida y vuelta extra por consulta — el precio concreto de esta capa de
   seguridad — pero significa que ninguna consulta puede ejecutarse jamás sin que la
   política RLS esté activa para ella; si por lo que sea `app.tenant_id` no quedó
   fijado, `current_setting(..., true)` da `NULL` y la política simplemente no
   compara verdadero con nada — la consulta devuelve cero filas, nunca datos de otro
   tenant. Falla cerrado, no abierto.
   `FORCE ROW LEVEL SECURITY` es necesario porque, por default, Postgres exime de RLS
   al rol dueño de la tabla (que es el rol con el que corren las migraciones) — sin
   este flag, la protección quedaría desactivada para la conexión de la propia app si
   usa ese mismo rol.

3. **Vía de escape explícita para Super Admin:** un cliente separado
   (`platformDb`, sin extensión de tenant) para las operaciones que genuinamente
   cruzan tenants — crear un `Tenant`, listar todos, cambiar su `estado`. Solo se usa
   desde las rutas de Super Admin, nunca desde código de negocio, así que el código
   que sirve a los usuarios de un tenant no tiene ni la opción de saltarse el filtro.

**Prueba de que esto funciona:** el plan de pruebas (más abajo) incluye un itest que
crea dos tenants con datos y confirma que ni el `db` con extensión ni una consulta
cruda que ignore el wrapper pueden leer datos del otro tenant — eso es lo que
demuestra que la capa de RLS realmente está activa, no solo declarada.

## Ruteo y resolución de tenant

`src/proxy.ts` (ya lee headers en cada request) se extiende: lee `Host`, extrae el
subdominio, busca `Tenant` por `slug`, y expone `x-tenant-id` como header interno
(mismo patrón que ya usan con `x-pathname`).

- Dominio raíz sin subdominio (`tuapp.com`) → no resuelve tenant; es el dominio de
  Super Admin. Subdominios reservados desde el inicio: `www`, `api`, `admin`, `app`.
- Subdominio sin `Tenant` correspondiente → página 404 propia ("esta empresa no
  existe"), no el 404 genérico.
- Subdominio de un tenant `SUSPENDIDO` → pantalla de "cuenta suspendida", distinta
  del 404, antes de siquiera llegar al login.

## Autenticación — dos planos separados

No se reutiliza la tabla `Session` actual con un caso especial para Super Admin;
son identidades, tablas, cookies y páginas de login completamente separadas
(`PlatformAdmin`/`PlatformAdminSession`/cookie `platform_session`, en
`tuapp.com/plataforma/login`, frente a `User`/`Session`/cookie `pos_session` en
`negocio.tuapp.com/login` como hoy). Esto es lo que garantiza que una sesión de
Super Admin nunca pueda interpretarse como sesión de un tenant, ni viceversa — no
hay bandera ni columna que distinga un caso del otro, son universos separados.

El mecanismo actual de `validateSession`/`loadAuthUser`/RBAC por permisos para
usuarios de tenant no cambia de forma, solo queda dentro del contexto de tenant ya
resuelto por el proxy.

## Capacidades de Super Admin

Panel en `tuapp.com/plataforma`:
- Crear tenant (nombre, `slug`, `Plan`) + su primer usuario Administrador —
  equivalente al `/setup` actual, disparado por Super Admin en vez de auto-arranque
  cuando la base está vacía.
- Cambiar `estado` (ACTIVO/SUSPENDIDO/PRUEBA) — efecto inmediato vía el proxy.
- Listado de tenants con plan, estado, y uso actual contra los límites del plan.
- CRUD de `Plan`es.
- Acceso operativo completo a los datos de cualquier tenant vía `platformDb`, sin
  flujo de aprobación — según lo decidido, sin excepción salvo el CSD.

## Límites de plan

Se valida en el mismo punto donde hoy se crea un usuario (`src/lib/users`, que ya
usa `ValidationError`): antes de crear el usuario N+1 se cuenta cuántos tiene el
tenant y se compara contra `plan.maxUsuarios`. El límite de sucursales se define en
`Plan` desde ahora aunque el módulo de sucursales no exista todavía, para no tener
que tocar el modelo de planes cuando llegue.

## Manejo de errores

| Caso | Resultado |
|---|---|
| Subdominio sin tenant | 404 propio |
| Tenant suspendido | Pantalla de "cuenta suspendida" |
| Límite de plan alcanzado | `ValidationError` con mensaje claro en el formulario |
| Falla al descifrar/usar el CSD | Mensaje genérico al usuario; detalle solo en log interno |
| Intento de acceso cruzado (bug) | Bloqueado por RLS a nivel de base de datos |

## Estrategia de pruebas

- **Itest de fuga de datos** (el más importante): dos tenants con datos propios;
  confirmar que consultas con el contexto del tenant A en cero casos devuelven filas
  del tenant B — incluyendo una consulta que deliberadamente ignora el wrapper de
  Prisma, para probar que RLS detiene la fuga aunque falle el código de aplicación.
- **Itest de ruteo:** subdominio válido resuelve al tenant correcto; subdominio
  desconocido da 404 propio; tenant suspendido bloquea antes del login.
- **Itest de límites de plan:** crear el usuario N+1 sobre el límite falla con el
  mensaje esperado; el usuario N (límite exacto) sí se permite.
- **Itest de separación de sesiones:** una cookie de `PlatformAdminSession` no
  autentica como usuario de tenant y viceversa.
- **Itest de RLS activo a nivel de Postgres:** verifica explícitamente que
  `FORCE ROW LEVEL SECURITY` está aplicado (no solo `ENABLE`) en cada tabla con
  `tenantId`, para que un cambio futuro de rol de conexión no desactive la
  protección en silencio.

## Riesgos y decisiones abiertas para más adelante

- **Impersonación de soporte con auditoría:** hoy no está en alcance (acceso total
  confirmado sin ese flujo), pero el diseño no lo bloquea — se puede agregar después
  como una tabla de log + gate en la UI de Super Admin, sin tocar el modelo de datos.
- **Autoservicio de alta de tenants:** cuando se quiera, es una página pública que
  llama a la misma lógica que hoy usa Super Admin para crear un tenant.
- **Cobro automático:** cuando se integre una pasarela, se conecta al mismo campo
  `estado`/`Plan` que ya existe — suspender por falta de pago reutiliza el mecanismo
  de suspensión manual.

## Siguiente paso

Este spec pasa a `writing-plans` para el plan de implementación detallado. El
proyecto de CFDI real se planifica por separado después de que esta fundación esté
implementada y probada.
