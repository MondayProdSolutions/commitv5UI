# POS Módulo Asistencias (Bloque 7) — Diseño

**Fecha:** 2026-09-13
**Depende de:** Bloques 1-6 (Usuarios/Roles, Productos/Inventario, Clientes, Ventas, Caja, Reportes), ya existentes. Requiere una migración de esquema nueva (tabla `AttendanceRecord`) y una variable de entorno nueva (`ATTENDANCE_PHOTOS_DIR`).

Este es el primero de 4 módulos planeados para expandir el POS (asistencia, y 3 módulos adicionales aún por describir). Cada uno se diseña y especifica por separado; este documento cubre únicamente el módulo de Asistencias.

## 1. Resumen

Registro de entrada/salida de empleados con foto de comprobante tomada con la cámara del dispositivo, cálculo automático de horas trabajadas, y un dashboard (histograma de llegadas por hora, tabla de horas por empleado, galería del día, filtros) reutilizando el patrón de reportes ya existente (`src/lib/reports/*`, `src/components/charts/BarChart.tsx`, `period.ts`).

**No se toca la lógica central del POS** (ventas, caja, inventario, catálogo). El único punto de contacto con el modelo existente es una relación desde `AttendanceRecord` hacia `User` — no se modifica el modelo `User` ni ningún otro modelo existente.

## 2. Decisiones de diseño (de la sesión de brainstorming)

- **Alcance "facial":** solo captura de fotografía como comprobante visual — **sin verificación biométrica automática**. El empleado se identifica porque ya tiene sesión iniciada en el POS; la foto es evidencia, no una validación de identidad. Evita la complejidad y los riesgos de privacidad de un modelo de reconocimiento facial real.
- **Entidad "empleado":** se reutiliza `User` (con su `Role` ya existente) — no se crea una entidad `Employee` separada. Todo el que tiene cuenta en el POS puede registrar su asistencia.
- **Identificación en el check-in:** el empleado usa su propia sesión ya iniciada del POS (sin PIN adicional ni modo kiosco compartido). Simplifica el flujo: `context.user.id` de la sesión es quien registra.
- **Un par entrada/salida por día:** `@@unique([userId, fecha])` en el modelo — sin soporte de turnos múltiples ni pausas dentro del mismo día. Horas trabajadas = `checkOutAt − checkInAt`.
- **"Departamento" para filtros:** se reutiliza `User.role.nombre` (Administrador/Gerente/Cajero/Empleado) — no se agrega un campo nuevo al esquema de usuarios.
- **Fallback sin cámara:** si `getUserMedia` falla (permiso denegado, sin cámara, cámara ocupada, contexto inseguro, navegador sin soporte) el registro de entrada/salida se permite igual, sin foto. Nunca se bloquea la asistencia de alguien por un problema de hardware/navegador ajeno a su control.
- **Storage de fotos:** carpeta local en disco (`ATTENDANCE_PHOTOS_DIR`, default `.attendance-photos/`), no en Postgres. Mantiene la BD ligera; consistente con cómo ya se maneja `.pgdata/` para Postgres local. Las fotos nunca se sirven desde `public/` — solo vía un route handler con control de permiso.
- **Turnos abiertos sin cerrar:** si alguien olvida marcar salida, el registro queda "en curso" (sin horas calculadas) hasta que un Administrador lo cierre/corrija manualmente.
- **Sin nuevo rol ni cambios a roles existentes** más allá de asignarles los permisos nuevos de este bloque (ver §3).

## 3. Permisos y navegación

En `PERMISSIONS` (`src/lib/auth/rbac.ts`), nuevo módulo al final, tras `reportes`:

```ts
{
  modulo: 'asistencia', label: 'Asistencia',
  permisos: [
    { key: 'asistencia.registrar', label: 'Registrar la propia entrada y salida' },
    { key: 'asistencia.ver', label: 'Ver el dashboard y reportes de asistencia de todos los empleados' },
    { key: 'asistencia.corregir', label: 'Editar o cerrar manualmente un registro de asistencia' },
  ],
},
```

En `ROLE_PERMISSIONS` (`src/lib/auth/role-permissions.ts`):
- `Administrador` — todos, vía `ALL_PERMISSION_KEYS` (sin cambios en el archivo).
- `Gerente` += `['asistencia.registrar', 'asistencia.ver']`
- `Cajero` += `['asistencia.registrar']`
- `Empleado` += `['asistencia.registrar']`

`asistencia.corregir` queda reservado solo a Administrador (no se añade a ningún otro rol explícitamente, igual que `roles.gestionar`/`usuarios.editar`).

En `nav.ts` (`src/lib/nav.ts`): dos ítems nuevos entre `/reportes` y `/perfil`:
```ts
{ href: '/asistencia/registrar', label: 'Registrar asistencia', permiso: 'asistencia.registrar' },
{ href: '/asistencia', label: 'Asistencia (dashboard)', permiso: 'asistencia.ver' },
```

