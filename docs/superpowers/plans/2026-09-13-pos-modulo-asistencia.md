# POS Módulo Asistencias (Bloque 7) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Registro de entrada/salida de empleados (con foto de comprobante opcional tomada desde el navegador), cálculo de horas trabajadas, y un dashboard de asistencia (llegadas por hora, horas por empleado, galería del día, filtros) — sin tocar la lógica central de Ventas/Caja/Inventario/Catálogo.

**Architecture:** Un modelo nuevo (`AttendanceRecord`, un renglón por empleado por día) en `src/lib/attendance/`, consumido por (a) una pantalla de auto-registro (`/asistencia/registrar`) donde el propio empleado ya logueado marca su entrada/salida con una foto capturada vía `getUserMedia` + `<canvas>`, (b) un route handler que sirve esas fotos desde disco con control de permiso, y (c) un dashboard (`/asistencia`) que reutiliza el patrón ya existente de reportes (`resolvePeriod`/`diaKeyMX` de `@/lib/reports/period`, `BarChart` de `@/components/charts`).

**Tech Stack:** Next.js 16.3.4, React 19.2, TypeScript strict, PostgreSQL + Prisma 7 + `@prisma/adapter-pg`, Tailwind v4, Vitest 4 (`*.test.ts` unit / `*.itest.ts` integración con Postgres efímero), Playwright. Sin librerías nuevas — la cámara usa la Web API nativa `navigator.mediaDevices.getUserMedia`.

**Spec:** `docs/superpowers/specs/2026-09-13-pos-modulo-asistencia-design.md`

## Global Constraints

- **Base ya construida (Bloques 1-6, en `master`):** reutiliza sin reescribir — `requirePermission`/`getCurrentUser` (`@/lib/auth/context`), `PERMISSIONS`/`can`/`ALL_PERMISSION_KEYS`/`PermissionKey` (`@/lib/auth/rbac`), `ROLE_PERMISSIONS` (`@/lib/auth/role-permissions`), `db` (`@/lib/db`), `ValidationError`/`NotFoundError`/`ForbiddenError` (`@/lib/errors`), `hashPassword` (`@/lib/auth/password`), `createSession`/`SESSION_COOKIE` (`@/lib/auth/session`), `visibleNav`/`NAV_ITEMS` (`@/lib/nav`), `Button`/`Card` (`@/components/ui`), `Field` (`@/components/forms`), `inputClass` (`@/app/(app)/ventas/types`), `FormState` (`@/app/(auth)/setup/actions`), `BarChart`/`ChartDatum` (`@/components/charts/BarChart`), `resolvePeriod`/`diaKeyMX`/`ReportPeriod` (`@/lib/reports/period` — sin fork, se importa tal cual), `PeriodFilterForm` (`@/app/(app)/reportes/PeriodFilterForm`), `doSetup`/`login`/`entrarComo`-style helpers (`e2e/helpers.ts`).
- **Prisma:** un solo cliente, `import { db } from '@/lib/db'` — NUNCA `new PrismaClient()`. `Prisma.PrismaClientKnownRequestError` con `.code === 'P2002'` para únicos.
- **Migración:** puramente ADITIVA. Un modelo nuevo (`AttendanceRecord`) y dos relaciones inversas nuevas en `User` (`asistencias`, `asistenciasCorregidas`). Ninguna columna/tabla existente se altera ni se borra. `npx prisma migrate dev --name bloque7_asistencia`.
- **Alcance "facial":** solo foto de comprobante — **sin verificación biométrica**. El empleado se identifica por su sesión ya iniciada (`requirePermission('asistencia.registrar')` devuelve el actor; nunca se recibe un `userId` del cliente para decidir de quién es el registro).
- **Un registro por día:** `@@unique([userId, fecha])`, `fecha` es `diaKeyMX(new Date())` (día natural en `America/Mexico_City`, mismo criterio que Reportes). Un empleado no puede tener 2 check-ins ni 2 check-outs el mismo día MX.
- **Fallback sin cámara:** si `getUserMedia` falla, o si la foto recibida en el servidor es inválida/corrupta/demasiado grande, el check-in/check-out se registra igual **sin foto** — nunca se bloquea la asistencia por esto (spec §2, §9).
- **Storage de fotos:** carpeta local en disco, ruta base en `ATTENDANCE_PHOTOS_DIR` (default `.attendance-photos`, añadida a `.gitignore`). Nunca servidas desde `public/` — solo vía `GET /api/asistencia/foto/[...path]`, que exige sesión y (dueño de la foto O `asistencia.ver`), y nunca resuelve una ruta fuera del directorio base.
- **Permisos nuevos** (grupo `asistencia` en `PERMISSIONS`, al final, tras `reportes`): `asistencia.registrar` (Administrador + Gerente + Cajero + Empleado), `asistencia.ver` (Administrador + Gerente), `asistencia.corregir` (solo Administrador, vía `ALL_PERMISSION_KEYS` — no se añade explícitamente a ningún otro rol).
- **Autorización:** toda página server empieza con `await requirePermission('<clave>')` ANTES de leer `searchParams`/tocar la BD; `export const dynamic = 'force-dynamic'`. Toda Server Action empieza con `await requirePermission('<clave>')` ANTES de leer `formData`.
- **`src/proxy.ts` ya cubre autenticación** para `/api/asistencia/foto/**` (su matcher solo ignora `/api/session` y `/api/health`) — no requiere cambios; el route handler añade la capa de AUTORIZACIÓN (dueño o `asistencia.ver`) que el proxy no conoce.
- **Turnos abandonados:** si alguien olvida marcar salida, el registro queda con `checkOutAt = null` ("en curso"); un Administrador lo cierra con `asistencia.corregir` (fija `checkOutAt`, recalcula `minutosTrabajados`, guarda `corregidoPorId`).
- **UI:** español; `redirect()`/`notFound()` fuera de try/catch; Tailwind v4 con los tokens de diseño ya en uso (`ink`, `ink-muted`, `ink-subtle`, `surface`, `surface-raised`, `line`, `primary`, `danger-soft`, `on-danger-soft`, `rounded-control`, `rounded-card`); sin `any`; sin `console.*`. `<img>` (no `next/image`) para las fotos servidas por el route handler propio, con el comentario `// eslint-disable-next-line @next/next/no-img-element -- <razón>` (mismo patrón que `CategoryGrid.tsx`).
- **TDD:** test primero. `*.test.ts` unit (sin BD): `rbac-asistencia.test.ts`, `photos.test.ts` (usa un directorio temporal real vía `ATTENDANCE_PHOTOS_DIR`, pero sin Postgres). `*.itest.ts` integración (Postgres efímero): todo lo que importe `@/lib/db` (`records.itest.ts`, `dashboard.itest.ts`, `schema.itest.ts`, `route.itest.ts` de fotos). Ejecutar por tarea: `npm run typecheck && npm run lint && npm run test:unit && npm run test:integration`, pegar las colas en el reporte.
- **Aislamiento en itests:** cada archivo limpia por email de usuario de prueba (`t7-<algo>@pos.com`) vía `cleanupAttendance` (Task 2) — nunca borra roles del sistema ni usuarios de otras suites.
- **Ruta de fotos en itests:** los tests de route handlers mockean `next/headers` (`vi.mock('next/headers', ...)` con un `cookieStore` compartido) y llaman al `GET` exportado directamente con `new Request(url)` — mismo patrón exacto que `src/app/(app)/clientes/export/route.itest.ts`.
- **Sin repo git inicializado en este proyecto todavía** (`git status` → `fatal: not a git repository`). Los pasos "Commit" de este plan asumen que alguien corrió `git init` (y hecho el primer commit del estado actual) antes de la Task 1 — si no se ha hecho, ejecútalo o pregúntale al usuario antes de la primera Task; si el usuario prefiere no inicializar git todavía, omite los pasos de commit y sigue el resto de cada tarea igual.
- **Commits:** Conventional Commits en español, terminando EXACTAMENTE con:
  ```
  Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01FVhnjxQuS9orkoakWbjRWa
  ```
- **Sin push, sin remoto, sin deploy.** Todo local.

---

## Estructura de archivos

**Prisma**
- `prisma/schema.prisma` — + modelo `AttendanceRecord`, + 2 relaciones inversas en `User`.
- `prisma/migrations/<ts>_bloque7_asistencia/` — generada.

**Librería**
- `src/lib/auth/rbac.ts` — + grupo `asistencia`.
- `src/lib/auth/role-permissions.ts` — + `asistencia.registrar`/`asistencia.ver` en Gerente/Cajero/Empleado (según corresponda).
- `src/lib/nav.ts` — + 2 ítems.
- `src/lib/attendance/__testutil.ts` — `seedUser`, `cleanupAttendance`.
- `src/lib/attendance/photos.ts` — `savePhoto`, `resolvePhotoAbsolutePath`, `photoExists`.
- `src/lib/attendance/records.ts` — `getTodayRecord`, `checkIn`, `checkOut`, `corregirRegistro`.
- `src/lib/attendance/dashboard.ts` — `getAttendanceDashboard`.

**App**
- `src/app/(app)/asistencia/registrar/page.tsx`, `CameraCapture.tsx`, `actions.ts`.
- `src/app/api/asistencia/foto/[...path]/route.ts`.
- `src/app/(app)/asistencia/page.tsx`, `AttendanceFilters.tsx`, `CorregirTurnoForm.tsx`, `actions.ts`.

**Config**
- `.env.example`, `.gitignore` — + `ATTENDANCE_PHOTOS_DIR`.

