# Sistema POS — Bloque 1: Autenticación, Usuarios, Roles y Auditoría

Fecha: 2026-09-02
Estado: Aprobado para plan de implementación

## Contexto del proyecto

El sistema POS completo se construye por sub-proyectos independientes, cada uno con
su propio ciclo spec → plan → implementación, en orden de dependencia:

1. **Autenticación, Usuarios, Roles/Permisos, Auditoría** ← este documento
2. Productos, Categorías e Inventario
3. Clientes
4. POS / Ventas (carrito, pagos, tickets)
5. Caja (apertura, cortes, cierre)
6. Dashboard y Reportes
7. Configuración (negocio, impuestos, moneda, tickets)
8. Seguridad transversal (retención de logs, backups, exportaciones)
9. Sucursales (multi-branch)

### Decisiones de alcance (Bloque 1)

| Tema | Decisión |
|---|---|
| Stack | Next.js (App Router) + TypeScript, PostgreSQL + Prisma, Tailwind. UI en español. |
| Despliegue | Un solo negocio, 1 sucursal, hosting en la nube. Sin multi-tenant. Diseño preparado para añadir `branchId` sin migración destructiva. |
| Alta de usuarios | Solo Admin/Gerente crean usuarios. Registro inicial único (`/setup`) para el primer Administrador. Sin registro público. |
| Login | Email + contraseña para todos los roles. Sin PIN. |
| Restablecer contraseña | El Admin/Gerente la restablece (contraseña temporal). Sin servidor de correo. |
| Roles y permisos | Roles totalmente personalizables (CRUD de roles + checklist de permisos). Permiso efectivo = permisos del rol asignado. **Sin** overrides por usuario. |
| Cierre por inactividad | 15 min por defecto, configurable por el Admin. Aviso 1 min antes. Autoridad en el servidor. |
| Auditoría | Log central `ActivityLog` visible para quien tenga `auditoria.ver`; además cada usuario ve su propia actividad en el perfil. Inmutable desde la app. |
| Autenticación/sesión | Sesiones propias: cookie `httpOnly` + tabla `Session` con token opaco, corte de inactividad server-side, revocación de sesiones. Hash Argon2id. |
| Avatar | Placeholder por ahora (sin upload real). |
| Modo oscuro | Fuera de este bloque (llega con Configuración). |

## Arquitectura

Un solo proyecto Next.js (App Router) con Server Actions + Route Handlers como backend.

### Estructura de archivos (Bloque 1)

```
src/
├── app/
│   ├── (auth)/
│   │   ├── login/page.tsx
│   │   ├── setup/page.tsx            # bootstrap: crear primer Administrador
│   │   └── cambiar-password/page.tsx # forzado en primer login / tras reset
│   ├── (app)/
│   │   ├── layout.tsx                # shell con sesión + timer de inactividad
│   │   ├── perfil/page.tsx
│   │   ├── perfil/actividad/page.tsx # historial propio
│   │   └── admin/
│   │       ├── usuarios/…            # listado, crear, editar, desactivar, reset
│   │       ├── roles/…               # crear/editar roles + permisos
│   │       └── auditoria/page.tsx    # log central con filtros
│   └── api/
│       └── session/heartbeat/route.ts
├── lib/
│   ├── auth/
│   │   ├── password.ts     # hash/verify Argon2id + generador de temporales
│   │   ├── session.ts      # crear/validar/renovar/revocar sesión
│   │   └── rbac.ts         # catálogo de permisos + can(user, permiso)
│   ├── audit.ts            # registrar evento en ActivityLog
│   └── db.ts               # cliente Prisma singleton
├── middleware.ts           # valida cookie de sesión, aplica inactividad
└── prisma/schema.prisma
```

### Módulos aislados

- `lib/auth/session.ts` — API: `createSession(userId, ctx)`, `validateSession(token)`,
  `touchSession(token)`, `revokeSession(id)`, `revokeAllForUser(userId, exceptId?)`.
  Depende de: `db`, config de timeout. Testeable en aislamiento con BD de prueba.
- `lib/auth/rbac.ts` — API: `PERMISSIONS` (catálogo agrupado por módulo),
  `can(user, permiso)`, `requirePermission(permiso)`. Sin dependencia de BD (recibe el
  usuario con su rol y permisos ya cargados).
- `lib/auth/password.ts` — API: `hashPassword(plain)`, `verifyPassword(hash, plain)`,
  `generateTempPassword()`. Sin estado.