## 4. Modelo de datos

Nuevo modelo en `prisma/schema.prisma`, sin tocar ningún modelo existente:

```prisma
model AttendanceRecord {
  id                String    @id @default(cuid())
  userId            String
  user              User      @relation("AsistenciaUsuario", fields: [userId], references: [id])
  fecha             String    // YYYY-MM-DD en América/Mexico_City — misma convención que diaKeyMX de reports/period.ts
  checkInAt         DateTime
  checkInFotoPath   String?   // ruta relativa dentro de ATTENDANCE_PHOTOS_DIR; null si falló la cámara
  checkOutAt        DateTime?
  checkOutFotoPath  String?
  minutosTrabajados Int?      // (checkOutAt − checkInAt) en minutos; se calcula y persiste al hacer checkout
  corregidoPorId    String?   // Administrador que cerró/editó manualmente (null si el flujo fue normal)
  corregidoPor      User?     @relation("AsistenciaCorregidoPor", fields: [corregidoPorId], references: [id])
  createdAt         DateTime  @default(now())
  updatedAt         DateTime  @updatedAt

  @@unique([userId, fecha])
  @@index([fecha])
  @@index([userId, fecha])
}
```

En `User`, se añaden las dos relaciones inversas correspondientes (`asistencias AttendanceRecord[] @relation("AsistenciaUsuario")`, `asistenciasCorregidas AttendanceRecord[] @relation("AsistenciaCorregidoPor")`) — el único cambio al modelo existente, y es aditivo (no rompe nada de Bloques 1-6).

## 5. Almacenamiento y servido de fotos

- **Variable de entorno nueva** `ATTENDANCE_PHOTOS_DIR` en `.env.example` (default documentado: `.attendance-photos`), añadida a `.gitignore` igual que `.pgdata/`.
- **Escritura:** `src/lib/attendance/photos.ts` — `savePhoto(buffer: Buffer, userId: string, tipo: 'checkin' | 'checkout'): Promise<string>` escribe a `<ATTENDANCE_PHOTOS_DIR>/<fecha>/<userId>-<tipo>-<timestamp>.jpg` (creando directorios con `fs.mkdir({ recursive: true })`) y devuelve la ruta relativa a guardar en la BD. Validación de tipo/tamaño (solo JPEG, límite razonable ~5MB) antes de escribir.
- **Lectura:** `src/app/api/asistencia/foto/[...path]/route.ts` — `runtime = 'nodejs'`; requiere sesión válida; permite la foto si `can(user, 'asistencia.ver')` **o** si la ruta pertenece a un `AttendanceRecord` cuyo `userId` es el propio usuario (para que cualquiera pueda ver su propia foto en su historial). Devuelve 404 si el archivo no existe en disco, 403 si no tiene permiso. Nunca resuelve rutas fuera de `ATTENDANCE_PHOTOS_DIR` (normalizar y validar el path antes de leer).

## 6. Lógica de negocio (`src/lib/attendance/`)

- `records.ts`:
  - `getTodayRecord(userId): Promise<AttendanceRecord | null>` — busca por `[userId, fecha=hoyMX]`.
  - `checkIn({ userId, fotoBuffer }): Promise<AttendanceRecord>` — rechaza (`ValidationError`) si ya existe registro hoy para ese usuario (el `@@unique` es el respaldo a nivel BD).
  - `checkOut({ userId, fotoBuffer }): Promise<AttendanceRecord>` — rechaza si no hay `checkInAt` abierto hoy o si ya tiene `checkOutAt`; calcula `minutosTrabajados = Math.round((checkOutAt - checkInAt) / 60000)`.
  - `corregirRegistro({ id, checkOutAt, actorId }): Promise<AttendanceRecord>` — uso de Administrador para cerrar un turno abandonado; setea `corregidoPorId`, recalcula `minutosTrabajados`.
- `fecha.ts` (o reutiliza `diaKeyMX` copiando el mismo patrón aislado que `reports/period.ts` explica en su comentario, para no arrastrar `@/lib/db` a lógica pura) — `hoyKeyMX(): string`.
- Todas las escrituras van dentro de `db.$transaction` cuando tocan más de una fila (no es el caso aquí — cada operación es de una sola fila con `@@unique` como guarda), consistente con el nivel de rigor de `recordMovement` para operaciones que sí lo requieren.

## 7. Flujo del empleado — `/asistencia/registrar`

Página cliente (`'use client'` en el componente de cámara; el `page.tsx` server-side hace `requirePermission('asistencia.registrar')` y pasa si hay registro abierto hoy):

1. Muestra "Marcar entrada" o "Marcar salida" según `getTodayRecord`.
2. Al presionar: abre `<video>` con `getUserMedia({ video: true })`.
   - Éxito → botón "Capturar", toma frame a `<canvas>` → `canvas.toBlob('image/jpeg')`.
   - Falla (cualquier excepción de `getUserMedia`, o `mediaDevices` inexistente) → se omite la captura, se muestra un aviso breve ("No se pudo acceder a la cámara — se registrará sin foto") y se continúa.