**E2E**
- `e2e/asistencia.spec.ts`.

---

## Task 1: RBAC y navegación (`asistencia.registrar`/`ver`/`corregir`)

**Files:**
- Modify: `src/lib/auth/rbac.ts`, `src/lib/auth/role-permissions.ts`, `src/lib/nav.ts`
- Create: `src/lib/auth/rbac-asistencia.test.ts`

**Interfaces:**
- Produces: claves `asistencia.registrar`/`asistencia.ver`/`asistencia.corregir` (parte de `PermissionKey`/`ALL_PERMISSION_KEYS`). `ROLE_PERMISSIONS.Gerente`/`.Cajero`/`.Empleado` += `asistencia.registrar`; `.Gerente` += también `asistencia.ver`.

- [ ] **Step 1: `src/lib/auth/rbac-asistencia.test.ts` (falla)**

```ts
import { describe, it, expect } from 'vitest';
import { PERMISSIONS, ALL_PERMISSION_KEYS } from './rbac';

describe('grupo de permisos asistencia', () => {
  it('existe el módulo asistencia con 3 claves', () => {
    const g = PERMISSIONS.find((x) => x.modulo === 'asistencia');
    expect(g?.permisos.map((p) => p.key)).toEqual([
      'asistencia.registrar',
      'asistencia.ver',
      'asistencia.corregir',
    ]);
  });
  it('las 3 claves están en ALL_PERMISSION_KEYS', () => {
    expect(ALL_PERMISSION_KEYS).toContain('asistencia.registrar');
    expect(ALL_PERMISSION_KEYS).toContain('asistencia.ver');
    expect(ALL_PERMISSION_KEYS).toContain('asistencia.corregir');
  });
});
```

Run: `npm run test:unit -- src/lib/auth/rbac-asistencia.test.ts` → FAIL (`g` es `undefined`).

- [ ] **Step 2: Añadir el grupo en `rbac.ts`** — como último elemento de `PERMISSIONS` (tras `reportes`, antes de `] as const;`):

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

Run: `npm run test:unit -- src/lib/auth/rbac-asistencia.test.ts` → PASS.

- [ ] **Step 3: `role-permissions.ts` — reparto**

En `ROLE_PERMISSIONS.Gerente` (tras el bloque `// Bloque 6: Reportes`, añade):
```ts
    // Bloque 7: Asistencia
    'asistencia.registrar', 'asistencia.ver',
```
En `ROLE_PERMISSIONS.Cajero` (añade a la lista existente, con comentario):
```ts
    // Bloque 7: Asistencia
    'asistencia.registrar',
```
En `ROLE_PERMISSIONS.Empleado` (reemplaza `['productos.ver', 'inventario.ver', 'clientes.ver']` por):
```ts
  Empleado: ['productos.ver', 'inventario.ver', 'clientes.ver', 'asistencia.registrar'],
```

- [ ] **Step 4: `nav.ts` — 2 ítems** — entre el ítem `/reportes` y `/perfil`:
```ts
  { href: '/asistencia/registrar', label: 'Registrar asistencia', permiso: 'asistencia.registrar' },
  { href: '/asistencia', label: 'Asistencia (dashboard)', permiso: 'asistencia.ver' },
```

- [ ] **Step 5: Suite completa + commit**

Run: `npm run typecheck && npm run lint && npm run test:unit && npm run test:integration`
Expected: 0 errores; `src/lib/roles/admin.itest.ts` sigue verde (consume `ROLE_PERMISSIONS`).

```bash
git add src/lib/auth/rbac.ts src/lib/auth/rbac-asistencia.test.ts src/lib/auth/role-permissions.ts src/lib/nav.ts
git commit -m "feat(asistencia): permisos asistencia.registrar/ver/corregir y navegación

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01FVhnjxQuS9orkoakWbjRWa"
```

---

## Task 2: Esquema Prisma, migración y utilidades de test

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<ts>_bloque7_asistencia/` (generada por Prisma)
- Create: `src/lib/attendance/__testutil.ts`, `src/lib/attendance/schema.itest.ts`

**Interfaces:**
- Consumes: `db` (`@/lib/db`), `hashPassword` (`@/lib/auth/password`).
- Produces: modelo Prisma `AttendanceRecord` (campos: `id`, `userId`, `fecha: string`, `checkInAt: Date`, `checkInFotoPath: string | null`, `checkOutAt: Date | null`, `checkOutFotoPath: string | null`, `minutosTrabajados: number | null`, `corregidoPorId: string | null`, `createdAt`, `updatedAt`), único compuesto `userId_fecha`. `seedUser(email: string, roleName: string): Promise<string>`; `cleanupAttendance(emails: string[]): Promise<void>` — usados por todas las Tasks siguientes.

- [ ] **Step 1: `src/lib/attendance/__testutil.ts`**

```ts
import { db } from '@/lib/db';
import { hashPassword } from '@/lib/auth/password';

/** Crea (o recrea) un usuario con el rol indicado y devuelve su id. */
export async function seedUser(email: string, roleName: string): Promise<string> {
  await db.user.deleteMany({ where: { email } });
  const rol = await db.role.findFirstOrThrow({ where: { nombre: roleName } });
  const user = await db.user.create({
    data: {
      nombre: `Test ${roleName}`,
      email,
      passwordHash: await hashPassword('xxxxxxxxxx'),
      roleId: rol.id,
    },
  });
  return user.id;
}

/** Limpieza FK-segura: borra los AttendanceRecord y luego los usuarios de los emails dados. */
export async function cleanupAttendance(emails: string[]): Promise<void> {
  const users = await db.user.findMany({ where: { email: { in: emails } }, select: { id: true } });
  const ids = users.map((u) => u.id);
  if (ids.length) await db.attendanceRecord.deleteMany({ where: { userId: { in: ids } } });
  if (emails.length) await db.user.deleteMany({ where: { email: { in: emails } } });
}
```

- [ ] **Step 2: `src/lib/attendance/schema.itest.ts` (falla — el modelo no existe aún)**

```ts
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { db } from '@/lib/db';
import { seedUser, cleanupAttendance } from './__testutil';

const EMAIL = 't7-schema@pos.com';
const EMAIL_ADMIN = 't7-schema-admin@pos.com';
const EMAILS = [EMAIL, EMAIL_ADMIN];

beforeEach(async () => {
  await cleanupAttendance(EMAILS);
});
afterAll(async () => {
  await cleanupAttendance(EMAILS);
});

describe('modelo AttendanceRecord', () => {
  it('crea un registro y respeta @@unique([userId, fecha])', async () => {
    const userId = await seedUser(EMAIL, 'Empleado');
    await db.attendanceRecord.create({ data: { userId, fecha: '2026-09-13', checkInAt: new Date() } });

    await expect(
      db.attendanceRecord.create({ data: { userId, fecha: '2026-09-13', checkInAt: new Date() } }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });

  it('permite el mismo usuario en días distintos, y corregidoPorId apuntando a otro usuario', async () => {
    const userId = await seedUser(EMAIL, 'Empleado');
    const adminId = await seedUser(EMAIL_ADMIN, 'Administrador');

    await db.attendanceRecord.create({ data: { userId, fecha: '2026-09-13', checkInAt: new Date() } });
    const dia2 = await db.attendanceRecord.create({
      data: {
        userId,
        fecha: '2026-09-14',
        checkInAt: new Date(),
        checkOutAt: new Date(),
        minutosTrabajados: 60,
        corregidoPorId: adminId,
      },
    });

    expect(dia2.corregidoPorId).toBe(adminId);
  });
});
```

- [ ] **Step 3: Añadir al `schema.prisma`** (al final, sin tocar lo existente salvo las 2 líneas inversas en `User`)

```prisma
model AttendanceRecord {
  id                String    @id @default(cuid())
  userId            String
  user              User      @relation("AsistenciaUsuario", fields: [userId], references: [id])
  fecha             String
  checkInAt         DateTime
  checkInFotoPath   String?
  checkOutAt        DateTime?
  checkOutFotoPath  String?
  minutosTrabajados Int?
  corregidoPorId    String?
  corregidoPor      User?     @relation("AsistenciaCorregidoPor", fields: [corregidoPorId], references: [id])
  createdAt         DateTime  @default(now())
  updatedAt         DateTime  @updatedAt

  @@unique([userId, fecha])
  @@index([fecha])
  @@index([userId, fecha])
}
```

En el modelo `User` existente, añade (junto a las demás relaciones inversas, p. ej. tras `movimientosCaja`):
```prisma
  asistencias           AttendanceRecord[] @relation("AsistenciaUsuario")
  asistenciasCorregidas AttendanceRecord[] @relation("AsistenciaCorregidoPor")
```

- [ ] **Step 4: Generar la migración**

```bash
npm run db:start   # background; esperar "Corriendo"
npx prisma migrate dev --name bloque7_asistencia
```
Expected: crea la carpeta de migración, aplica a `pos_dev`, regenera el cliente. El SQL debe ser solo `CREATE TABLE "AttendanceRecord"` + sus `ADD CONSTRAINT` de FK hacia `User` — ninguna columna existente alterada.

- [ ] **Step 5: Ejecutar tests y suite completa**

Run: `npm run test:integration -- src/lib/attendance/schema.itest.ts` → PASS.
Run: `npm run typecheck && npm run lint && npm run test:unit && npm run test:integration`

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma prisma/migrations src/lib/attendance/__testutil.ts src/lib/attendance/schema.itest.ts
git commit -m "feat(asistencia): modelo AttendanceRecord y migración

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01FVhnjxQuS9orkoakWbjRWa"
```

---

## Task 3: Almacenamiento de fotos (`src/lib/attendance/photos.ts`)

**Files:**
- Create: `src/lib/attendance/photos.ts`, `src/lib/attendance/photos.test.ts`
- Modify: `.env.example`, `.gitignore`

**Interfaces:**
- Consumes: `ValidationError` (`@/lib/errors`).
- Produces: `savePhoto(buffer: Buffer, opts: { userId: string; tipo: 'checkin' | 'checkout'; fecha: string }): Promise<string>` (devuelve ruta relativa `YYYY-MM-DD/archivo.jpg`); `resolvePhotoAbsolutePath(relativePath: string): string | null`; `photoExists(absolutePath: string): Promise<boolean>`.

- [ ] **Step 1: `.env.example` y `.gitignore`**

En `.env.example`, añade al final:
```
ATTENDANCE_PHOTOS_DIR=".attendance-photos"
```
En `.gitignore`, junto a `.pgdata/`:
```
.attendance-photos/
```

- [ ] **Step 2: `src/lib/attendance/photos.test.ts` (falla)**

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { ValidationError } from '@/lib/errors';
import { savePhoto, resolvePhotoAbsolutePath, photoExists } from './photos';

let dir: string;
const ORIGINAL_ENV = process.env.ATTENDANCE_PHOTOS_DIR;

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'asistencia-'));
  process.env.ATTENDANCE_PHOTOS_DIR = dir;
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
  process.env.ATTENDANCE_PHOTOS_DIR = ORIGINAL_ENV;
});