- `lib/audit.ts` — API: `logActivity({ actorId, accion, entidad?, entidadId?, metadata?, ip? })`.
  Se invoca dentro de la misma transacción que la operación auditada cuando es posible.

Los bloques futuros reutilizan `rbac.ts` y `audit.ts` sin modificarlos: solo añaden
claves al catálogo de permisos y llaman a `logActivity` con nuevas acciones.

## Modelo de datos (Prisma / PostgreSQL)

```
User
  id            String  @id @default(cuid())
  nombre        String
  email         String  @unique
  telefono      String?
  avatarUrl     String?           # placeholder por ahora
  passwordHash  String
  roleId        String  → Role
  activo        Boolean @default(true)   # baja lógica, nunca borrado físico
  mustChangePassword Boolean @default(false)
  lastLoginAt   DateTime?
  createdById   String?           # quién lo creó
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

Role
  id          String  @id @default(cuid())
  nombre      String  @unique
  descripcion String?
  esSistema   Boolean @default(false)   # los 4 por defecto: no borrables, sí editables
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

RolePermission
  id      String @id @default(cuid())
  roleId  String → Role
  permiso String                        # clave del catálogo, p.ej. "usuarios.crear"
  @@unique([roleId, permiso])

Session
  id            String  @id            # NO se guarda el token en claro
  tokenHash     String  @unique        # SHA-256 del token de 32 bytes
  userId        String  → User
  createdAt     DateTime @default(now())
  expiresAt     DateTime
  lastActivityAt DateTime
  ip            String?
  userAgent     String?
  revokedAt     DateTime?

ActivityLog
  id        String  @id @default(cuid())
  actorId   String?                     # null = sistema
  accion    String                      # "auth.login", "usuarios.crear", …
  entidad   String?                     # "User", "Role", "AppSetting"
  entidadId String?
  metadata  Json     @default("{}")     # antes/después, motivo de reset, etc.
  ip        String?
  createdAt DateTime @default(now())
  # solo INSERT desde la app; sin update/delete

AppSetting
  clave String @id                      # p.ej. "session.idleTimeoutMinutes"
  valor Json
  updatedAt DateTime @updatedAt
```

Notas:
- Sin borrado físico de `User` (baja lógica `activo=false`) para no romper referencias
  futuras (ventas, movimientos de inventario).
- `Session` almacena el hash del token, no el token. Si se filtra la BD, los tokens
  existentes no son utilizables.
- `AppSetting` queda lista para el bloque de Configuración; aquí solo se usa para
  `session.idleTimeoutMinutes` (default 15).
- El token de sesión en la cookie: 32 bytes de CSPRNG en base64url. `Session.id` puede
  ser un cuid independiente; el lookup es por `tokenHash`.

## Catálogo de permisos y roles

### Permisos del Bloque 1 (`lib/auth/rbac.ts`)

| Clave | Descripción | Módulo |
|---|---|---|
| `usuarios.ver` | Ver listado y detalle de usuarios | Usuarios |
| `usuarios.crear` | Dar de alta usuarios | Usuarios |
| `usuarios.editar` | Editar datos y rol de un usuario | Usuarios |
| `usuarios.desactivar` | Baja/reactivación lógica | Usuarios |
| `usuarios.reset_password` | Generar contraseña temporal a otro usuario | Usuarios |
| `roles.ver` | Ver roles y sus permisos | Roles |
| `roles.gestionar` | Crear, editar y borrar roles; asignar permisos | Roles |
| `auditoria.ver` | Ver el log central de actividad | Auditoría |
| `config.editar` | Cambiar ajustes (aquí: timeout de inactividad) | Configuración |

Los bloques posteriores añaden sus propias claves al mismo catálogo
(`ventas.crear`, `inventario.ajustar`, `caja.abrir`, `reportes.ver`, …).

### Roles sembrados (seed), `esSistema = true`, editables

- **Administrador** — todos los permisos. Blindaje: no se le pueden quitar
  `roles.gestionar`, `usuarios.editar` ni `usuarios.desactivar`.
- **Gerente** — `usuarios.ver`, `usuarios.crear`, `usuarios.editar`,
  `usuarios.reset_password`, `roles.ver`, `auditoria.ver`.
- **Cajero** — sin permisos del Bloque 1 (los suyos llegan con Ventas/Caja).
- **Empleado** — sin permisos del Bloque 1.

Todo usuario autenticado puede ver y editar su propio perfil y cambiar su propia
contraseña sin necesidad de un permiso explícito.

### Reglas de negocio

- No se puede borrar un rol con usuarios asignados (primero reasignar).
- No se puede borrar un rol `esSistema`; sí editar sus permisos, salvo el blindaje
  del Administrador.