3. Envío a una Server Action (`src/app/(app)/asistencia/registrar/actions.ts`) con `FormData` (incluye el `Blob` si existe) → `requirePermission('asistencia.registrar')` → `checkIn`/`checkOut` de `src/lib/attendance/records.ts`.
4. `revalidatePath('/asistencia/registrar')`; confirmación visual inmediata (sin redirect, para minimizar fricción — "los empleados no quieren esperar").

## 8. Dashboard — `/asistencia` (requiere `asistencia.ver`)

Mismo patrón que `src/app/(app)/reportes/`: `page.tsx` con `requirePermission('asistencia.ver')`, `export const dynamic = 'force-dynamic'`, lee `searchParams`, resuelve período con el `resolvePeriod` ya existente de `src/lib/reports/period.ts` (reutilizado tal cual, sin fork).

`src/lib/attendance/dashboard.ts` → `getAttendanceDashboard(period, filtros: { userId?: string; roleId?: string }): Promise<AttendanceDashboard>`:

```
// period.desde/hasta son Date; se convierten a fecha string (diaKeyMX) para comparar
// contra el campo `fecha` (string, orden lexicográfico = orden cronológico — mismo
// criterio documentado en reports/period.ts), en vez de comparar por DateTime.
registros = AttendanceRecord WHERE fecha BETWEEN diaKeyMX(period.desde) AND diaKeyMX(period.hasta) AND filtros aplicados

llegadasPorHora   = agrupa checkInAt por hora local MX (0-23) → [{ hora: '08', llegadas: n }, ...] — respalda BarChart
horasPorEmpleado  = agrupa minutosTrabajados (no-null) por userId → [{ userId, nombre, roleName, minutos }] — tabla
registrosDeHoy    = registros de la fecha de hoy con sus rutas de foto — galería
```

- **Gráfica**: `BarChart` vertical con `llegadasPorHora` (reutilizado tal cual de `src/components/charts/BarChart.tsx`, sin cambios al componente).
- **Tabla**: horas trabajadas por empleado en el período, formateadas `Xh Ym`.
- **Galería**: grid de tarjetas del día actual — foto de entrada, hora, foto de salida (o "en curso"), nombre.
- **Filtros**: mismo `<form method="get">` que reportes, + selects de empleado y rol (poblados desde `db.user.findMany`/`db.role.findMany`).

## 9. Casos borde y errores

- **Checkout sin checkin / doble checkin o checkout**: `ValidationError` desde `records.ts`, mostrado en el formulario (mismo patrón `fieldErrorsFrom`/`FormState` que `movimientos/actions.ts`).
- **Turno "en curso" indefinido**: visible en dashboard con estado especial (sin `minutosTrabajados`); acción de corrección solo accesible con `asistencia.corregir`.
- **Foto corrupta/demasiado grande**: `savePhoto` valida antes de escribir; si falla, el registro procede igual sin foto (mismo criterio que "sin cámara" — nunca bloquea la asistencia).
- **Ruta de foto maliciosa** (`../../etc/passwd` etc.) en el route handler: se normaliza el path y se verifica que quede dentro de `ATTENDANCE_PHOTOS_DIR` antes de leer; si no, 404.

## 10. Testing

- **Unit** (`*.test.ts`, sin BD): cálculo de `minutosTrabajados`, bucketing de `llegadasPorHora`, normalización/validación de rutas de foto.
- **Integración** (`*.itest.ts`, BD real): `src/lib/attendance/records.itest.ts` — checkIn/checkOut felices, rechazo de doble check-in, rechazo de checkout sin checkin, `@@unique` respetado bajo escritura concurrente; `dashboard.itest.ts` — agregaciones con datos sembrados.
- **Ruta de fotos**: `route.itest.ts` para `/api/asistencia/foto/[...path]` — 403 sin sesión, 404 fuera de `ATTENDANCE_PHOTOS_DIR`, 200 sirviendo el archivo correcto al dueño o a alguien con `asistencia.ver`.
- **E2E** (`e2e/asistencia.spec.ts`): flujo de check-in/checkout con cámara simulada de Playwright (`context.grantPermissions(['camera'])` + fake device), y flujo sin cámara (permiso denegado) verificando que igual se registra.

## 11. Fuera de alcance

- Reconocimiento facial / verificación biométrica real.
- Modo kiosco compartido con PIN (varios empleados en un mismo dispositivo sin sesión individual).
- Turnos múltiples o pausas dentro del mismo día.
- Geolocalización del registro.
- Entidad `Employee` separada de `User` (personal sin cuenta en el POS).
- Notificaciones (retardos, faltas) — posible extensión futura, no en este bloque.
- Los módulos 2, 3 y 4 mencionados por el usuario — se especifican por separado cuando se describan.