describe('savePhoto', () => {
  it('escribe el archivo y devuelve la ruta relativa fecha/archivo.jpg', async () => {
    const rel = await savePhoto(Buffer.from('foto'), { userId: 'u1', tipo: 'checkin', fecha: '2026-09-13' });
    expect(rel).toMatch(/^2026-09-13\/u1-checkin-\d+\.jpg$/);
    const abs = resolvePhotoAbsolutePath(rel);
    expect(abs).not.toBeNull();
    expect(await photoExists(abs as string)).toBe(true);
  });

  it('rechaza un buffer vacío', async () => {
    await expect(
      savePhoto(Buffer.alloc(0), { userId: 'u1', tipo: 'checkin', fecha: '2026-09-13' }),
    ).rejects.toThrow(ValidationError);
  });

  it('rechaza un buffer mayor a 5MB', async () => {
    await expect(
      savePhoto(Buffer.alloc(5 * 1024 * 1024 + 1), { userId: 'u1', tipo: 'checkin', fecha: '2026-09-13' }),
    ).rejects.toThrow(ValidationError);
  });
});

describe('resolvePhotoAbsolutePath', () => {
  it('rechaza intentos de path traversal', () => {
    expect(resolvePhotoAbsolutePath('../../etc/passwd')).toBeNull();
    expect(resolvePhotoAbsolutePath('2026-09-13/../../etc/passwd')).toBeNull();
  });

  it('rechaza formatos que no son fecha/archivo.jpg', () => {
    expect(resolvePhotoAbsolutePath('archivo.jpg')).toBeNull();
    expect(resolvePhotoAbsolutePath('2026-09-13/archivo.png')).toBeNull();
  });

  it('acepta el formato válido', () => {
    expect(resolvePhotoAbsolutePath('2026-09-13/u1-checkin-123.jpg')).not.toBeNull();
  });
});
```

Run: `npm run test:unit -- src/lib/attendance/photos.test.ts` → FAIL (`./photos` no existe).

- [ ] **Step 3: `src/lib/attendance/photos.ts`**

```ts
import { mkdir, writeFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { ValidationError } from '@/lib/errors';

const MAX_BYTES = 5 * 1024 * 1024;

function photosRoot(): string {
  return path.resolve(process.cwd(), process.env.ATTENDANCE_PHOTOS_DIR ?? '.attendance-photos');
}

/** Escribe la foto en `<root>/<fecha>/<userId>-<tipo>-<timestamp>.jpg` y devuelve la ruta relativa. */
export async function savePhoto(
  buffer: Buffer,
  opts: { userId: string; tipo: 'checkin' | 'checkout'; fecha: string },
): Promise<string> {
  if (buffer.length === 0 || buffer.length > MAX_BYTES) {
    throw new ValidationError({ foto: 'La foto está vacía o excede el tamaño máximo (5MB).' });
  }
  const dir = path.join(photosRoot(), opts.fecha);
  await mkdir(dir, { recursive: true });
  const filename = `${opts.userId}-${opts.tipo}-${Date.now()}.jpg`;
  await writeFile(path.join(dir, filename), buffer);
  return `${opts.fecha}/${filename}`;
}

/**
 * Resuelve una ruta relativa guardada en BD (`YYYY-MM-DD/archivo.jpg`) a una
 * ruta absoluta dentro de `ATTENDANCE_PHOTOS_DIR`, o `null` si el formato es
 * inválido o intenta salir del directorio base (path traversal).
 */
export function resolvePhotoAbsolutePath(relativePath: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}\/[\w-]+\.jpg$/.test(relativePath)) return null;
  const root = photosRoot();
  const abs = path.join(root, relativePath);
  if (!abs.startsWith(root + path.sep)) return null;
  return abs;
}

export async function photoExists(absolutePath: string): Promise<boolean> {
  try {
    await stat(absolutePath);
    return true;
  } catch {
    return false;
  }
}
```

- [ ] **Step 4: Ejecutar y verificar que pasa**

Run: `npm run test:unit -- src/lib/attendance/photos.test.ts` → PASS.

- [ ] **Step 5: typecheck + lint + commit**

Run: `npm run typecheck && npm run lint`

```bash
git add src/lib/attendance/photos.ts src/lib/attendance/photos.test.ts .env.example .gitignore
git commit -m "feat(asistencia): storage de fotos en disco (savePhoto/resolvePhotoAbsolutePath)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01FVhnjxQuS9orkoakWbjRWa"
```

---

## Task 4: Lógica de negocio (`src/lib/attendance/records.ts`)

**Files:**
- Create: `src/lib/attendance/records.ts`, `src/lib/attendance/records.itest.ts`

**Interfaces:**
- Consumes: `db` (`@/lib/db`), `diaKeyMX` (`@/lib/reports/period`), `ValidationError`/`NotFoundError` (`@/lib/errors`), `Prisma` (`@prisma/client`), `seedUser`/`cleanupAttendance` (Task 2).
- Produces: `getTodayRecord(userId: string): Promise<AttendanceRecord | null>`; `checkIn(params: { userId: string; fotoPath: string | null }): Promise<AttendanceRecord>`; `checkOut(params: { userId: string; fotoPath: string | null }): Promise<AttendanceRecord>`; `corregirRegistro(params: { id: string; checkOutAt: Date; actorId: string }): Promise<AttendanceRecord>`. Consumidas por Task 5 (Server Actions) y Task 8 (corrección).

- [ ] **Step 1: `src/lib/attendance/records.itest.ts` (falla)**

```ts
import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import { ValidationError } from '@/lib/errors';
import { seedUser, cleanupAttendance } from './__testutil';
import { checkIn, checkOut, getTodayRecord, corregirRegistro } from './records';

const EMAIL_A = 't7-records-a@pos.com';
const EMAIL_ADMIN = 't7-records-admin@pos.com';
const EMAILS = [EMAIL_A, EMAIL_ADMIN];

let userA: string;
let admin: string;

beforeEach(async () => {
  await cleanupAttendance(EMAILS);
  userA = await seedUser(EMAIL_A, 'Empleado');
  admin = await seedUser(EMAIL_ADMIN, 'Administrador');
});

afterAll(async () => {
  await cleanupAttendance(EMAILS);
});

describe('checkIn', () => {
  it('crea el registro del día con checkInAt y sin checkOutAt', async () => {
    const r = await checkIn({ userId: userA, fotoPath: '2026-09-13/x-checkin-1.jpg' });
    expect(r.userId).toBe(userA);
    expect(r.checkOutAt).toBeNull();
    expect(r.checkInFotoPath).toBe('2026-09-13/x-checkin-1.jpg');
  });

  it('rechaza un segundo check-in el mismo día', async () => {
    await checkIn({ userId: userA, fotoPath: null });
    await expect(checkIn({ userId: userA, fotoPath: null })).rejects.toThrow(ValidationError);
  });
});

describe('checkOut', () => {
  it('rechaza checkout sin checkin previo', async () => {
    await expect(checkOut({ userId: userA, fotoPath: null })).rejects.toThrow(ValidationError);
  });

  it('calcula minutosTrabajados y rechaza un segundo checkout', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-13T14:00:00Z'));
    await checkIn({ userId: userA, fotoPath: null });
    vi.setSystemTime(new Date('2026-09-13T14:30:00Z'));
    const r = await checkOut({ userId: userA, fotoPath: null });
    vi.useRealTimers();

    expect(r.minutosTrabajados).toBe(30);
    await expect(checkOut({ userId: userA, fotoPath: null })).rejects.toThrow(ValidationError);
  });
});

describe('getTodayRecord', () => {
  it('devuelve null si no hay registro hoy', async () => {
    expect(await getTodayRecord(userA)).toBeNull();
  });
});