- Debe existir siempre ≥ 1 usuario activo cuyo rol tenga `roles.gestionar` **y**
  `usuarios.editar`. Toda operación que lo violaría (editar rol, quitar permisos,
  desactivar usuario) se rechaza en el servidor.
- `can(user, "clave")` es la única vía de comprobación. Se usa en Server Actions
  (autorización real) y en la UI (mostrar/ocultar). La comprobación del servidor
  nunca se omite aunque la UI oculte el control.

## Sesiones, middleware e inactividad

### Login (`/login`)

1. Server Action recibe `{ email, password }`, validados con Zod.
2. Se verifica el hash con Argon2id. Fallo → mensaje genérico "Credenciales inválidas",
   se registra `auth.login_failed` con la IP y el email intentado. Tiempo de respuesta
   aproximadamente constante exista o no el email (mitigar enumeración).
3. Rate limiting: máx. 5 intentos fallidos por (email + IP) en 15 min → bloqueo
   temporal de 15 min. Contador en memoria del proceso, con respaldo consultable en
   `ActivityLog`. Suficiente para 1 instancia; se revisará si se escala horizontalmente.
4. Cuenta con `activo = false` → mismo mensaje genérico, no se crea sesión.
5. Éxito → `createSession`: token de 32 bytes CSPRNG, `expiresAt = now + 8h`,
   `lastActivityAt = now`, guarda `ip` y `userAgent`. Cookie `httpOnly` + `Secure` +
   `SameSite=Lax` + `Path=/`. Se registra `auth.login`. Se actualiza `User.lastLoginAt`.
6. Si `mustChangePassword` → redirección forzada a `/cambiar-password`; el middleware
   impide navegar a cualquier otra ruta protegida hasta completarlo.

### `middleware.ts` (rutas protegidas)

- Sin cookie, o sesión inexistente / `revokedAt != null` / `expiresAt < now`
  → redirect a `/login?motivo=sesion_cerrada`.
- Inactividad: si `now − lastActivityAt > idleTimeout` (de `AppSetting`,
  default 15 min) → `revokeSession`, se registra `auth.logout_idle` con los minutos
  transcurridos, redirect a `/login?motivo=inactividad`.
- OK → `touchSession`: actualiza `lastActivityAt = now` con throttle (como máximo
  1 escritura cada 60 s por sesión) y desliza `expiresAt = now + 8h`.
- Si `user.mustChangePassword` y la ruta no es `/cambiar-password` ni `/logout`
  → redirect a `/cambiar-password`.

### Aviso de inactividad (cliente)

Componente en el layout `(app)` con un temporizador local. A falta de 1 min muestra un
modal "Tu sesión se cerrará por inactividad" con botón "Seguir conectado" que hace
`POST /api/session/heartbeat` (valida y hace `touchSession`). Si llega a 0 sin
interacción, redirige a `/login?motivo=inactividad`. El temporizador del cliente es solo
UX; la autoridad es el middleware.

### Logout y gestión de sesiones

- **Logout** (Server Action): `revokeSession` de la actual, borra la cookie, registra
  `auth.logout`.
- **`/perfil` → Sesiones activas**: lista (dispositivo/IP/última actividad) con "Cerrar"
  individual y "Cerrar todas las demás" (`revokeAllForUser(userId, exceptId)`).
- **Admin sobre otro usuario** (`/admin/usuarios/[id]`): "Cerrar todas las sesiones";
  registra `usuarios.sesiones_revocadas` con nº de sesiones y usuario objetivo.

## Pantallas y flujos (UI)

Responsive (tablet/desktop), Tailwind, español.

### Sin sesión

- **`/setup`** — accesible solo si no existe ningún `User`. Campos: nombre, email,
  contraseña (medidor de fortaleza), confirmar. Crea el primer usuario con rol
  Administrador y `mustChangePassword = false`. Tras completarse, la ruta responde 404.
- **`/login`** — email, contraseña, botón "Entrar". Muestra el motivo si llega
  `?motivo=inactividad` o `?motivo=sesion_cerrada`. Enlace "¿Olvidaste tu contraseña?"
  muestra el texto "Contacta a un administrador para restablecerla".
- **`/cambiar-password`** — accesible autenticado; forzada si `mustChangePassword`.
  En flujo normal pide contraseña actual + nueva + confirmar. En flujo forzado tras
  reset/bootstrap pide solo nueva + confirmar. Medidor de fortaleza. Al guardar:
  rehash, `mustChangePassword = false`, `revokeAllForUser` excepto la sesión actual,
  registra `auth.password_changed` con `{ forzado: bool }`.

### Con sesión — comunes

- **`/perfil`** — ver/editar nombre, teléfono. Avatar: placeholder (iniciales). El email
  solo lo cambia quien tenga `usuarios.editar` (sobre sí mismo, desde admin). Botón
  "Cambiar contraseña". Bloque "Sesiones activas".
- **`/perfil/actividad`** — historial propio: tabla paginada (acción legible, fecha/hora,
  IP) con filtro por rango de fechas.

### Con sesión — administración (según permisos)

- **`/admin/usuarios`** (`usuarios.ver`) — tabla: nombre, email, rol, estado, último
  acceso. Filtros por rol/estado; búsqueda por nombre/email. Acciones:
  - **Crear** (`usuarios.crear`): nombre, email, teléfono, rol. Genera contraseña
    temporal (mostrada una sola vez en pantalla), `mustChangePassword = true`. Registra
    `usuarios.crear` con los datos del nuevo usuario (sin hash).
  - **Editar** (`usuarios.editar`): datos + rol. Cambiar el rol registra
    `usuarios.rol_cambiado` con rol antes/después; otros campos → `usuarios.editar` con
    antes/después de lo modificado.
  - **Activar/Desactivar** (`usuarios.desactivar`): confirmación; al desactivar,
    `revokeAllForUser`. No disponible sobre uno mismo ni si deja el sistema sin Admin
    gestor. Registra `usuarios.desactivar` / `usuarios.activar`.
  - **Restablecer contraseña** (`usuarios.reset_password`): confirmación + campo
    "motivo" (obligatorio). Genera temporal (mostrada una vez), `mustChangePassword =
    true`, `revokeAllForUser`. Registra `usuarios.reset_password` con el motivo.
- **`/admin/roles`** (`roles.ver` para ver, `roles.gestionar` para editar) — lista de
  roles (nombre, nº de usuarios, `esSistema`). Crear/editar: nombre, descripción y
  checklist de permisos agrupada por módulo. Borrar solo si no es de sistema y no tiene
  usuarios. Guardar registra `roles.crear` / `roles.editar` con la lista de permisos
  antes/después. Aviso al editar un rol que afecta a N usuarios (sus permisos cambian en
  el siguiente request).
- **`/admin/auditoria`** (`auditoria.ver`) — tabla paginada de `ActivityLog`. Filtros:
  actor, acción (select del catálogo), rango de fechas, entidad. Fila expandible que
  muestra `metadata` (antes/después) de forma legible. Solo lectura. Botón "Exportar
  CSV" (PDF/Excel llega con el bloque de Reportes).
- **Configuración mínima** (`config.editar`) — un único ajuste en este bloque:
  `session.idleTimeoutMinutes`. Editar registra `config.editar` con clave y
  antes/después. (La pantalla completa de Configuración es otro bloque.)

### Navegación

Shell con barra lateral; los ítems de menú se muestran/ocultan según `can()`. Cabecera
con nombre de usuario y menú (Perfil, Cambiar contraseña, Cerrar sesión).

## Auditoría (detalle)

`lib/audit.ts` expone `logActivity(...)`, invocado desde cada Server Action relevante,
dentro de la misma transacción que la operación cuando es posible (si la operación se
revierte, no queda log huérfano).

Acciones del Bloque 1:

| Acción | Metadata |
|---|---|
| `auth.login` / `auth.logout` | — |
| `auth.login_failed` | `{ email }` |
| `auth.logout_idle` | `{ minutosInactivo }` |
| `auth.forbidden` | `{ ruta, permisoRequerido }` |
| `auth.password_changed` | `{ forzado }` |
| `usuarios.crear` | datos del nuevo usuario (sin hash) |
| `usuarios.editar` | `{ antes, despues }` de campos cambiados |
| `usuarios.rol_cambiado` | `{ rolAntes, rolDespues }` |
| `usuarios.desactivar` / `usuarios.activar` | — |
| `usuarios.reset_password` | `{ motivo }` |
| `usuarios.sesiones_revocadas` | `{ objetivoUserId, cantidad }` |
| `roles.crear` / `roles.editar` / `roles.borrar` | `{ antes, despues }` de permisos |
| `config.editar` | `{ clave, antes, despues }` |

Inmutabilidad: no hay endpoints de update/delete sobre `ActivityLog`. La retención
(purga a X meses) se trata en el bloque de Configuración/Seguridad. La IP se obtiene en
el middleware/acción y se pasa explícitamente; no se confía en `x-forwarded-for` sin
sanear.