describe('corregirRegistro', () => {
  it('cierra un turno abierto, calcula minutos y marca quién corrigió', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-13T14:00:00Z'));
    const abierto = await checkIn({ userId: userA, fotoPath: null });
    vi.useRealTimers();

    const cierre = new Date('2026-09-13T22:00:00Z');
    const r = await corregirRegistro({ id: abierto.id, checkOutAt: cierre, actorId: admin });
    expect(r.checkOutAt?.toISOString()).toBe(cierre.toISOString());
    expect(r.minutosTrabajados).toBe(480);
    expect(r.corregidoPorId).toBe(admin);
  });

  it('rechaza una salida anterior o igual a la entrada', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-13T14:00:00Z'));
    const abierto = await checkIn({ userId: userA, fotoPath: null });
    vi.useRealTimers();

    await expect(
      corregirRegistro({ id: abierto.id, checkOutAt: new Date('2026-09-13T10:00:00Z'), actorId: admin }),
    ).rejects.toThrow(ValidationError);
  });
});
```

- [ ] **Step 2: Ejecutar (FAIL), escribir `src/lib/attendance/records.ts`**

```ts
import { Prisma } from '@prisma/client';
import type { AttendanceRecord } from '@prisma/client';
import { db } from '@/lib/db';
import { diaKeyMX } from '@/lib/reports/period';
import { NotFoundError, ValidationError } from '@/lib/errors';

export async function getTodayRecord(userId: string): Promise<AttendanceRecord | null> {
  return db.attendanceRecord.findUnique({
    where: { userId_fecha: { userId, fecha: diaKeyMX(new Date()) } },
  });
}

export async function checkIn(params: {
  userId: string;
  fotoPath: string | null;
}): Promise<AttendanceRecord> {
  const fecha = diaKeyMX(new Date());
  const existente = await db.attendanceRecord.findUnique({
    where: { userId_fecha: { userId: params.userId, fecha } },
  });
  if (existente) throw new ValidationError({ checkIn: 'Ya registraste tu entrada hoy.' });

  try {
    return await db.attendanceRecord.create({
      data: { userId: params.userId, fecha, checkInAt: new Date(), checkInFotoPath: params.fotoPath },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      throw new ValidationError({ checkIn: 'Ya registraste tu entrada hoy.' });
    }
    throw e;
  }
}

export async function checkOut(params: {
  userId: string;
  fotoPath: string | null;
}): Promise<AttendanceRecord> {
  const fecha = diaKeyMX(new Date());
  const existente = await db.attendanceRecord.findUnique({
    where: { userId_fecha: { userId: params.userId, fecha } },
  });
  if (!existente) throw new ValidationError({ checkOut: 'No has registrado tu entrada hoy.' });
  if (existente.checkOutAt) throw new ValidationError({ checkOut: 'Ya registraste tu salida hoy.' });

  const checkOutAt = new Date();
  const minutosTrabajados = Math.round((checkOutAt.getTime() - existente.checkInAt.getTime()) / 60000);
  return db.attendanceRecord.update({
    where: { id: existente.id },
    data: { checkOutAt, checkOutFotoPath: params.fotoPath, minutosTrabajados },
  });
}

export async function corregirRegistro(params: {
  id: string;
  checkOutAt: Date;
  actorId: string;
}): Promise<AttendanceRecord> {
  const record = await db.attendanceRecord.findUnique({ where: { id: params.id } });
  if (!record) throw new NotFoundError('Registro de asistencia no encontrado');
  if (params.checkOutAt.getTime() <= record.checkInAt.getTime()) {
    throw new ValidationError({ checkOutAt: 'La salida debe ser posterior a la entrada.' });
  }
  const minutosTrabajados = Math.round(
    (params.checkOutAt.getTime() - record.checkInAt.getTime()) / 60000,
  );
  return db.attendanceRecord.update({
    where: { id: params.id },
    data: { checkOutAt: params.checkOutAt, minutosTrabajados, corregidoPorId: params.actorId },
  });
}
```

- [ ] **Step 3: Ejecutar y verificar que pasa**

Run: `npm run test:integration -- src/lib/attendance/records.itest.ts` → PASS.

- [ ] **Step 4: typecheck + lint + suite + commit**

Run: `npm run typecheck && npm run lint && npm run test:unit && npm run test:integration`

```bash
git add src/lib/attendance/records.ts src/lib/attendance/records.itest.ts
git commit -m "feat(asistencia): checkIn/checkOut/corregirRegistro

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01FVhnjxQuS9orkoakWbjRWa"
```

---

## Task 5: Pantalla de auto-registro con cámara (`/asistencia/registrar`)

**Files:**
- Create: `src/app/(app)/asistencia/registrar/actions.ts`, `CameraCapture.tsx`, `page.tsx`

**Interfaces:**
- Consumes: `requirePermission` (`@/lib/auth/context`), `checkIn`/`checkOut`/`getTodayRecord` (Task 4), `savePhoto` (Task 3), `diaKeyMX` (`@/lib/reports/period`), `ValidationError` (`@/lib/errors`), `FormState` (`@/app/(auth)/setup/actions`), `Button` (`@/components/ui/Button`).
- Produces: ruta `/asistencia/registrar`. Server Actions `registrarEntradaAction`/`registrarSalidaAction(_prev: FormState, formData: FormData): Promise<FormState>` — usadas solo aquí.

- [ ] **Step 1: `src/app/(app)/asistencia/registrar/actions.ts`**

```ts
'use server';

import { revalidatePath } from 'next/cache';
import { requirePermission } from '@/lib/auth/context';
import { ValidationError } from '@/lib/errors';
import { checkIn, checkOut } from '@/lib/attendance/records';
import { savePhoto } from '@/lib/attendance/photos';
import { diaKeyMX } from '@/lib/reports/period';
import type { FormState } from '@/app/(auth)/setup/actions';

const RUTA = '/asistencia/registrar';
const MAX_FOTO_BYTES = 5 * 1024 * 1024;

/**
 * Extrae y guarda la foto si vino una válida. Nunca lanza: si la foto falta,
 * no es JPEG, excede el tamaño, o `savePhoto` falla por cualquier razón, el
 * check-in/check-out continúa sin foto (spec §2/§9 — nunca se bloquea la
 * asistencia por un problema de cámara/foto).
 */
async function fotoPathFrom(
  formData: FormData,
  userId: string,
  tipo: 'checkin' | 'checkout',
): Promise<string | null> {
  const foto = formData.get('foto');
  if (!(foto instanceof File) || foto.size === 0) return null;
  if (foto.type !== 'image/jpeg' || foto.size > MAX_FOTO_BYTES) return null;
  try {
    const buffer = Buffer.from(await foto.arrayBuffer());
    return await savePhoto(buffer, { userId, tipo, fecha: diaKeyMX(new Date()) });
  } catch {
    return null;
  }
}

export async function registrarEntradaAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const actor = await requirePermission('asistencia.registrar');
  const fotoPath = await fotoPathFrom(formData, actor.id, 'checkin');
  try {
    await checkIn({ userId: actor.id, fotoPath });
  } catch (e) {
    if (e instanceof ValidationError) return { ok: false, formError: e.message, fieldErrors: e.fields };
    throw e;
  }
  revalidatePath(RUTA);
  return { ok: true };
}

export async function registrarSalidaAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const actor = await requirePermission('asistencia.registrar');
  const fotoPath = await fotoPathFrom(formData, actor.id, 'checkout');
  try {
    await checkOut({ userId: actor.id, fotoPath });
  } catch (e) {
    if (e instanceof ValidationError) return { ok: false, formError: e.message, fieldErrors: e.fields };
    throw e;
  }
  revalidatePath(RUTA);
  return { ok: true };
}
```

- [ ] **Step 2: `src/app/(app)/asistencia/registrar/CameraCapture.tsx`**

```tsx
'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import type { FormState } from '@/app/(auth)/setup/actions';
import { registrarEntradaAction, registrarSalidaAction } from './actions';

const FORM_INITIAL: FormState = { ok: false };

type CamaraEstado = 'inactiva' | 'activando' | 'transmitiendo' | 'capturada' | 'no_disponible';