## Manejo de errores y seguridad transversal

- **Validación:** toda entrada de Server Actions y Route Handlers se valida con Zod en
  el servidor antes de tocar la BD. El cliente valida en paralelo solo para UX. Errores
  de validación → se devuelven al formulario campo por campo, sin recargar.
- **Contraseñas:** hash Argon2id (parámetros recomendados por OWASP). Nunca se registran,
  devuelven ni loguean. Política mínima: ≥ 10 caracteres, distinta del email, no en una
  lista corta de contraseñas comunes. Medidor de fortaleza (zxcvbn) informativo.
  Temporales: CSPRNG, 12 caracteres legibles (sin ambiguos), de un solo uso vía
  `mustChangePassword`.
- **Sesiones / transporte:** cookie `httpOnly` + `Secure` + `SameSite=Lax`. Token = 32
  bytes CSPRNG; en BD solo su SHA-256. HTTPS obligatorio (hosting). Cabeceras:
  `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`,
  `X-Frame-Options: DENY`, CSP básica. CSRF: las Server Actions de Next exigen mismo
  origen; los Route Handlers mutantes verifican `Origin` / `Referer`.
- **Autorización:** cada Server Action comienza con `requireUser()` +
  `requirePermission("clave")`. Fallo → 403 y registro `auth.forbidden`. Reglas de
  blindaje comprobadas en servidor: no auto-desactivación; no dejar el sistema sin un
  Admin con `roles.gestionar` + `usuarios.editar`; no quitarte a ti mismo
  `roles.gestionar` si eres el último que lo tiene.
- **Errores del sistema:** `error.tsx` por segmento + página 500 genérica. Los errores
  inesperados se registran en el servidor (stack completo en los logs del hosting,
  nunca al cliente); el usuario ve un mensaje neutro con un id de incidencia.
- **Backups:** requisito operativo del proveedor de PostgreSQL (snapshots automáticos +
  `pg_dump` programado). Documentado aquí; no es código de la app en este bloque.
- **Fugas de información:** mensajes de login siempre genéricos; enumeración de usuarios
  evitada (mismo mensaje y tiempo de respuesta aproximado).

## Testing

Se sigue TDD (test primero) en la implementación.

### Unitarios (Vitest)

- `password.ts`: hash ≠ texto plano; verify correcto/incorrecto; generador de temporales
  (longitud, alfabeto, aleatoriedad).
- `rbac.ts`: `can()` con permisos presentes/ausentes; blindaje del Administrador;
  agrupación del catálogo por módulo.
- `session.ts`: crear; validar vigente; rechazar expirada/revocada; deslizamiento de
  `expiresAt`; corte por inactividad con timeout configurable; throttle de `touchSession`.
- Validadores Zod de cada formulario.

### Integración (Vitest + PostgreSQL de prueba)

- Bootstrap `/setup`: crea Admin; luego la ruta responde 404.
- Login: OK / fallido / rate limit / cuenta desactivada / `mustChangePassword`.
- CRUD de usuarios con auditoría: cada acción deja el registro esperado en `ActivityLog`
  con `metadata` antes/después.
- Roles: crear/editar/borrar; no borrar rol con usuarios; no borrar rol de sistema;
  no violar el blindaje del Administrador.
- Autorización: un Cajero recibe 403 en acciones de `/admin/*` y el efecto no se aplica;
  se registra `auth.forbidden`.
- Inactividad: sesión con `lastActivityAt` viejo → el middleware la revoca y registra
  `auth.logout_idle`.
- Blindaje: no auto-desactivación; no dejar el sistema sin Admin gestor.

### E2E (Playwright — caminos críticos)

- Setup (crea Admin con su propia contraseña) → login → dashboard, sin cambio forzado.
- Admin crea cajero → cajero entra con la temporal → se le fuerza el cambio → dashboard.
- Modal de inactividad aparece; "Seguir conectado" mantiene la sesión.
- Cerrar sesión; "cerrar todas las demás".

### CI

Workflow que corre lint + typecheck + unit + integración en cada push.

## Fuera de alcance (bloques posteriores)

- Cualquier lógica de ventas, inventario, clientes, caja, reportes, configuración
  completa, sucursales.
- Restablecimiento de contraseña por correo electrónico.
- Overrides de permisos por usuario.
- PIN de cajero / cambio rápido de turno.
- Upload real de avatar.
- Modo oscuro.
- Retención/purga automática del log de auditoría.
- Exportación a PDF/Excel (solo CSV en este bloque).