export function CameraCapture({ accion }: { accion: 'checkin' | 'checkout' }) {
  const action = accion === 'checkin' ? registrarEntradaAction : registrarSalidaAction;
  const [state, formAction, pending] = useActionState<FormState, FormData>(action, FORM_INITIAL);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [camara, setCamara] = useState<CamaraEstado>('inactiva');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  async function activarCamara() {
    setCamara('activando');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
      setCamara('transmitiendo');
    } catch {
      // Permiso denegado, sin cámara, cámara ocupada, o contexto inseguro — se
      // continúa sin foto (spec §2/§9: nunca se bloquea el registro por esto).
      setCamara('no_disponible');
    }
  }

  function capturar() {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const input = fileInputRef.current;
    if (!video || !canvas || !input) return;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d')?.drawImage(video, 0, 0);
    canvas.toBlob((blob) => {
      if (!blob) return;
      const file = new File([blob], 'captura.jpg', { type: 'image/jpeg' });
      const dt = new DataTransfer();
      dt.items.add(file);
      input.files = dt.files;
      setPreviewUrl(URL.createObjectURL(blob));
      setCamara('capturada');
      streamRef.current?.getTracks().forEach((t) => t.stop());
    }, 'image/jpeg', 0.85);
  }

  const etiqueta = accion === 'checkin' ? 'Marcar entrada' : 'Marcar salida';

  return (
    <form action={formAction} className="space-y-4 rounded-card border border-line bg-surface p-4">
      {state.formError ? (
        <p className="rounded-control bg-danger-soft px-3 py-2 text-sm text-on-danger-soft">{state.formError}</p>
      ) : null}
      {state.ok ? (
        <p className="rounded-control bg-primary-soft px-3 py-2 text-sm text-ink">
          {accion === 'checkin' ? 'Entrada registrada.' : 'Salida registrada.'}
        </p>
      ) : null}

      <input ref={fileInputRef} type="file" name="foto" accept="image/jpeg" className="hidden" />

      {camara === 'inactiva' ? (
        <Button type="button" variant="secondary" className="w-full" onClick={activarCamara}>
          Activar cámara
        </Button>
      ) : null}
      {camara === 'activando' ? (
        <p className="text-sm text-ink-muted">Solicitando acceso a la cámara…</p>
      ) : null}
      {camara === 'no_disponible' ? (
        <p className="rounded-control bg-surface-raised px-3 py-2 text-sm text-ink-muted">
          No se pudo acceder a la cámara — se registrará sin foto.
        </p>
      ) : null}

      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className={camara === 'transmitiendo' ? 'w-full rounded-control' : 'hidden'}
      />
      <canvas ref={canvasRef} className="hidden" />

      {camara === 'transmitiendo' ? (
        <Button type="button" variant="secondary" className="w-full" onClick={capturar}>
          Capturar foto
        </Button>
      ) : null}

      {camara === 'capturada' && previewUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- vista previa local (object URL), no aplica next/image
        <img src={previewUrl} alt="Foto capturada" className="h-32 w-32 rounded-control object-cover" />
      ) : null}

      <Button
        type="submit"
        variant="primary"
        className="w-full"
        disabled={camara === 'activando'}
        pending={pending}
        pendingLabel="Registrando…"
      >
        {etiqueta}
      </Button>
    </form>
  );
}
```

- [ ] **Step 3: `src/app/(app)/asistencia/registrar/page.tsx`**

```tsx
import { requirePermission } from '@/lib/auth/context';
import { getTodayRecord } from '@/lib/attendance/records';
import { CameraCapture } from './CameraCapture';

export const dynamic = 'force-dynamic';

export default async function RegistrarAsistenciaPage() {
  const actor = await requirePermission('asistencia.registrar');
  const registro = await getTodayRecord(actor.id);

  const accion: 'checkin' | 'checkout' | 'completo' = !registro
    ? 'checkin'
    : !registro.checkOutAt
      ? 'checkout'
      : 'completo';

  return (
    <div className="mx-auto max-w-md space-y-4">
      <h1 className="text-2xl font-bold">Mi asistencia</h1>
      {accion === 'completo' ? (
        <p className="rounded-control bg-surface-raised px-3 py-2 text-sm text-ink-muted">
          Ya registraste tu entrada y salida de hoy.
        </p>
      ) : (
        <CameraCapture accion={accion} />
      )}
    </div>
  );
}
```

- [ ] **Step 4: typecheck + lint + build + commit**

Run: `npm run typecheck && npm run lint && npm run build`

```bash
git add "src/app/(app)/asistencia/registrar"
git commit -m "feat(asistencia): pantalla de auto-registro con captura de cámara

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01FVhnjxQuS9orkoakWbjRWa"
```

---

## Task 6: Servido de fotos (`GET /api/asistencia/foto/[...path]`)

**Files:**
- Create: `src/app/api/asistencia/foto/[...path]/route.ts`, `route.itest.ts`

**Interfaces:**
- Consumes: `getCurrentUser` (`@/lib/auth/context`), `can` (`@/lib/auth/rbac`), `db` (`@/lib/db`), `resolvePhotoAbsolutePath`/`photoExists` (Task 3), `savePhoto` (Task 3, solo en el itest), `seedUser`/`cleanupAttendance` (Task 2, solo en el itest), `createSession` (`@/lib/auth/session`).
- Produces: `GET(req: Request, { params }: { params: Promise<{ path: string[] }> }): Promise<Response>`.

- [ ] **Step 1: `route.itest.ts` (falla — la ruta no existe)**

```ts
import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import { db } from '@/lib/db';
import { createSession } from '@/lib/auth/session';
import { savePhoto } from '@/lib/attendance/photos';
import { seedUser, cleanupAttendance } from '@/lib/attendance/__testutil';

const cookieStore = { value: undefined as string | undefined };
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: () => (cookieStore.value ? { value: cookieStore.value } : undefined) }),
  headers: async () => new Headers(),
}));
import { GET } from './route';

const EMAIL_DUENO = 't7-foto-dueno@pos.com';
const EMAIL_OTRO = 't7-foto-otro@pos.com';
const EMAIL_GERENTE = 't7-foto-gerente@pos.com';
const EMAILS = [EMAIL_DUENO, EMAIL_OTRO, EMAIL_GERENTE];

function paramsFor(relativePath: string) {
  return { params: Promise.resolve({ path: relativePath.split('/') }) };
}

beforeEach(async () => {
  await db.session.deleteMany();
  await cleanupAttendance(EMAILS);
});
afterAll(async () => {
  await db.session.deleteMany();
  await cleanupAttendance(EMAILS);
});

describe('GET /api/asistencia/foto/[...path]', () => {
  it('403 sin sesión', async () => {
    cookieStore.value = undefined;
    const res = await GET(new Request('http://x/api/asistencia/foto/2026-09-13/x.jpg'), paramsFor('2026-09-13/x.jpg'));
    expect(res.status).toBe(403);
  });

  it('404 con ruta fuera de ATTENDANCE_PHOTOS_DIR', async () => {
    const dueno = await seedUser(EMAIL_DUENO, 'Empleado');
    cookieStore.value = (await createSession(dueno, {})).token;

    const res = await GET(new Request('http://x/api/asistencia/foto/x'), paramsFor('../../etc/passwd'));
    expect(res.status).toBe(404);
  });

  it('403 si no es el dueño de la foto y no tiene asistencia.ver', async () => {
    const dueno = await seedUser(EMAIL_DUENO, 'Empleado');
    const otro = await seedUser(EMAIL_OTRO, 'Empleado');
    const rel = await savePhoto(Buffer.from('foto'), { userId: dueno, tipo: 'checkin', fecha: '2026-09-13' });
    await db.attendanceRecord.create({
      data: { userId: dueno, fecha: '2026-09-13', checkInAt: new Date(), checkInFotoPath: rel },
    });

    cookieStore.value = (await createSession(otro, {})).token;
    const res = await GET(new Request(`http://x/api/asistencia/foto/${rel}`), paramsFor(rel));
    expect(res.status).toBe(403);
  });

  it('200 para el dueño de la foto', async () => {
    const dueno = await seedUser(EMAIL_DUENO, 'Empleado');
    const rel = await savePhoto(Buffer.from('foto'), { userId: dueno, tipo: 'checkin', fecha: '2026-09-13' });
    await db.attendanceRecord.create({
      data: { userId: dueno, fecha: '2026-09-13', checkInAt: new Date(), checkInFotoPath: rel },
    });

    cookieStore.value = (await createSession(dueno, {})).token;
    const res = await GET(new Request(`http://x/api/asistencia/foto/${rel}`), paramsFor(rel));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/jpeg');
  });

  it('200 para alguien con asistencia.ver aunque no sea el dueño', async () => {
    const dueno = await seedUser(EMAIL_DUENO, 'Empleado');
    const gerente = await seedUser(EMAIL_GERENTE, 'Gerente');
    const rel = await savePhoto(Buffer.from('foto'), { userId: dueno, tipo: 'checkin', fecha: '2026-09-13' });
    await db.attendanceRecord.create({
      data: { userId: dueno, fecha: '2026-09-13', checkInAt: new Date(), checkInFotoPath: rel },
    });

    cookieStore.value = (await createSession(gerente, {})).token;
    const res = await GET(new Request(`http://x/api/asistencia/foto/${rel}`), paramsFor(rel));
    expect(res.status).toBe(200);
  });
});
```

- [ ] **Step 2: Ejecutar (FAIL), escribir `src/app/api/asistencia/foto/[...path]/route.ts`**

```ts
import { NextResponse } from 'next/server';
import { readFile } from 'node:fs/promises';
import { getCurrentUser } from '@/lib/auth/context';
import { can } from '@/lib/auth/rbac';
import { db } from '@/lib/db';
import { resolvePhotoAbsolutePath, photoExists } from '@/lib/attendance/photos';

export const runtime = 'nodejs';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Sesión requerida' }, { status: 403 });

  const relativePath = (await params).path.join('/');
  const abs = resolvePhotoAbsolutePath(relativePath);
  if (!abs) return NextResponse.json({ error: 'Ruta inválida' }, { status: 404 });

  if (!can(user, 'asistencia.ver')) {
    const esDueno = await db.attendanceRecord.findFirst({
      where: {
        userId: user.id,
        OR: [{ checkInFotoPath: relativePath }, { checkOutFotoPath: relativePath }],
      },
      select: { id: true },
    });
    if (!esDueno) return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }

  if (!(await photoExists(abs))) {
    return NextResponse.json({ error: 'Foto no encontrada' }, { status: 404 });
  }

  const buffer = await readFile(abs);
  return new NextResponse(new Uint8Array(buffer), {
    headers: { 'content-type': 'image/jpeg', 'cache-control': 'private, max-age=3600' },
  });
}
```

- [ ] **Step 3: Ejecutar y verificar que pasa**

Run: `npm run test:integration -- "src/app/api/asistencia/foto/[...path]/route.itest.ts"` → PASS.

- [ ] **Step 4: typecheck + lint + build + commit**

Run: `npm run typecheck && npm run lint && npm run build`

```bash
git add "src/app/api/asistencia/foto"
git commit -m "feat(asistencia): route handler de fotos con control de dueño/permiso

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01FVhnjxQuS9orkoakWbjRWa"
```

---

## Task 7: Servicio del dashboard (`src/lib/attendance/dashboard.ts`)

**Files:**
- Create: `src/lib/attendance/dashboard.ts`, `src/lib/attendance/dashboard.itest.ts`

**Interfaces:**
- Consumes: `db` (`@/lib/db`), `ReportPeriod`/`diaKeyMX` (`@/lib/reports/period`), `seedUser`/`cleanupAttendance` (Task 2).
- Produces: `type AttendanceDashboard = { periodo: ReportPeriod; llegadasPorHora: ChartDatum[]; horasPorEmpleado: { userId: string; nombre: string; roleName: string; minutos: number }[]; registrosDeHoy: { id: string; userId: string; nombre: string; checkInAt: Date; checkInFotoPath: string | null; checkOutAt: Date | null; checkOutFotoPath: string | null }[] }`; `getAttendanceDashboard(periodo: ReportPeriod, filtros?: { userId?: string; roleId?: string }): Promise<AttendanceDashboard>` — consumida por Task 8. `llegadasPorHora` es compatible con `ChartDatum` (`@/components/charts/BarChart`).

- [ ] **Step 1: `src/lib/attendance/dashboard.itest.ts` (falla)**

```ts
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { db } from '@/lib/db';
import { seedUser, cleanupAttendance } from './__testutil';
import { getAttendanceDashboard } from './dashboard';
import { diaKeyMX, type ReportPeriod } from '@/lib/reports/period';

const EMAIL_A = 't7-dash-a@pos.com';
const EMAIL_B = 't7-dash-b@pos.com';
const EMAILS = [EMAIL_A, EMAIL_B];

const PERIODO_AMPLIO: ReportPeriod = {
  desde: new Date('2000-01-01T00:00:00Z'),
  hasta: new Date('2100-01-01T00:00:00Z'),
  etiqueta: 'test',
};

let userA: string;
let userB: string;

beforeEach(async () => {
  await cleanupAttendance(EMAILS);
  userA = await seedUser(EMAIL_A, 'Empleado');
  userB = await seedUser(EMAIL_B, 'Gerente');
});
afterAll(async () => {
  await cleanupAttendance(EMAILS);
});

describe('getAttendanceDashboard', () => {
  it('agrupa llegadas por hora MX y horas trabajadas por empleado (turnos abiertos no cuentan)', async () => {
    // 14:05Z y 14:40Z son 08:05 y 08:40 en America/Mexico_City (UTC-6) — misma hora "08".
    await db.attendanceRecord.create({
      data: {
        userId: userA, fecha: '2026-09-13',
        checkInAt: new Date('2026-09-13T14:05:00Z'), checkOutAt: new Date('2026-09-13T22:05:00Z'),
        minutosTrabajados: 480,
      },
    });
    await db.attendanceRecord.create({
      data: { userId: userB, fecha: '2026-09-13', checkInAt: new Date('2026-09-13T14:40:00Z') },
    });

    const r = await getAttendanceDashboard(PERIODO_AMPLIO);
    expect(r.llegadasPorHora).toEqual([{ label: '08:00', value: 2 }]);
    expect(r.horasPorEmpleado).toEqual([
      { userId: userA, nombre: 'Test Empleado', roleName: 'Empleado', minutos: 480 },
    ]);
  });

  it('registrosDeHoy solo incluye la fecha de hoy', async () => {
    const hoy = diaKeyMX(new Date());
    await db.attendanceRecord.create({
      data: { userId: userA, fecha: hoy, checkInAt: new Date() },
    });
    await db.attendanceRecord.create({
      data: {
        userId: userB, fecha: '2020-01-01',
        checkInAt: new Date('2020-01-01T14:00:00Z'), checkOutAt: new Date('2020-01-01T20:00:00Z'),
        minutosTrabajados: 360,
      },
    });

    const r = await getAttendanceDashboard(PERIODO_AMPLIO);
    expect(r.registrosDeHoy).toHaveLength(1);
    expect(r.registrosDeHoy[0].userId).toBe(userA);
  });

  it('filtra por userId y por roleId', async () => {
    await db.attendanceRecord.create({
      data: { userId: userA, fecha: '2026-09-13', checkInAt: new Date('2026-09-13T14:00:00Z') },
    });
    await db.attendanceRecord.create({
      data: { userId: userB, fecha: '2026-09-13', checkInAt: new Date('2026-09-13T15:00:00Z') },
    });

    const porUsuario = await getAttendanceDashboard(PERIODO_AMPLIO, { userId: userA });
    expect(porUsuario.llegadasPorHora.reduce((s, h) => s + h.value, 0)).toBe(1);

    const rolGerente = await db.role.findFirstOrThrow({ where: { nombre: 'Gerente' } });
    const porRol = await getAttendanceDashboard(PERIODO_AMPLIO, { roleId: rolGerente.id });
    expect(porRol.llegadasPorHora.reduce((s, h) => s + h.value, 0)).toBe(1);
  });

  it('un registro fuera del período no se cuenta', async () => {
    await db.attendanceRecord.create({
      data: { userId: userA, fecha: '1990-01-01', checkInAt: new Date('1990-01-01T14:00:00Z') },
    });
    const periodoActual: ReportPeriod = { desde: new Date(), hasta: new Date(), etiqueta: 'test' };
    const r = await getAttendanceDashboard(periodoActual);
    expect(r.llegadasPorHora).toEqual([]);
  });
});
```

- [ ] **Step 2: Ejecutar (FAIL), escribir `src/lib/attendance/dashboard.ts`**

```ts
import { db } from '@/lib/db';
import { diaKeyMX } from '@/lib/reports/period';
import type { ReportPeriod } from '@/lib/reports/period';
import type { ChartDatum } from '@/components/charts/BarChart';

function horaKeyMX(d: Date): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Mexico_City',
    hour: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(d);
  return (parts.find((p) => p.type === 'hour')?.value ?? '00').padStart(2, '0');
}

export type AttendanceDashboard = {
  periodo: ReportPeriod;
  llegadasPorHora: ChartDatum[];
  horasPorEmpleado: { userId: string; nombre: string; roleName: string; minutos: number }[];
  registrosDeHoy: {
    id: string;
    userId: string;
    nombre: string;
    checkInAt: Date;
    checkInFotoPath: string | null;
    checkOutAt: Date | null;
    checkOutFotoPath: string | null;
  }[];
};

export async function getAttendanceDashboard(
  periodo: ReportPeriod,
  filtros: { userId?: string; roleId?: string } = {},
): Promise<AttendanceDashboard> {
  const fechaDesde = diaKeyMX(periodo.desde);
  const fechaHasta = diaKeyMX(periodo.hasta);
  const hoy = diaKeyMX(new Date());

  const registros = await db.attendanceRecord.findMany({
    where: {
      fecha: { gte: fechaDesde, lte: fechaHasta },
      ...(filtros.userId ? { userId: filtros.userId } : {}),
      ...(filtros.roleId ? { user: { roleId: filtros.roleId } } : {}),
    },
    select: {
      id: true, userId: true, fecha: true,
      checkInAt: true, checkInFotoPath: true,
      checkOutAt: true, checkOutFotoPath: true,
      minutosTrabajados: true,
      user: { select: { nombre: true, role: { select: { nombre: true } } } },
    },
    orderBy: { checkInAt: 'desc' },
  });

  const porHora = new Map<string, number>();
  for (const r of registros) {
    const key = horaKeyMX(r.checkInAt);
    porHora.set(key, (porHora.get(key) ?? 0) + 1);
  }
  const llegadasPorHora = [...porHora.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([label, value]) => ({ label: `${label}:00`, value }));

  const porEmpleado = new Map<string, { nombre: string; roleName: string; minutos: number }>();
  for (const r of registros) {
    if (r.minutosTrabajados == null) continue;
    const acc = porEmpleado.get(r.userId) ?? {
      nombre: r.user.nombre,
      roleName: r.user.role.nombre,
      minutos: 0,
    };
    acc.minutos += r.minutosTrabajados;
    porEmpleado.set(r.userId, acc);
  }
  const horasPorEmpleado = [...porEmpleado.entries()]
    .map(([userId, v]) => ({ userId, ...v }))
    .sort((a, b) => b.minutos - a.minutos);

  const registrosDeHoy = registros
    .filter((r) => r.fecha === hoy)
    .map((r) => ({
      id: r.id,
      userId: r.userId,
      nombre: r.user.nombre,
      checkInAt: r.checkInAt,
      checkInFotoPath: r.checkInFotoPath,
      checkOutAt: r.checkOutAt,
      checkOutFotoPath: r.checkOutFotoPath,
    }));

  return { periodo, llegadasPorHora, horasPorEmpleado, registrosDeHoy };
}
```

- [ ] **Step 3: Ejecutar y verificar que pasa**

Run: `npm run test:integration -- src/lib/attendance/dashboard.itest.ts` → PASS.

- [ ] **Step 4: typecheck + lint + suite + commit**

Run: `npm run typecheck && npm run lint && npm run test:unit && npm run test:integration`

```bash
git add src/lib/attendance/dashboard.ts src/lib/attendance/dashboard.itest.ts
git commit -m "feat(asistencia): servicio de dashboard (llegadas por hora, horas por empleado)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01FVhnjxQuS9orkoakWbjRWa"
```

---

## Task 8: Página de dashboard, filtros y corrección de turnos (`/asistencia`)

**Files:**
- Create: `src/app/(app)/asistencia/page.tsx`, `AttendanceFilters.tsx`, `CorregirTurnoForm.tsx`, `actions.ts`

**Interfaces:**
- Consumes: `requirePermission`/`can` (`@/lib/auth/context`, `@/lib/auth/rbac`), `resolvePeriod` (`@/lib/reports/period`), `getAttendanceDashboard` (Task 7), `corregirRegistro` (Task 4), `db` (`@/lib/db`), `BarChart` (`@/components/charts/BarChart`), `PeriodFilterForm` (`@/app/(app)/reportes/PeriodFilterForm`), `Card`/`Button` (`@/components/ui`), `inputClass` (`@/app/(app)/ventas/types`), `FormState` (`@/app/(auth)/setup/actions`).
- Produces: ruta `/asistencia`. Server Action `corregirRegistroAction(_prev: FormState, formData: FormData): Promise<FormState>`.

- [ ] **Step 1: `src/app/(app)/asistencia/actions.ts`**

```ts
'use server';

import { revalidatePath } from 'next/cache';
import { requirePermission } from '@/lib/auth/context';
import { ValidationError } from '@/lib/errors';
import { corregirRegistro } from '@/lib/attendance/records';
import type { FormState } from '@/app/(auth)/setup/actions';

export async function corregirRegistroAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const actor = await requirePermission('asistencia.corregir');
  const id = String(formData.get('id') ?? '');
  const checkOutAt = new Date(String(formData.get('checkOutAt') ?? ''));
  if (!id || Number.isNaN(checkOutAt.getTime())) {
    return { ok: false, formError: 'Fecha/hora de salida inválida.' };
  }

  try {
    await corregirRegistro({ id, checkOutAt, actorId: actor.id });
  } catch (e) {
    if (e instanceof ValidationError) return { ok: false, formError: e.message, fieldErrors: e.fields };
    throw e;
  }
  revalidatePath('/asistencia');
  return { ok: true };
}
```

- [ ] **Step 2: `src/app/(app)/asistencia/CorregirTurnoForm.tsx`**

```tsx
'use client';

import { useActionState } from 'react';
import { Button } from '@/components/ui/Button';
import type { FormState } from '@/app/(auth)/setup/actions';
import { corregirRegistroAction } from './actions';

const INITIAL: FormState = { ok: false };

export function CorregirTurnoForm({ recordId }: { recordId: string }) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(corregirRegistroAction, INITIAL);

  return (
    <form action={formAction} className="mt-2 flex flex-wrap items-end gap-2">
      <input type="hidden" name="id" value={recordId} />
      <label className="block space-y-1">
        <span className="text-xs text-ink-muted">Cerrar turno — hora de salida</span>
        <input
          type="datetime-local"
          name="checkOutAt"
          required
          className="rounded-control border border-line px-2 py-1 text-xs"
        />
      </label>
      <Button type="submit" size="sm" variant="secondary" pending={pending} pendingLabel="Cerrando…">
        Cerrar turno
      </Button>
      {state.formError ? <span className="text-xs text-danger">{state.formError}</span> : null}
    </form>
  );
}
```

- [ ] **Step 3: `src/app/(app)/asistencia/AttendanceFilters.tsx`**

```tsx
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { inputClass } from '@/app/(app)/ventas/types';

export function AttendanceFilters({
  usuarios,
  roles,
  current,
}: {
  usuarios: { id: string; nombre: string }[];
  roles: { id: string; nombre: string }[];
  current: { atajo?: string; desde?: string; hasta?: string; userId?: string; roleId?: string };
}) {
  const hayFiltro = Boolean(current.userId || current.roleId);

  return (
    <form
      method="get"
      action="/asistencia"
      className="flex flex-wrap items-end gap-3 rounded-card border border-line bg-surface p-4"
    >
      {current.atajo ? <input type="hidden" name="atajo" value={current.atajo} /> : null}
      {current.desde ? <input type="hidden" name="desde" value={current.desde} /> : null}
      {current.hasta ? <input type="hidden" name="hasta" value={current.hasta} /> : null}

      <label className="block space-y-1">
        <span className="text-sm font-medium text-ink-muted">Empleado</span>
        <select name="userId" defaultValue={current.userId ?? ''} className={inputClass}>
          <option value="">Todos</option>
          {usuarios.map((u) => (
            <option key={u.id} value={u.id}>{u.nombre}</option>
          ))}
        </select>
      </label>

      <label className="block space-y-1">
        <span className="text-sm font-medium text-ink-muted">Rol</span>
        <select name="roleId" defaultValue={current.roleId ?? ''} className={inputClass}>
          <option value="">Todos</option>
          {roles.map((r) => (
            <option key={r.id} value={r.id}>{r.nombre}</option>
          ))}
        </select>
      </label>

      <Button type="submit" variant="primary">Filtrar</Button>
      {hayFiltro ? (
        <Link
          href={`/asistencia${current.atajo ? `?atajo=${current.atajo}` : ''}`}
          className="px-2 py-2 text-sm text-ink-subtle hover:text-ink"
        >
          Quitar filtros
        </Link>
      ) : null}
    </form>
  );
}
```

- [ ] **Step 4: `src/app/(app)/asistencia/page.tsx`**

```tsx
import { requirePermission } from '@/lib/auth/context';
import { can } from '@/lib/auth/rbac';
import { resolvePeriod } from '@/lib/reports/period';
import { getAttendanceDashboard } from '@/lib/attendance/dashboard';
import { db } from '@/lib/db';
import { BarChart } from '@/components/charts/BarChart';
import { Card } from '@/components/ui/Card';
import { PeriodFilterForm } from '@/app/(app)/reportes/PeriodFilterForm';
import { AttendanceFilters } from './AttendanceFilters';
import { CorregirTurnoForm } from './CorregirTurnoForm';

export const dynamic = 'force-dynamic';

function fmtMinutos(min: number): string {
  return `${Math.floor(min / 60)}h ${min % 60}m`;
}

function fmtHora(d: Date): string {
  return new Intl.DateTimeFormat('es-MX', {
    timeZone: 'America/Mexico_City',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(d);
}

export default async function AsistenciaPage(props: {
  searchParams: Promise<{
    atajo?: string; desde?: string; hasta?: string; userId?: string; roleId?: string;
  }>;
}) {
  const actor = await requirePermission('asistencia.ver');
  const sp = await props.searchParams;
  const periodo = resolvePeriod(sp);
  const dashboard = await getAttendanceDashboard(periodo, {
    userId: sp.userId || undefined,
    roleId: sp.roleId || undefined,
  });
  const [usuarios, roles] = await Promise.all([
    db.user.findMany({ where: { activo: true }, select: { id: true, nombre: true }, orderBy: { nombre: 'asc' } }),
    db.role.findMany({ select: { id: true, nombre: true }, orderBy: { nombre: 'asc' } }),
  ]);
  const puedeCorregir = can(actor, 'asistencia.corregir');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Asistencia</h1>
        <p className="text-ink-muted">{periodo.etiqueta}</p>
      </div>

      <PeriodFilterForm base="/asistencia" atajo={sp.atajo} desde={sp.desde} hasta={sp.hasta} />
      <AttendanceFilters usuarios={usuarios} roles={roles} current={sp} />

      <Card>
        <h2 className="mb-3 text-lg font-semibold text-ink">Llegadas por hora</h2>
        <BarChart data={dashboard.llegadasPorHora} />
      </Card>

      <Card>
        <h2 className="mb-3 text-lg font-semibold text-ink">Horas trabajadas por empleado</h2>
        {dashboard.horasPorEmpleado.length === 0 ? (
          <p className="text-sm text-ink-subtle">Sin datos en este período.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-ink-muted">
                <th className="py-2">Empleado</th>
                <th className="py-2">Rol</th>
                <th className="py-2 text-right">Horas trabajadas</th>
              </tr>
            </thead>
            <tbody>
              {dashboard.horasPorEmpleado.map((h) => (
                <tr key={h.userId} className="border-b border-line last:border-0">
                  <td className="py-2">{h.nombre}</td>
                  <td className="py-2 text-ink-muted">{h.roleName}</td>
                  <td className="py-2 text-right tabular-nums">{fmtMinutos(h.minutos)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Card>
        <h2 className="mb-3 text-lg font-semibold text-ink">Registros de hoy</h2>
        {dashboard.registrosDeHoy.length === 0 ? (
          <p className="text-sm text-ink-subtle">Sin registros hoy.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {dashboard.registrosDeHoy.map((r) => (
              <div key={r.id} className="rounded-control border border-line p-3">
                <p className="font-medium text-ink">{r.nombre}</p>
                <div className="mt-2 flex gap-2">
                  {r.checkInFotoPath ? (
                    // eslint-disable-next-line @next/next/no-img-element -- servida por route handler propio con control de permiso, no aplica next/image
                    <img
                      src={`/api/asistencia/foto/${r.checkInFotoPath}`}
                      alt={`Entrada de ${r.nombre}`}
                      className="h-16 w-16 rounded-control object-cover"
                    />
                  ) : (
                    <div className="flex h-16 w-16 items-center justify-center rounded-control bg-surface-raised text-xs text-ink-subtle">
                      Sin foto
                    </div>
                  )}
                  {r.checkOutFotoPath ? (
                    // eslint-disable-next-line @next/next/no-img-element -- servida por route handler propio con control de permiso, no aplica next/image
                    <img
                      src={`/api/asistencia/foto/${r.checkOutFotoPath}`}
                      alt={`Salida de ${r.nombre}`}
                      className="h-16 w-16 rounded-control object-cover"
                    />
                  ) : (
                    <div className="flex h-16 w-16 items-center justify-center rounded-control bg-surface-raised text-xs text-ink-subtle">
                      {r.checkOutAt ? 'Sin foto' : 'En curso'}
                    </div>
                  )}
                </div>
                <p className="mt-2 text-xs text-ink-muted">
                  Entrada {fmtHora(r.checkInAt)}
                  {r.checkOutAt ? ` · Salida ${fmtHora(r.checkOutAt)}` : ' · En curso'}
                </p>
                {!r.checkOutAt && puedeCorregir ? <CorregirTurnoForm recordId={r.id} /> : null}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
```

- [ ] **Step 5: typecheck + lint + build + commit**

Run: `npm run typecheck && npm run lint && npm run build`

```bash
git add "src/app/(app)/asistencia/page.tsx" "src/app/(app)/asistencia/AttendanceFilters.tsx" "src/app/(app)/asistencia/CorregirTurnoForm.tsx" "src/app/(app)/asistencia/actions.ts"
git commit -m "feat(asistencia): dashboard con gráfica, tabla, galería, filtros y corrección de turnos

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01FVhnjxQuS9orkoakWbjRWa"
```

---

## Task 9: E2E (`e2e/asistencia.spec.ts`)

**Files:**
- Create: `e2e/asistencia.spec.ts`

**Interfaces:**
- Consumes: `doSetup`/`login` (`e2e/helpers.ts`), rutas `/asistencia/registrar` y `/asistencia`.

- [ ] **Step 1: `e2e/asistencia.spec.ts`**

```ts
import { test, expect, type Page } from '@playwright/test';
import { doSetup, login } from './helpers';

/**
 * E2E del Bloque 7 (Asistencia) — spec §10.
 *
 * `test.use` a nivel de archivo activa el permiso de cámara y fuerza a
 * Chromium a exponer un dispositivo de video sintético (sin hardware real),
 * para el escenario "con cámara". El escenario "sin cámara" sobreescribe
 * `navigator.mediaDevices.getUserMedia` vía `addInitScript` para simular el
 * fallo, independientemente del flag de Chromium.
 */
test.use({
  permissions: ['camera'],
  launchOptions: {
    args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
  },
});

async function crearEmpleado(page: Page, email: string): Promise<string> {
  await page.goto('/admin/usuarios');
  await page.getByRole('button', { name: 'Crear usuario' }).click();
  const dialog = page
    .locator('form')
    .filter({ has: page.getByRole('button', { name: 'Crear', exact: true }) });
  await dialog.getByLabel('Nombre').fill('Empleado Asistencia');
  await dialog.getByLabel('Correo electrónico').fill(email);
  await dialog.getByLabel('Rol').selectOption({ label: 'Empleado' });
  await dialog.getByRole('button', { name: 'Crear', exact: true }).click();
  await expect(page.getByText('Usuario creado correctamente.')).toBeVisible();
  const temp = (await page.getByTestId('temp-password').innerText()).trim();
  await page.getByRole('button', { name: 'Entendido' }).click();
  return temp;
}

async function cambiarPassword(page: Page, email: string, temp: string, nueva: string): Promise<void> {
  await login(page, email, temp);
  await expect(page).toHaveURL(/\/cambiar-password/);
  await page.getByLabel('Contraseña nueva', { exact: true }).fill(nueva);
  await page.getByLabel('Confirmar contraseña nueva', { exact: true }).fill(nueva);
  await page.getByRole('button', { name: 'Cambiar contraseña' }).click();
  await expect(page.getByText('Contraseña actualizada')).toBeVisible();
}

test('Marcar entrada y salida con cámara simulada guarda fotos y calcula horas', async ({ page, browser }) => {
  test.setTimeout(180_000);
  await doSetup(page);

  const email = `emp-asistencia-${Date.now()}@pos.com`;
  const temp = await crearEmpleado(page, email);

  const ctx = await browser.newContext({ permissions: ['camera'] });
  const emp = await ctx.newPage();
  try {
    await cambiarPassword(emp, email, temp, 'empleadoSegura99');

    await emp.goto('/asistencia/registrar');
    await emp.getByRole('button', { name: 'Activar cámara' }).click();
    await emp.getByRole('button', { name: 'Capturar foto' }).click();
    await emp.getByRole('button', { name: 'Marcar entrada' }).click();
    await expect(emp.getByText('Entrada registrada.')).toBeVisible();

    await emp.reload();
    await emp.getByRole('button', { name: 'Activar cámara' }).click();
    await emp.getByRole('button', { name: 'Capturar foto' }).click();
    await emp.getByRole('button', { name: 'Marcar salida' }).click();
    await expect(emp.getByText('Salida registrada.')).toBeVisible();
  } finally {
    await ctx.close();
  }

  await page.goto('/asistencia?atajo=hoy');
  await expect(page.getByText('Empleado Asistencia')).toBeVisible();
  const tarjeta = page
    .locator('div.rounded-control')
    .filter({ has: page.getByText('Empleado Asistencia') });
  await expect(tarjeta.locator('img')).toHaveCount(2);
});

test('Marcar entrada sin cámara disponible igual registra la asistencia', async ({ page, browser }) => {
  test.setTimeout(180_000);
  await doSetup(page);

  const email = `emp-sincamara-${Date.now()}@pos.com`;
  const temp = await crearEmpleado(page, email);

  const ctx = await browser.newContext();
  const emp = await ctx.newPage();
  try {
    await emp.addInitScript(() => {
      Object.defineProperty(window.navigator, 'mediaDevices', {
        value: { getUserMedia: () => Promise.reject(new DOMException('Denegado', 'NotAllowedError')) },
        configurable: true,
      });
    });

    await cambiarPassword(emp, email, temp, 'empleadoSegura99');

    await emp.goto('/asistencia/registrar');
    await emp.getByRole('button', { name: 'Activar cámara' }).click();
    await expect(emp.getByText('No se pudo acceder a la cámara — se registrará sin foto.')).toBeVisible();
    await emp.getByRole('button', { name: 'Marcar entrada' }).click();
    await expect(emp.getByText('Entrada registrada.')).toBeVisible();
  } finally {
    await ctx.close();
  }
});
```

- [ ] **Step 2: Ejecutar**

Run: `npm run test:e2e -- e2e/asistencia.spec.ts`
Expected: ambos tests PASS. Si el flag `--use-fake-device-for-media-stream` no aplica en el entorno de CI (Chromium headless), reintenta con `xvfb-run` o marca el primer test como `test.skip` en ese entorno específico — el segundo test (sin cámara) no depende del flag y debe pasar siempre.

- [ ] **Step 3: Suite completa + commit final**

Run: `npm run typecheck && npm run lint && npm run test:unit && npm run test:integration && npm run build`

```bash
git add e2e/asistencia.spec.ts
git commit -m "test(asistencia): E2E de check-in/checkout con y sin cámara

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01FVhnjxQuS9orkoakWbjRWa"
```

---

## Consistencia de tipos

`AttendanceRecord` (Prisma, Task 2) es el mismo tipo que consumen `records.ts` (Task 4, devuelve `Promise<AttendanceRecord>` en las 4 funciones), `dashboard.ts` (Task 7, lo lee vía `select` parcial) y los itests. `fotoPath: string | null` (Task 5 `fotoPathFrom`) es el mismo concepto que `checkInFotoPath`/`checkOutFotoPath` (Task 2/4) y la ruta que arma Task 6 (`resolvePhotoAbsolutePath`) y Task 8 (`/api/asistencia/foto/${...}`). `ChartDatum` (Task 7 `llegadasPorHora`) es el mismo tipo que ya consume `BarChart` (Bloque 6, sin cambios). `FormState` se reimporta de `@/app/(auth)/setup/actions` en las 3 Server Actions nuevas (Task 5 y Task 8), igual que en Bloques 2-6.

## Notas de ejecución

- **Orden y dependencias:** Task 1 (RBAC) es prerrequisito de todas las páginas (`requirePermission`). Task 2 (`__testutil.ts`) es prerrequisito de Tasks 4/6/7 (todas lo importan). Task 3 (`photos.ts`) es prerrequisito de Tasks 5/6. Task 4 (`records.ts`) es prerrequisito de Tasks 5/8. Task 7 (`dashboard.ts`) es prerrequisito de Task 8. Task 9 depende de que Tasks 5 y 8 estén desplegadas (usa las etiquetas de botón/texto exactas que definen).
- **Postgres local:** `npm run db:start` en background para `prisma migrate dev`. Los `test:integration` traen su propio Postgres efímero; `test:e2e` también (ver `playwright.config.ts`).
- **Aislamiento de tests:** cualquier itest que cree usuarios/registros de asistencia limpia por email de prueba en `beforeEach`/`afterAll` vía `cleanupAttendance` (Task 2) — nunca borra roles del sistema.
- **Git:** si el repositorio aún no está inicializado cuando se ejecute la Task 1, ejecuta `git init` y un primer commit del estado actual (o pregúntale al usuario) antes de continuar — de lo contrario, omite los pasos "Commit" de cada tarea y termina el plan igual.
- **Sin push / sin deploy.** Integración local solo tras revisión final limpia.
