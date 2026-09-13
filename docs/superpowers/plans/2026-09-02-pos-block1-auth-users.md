# POS Bloque 1 (Autenticación, Usuarios, Roles, Auditoría) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir el primer sub-proyecto del sistema POS: autenticación con sesiones propias, CRUD de usuarios, roles personalizables con catálogo de permisos, cierre de sesión por inactividad server-side y log de auditoría inmutable.

**Architecture:** Un único proyecto Next.js (App Router) con Server Actions + Route Handlers como backend. La lógica sensible vive en módulos aislados y testeables (`lib/auth/password.ts`, `lib/auth/rbac.ts`, `lib/auth/session.ts`, `lib/audit.ts`). PostgreSQL vía Prisma. Un `middleware.ts` valida la cookie de sesión opaca en cada request, aplica el corte por inactividad y fuerza el cambio de contraseña pendiente. La autorización real siempre ocurre en el servidor (`requirePermission`), la UI solo muestra/oculta.

**Tech Stack:** Next.js 15 (App Router, React 19), TypeScript (strict), PostgreSQL 16, Prisma 6, Tailwind CSS 4, Zod, `@node-rs/argon2`, `@zxcvbn-ts/core`, Vitest 3 (unit + integración), Playwright (E2E), GitHub Actions (CI).

**Spec:** `docs/superpowers/specs/2026-09-02-pos-block1-auth-users-design.md`

## Global Constraints

- **Node:** >= 20.11 (la máquina de desarrollo tiene Node 24; todo debe funcionar en 20 y en 24).
- **Next.js:** 15.x, App Router only. No Pages Router.
- **TypeScript:** `strict: true`. Sin `any` implícito. Sin `// @ts-ignore` salvo comentario justificado.
- **Idioma UI:** español. Todos los textos visibles, nombres de acciones de auditoría legibles y mensajes de error en español.
- **Base de datos:** PostgreSQL 17. IDs de entidades de negocio = `cuid()`. Sin borrado físico de `User` (baja lógica con `activo=false`).
- **PostgreSQL en local (sin instalador):** no hay PostgreSQL de sistema ni Docker en la máquina, y el CDN de EDB está bloqueado (403). Se usa el paquete npm **`embedded-postgres`** (`@embedded-postgres/windows-x64`, binarios de PostgreSQL 17.10 servidos por npm) para levantar una instancia local:
  - Dev: instancia **persistente** en `.pgdata/` (gitignored), puerto **54329**, usuario/clave `postgres`/`postgres`. Se controla con `npm run db:start` / `npm run db:stop` (script `scripts/db.mjs`).
  - Tests (unit no la usan; integración y E2E sí): instancia **efímera** creada por el `globalSetup` de Vitest/Playwright en el puerto **54330**, destruida en el teardown.
  - No se dispone de los binarios `createdb`/`psql` en el PATH: la creación de bases se hace con `pg` (`CREATE DATABASE ...`) o `EmbeddedPostgres.createDatabase()`.
  - `DATABASE_URL` = `postgresql://postgres:postgres@localhost:54329/pos_dev?schema=public`; `DATABASE_URL_TEST` apunta al 54330; `DATABASE_URL_E2E` al 54330 con BD `pos_e2e`.
  - CI (GitHub Actions, Linux) **no** usa `embedded-postgres`: usa el service container `postgres:17` estándar.
- **Hash de contraseñas:** Argon2id vía `@node-rs/argon2` con parámetros OWASP: `memoryCost: 19456` (19 MiB), `timeCost: 2`, `parallelism: 1`. Nunca loguear, devolver ni serializar `passwordHash`.
- **Token de sesión:** 32 bytes de `crypto.randomBytes`, codificado base64url. En BD solo se guarda `sha256(token)` en `Session.tokenHash`. Cookie: nombre `pos_session`, `httpOnly`, `secure`, `sameSite: 'lax'`, `path: '/'`.
- **Duración de sesión:** `expiresAt = now + 8h`, deslizante. Timeout de inactividad por defecto 15 min, leído de `AppSetting["session.idleTimeoutMinutes"]`.
- **Política de contraseña:** mínimo 10 caracteres, distinta del email (case-insensitive), no en la lista `COMMON_PASSWORDS`. `@zxcvbn-ts` solo informa fortaleza, no bloquea por encima del mínimo.
- **Validación:** toda entrada de Server Action / Route Handler se valida con Zod en el servidor ANTES de tocar la BD.
- **Autorización:** toda Server Action mutante empieza con `requireUser()` y, si aplica, `requirePermission("clave")`. Un fallo lanza y se registra `auth.forbidden`.
- **Auditoría:** cada operación auditada llama a `logActivity(...)` dentro de la misma transacción Prisma que la operación, cuando es posible.
- **TDD:** test primero, siempre. Ver el test fallar antes de implementar. Commits frecuentes, uno por tarea como mínimo.
- **Commits:** Conventional Commits en español (`feat:`, `test:`, `chore:`, `docs:`). Terminar el mensaje con:
  ```
  Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01EnFJHWm8zVoqgkmfwwcRHi
  ```

---

## Estructura de archivos

**Configuración / raíz**
- `package.json`, `tsconfig.json`, `next.config.ts`, `tailwind.config.ts`, `postcss.config.mjs` — config del proyecto.
- `vitest.config.ts` — dos proyectos Vitest: `unit` (entorno node, sin BD) e `integration` (con `globalSetup` que levanta Postgres embebido).
- `test/pg-embedded.ts` — helper compartido: `startEphemeralPg(port, dbNames[])` / `stopEphemeralPg()` sobre `embedded-postgres`; aplica `prisma migrate deploy` + seed a cada BD.
- `test/vitest.global-setup.ts` — `globalSetup` de integración: llama `startEphemeralPg(54330, ['pos_test'])`, exporta `DATABASE_URL_TEST`; teardown → `stopEphemeralPg()`.
- `test/playwright.global-setup.ts` / `test/playwright.global-teardown.ts` — igual para E2E (`pos_e2e`, puerto 54330).
- `scripts/db.mjs` — CLI local: `start` (instancia persistente en `.pgdata/`, puerto 54329, crea `pos_dev` si falta, escribe `.pgdata/pg.pid`), `stop`, `status`, `create <nombre>`.
- `playwright.config.ts` — E2E: `globalSetup`/`globalTeardown` + `webServer` (`next build && next start -p 3100`) con `DATABASE_URL` = la BD E2E.
- `.env.example` — `DATABASE_URL`, `DATABASE_URL_TEST`, `DATABASE_URL_E2E`, `NODE_ENV`.
- `.env` (local, gitignored) — con los valores reales de los puertos 54329/54330.
- `.gitignore` — añade `.pgdata/`.
- `.github/workflows/ci.yml` — lint + typecheck + unit + integración con service container `postgres:17` (sin `embedded-postgres`).

**Prisma**
- `prisma/schema.prisma` — modelos `User`, `Role`, `RolePermission`, `Session`, `ActivityLog`, `AppSetting`.
- `prisma/seed.ts` — siembra roles de sistema, sus permisos y `AppSetting` por defecto.
- `prisma/migrations/**` — generadas por `prisma migrate`.

**Librería (lógica aislada)**
- `src/lib/db.ts` — singleton de `PrismaClient`.
- `src/lib/auth/password.ts` — `hashPassword`, `verifyPassword`, `generateTempPassword`, `COMMON_PASSWORDS`, `passwordPolicyError`.
- `src/lib/auth/rbac.ts` — `PERMISSIONS` (catálogo agrupado), `ALL_PERMISSION_KEYS`, `can`, `AuthUser` type.
- `src/lib/auth/session.ts` — `createSession`, `validateSession`, `touchSession`, `revokeSession`, `revokeAllForUser`, `hashToken`, `SESSION_COOKIE`.
- `src/lib/auth/context.ts` — `getCurrentUser`, `requireUser`, `requirePermission` (usados desde Server Actions / RSC).
- `src/lib/auth/rate-limit.ts` — `checkLoginRateLimit`, `recordLoginFailure`, `clearLoginFailures` (contador en memoria).
- `src/lib/audit.ts` — `logActivity`, `AuditAction` union type, `actionLabel` (etiqueta legible en español).
- `src/lib/settings.ts` — `getSetting`, `setSetting` (tipado sobre `AppSetting`).
- `src/lib/http.ts` — `getClientIp(headers)`, `assertSameOrigin(request)`.
- `src/lib/validation/*.ts` — esquemas Zod por formulario (`user.ts`, `role.ts`, `auth.ts`, `settings.ts`).

**App (rutas)**
- `src/middleware.ts` — validación de sesión, inactividad, redirección por `mustChangePassword`.
- `src/app/layout.tsx`, `src/app/globals.css` — layout raíz + Tailwind.
- `src/app/(auth)/setup/page.tsx` + `actions.ts` — bootstrap del primer Administrador.
- `src/app/(auth)/login/page.tsx` + `actions.ts` — login.
- `src/app/(auth)/cambiar-password/page.tsx` + `actions.ts` — cambio de contraseña (normal y forzado).
- `src/app/(app)/layout.tsx` — shell autenticado: sidebar con gating por `can`, cabecera, `<InactivityWatcher>`.
- `src/app/(app)/dashboard/page.tsx` — placeholder mínimo (destino tras login).
- `src/app/(app)/perfil/page.tsx` + `actions.ts` — perfil, sesiones activas, enlace a cambiar contraseña.
- `src/app/(app)/perfil/actividad/page.tsx` — historial propio (tabla paginada).
- `src/app/(app)/admin/usuarios/page.tsx` + `actions.ts` + componentes de formulario.
- `src/app/(app)/admin/usuarios/[id]/page.tsx` — detalle/edición + revocar sesiones.
- `src/app/(app)/admin/roles/page.tsx` + `actions.ts` + `[id]/page.tsx` — CRUD de roles con checklist de permisos.
- `src/app/(app)/admin/auditoria/page.tsx` — visor del log con filtros.
- `src/app/(app)/admin/auditoria/export/route.ts` — Route Handler que devuelve CSV.
- `src/app/(app)/admin/configuracion/page.tsx` + `actions.ts` — único ajuste: timeout de inactividad.
- `src/app/api/session/heartbeat/route.ts` — Route Handler POST que hace `touchSession`.
- `src/components/*` — `InactivityWatcher.tsx`, `PasswordStrengthMeter.tsx`, `PermissionGate.tsx`, `Pagination.tsx`, `DataTable.tsx`, primitivas de formulario.

**Tests E2E**
- `e2e/setup-login.spec.ts`, `e2e/user-lifecycle.spec.ts`, `e2e/inactivity.spec.ts`, `e2e/sessions.spec.ts`.

---

## Task 1: Scaffolding del proyecto y tooling

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `tailwind.config.ts`, `postcss.config.mjs`, `src/app/globals.css`, `src/app/layout.tsx`, `src/app/page.tsx`
- Create: `vitest.config.ts`, `.eslintrc.json`, `.env.example`, `.nvmrc`
- Create: `src/lib/__tests__/smoke.test.ts`

**Interfaces:**
- Consumes: nada (primera tarea).
- Produces: proyecto que compila (`npm run build`), `npm test` ejecuta Vitest, `npm run lint` y `npm run typecheck` pasan. Scripts npm: `dev`, `build`, `start`, `lint`, `typecheck`, `test`, `test:unit`, `test:integration`, `test:e2e`, `db:migrate`, `db:seed`, `db:reset`.

- [ ] **Step 1: Inicializar el proyecto Next.js**

Ejecutar (responde a los prompts como se indica):

```bash
cd /c/Users/papor/pos-system
npx create-next-app@latest . --ts --tailwind --eslint --app --src-dir --import-alias "@/*" --no-turbopack
```

Si `create-next-app` se niega por carpeta no vacía (`docs/`, `.git/`), inicializa en carpeta temporal y copia:

```bash
npx create-next-app@latest /c/Users/papor/pos-system-tmp --ts --tailwind --eslint --app --src-dir --import-alias "@/*" --no-turbopack
cp -r /c/Users/papor/pos-system-tmp/. /c/Users/papor/pos-system/
rm -rf /c/Users/papor/pos-system-tmp /c/Users/papor/pos-system/.git/  # conserva SOLO si create-next-app creó un .git nuevo; recupera el original
cd /c/Users/papor/pos-system && git status
```

Verifica que `.git` sigue siendo el repo original (`git log --oneline` muestra el commit del spec). Si `create-next-app` sobrescribió `.git`, restáuralo: el commit del spec debe seguir presente; si no, `git init` de nuevo y re-commitea el spec antes de continuar.

- [ ] **Step 2: Instalar dependencias del bloque**

```bash
npm install @prisma/client @node-rs/argon2 zod @zxcvbn-ts/core @zxcvbn-ts/language-common
npm install -D prisma vitest @vitejs/plugin-react vite-tsconfig-paths @testing-library/react @testing-library/dom jsdom @playwright/test tsx cross-env
npm install -D embedded-postgres@17.10.0-beta.17 pg @types/pg
```

> `embedded-postgres` solo publica tags `-beta`; el `17.10.0-beta.17` está verificado y arranca PostgreSQL 17.10 en Windows x64 (spike hecho). Pínalo exacto.

- [ ] **Step 3: Configurar Vitest con proyectos unit e integración**

Crear `vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          environment: 'node',
          include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
          exclude: ['src/**/*.itest.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'integration',
          environment: 'node',
          include: ['src/**/*.itest.ts'],
          globalSetup: ['./test/vitest.global-setup.ts'],
          fileParallelism: false,
          testTimeout: 30_000,
          hookTimeout: 120_000,
        },
      },
    ],
  },
});
```

Convención: tests unitarios `*.test.ts` (nunca tocan BD), tests de integración con BD `*.itest.ts`.

- [ ] **Step 4: Helper de Postgres embebido y `globalSetup`**

Crear `test/pg-embedded.ts`:

```ts
import EmbeddedPostgres from 'embedded-postgres';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let pg: EmbeddedPostgres | null = null;
let dataDir = '';

export async function startEphemeralPg(port: number, dbNames: string[]): Promise<Record<string, string>> {
  dataDir = mkdtempSync(join(tmpdir(), 'pos-pg-'));
  pg = new EmbeddedPostgres({ databaseDir: dataDir, user: 'postgres', password: 'postgres', port, persistent: false });
  await pg.initialise();
  await pg.start();
  const urls: Record<string, string> = {};
  for (const name of dbNames) {
    await pg.createDatabase(name);
    const url = `postgresql://postgres:postgres@localhost:${port}/${name}?schema=public`;
    urls[name] = url;
    // aplica migraciones + seed a cada BD
    execFileSync('npx', ['prisma', 'migrate', 'deploy'], { stdio: 'inherit', env: { ...process.env, DATABASE_URL: url } });
    execFileSync('npx', ['tsx', 'prisma/seed.ts'], { stdio: 'inherit', env: { ...process.env, DATABASE_URL: url } });
  }
  return urls;
}

export async function stopEphemeralPg(): Promise<void> {
  if (pg) { await pg.stop(); pg = null; }
  if (dataDir) { rmSync(dataDir, { recursive: true, force: true }); dataDir = ''; }
}
```

> En Windows, `execFileSync('npx', …)` puede requerir `shell: true`. Si falla con ENOENT, usa `execFileSync(process.platform === 'win32' ? 'npx.cmd' : 'npx', …)` o `{ shell: true }`.

Crear `test/vitest.global-setup.ts`:

```ts
import { startEphemeralPg, stopEphemeralPg } from './pg-embedded';

export async function setup() {
  const urls = await startEphemeralPg(54330, ['pos_test']);
  process.env.DATABASE_URL = urls['pos_test'];
  process.env.DATABASE_URL_TEST = urls['pos_test'];
}

export async function teardown() {
  await stopEphemeralPg();
}
```

> El `globalSetup` corre en un proceso aparte; para que `src/lib/db.ts` (en los workers) reciba `DATABASE_URL`, expórtalo también vía `provide`/`inject` de Vitest **o** más simple: en `test/vitest.global-setup.ts` escribe el valor en un archivo `.env.test.local` y haz que `vitest.config.ts` lo cargue con `env` o que `src/lib/db.ts` haga `dotenv` de ese archivo en entorno test. Enfoque elegido: `globalSetup` devuelve `{ DATABASE_URL }` y se usa `import { inject } from 'vitest'` en un `setupFiles` corto (`test/vitest.setup.ts`) que hace `process.env.DATABASE_URL = inject('databaseUrl')`. Añade a `vitest.config.ts` del proyecto integration: `setupFiles: ['./test/vitest.setup.ts']` y en `globalSetup` `return () => {}` con `provide('databaseUrl', urls['pos_test'])`.

- [ ] **Step 5: Script `scripts/db.mjs` para la BD de desarrollo**

Crear `scripts/db.mjs`:

```js
import EmbeddedPostgres from 'embedded-postgres';
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const DATA_DIR = join(process.cwd(), '.pgdata');
const PID_FILE = join(DATA_DIR, 'pg.pid');
const PORT = 54329;
const cmd = process.argv[2];

function makePg() {
  return new EmbeddedPostgres({ databaseDir: DATA_DIR, user: 'postgres', password: 'postgres', port: PORT, persistent: true });
}

if (cmd === 'start') {
  const fresh = !existsSync(join(DATA_DIR, 'PG_VERSION'));
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  const pg = makePg();
  if (fresh) await pg.initialise();
  await pg.start();
  for (const name of ['pos_dev']) {
    try { await pg.createDatabase(name); } catch { /* ya existe */ }
  }
  writeFileSync(PID_FILE, String(process.pid));
  console.log(`PostgreSQL en localhost:${PORT} (pos_dev). Deja esta terminal abierta; Ctrl+C para parar.`);
  process.on('SIGINT', async () => { await pg.stop(); rmSync(PID_FILE, { force: true }); process.exit(0); });
  await new Promise(() => {}); // mantener vivo
} else if (cmd === 'stop') {
  if (existsSync(PID_FILE)) { process.kill(Number(readFileSync(PID_FILE, 'utf8'))); rmSync(PID_FILE, { force: true }); console.log('Parado.'); }
  else console.log('No hay PID registrado.');
} else if (cmd === 'status') {
  console.log(existsSync(PID_FILE) ? `Corriendo (pid ${readFileSync(PID_FILE, 'utf8')})` : 'Parado');
} else {
  console.log('Uso: node scripts/db.mjs <start|stop|status>');
  process.exit(1);
}
```

> `db:start` es un proceso en primer plano que hay que dejar abierto en su propia terminal (como `next dev`). Para los subagentes: arrancarlo con `run_in_background`.

Añade `.pgdata/` a `.gitignore`.

- [ ] **Step 6: `.env` local y `.env.example`**

`.env` (local, gitignored):

```
DATABASE_URL="postgresql://postgres:postgres@localhost:54329/pos_dev?schema=public"
DATABASE_URL_TEST="postgresql://postgres:postgres@localhost:54330/pos_test?schema=public"
DATABASE_URL_E2E="postgresql://postgres:postgres@localhost:54330/pos_e2e?schema=public"
```

`.env.example` con los mismos valores (son locales, no secretos).

- [ ] **Step 7: Añadir scripts a `package.json`**

```jsonc
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:unit": "vitest run --project unit",
    "test:integration": "vitest run --project integration",
    "test:e2e": "playwright test",
    "db:start": "node scripts/db.mjs start",
    "db:stop": "node scripts/db.mjs stop",
    "db:status": "node scripts/db.mjs status",
    "db:migrate": "prisma migrate dev",
    "db:seed": "tsx prisma/seed.ts",
    "db:reset": "prisma migrate reset --force"
  },
  "prisma": { "seed": "tsx prisma/seed.ts" }
}
```

> `db:migrate`, `db:seed`, `db:reset` requieren `npm run db:start` corriendo en otra terminal.

- [ ] **Step 8: Escribir el smoke test**

Crear `src/lib/__tests__/smoke.test.ts`:

```ts
import { describe, it, expect } from 'vitest';

describe('tooling', () => {
  it('ejecuta Vitest', () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 9: Verificar que la suite y los checks pasan**

Run: `npm run test:unit && npm run typecheck && npm run lint && npm run build`
Expected: todo PASS. El smoke test corre en el proyecto `unit` (no arranca Postgres). `next build` termina sin errores (la home por defecto de create-next-app sirve como placeholder de `src/app/page.tsx`).

Verificación extra del Postgres embebido: `npm run db:start` en segundo plano, luego `npm run db:status` → "Corriendo"; `npm run db:stop` → "Parado".

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "chore: scaffolding Next.js + Prisma + Vitest + Playwright + Postgres embebido"
```

---

## Task 2: Esquema Prisma, migración y seed

**Files:**
- Create: `prisma/schema.prisma`, `prisma/seed.ts`, `src/lib/db.ts`
- Create: `src/lib/__tests__/seed.itest.ts`
- Note: `.env` / `.env.example` y `test/vitest.global-setup.ts` ya se crearon en Task 1.

**Interfaces:**
- Consumes: proyecto de Task 1.
- Produces:
  - `src/lib/db.ts` exporta `export const db: PrismaClient`.
  - Modelos Prisma con estos nombres de campo exactos (usados por tareas posteriores): `User { id, nombre, email, telefono, avatarUrl, passwordHash, roleId, role, activo, mustChangePassword, lastLoginAt, createdById, createdAt, updatedAt }`, `Role { id, nombre, descripcion, esSistema, permissions, users, createdAt, updatedAt }`, `RolePermission { id, roleId, permiso }`, `Session { id, tokenHash, userId, user, createdAt, expiresAt, lastActivityAt, ip, userAgent, revokedAt }`, `ActivityLog { id, actorId, actor, accion, entidad, entidadId, metadata, ip, createdAt }`, `AppSetting { clave, valor, updatedAt }`.
  - Seed crea roles `Administrador`, `Gerente`, `Cajero`, `Empleado` (`esSistema: true`) y `AppSetting` `{ clave: "session.idleTimeoutMinutes", valor: 15 }`.

- [ ] **Step 1: Escribir el test de integración del seed (falla)**

> El arranque de Postgres, `prisma migrate deploy` y el seed sobre `pos_test` los hace `test/vitest.global-setup.ts` (Task 1, Step 4) al iniciar el proyecto `integration`. Cada archivo `.itest.ts` solo necesita limpiar las tablas que toca en un `beforeEach` (no borres los roles `esSistema`). `seed.itest.ts` no limpia nada: comprueba el estado que dejó el seed.

Crear `src/lib/__tests__/seed.itest.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { db } from '@/lib/db';

describe('seed', () => {
  it('crea los 4 roles de sistema', async () => {
    const roles = await db.role.findMany({ where: { esSistema: true } });
    expect(roles.map((r) => r.nombre).sort()).toEqual(
      ['Administrador', 'Cajero', 'Empleado', 'Gerente'],
    );
  });

  it('el Administrador tiene todos los permisos del catálogo', async () => {
    const { ALL_PERMISSION_KEYS } = await import('@/lib/auth/rbac');
    const admin = await db.role.findUniqueOrThrow({
      where: { nombre: 'Administrador' },
      include: { permissions: true },
    });
    expect(admin.permissions.map((p) => p.permiso).sort()).toEqual(
      [...ALL_PERMISSION_KEYS].sort(),
    );
  });

  it('define el timeout de inactividad por defecto en 15', async () => {
    const s = await db.appSetting.findUniqueOrThrow({
      where: { clave: 'session.idleTimeoutMinutes' },
    });
    expect(s.valor).toBe(15);
  });
});
```

> Nota: este test importa `@/lib/auth/rbac`, que se crea en Task 4. Si ejecutas Task 2 aislada, define temporalmente `ALL_PERMISSION_KEYS` como `[]` en un stub y sustitúyelo en Task 4. El plan asume ejecución en orden; el subagente de Task 4 debe re-ejecutar este test.

- [ ] **Step 2: Escribir `prisma/schema.prisma`**

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model User {
  id                 String    @id @default(cuid())
  nombre             String
  email              String    @unique
  telefono           String?
  avatarUrl          String?
  passwordHash       String
  roleId             String
  role               Role      @relation(fields: [roleId], references: [id])
  activo             Boolean   @default(true)
  mustChangePassword Boolean   @default(false)
  lastLoginAt        DateTime?
  createdById        String?
  createdAt          DateTime  @default(now())
  updatedAt          DateTime  @updatedAt
  sessions           Session[]
  activity           ActivityLog[] @relation("ActorActivity")

  @@index([roleId])
  @@index([activo])
}

model Role {
  id          String           @id @default(cuid())
  nombre      String           @unique
  descripcion String?
  esSistema   Boolean          @default(false)
  createdAt   DateTime         @default(now())
  updatedAt   DateTime         @updatedAt
  permissions RolePermission[]
  users       User[]
}

model RolePermission {
  id     String @id @default(cuid())
  roleId String
  role   Role   @relation(fields: [roleId], references: [id], onDelete: Cascade)
  permiso String

  @@unique([roleId, permiso])
  @@index([roleId])
}

model Session {
  id             String    @id @default(cuid())
  tokenHash      String    @unique
  userId         String
  user           User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  createdAt      DateTime  @default(now())
  expiresAt      DateTime
  lastActivityAt DateTime
  ip             String?
  userAgent      String?
  revokedAt      DateTime?

  @@index([userId])
  @@index([expiresAt])
}

model ActivityLog {
  id        String   @id @default(cuid())
  actorId   String?
  actor     User?    @relation("ActorActivity", fields: [actorId], references: [id])
  accion    String
  entidad   String?
  entidadId String?
  metadata  Json     @default("{}")
  ip        String?
  createdAt DateTime @default(now())

  @@index([actorId, createdAt])
  @@index([accion, createdAt])
  @@index([createdAt])
}

model AppSetting {
  clave     String   @id
  valor     Json
  updatedAt DateTime @updatedAt
}
```

- [ ] **Step 3: Escribir `src/lib/db.ts`**

```ts
import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({ log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'] });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db;
```

- [ ] **Step 4: Escribir `prisma/seed.ts`**

```ts
import { PrismaClient } from '@prisma/client';
import { PERMISSIONS, ALL_PERMISSION_KEYS } from '../src/lib/auth/rbac';

const db = new PrismaClient();

const ROLE_PERMISSIONS: Record<string, readonly string[]> = {
  Administrador: ALL_PERMISSION_KEYS,
  Gerente: [
    'usuarios.ver', 'usuarios.crear', 'usuarios.editar',
    'usuarios.reset_password', 'roles.ver', 'auditoria.ver',
  ],
  Cajero: [],
  Empleado: [],
};

async function main() {
  for (const [nombre, permisos] of Object.entries(ROLE_PERMISSIONS)) {
    const role = await db.role.upsert({
      where: { nombre },
      update: { esSistema: true },
      create: { nombre, esSistema: true, descripcion: `Rol de sistema: ${nombre}` },
    });
    await db.rolePermission.deleteMany({ where: { roleId: role.id } });
    if (permisos.length) {
      await db.rolePermission.createMany({
        data: permisos.map((permiso) => ({ roleId: role.id, permiso })),
      });
    }
  }

  await db.appSetting.upsert({
    where: { clave: 'session.idleTimeoutMinutes' },
    update: {},
    create: { clave: 'session.idleTimeoutMinutes', valor: 15 },
  });

  console.log('Seed completado. Permisos en catálogo:', ALL_PERMISSION_KEYS.length);
  void PERMISSIONS;
}

main().finally(() => db.$disconnect());
```

- [ ] **Step 5: Arrancar la BD de desarrollo y generar la migración inicial**

`.env` / `.env.example` ya existen (Task 1, Step 6) apuntando al puerto 54329 (dev) y 54330 (test/e2e). Arranca la BD de desarrollo en segundo plano y genera la migración:

```bash
npm run db:start   # en segundo plano (run_in_background); crea pos_dev
# esperar a que el log diga "PostgreSQL en localhost:54329"
npx prisma migrate dev --name init
```

Expected: crea `prisma/migrations/<ts>_init/`, aplica el esquema a `pos_dev`, genera el cliente Prisma.

- [ ] **Step 6: Ejecutar el seed sobre dev (verificación manual)**

Run: `npm run db:seed`
Expected: imprime "Seed completado. Permisos en catálogo: N". Consulta rápida opcional con un script `tsx` que haga `db.role.count()`.

- [ ] **Step 7: Ejecutar los tests de integración**

Run: `npm run test:integration`
Expected: el `globalSetup` levanta Postgres embebido efímero en 54330, crea `pos_test`, corre `prisma migrate deploy` + seed, y `seed.itest.ts` PASA (3 tests). El teardown para la instancia y borra el data dir. `npm run db:start` (dev) puede seguir corriendo en paralelo: usan puertos distintos.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: esquema Prisma, migración inicial y seed de roles de sistema"
```

---

## Task 3: Módulo de contraseñas (`lib/auth/password.ts`)

**Files:**
- Create: `src/lib/auth/password.ts`, `src/lib/auth/password.test.ts`

**Interfaces:**
- Consumes: nada de tareas previas (módulo puro).
- Produces:
  - `hashPassword(plain: string): Promise<string>`
  - `verifyPassword(hash: string, plain: string): Promise<boolean>`
  - `generateTempPassword(): string` — 12 caracteres del alfabeto sin ambiguos `23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz`.
  - `passwordPolicyError(plain: string, email: string): string | null` — devuelve el mensaje de error en español o `null` si cumple.
  - `COMMON_PASSWORDS: ReadonlySet<string>`.

- [ ] **Step 1: Escribir los tests (fallan)**

Crear `src/lib/auth/password.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  hashPassword, verifyPassword, generateTempPassword, passwordPolicyError,
} from './password';

describe('hashPassword / verifyPassword', () => {
  it('el hash no es el texto plano y tiene formato argon2id', async () => {
    const hash = await hashPassword('contraseñaSegura123');
    expect(hash).not.toContain('contraseñaSegura123');
    expect(hash.startsWith('$argon2id$')).toBe(true);
  });

  it('verifica la contraseña correcta', async () => {
    const hash = await hashPassword('contraseñaSegura123');
    expect(await verifyPassword(hash, 'contraseñaSegura123')).toBe(true);
  });

  it('rechaza la contraseña incorrecta', async () => {
    const hash = await hashPassword('contraseñaSegura123');
    expect(await verifyPassword(hash, 'otraCosa')).toBe(false);
  });

  it('dos hashes de la misma contraseña son distintos (salt aleatorio)', async () => {
    expect(await hashPassword('abcabcabc1')).not.toBe(await hashPassword('abcabcabc1'));
  });

  it('verifyPassword devuelve false ante un hash corrupto en vez de lanzar', async () => {
    expect(await verifyPassword('no-es-un-hash', 'x')).toBe(false);
  });
});

describe('generateTempPassword', () => {
  it('genera 12 caracteres del alfabeto sin ambiguos', () => {
    for (let i = 0; i < 50; i++) {
      const p = generateTempPassword();
      expect(p).toHaveLength(12);
      expect(p).toMatch(/^[23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz]+$/);
    }
  });

  it('no repite en 100 generaciones', () => {
    const s = new Set(Array.from({ length: 100 }, () => generateTempPassword()));
    expect(s.size).toBe(100);
  });
});

describe('passwordPolicyError', () => {
  it('acepta una contraseña válida', () => {
    expect(passwordPolicyError('caballoAzul42', 'user@pos.com')).toBeNull();
  });
  it('rechaza menos de 10 caracteres', () => {
    expect(passwordPolicyError('corta1', 'user@pos.com')).toMatch(/10 caracteres/);
  });
  it('rechaza que sea igual al email', () => {
    expect(passwordPolicyError('User@Pos.com', 'user@pos.com')).toMatch(/correo/i);
  });
  it('rechaza una contraseña común', () => {
    expect(passwordPolicyError('password123', 'user@pos.com')).toMatch(/común/i);
  });
});
```

- [ ] **Step 2: Ejecutar y ver fallar**

Run: `npm run test:unit -- password`
Expected: FAIL (`Cannot find module './password'`).

- [ ] **Step 3: Implementar `src/lib/auth/password.ts`**

```ts
import { hash, verify } from '@node-rs/argon2';
import { randomInt } from 'node:crypto';

const ARGON_OPTS = { memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;
const TEMP_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz';

export const COMMON_PASSWORDS: ReadonlySet<string> = new Set([
  'password', 'password1', 'password123', '12345678', '123456789', '1234567890',
  'qwertyuiop', 'contraseña', 'contrasena', 'admin1234', 'iloveyou1', 'welcome123',
  'pos123456', 'cajero1234', 'letmein123',
]);

export async function hashPassword(plain: string): Promise<string> {
  return hash(plain, ARGON_OPTS);
}

export async function verifyPassword(hashStr: string, plain: string): Promise<boolean> {
  try {
    return await verify(hashStr, plain, ARGON_OPTS);
  } catch {
    return false;
  }
}

export function generateTempPassword(): string {
  let out = '';
  for (let i = 0; i < 12; i++) out += TEMP_ALPHABET[randomInt(TEMP_ALPHABET.length)];
  return out;
}

export function passwordPolicyError(plain: string, email: string): string | null {
  if (plain.length < 10) return 'La contraseña debe tener al menos 10 caracteres.';
  if (plain.trim().toLowerCase() === email.trim().toLowerCase())
    return 'La contraseña no puede ser igual al correo.';
  if (COMMON_PASSWORDS.has(plain.toLowerCase()))
    return 'Esa contraseña es demasiado común. Elige otra.';
  return null;
}
```

- [ ] **Step 4: Ejecutar y ver pasar**

Run: `npm run test:unit -- password`
Expected: PASS (todos). Si `@node-rs/argon2` falla al cargar en el entorno, verifica que la versión instalada trae binario para la plataforma (Windows x64).

- [ ] **Step 5: Commit**

```bash
git add src/lib/auth/password.ts src/lib/auth/password.test.ts
git commit -m "feat: módulo de contraseñas (Argon2id, temporales, política)"
```

---

## Task 4: Módulo RBAC (`lib/auth/rbac.ts`)

**Files:**
- Create: `src/lib/auth/rbac.ts`, `src/lib/auth/rbac.test.ts`
- Re-run: `src/lib/__tests__/seed.itest.ts` (ya lo importa)

**Interfaces:**
- Consumes: nada (módulo puro; el `AuthUser` lo rellenan Task 6/7).
- Produces:
  - `type PermissionKey` — union de todas las claves.
  - `PERMISSIONS: { modulo: string; label: string; permisos: { key: PermissionKey; label: string }[] }[]` — catálogo agrupado para la UI.
  - `ALL_PERMISSION_KEYS: readonly PermissionKey[]`.
  - `type AuthUser = { id: string; nombre: string; email: string; roleId: string; roleName: string; permissions: Set<string>; mustChangePassword: boolean }`.
  - `can(user: AuthUser | null, permiso: PermissionKey): boolean`.
  - `ADMIN_LOCKED_PERMISSIONS: readonly PermissionKey[]` — `['roles.gestionar','usuarios.editar','usuarios.desactivar']` (no se pueden quitar al rol Administrador).
  - `MANAGER_GUARD_PERMISSIONS: readonly PermissionKey[]` — `['roles.gestionar','usuarios.editar']` (el sistema debe conservar ≥1 usuario activo cuyo rol tenga TODAS estas).

- [ ] **Step 1: Escribir los tests (fallan)**

Crear `src/lib/auth/rbac.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { PERMISSIONS, ALL_PERMISSION_KEYS, can, type AuthUser } from './rbac';

const user = (perms: string[]): AuthUser => ({
  id: 'u1', nombre: 'Test', email: 't@pos.com', roleId: 'r1', roleName: 'X',
  permissions: new Set(perms), mustChangePassword: false,
});

describe('catálogo', () => {
  it('agrupa por módulo y no repite claves', () => {
    const keys = PERMISSIONS.flatMap((g) => g.permisos.map((p) => p.key));
    expect(new Set(keys).size).toBe(keys.length);
    expect([...ALL_PERMISSION_KEYS].sort()).toEqual([...keys].sort());
  });
  it('incluye las claves del Bloque 1', () => {
    for (const k of [
      'usuarios.ver','usuarios.crear','usuarios.editar','usuarios.desactivar',
      'usuarios.reset_password','roles.ver','roles.gestionar','auditoria.ver','config.editar',
    ]) expect(ALL_PERMISSION_KEYS).toContain(k);
  });
});

describe('can()', () => {
  it('true si el usuario tiene el permiso', () => {
    expect(can(user(['usuarios.crear']), 'usuarios.crear')).toBe(true);
  });
  it('false si no lo tiene', () => {
    expect(can(user(['usuarios.ver']), 'usuarios.crear')).toBe(false);
  });
  it('false si el usuario es null', () => {
    expect(can(null, 'usuarios.ver')).toBe(false);
  });
});
```

- [ ] **Step 2: Ejecutar y ver fallar**

Run: `npm run test:unit -- rbac`
Expected: FAIL (módulo inexistente).

- [ ] **Step 3: Implementar `src/lib/auth/rbac.ts`**

```ts
export const PERMISSIONS = [
  {
    modulo: 'usuarios', label: 'Usuarios',
    permisos: [
      { key: 'usuarios.ver', label: 'Ver usuarios' },
      { key: 'usuarios.crear', label: 'Crear usuarios' },
      { key: 'usuarios.editar', label: 'Editar usuarios y su rol' },
      { key: 'usuarios.desactivar', label: 'Activar/desactivar usuarios' },
      { key: 'usuarios.reset_password', label: 'Restablecer contraseñas' },
    ],
  },
  {
    modulo: 'roles', label: 'Roles y permisos',
    permisos: [
      { key: 'roles.ver', label: 'Ver roles' },
      { key: 'roles.gestionar', label: 'Crear, editar y borrar roles' },
    ],
  },
  {
    modulo: 'auditoria', label: 'Auditoría',
    permisos: [{ key: 'auditoria.ver', label: 'Ver el historial de actividad' }],
  },
  {
    modulo: 'configuracion', label: 'Configuración',
    permisos: [{ key: 'config.editar', label: 'Editar la configuración del sistema' }],
  },
] as const;

export type PermissionKey =
  (typeof PERMISSIONS)[number]['permisos'][number]['key'];

export const ALL_PERMISSION_KEYS: readonly PermissionKey[] =
  PERMISSIONS.flatMap((g) => g.permisos.map((p) => p.key));

export const ADMIN_LOCKED_PERMISSIONS = [
  'roles.gestionar', 'usuarios.editar', 'usuarios.desactivar',
] as const satisfies readonly PermissionKey[];

export const MANAGER_GUARD_PERMISSIONS = [
  'roles.gestionar', 'usuarios.editar',
] as const satisfies readonly PermissionKey[];

export type AuthUser = {
  id: string;
  nombre: string;
  email: string;
  roleId: string;
  roleName: string;
  permissions: Set<string>;
  mustChangePassword: boolean;
};

export function can(user: AuthUser | null, permiso: PermissionKey): boolean {
  return !!user && user.permissions.has(permiso);
}
```

- [ ] **Step 4: Ejecutar y ver pasar**

Run: `npm run test:unit -- rbac` → PASS.
Run: `npm run test:integration -- seed` → PASS (ahora que `ALL_PERMISSION_KEYS` existe, el test del Administrador cuadra). Si habías puesto un stub en Task 2, bórralo.

- [ ] **Step 5: Commit**

```bash
git add src/lib/auth/rbac.ts src/lib/auth/rbac.test.ts prisma/seed.ts
git commit -m "feat: catálogo de permisos y helper can()"
```

---

## Task 5: Módulo de auditoría (`lib/audit.ts`)

**Files:**
- Create: `src/lib/audit.ts`, `src/lib/audit.itest.ts`

**Interfaces:**
- Consumes: `db` de Task 2.
- Produces:
  - `type AuditAction` — union de strings; incluye `'auth.login' | 'auth.logout' | 'auth.login_failed' | 'auth.logout_idle' | 'auth.forbidden' | 'auth.password_changed' | 'usuarios.crear' | 'usuarios.editar' | 'usuarios.rol_cambiado' | 'usuarios.desactivar' | 'usuarios.activar' | 'usuarios.reset_password' | 'usuarios.sesiones_revocadas' | 'roles.crear' | 'roles.editar' | 'roles.borrar' | 'config.editar'`.
  - `logActivity(input: { actorId?: string | null; accion: AuditAction; entidad?: string; entidadId?: string; metadata?: Record<string, unknown>; ip?: string | null }, tx?: Prisma.TransactionClient): Promise<void>` — usa `tx` si se pasa, si no `db`.
  - `actionLabel(accion: string): string` — etiqueta legible en español (fallback: la propia clave).

- [ ] **Step 1: Escribir el test de integración (falla)**

Crear `src/lib/audit.itest.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '@/lib/db';
import { logActivity, actionLabel } from './audit';

beforeEach(async () => {
  await db.activityLog.deleteMany();
});

describe('logActivity', () => {
  it('inserta una fila con los campos dados', async () => {
    await logActivity({ actorId: null, accion: 'auth.login_failed', metadata: { email: 'x@pos.com' }, ip: '1.2.3.4' });
    const rows = await db.activityLog.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      accion: 'auth.login_failed', actorId: null, ip: '1.2.3.4',
    });
    expect(rows[0].metadata).toEqual({ email: 'x@pos.com' });
  });

  it('respeta la transacción: si el tx hace rollback, no queda log', async () => {
    await db.$transaction(async (tx) => {
      await logActivity({ accion: 'roles.crear', entidad: 'Role', entidadId: 'r1' }, tx);
      throw new Error('rollback');
    }).catch(() => {});
    expect(await db.activityLog.count()).toBe(0);
  });
});

describe('actionLabel', () => {
  it('traduce acciones conocidas', () => {
    expect(actionLabel('auth.login')).toBe('Inicio de sesión');
  });
  it('devuelve la clave si no la conoce', () => {
    expect(actionLabel('foo.bar')).toBe('foo.bar');
  });
});
```

- [ ] **Step 2: Ejecutar y ver fallar**

Run: `npm run test:integration -- audit`
Expected: FAIL (módulo inexistente).

- [ ] **Step 3: Implementar `src/lib/audit.ts`**

```ts
import type { Prisma } from '@prisma/client';
import { db } from '@/lib/db';

export type AuditAction =
  | 'auth.login' | 'auth.logout' | 'auth.login_failed' | 'auth.logout_idle'
  | 'auth.forbidden' | 'auth.password_changed'
  | 'usuarios.crear' | 'usuarios.editar' | 'usuarios.rol_cambiado'
  | 'usuarios.desactivar' | 'usuarios.activar' | 'usuarios.reset_password'
  | 'usuarios.sesiones_revocadas'
  | 'roles.crear' | 'roles.editar' | 'roles.borrar'
  | 'config.editar';

const LABELS: Record<string, string> = {
  'auth.login': 'Inicio de sesión',
  'auth.logout': 'Cierre de sesión',
  'auth.login_failed': 'Intento de inicio de sesión fallido',
  'auth.logout_idle': 'Cierre de sesión por inactividad',
  'auth.forbidden': 'Acceso denegado',
  'auth.password_changed': 'Cambio de contraseña',
  'usuarios.crear': 'Alta de usuario',
  'usuarios.editar': 'Edición de usuario',
  'usuarios.rol_cambiado': 'Cambio de rol de usuario',
  'usuarios.desactivar': 'Desactivación de usuario',
  'usuarios.activar': 'Reactivación de usuario',
  'usuarios.reset_password': 'Restablecimiento de contraseña',
  'usuarios.sesiones_revocadas': 'Revocación de sesiones de usuario',
  'roles.crear': 'Creación de rol',
  'roles.editar': 'Edición de rol',
  'roles.borrar': 'Eliminación de rol',
  'config.editar': 'Cambio de configuración',
};

export function actionLabel(accion: string): string {
  return LABELS[accion] ?? accion;
}

export async function logActivity(
  input: {
    actorId?: string | null;
    accion: AuditAction;
    entidad?: string;
    entidadId?: string;
    metadata?: Record<string, unknown>;
    ip?: string | null;
  },
  tx?: Prisma.TransactionClient,
): Promise<void> {
  const client = tx ?? db;
  await client.activityLog.create({
    data: {
      actorId: input.actorId ?? null,
      accion: input.accion,
      entidad: input.entidad ?? null,
      entidadId: input.entidadId ?? null,
      metadata: (input.metadata ?? {}) as Prisma.InputJsonValue,
      ip: input.ip ?? null,
    },
  });
}
```

- [ ] **Step 4: Ejecutar y ver pasar**

Run: `npm run test:integration -- audit` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/audit.ts src/lib/audit.itest.ts
git commit -m "feat: módulo de auditoría con soporte transaccional"
```

---

## Task 6: Módulo de sesiones (`lib/auth/session.ts`) + settings

**Files:**
- Create: `src/lib/auth/session.ts`, `src/lib/auth/session.itest.ts`
- Create: `src/lib/settings.ts`, `src/lib/settings.itest.ts`

**Interfaces:**
- Consumes: `db` (Task 2).
- Produces:
  - `SESSION_COOKIE = 'pos_session'`.
  - `SESSION_TTL_MS = 8 * 60 * 60 * 1000`.
  - `TOUCH_THROTTLE_MS = 60 * 1000`.
  - `hashToken(token: string): string` — `sha256` hex.
  - `createSession(userId: string, ctx: { ip?: string | null; userAgent?: string | null }): Promise<{ token: string; expiresAt: Date }>`.
  - `type ValidatedSession = { session: { id: string; userId: string; lastActivityAt: Date; expiresAt: Date }; status: 'ok' | 'idle' | 'invalid' }`.
  - `validateSession(token: string | undefined, idleTimeoutMinutes: number): Promise<ValidatedSession>` — `invalid` si no existe / revocada / expirada; `idle` si superó inactividad (y la revoca); `ok` si vale.
  - `touchSession(token: string): Promise<void>` — actualiza `lastActivityAt`/`expiresAt` respetando `TOUCH_THROTTLE_MS`.
  - `revokeSession(id: string): Promise<void>`, `revokeSessionByToken(token: string): Promise<void>`.
  - `revokeAllForUser(userId: string, exceptSessionId?: string): Promise<number>` — devuelve nº de sesiones revocadas.
  - `settings.ts`: `getSetting<T>(clave: string, fallback: T): Promise<T>`, `setSetting(clave: string, valor: unknown): Promise<void>`, `getIdleTimeoutMinutes(): Promise<number>`.

- [ ] **Step 1: Escribir `src/lib/settings.itest.ts` (falla)**

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '@/lib/db';
import { getSetting, setSetting, getIdleTimeoutMinutes } from './settings';

beforeEach(async () => {
  await db.appSetting.deleteMany({ where: { clave: { startsWith: 'test.' } } });
});

describe('settings', () => {
  it('devuelve el fallback si no existe', async () => {
    expect(await getSetting('test.x', 7)).toBe(7);
  });
  it('persiste y lee', async () => {
    await setSetting('test.x', 42);
    expect(await getSetting('test.x', 0)).toBe(42);
  });
  it('getIdleTimeoutMinutes devuelve 15 por defecto (seed)', async () => {
    expect(await getIdleTimeoutMinutes()).toBe(15);
  });
});
```

- [ ] **Step 2: Implementar `src/lib/settings.ts`**

```ts
import { db } from '@/lib/db';

export async function getSetting<T>(clave: string, fallback: T): Promise<T> {
  const row = await db.appSetting.findUnique({ where: { clave } });
  return row ? (row.valor as T) : fallback;
}

export async function setSetting(clave: string, valor: unknown): Promise<void> {
  await db.appSetting.upsert({
    where: { clave },
    update: { valor: valor as object },
    create: { clave, valor: valor as object },
  });
}

export async function getIdleTimeoutMinutes(): Promise<number> {
  const v = await getSetting<number>('session.idleTimeoutMinutes', 15);
  return typeof v === 'number' && v > 0 ? v : 15;
}
```

Run: `npm run test:integration -- settings` → PASS.

- [ ] **Step 3: Escribir `src/lib/auth/session.itest.ts` (falla)**

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '@/lib/db';
import { hashPassword } from './password';
import {
  createSession, validateSession, touchSession, revokeSessionByToken, revokeAllForUser,
} from './session';

async function makeUser() {
  const role = await db.role.findFirstOrThrow({ where: { nombre: 'Cajero' } });
  return db.user.create({
    data: {
      nombre: 'S', email: `s${Math.random()}@pos.com`,
      passwordHash: await hashPassword('xxxxxxxxxx'), roleId: role.id,
    },
  });
}

beforeEach(async () => {
  await db.session.deleteMany();
  await db.user.deleteMany();
});

describe('sesiones', () => {
  it('createSession devuelve token y guarda solo el hash', async () => {
    const u = await makeUser();
    const { token } = await createSession(u.id, { ip: '1.1.1.1', userAgent: 'jest' });
    const rows = await db.session.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0].tokenHash).not.toBe(token);
    expect(rows[0].ip).toBe('1.1.1.1');
  });

  it('validateSession = ok para sesión fresca', async () => {
    const u = await makeUser();
    const { token } = await createSession(u.id, {});
    expect((await validateSession(token, 15)).status).toBe('ok');
  });

  it('validateSession = invalid para token desconocido', async () => {
    expect((await validateSession('nope', 15)).status).toBe('invalid');
  });

  it('validateSession = invalid tras revocar', async () => {
    const u = await makeUser();
    const { token } = await createSession(u.id, {});
    await revokeSessionByToken(token);
    expect((await validateSession(token, 15)).status).toBe('invalid');
  });

  it('validateSession = idle y revoca si supera el timeout', async () => {
    const u = await makeUser();
    const { token } = await createSession(u.id, {});
    const h = (await import('./session')).hashToken(token);
    await db.session.update({
      where: { tokenHash: h },
      data: { lastActivityAt: new Date(Date.now() - 20 * 60_000) },
    });
    const res = await validateSession(token, 15);
    expect(res.status).toBe('idle');
    expect((await validateSession(token, 15)).status).toBe('invalid'); // ya revocada
  });

  it('touchSession no escribe si no pasó el throttle', async () => {
    const u = await makeUser();
    const { token } = await createSession(u.id, {});
    const h = (await import('./session')).hashToken(token);
    const before = await db.session.findUniqueOrThrow({ where: { tokenHash: h } });
    await new Promise((r) => setTimeout(r, 10));
    await touchSession(token);
    const after = await db.session.findUniqueOrThrow({ where: { tokenHash: h } });
    expect(after.lastActivityAt.getTime()).toBe(before.lastActivityAt.getTime());
  });

  it('revokeAllForUser revoca todas menos la excepción', async () => {
    const u = await makeUser();
    const a = await createSession(u.id, {});
    const b = await createSession(u.id, {});
    const bId = (await db.session.findUniqueOrThrow({
      where: { tokenHash: (await import('./session')).hashToken(b.token) },
    })).id;
    const n = await revokeAllForUser(u.id, bId);
    expect(n).toBe(1);
    expect((await validateSession(a.token, 15)).status).toBe('invalid');
    expect((await validateSession(b.token, 15)).status).toBe('ok');
  });
});
```

- [ ] **Step 4: Ejecutar y ver fallar**

Run: `npm run test:integration -- session`
Expected: FAIL (módulo inexistente).

- [ ] **Step 5: Implementar `src/lib/auth/session.ts`**

```ts
import { createHash, randomBytes } from 'node:crypto';
import { db } from '@/lib/db';

export const SESSION_COOKIE = 'pos_session';
export const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
export const TOUCH_THROTTLE_MS = 60 * 1000;

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export async function createSession(
  userId: string,
  ctx: { ip?: string | null; userAgent?: string | null },
): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(32).toString('base64url');
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);
  await db.session.create({
    data: {
      tokenHash: hashToken(token),
      userId,
      createdAt: now,
      lastActivityAt: now,
      expiresAt,
      ip: ctx.ip ?? null,
      userAgent: ctx.userAgent ?? null,
    },
  });
  return { token, expiresAt };
}

export type ValidatedSession = {
  session: { id: string; userId: string; lastActivityAt: Date; expiresAt: Date } | null;
  status: 'ok' | 'idle' | 'invalid';
};

export async function validateSession(
  token: string | undefined,
  idleTimeoutMinutes: number,
): Promise<ValidatedSession> {
  if (!token) return { session: null, status: 'invalid' };
  const row = await db.session.findUnique({ where: { tokenHash: hashToken(token) } });
  const now = Date.now();
  if (!row || row.revokedAt || row.expiresAt.getTime() <= now)
    return { session: null, status: 'invalid' };
  if (now - row.lastActivityAt.getTime() > idleTimeoutMinutes * 60_000) {
    await db.session.update({ where: { id: row.id }, data: { revokedAt: new Date() } });
    return {
      session: { id: row.id, userId: row.userId, lastActivityAt: row.lastActivityAt, expiresAt: row.expiresAt },
      status: 'idle',
    };
  }
  return {
    session: { id: row.id, userId: row.userId, lastActivityAt: row.lastActivityAt, expiresAt: row.expiresAt },
    status: 'ok',
  };
}

export async function touchSession(token: string): Promise<void> {
  const row = await db.session.findUnique({ where: { tokenHash: hashToken(token) } });
  if (!row || row.revokedAt) return;
  if (Date.now() - row.lastActivityAt.getTime() < TOUCH_THROTTLE_MS) return;
  const now = new Date();
  await db.session.update({
    where: { id: row.id },
    data: { lastActivityAt: now, expiresAt: new Date(now.getTime() + SESSION_TTL_MS) },
  });
}

export async function revokeSession(id: string): Promise<void> {
  await db.session.updateMany({ where: { id, revokedAt: null }, data: { revokedAt: new Date() } });
}

export async function revokeSessionByToken(token: string): Promise<void> {
  await db.session.updateMany({
    where: { tokenHash: hashToken(token), revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function revokeAllForUser(userId: string, exceptSessionId?: string): Promise<number> {
  const res = await db.session.updateMany({
    where: { userId, revokedAt: null, ...(exceptSessionId ? { id: { not: exceptSessionId } } : {}) },
    data: { revokedAt: new Date() },
  });
  return res.count;
}
```

- [ ] **Step 6: Ejecutar y ver pasar**

Run: `npm run test:integration -- session` → PASS (todos).

- [ ] **Step 7: Commit**

```bash
git add src/lib/auth/session.ts src/lib/auth/session.itest.ts src/lib/settings.ts src/lib/settings.itest.ts
git commit -m "feat: módulo de sesiones (crear/validar/inactividad/revocar) y settings"
```

---

## Task 7: Helpers HTTP, rate limit y contexto de autenticación

**Files:**
- Create: `src/lib/http.ts`, `src/lib/http.test.ts`
- Create: `src/lib/auth/rate-limit.ts`, `src/lib/auth/rate-limit.test.ts`
- Create: `src/lib/auth/context.ts`, `src/lib/auth/context.itest.ts`
- Create: `src/lib/errors.ts`

**Interfaces:**
- Consumes: `db` (T2), `validateSession` (T6), `getIdleTimeoutMinutes` (T6), `can`/`AuthUser`/`PermissionKey` (T4), `logActivity` (T5).
- Produces:
  - `http.ts`: `getClientIp(headers: Headers): string | null` (primer valor de `x-forwarded-for`, si no `x-real-ip`, si no `null`); `assertSameOrigin(req: Request): void` (lanza `ForbiddenError` si `Origin`/`Referer` no coincide con `Host`).
  - `errors.ts`: `class AppError extends Error { code: string }`, `class ForbiddenError extends AppError`, `class ValidationError extends AppError { fields: Record<string,string> }`, `class NotFoundError extends AppError`.
  - `rate-limit.ts`: `checkLoginRateLimit(key: string): { blocked: boolean; retryAfterSec: number }`; `recordLoginFailure(key: string): void`; `clearLoginFailures(key: string): void`. Ventana 15 min, umbral 5, bloqueo 15 min. Estado en `Map` de módulo. `key` = `${email.toLowerCase()}|${ip}`.
  - `context.ts`:
    - `getCurrentUser(): Promise<AuthUser | null>` — lee la cookie (`next/headers`), valida la sesión, carga usuario + rol + permisos. Devuelve `null` si inválida/idle/usuario inactivo.
    - `requireUser(): Promise<AuthUser>` — lanza `ForbiddenError('NO_SESSION')` si no hay.
    - `requirePermission(permiso: PermissionKey): Promise<AuthUser>` — `requireUser` + comprueba `can`; si falla, registra `auth.forbidden` con `{ ruta, permisoRequerido }` (ruta desde `next/headers` `x-pathname` si está, si no `''`) y lanza `ForbiddenError('FORBIDDEN')`.
    - `loadAuthUser(userId: string): Promise<AuthUser | null>` — helper compartido con el middleware (sin `next/headers`).

- [ ] **Step 1: Tests unitarios de `http.ts` y `rate-limit.ts` (fallan)**

Crear `src/lib/http.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { getClientIp } from './http';

describe('getClientIp', () => {
  it('toma el primer valor de x-forwarded-for', () => {
    const h = new Headers({ 'x-forwarded-for': '9.9.9.9, 10.0.0.1' });
    expect(getClientIp(h)).toBe('9.9.9.9');
  });
  it('cae a x-real-ip', () => {
    expect(getClientIp(new Headers({ 'x-real-ip': '8.8.8.8' }))).toBe('8.8.8.8');
  });
  it('null si no hay cabeceras', () => {
    expect(getClientIp(new Headers())).toBeNull();
  });
});
```

Crear `src/lib/auth/rate-limit.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { checkLoginRateLimit, recordLoginFailure, clearLoginFailures } from './rate-limit';

const KEY = 'user@pos.com|1.2.3.4';
beforeEach(() => clearLoginFailures(KEY));

describe('rate limit de login', () => {
  it('no bloquea por debajo del umbral', () => {
    for (let i = 0; i < 4; i++) recordLoginFailure(KEY);
    expect(checkLoginRateLimit(KEY).blocked).toBe(false);
  });
  it('bloquea al quinto fallo', () => {
    for (let i = 0; i < 5; i++) recordLoginFailure(KEY);
    const r = checkLoginRateLimit(KEY);
    expect(r.blocked).toBe(true);
    expect(r.retryAfterSec).toBeGreaterThan(0);
  });
  it('clearLoginFailures resetea', () => {
    for (let i = 0; i < 5; i++) recordLoginFailure(KEY);
    clearLoginFailures(KEY);
    expect(checkLoginRateLimit(KEY).blocked).toBe(false);
  });
});
```

- [ ] **Step 2: Implementar `src/lib/errors.ts`, `src/lib/http.ts`, `src/lib/auth/rate-limit.ts`**

`src/lib/errors.ts`:

```ts
export class AppError extends Error {
  constructor(public code: string, message: string) { super(message); this.name = 'AppError'; }
}
export class ForbiddenError extends AppError {
  constructor(code = 'FORBIDDEN', message = 'No autorizado') { super(code, message); this.name = 'ForbiddenError'; }
}
export class NotFoundError extends AppError {
  constructor(message = 'No encontrado') { super('NOT_FOUND', message); this.name = 'NotFoundError'; }
}
export class ValidationError extends AppError {
  constructor(public fields: Record<string, string>, message = 'Datos inválidos') {
    super('VALIDATION', message); this.name = 'ValidationError';
  }
}
```

`src/lib/http.ts`:

```ts
import { ForbiddenError } from '@/lib/errors';

export function getClientIp(headers: Headers): string | null {
  const xff = headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0]!.trim();
  return headers.get('x-real-ip')?.trim() ?? null;
}

export function assertSameOrigin(req: Request): void {
  const host = req.headers.get('host');
  const origin = req.headers.get('origin') ?? req.headers.get('referer');
  if (!host || !origin) return; // navegación same-origin sin Origin (GET) — Server Actions ya lo cubren
  try {
    if (new URL(origin).host !== host) throw new Error('cross-origin');
  } catch {
    throw new ForbiddenError('BAD_ORIGIN', 'Origen no permitido');
  }
}
```

`src/lib/auth/rate-limit.ts`:

```ts
const WINDOW_MS = 15 * 60_000;
const THRESHOLD = 5;
const BLOCK_MS = 15 * 60_000;

type Entry = { fails: number[]; blockedUntil: number };
const store = new Map<string, Entry>();

function prune(e: Entry, now: number) {
  e.fails = e.fails.filter((t) => now - t < WINDOW_MS);
}

export function checkLoginRateLimit(key: string): { blocked: boolean; retryAfterSec: number } {
  const now = Date.now();
  const e = store.get(key);
  if (!e) return { blocked: false, retryAfterSec: 0 };
  if (e.blockedUntil > now) return { blocked: true, retryAfterSec: Math.ceil((e.blockedUntil - now) / 1000) };
  prune(e, now);
  return { blocked: false, retryAfterSec: 0 };
}

export function recordLoginFailure(key: string): void {
  const now = Date.now();
  const e = store.get(key) ?? { fails: [], blockedUntil: 0 };
  prune(e, now);
  e.fails.push(now);
  if (e.fails.length >= THRESHOLD) { e.blockedUntil = now + BLOCK_MS; e.fails = []; }
  store.set(key, e);
}

export function clearLoginFailures(key: string): void {
  store.delete(key);
}
```

Run: `npm run test:unit -- http rate-limit` → PASS.

- [ ] **Step 3: Test de integración de `context.ts` (falla)**

Crear `src/lib/auth/context.itest.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { db } from '@/lib/db';
import { hashPassword } from './password';
import { createSession } from './session';

const cookieStore = { value: undefined as string | undefined };
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: (n: string) => (cookieStore.value ? { name: n, value: cookieStore.value } : undefined) }),
  headers: async () => new Headers(),
}));

import { getCurrentUser, requirePermission } from './context';

async function makeUser(roleName: string, activo = true) {
  const role = await db.role.findFirstOrThrow({ where: { nombre: roleName } });
  return db.user.create({
    data: { nombre: roleName, email: `${roleName}-${Math.random()}@pos.com`,
      passwordHash: await hashPassword('xxxxxxxxxx'), roleId: role.id, activo },
  });
}

beforeEach(async () => {
  await db.session.deleteMany();
  await db.user.deleteMany();
  await db.activityLog.deleteMany();
  cookieStore.value = undefined;
});

describe('getCurrentUser', () => {
  it('null sin cookie', async () => {
    expect(await getCurrentUser()).toBeNull();
  });
  it('devuelve el usuario con permisos de su rol', async () => {
    const u = await makeUser('Administrador');
    cookieStore.value = (await createSession(u.id, {})).token;
    const cu = await getCurrentUser();
    expect(cu?.email).toBe(u.email);
    expect(cu?.permissions.has('roles.gestionar')).toBe(true);
  });
  it('null si el usuario está inactivo', async () => {
    const u = await makeUser('Cajero', false);
    cookieStore.value = (await createSession(u.id, {})).token;
    expect(await getCurrentUser()).toBeNull();
  });
});

describe('requirePermission', () => {
  it('lanza y audita si falta el permiso', async () => {
    const u = await makeUser('Cajero');
    cookieStore.value = (await createSession(u.id, {})).token;
    await expect(requirePermission('usuarios.crear')).rejects.toMatchObject({ code: 'FORBIDDEN' });
    const log = await db.activityLog.findFirst({ where: { accion: 'auth.forbidden' } });
    expect(log?.metadata).toMatchObject({ permisoRequerido: 'usuarios.crear' });
  });
});
```

- [ ] **Step 4: Implementar `src/lib/auth/context.ts`**

```ts
import { cookies, headers } from 'next/headers';
import { db } from '@/lib/db';
import { SESSION_COOKIE, validateSession } from './session';
import { getIdleTimeoutMinutes } from '@/lib/settings';
import { can, type AuthUser, type PermissionKey } from './rbac';
import { ForbiddenError } from '@/lib/errors';
import { logActivity } from '@/lib/audit';
import { getClientIp } from '@/lib/http';

export async function loadAuthUser(userId: string): Promise<AuthUser | null> {
  const u = await db.user.findUnique({
    where: { id: userId },
    include: { role: { include: { permissions: true } } },
  });
  if (!u || !u.activo) return null;
  return {
    id: u.id, nombre: u.nombre, email: u.email,
    roleId: u.roleId, roleName: u.role.nombre,
    permissions: new Set(u.role.permissions.map((p) => p.permiso)),
    mustChangePassword: u.mustChangePassword,
  };
}

export async function getCurrentUser(): Promise<AuthUser | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const res = await validateSession(token, await getIdleTimeoutMinutes());
  if (res.status !== 'ok' || !res.session) return null;
  return loadAuthUser(res.session.userId);
}

export async function requireUser(): Promise<AuthUser> {
  const user = await getCurrentUser();
  if (!user) throw new ForbiddenError('NO_SESSION', 'Sesión requerida');
  return user;
}

export async function requirePermission(permiso: PermissionKey): Promise<AuthUser> {
  const user = await requireUser();
  if (!can(user, permiso)) {
    const h = await headers();
    await logActivity({
      actorId: user.id, accion: 'auth.forbidden',
      metadata: { ruta: h.get('x-pathname') ?? '', permisoRequerido: permiso },
      ip: getClientIp(h),
    });
    throw new ForbiddenError('FORBIDDEN', 'No tienes permiso para esta acción');
  }
  return user;
}
```

- [ ] **Step 5: Ejecutar y ver pasar**

Run: `npm run test:integration -- context` → PASS.
Run: `npm run test:unit && npm run test:integration` → toda la suite en verde.

- [ ] **Step 6: Commit**

```bash
git add src/lib/http.ts src/lib/http.test.ts src/lib/errors.ts src/lib/auth/rate-limit.ts src/lib/auth/rate-limit.test.ts src/lib/auth/context.ts src/lib/auth/context.itest.ts
git commit -m "feat: helpers HTTP, rate limit de login y contexto de autorización"
```

---

## Task 8: Middleware de sesión

**Files:**
- Create: `src/middleware.ts`
- Create: `src/lib/auth/edge-session.ts` (validación apta para el runtime de middleware)
- Create: `e2e/.gitkeep` (placeholder; los specs llegan en Task 17)
- Test: cobertura vía E2E en Task 17 + un test unitario de la función de decisión.
- Create: `src/lib/auth/middleware-decide.ts`, `src/lib/auth/middleware-decide.test.ts`

**Interfaces:**
- Consumes: `SESSION_COOKIE` (T6).
- Produces:
  - `decideRedirect(input: { pathname: string; hasSessionCookie: boolean; sessionStatus: 'ok'|'idle'|'invalid'; mustChangePassword: boolean }): { type: 'next' } | { type: 'redirect'; to: string }` — función pura testeable con toda la lógica de rutas.
  - `middleware.ts` — invoca la validación real y aplica `decideRedirect`. Inyecta la cabecera `x-pathname` para que las Server Actions sepan la ruta.

**Reglas de `decideRedirect`:**
- Rutas públicas (`/login`, `/setup`, assets `_next`, `/api/session/heartbeat`): siempre `next`, salvo que estando con sesión `ok` se visite `/login` o `/setup` → redirect a `/dashboard`.
- Sin cookie o `status !== 'ok'` en ruta protegida → redirect a `/login?motivo=` (`inactividad` si `status==='idle'`, si no `sesion_cerrada`).
- Con sesión `ok` y `mustChangePassword` y `pathname !== '/cambiar-password'` → redirect a `/cambiar-password`.
- Con sesión `ok` y NO `mustChangePassword` y `pathname === '/cambiar-password'` → `next` (se permite cambio voluntario).
- Resto con sesión `ok` → `next`.

- [ ] **Step 1: Test de `decideRedirect` (falla)**

Crear `src/lib/auth/middleware-decide.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { decideRedirect } from './middleware-decide';

const base = { pathname: '/dashboard', hasSessionCookie: true, sessionStatus: 'ok' as const, mustChangePassword: false };

describe('decideRedirect', () => {
  it('deja pasar una ruta protegida con sesión ok', () => {
    expect(decideRedirect(base)).toEqual({ type: 'next' });
  });
  it('redirige a /login sin sesión en ruta protegida', () => {
    expect(decideRedirect({ ...base, hasSessionCookie: false, sessionStatus: 'invalid' }))
      .toEqual({ type: 'redirect', to: '/login?motivo=sesion_cerrada' });
  });
  it('usa motivo=inactividad cuando la sesión está idle', () => {
    expect(decideRedirect({ ...base, sessionStatus: 'idle' }))
      .toEqual({ type: 'redirect', to: '/login?motivo=inactividad' });
  });
  it('fuerza /cambiar-password si mustChangePassword', () => {
    expect(decideRedirect({ ...base, mustChangePassword: true }))
      .toEqual({ type: 'redirect', to: '/cambiar-password' });
  });
  it('permite /cambiar-password cuando ya está forzado', () => {
    expect(decideRedirect({ ...base, pathname: '/cambiar-password', mustChangePassword: true }))
      .toEqual({ type: 'next' });
  });
  it('manda al dashboard si visita /login con sesión ok', () => {
    expect(decideRedirect({ ...base, pathname: '/login' }))
      .toEqual({ type: 'redirect', to: '/dashboard' });
  });
  it('deja ver /login sin sesión', () => {
    expect(decideRedirect({ pathname: '/login', hasSessionCookie: false, sessionStatus: 'invalid', mustChangePassword: false }))
      .toEqual({ type: 'next' });
  });
});
```

- [ ] **Step 2: Implementar `src/lib/auth/middleware-decide.ts`**

```ts
const PUBLIC_PATHS = ['/login', '/setup'];

export function decideRedirect(input: {
  pathname: string;
  hasSessionCookie: boolean;
  sessionStatus: 'ok' | 'idle' | 'invalid';
  mustChangePassword: boolean;
}): { type: 'next' } | { type: 'redirect'; to: string } {
  const { pathname, sessionStatus, mustChangePassword } = input;
  const isPublic = PUBLIC_PATHS.some((p) => pathname === p);

  if (sessionStatus === 'ok') {
    if (isPublic) return { type: 'redirect', to: '/dashboard' };
    if (mustChangePassword && pathname !== '/cambiar-password')
      return { type: 'redirect', to: '/cambiar-password' };
    return { type: 'next' };
  }

  if (isPublic) return { type: 'next' };
  const motivo = sessionStatus === 'idle' ? 'inactividad' : 'sesion_cerrada';
  return { type: 'redirect', to: `/login?motivo=${motivo}` };
}
```

Run: `npm run test:unit -- middleware-decide` → PASS.

- [ ] **Step 3: Implementar `src/middleware.ts`**

> El middleware de Next corre en Edge runtime; Prisma Client no funciona ahí sin adaptador. Estrategia: el middleware hace una llamada HTTP interna a un Route Handler (`/api/session/validate`) en Node runtime que devuelve `{ status, mustChangePassword }`. Alternativa aceptada: marcar `export const runtime = 'nodejs'` no aplica a middleware. Por eso creamos el Route Handler.

Crear `src/app/api/session/validate/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { SESSION_COOKIE, validateSession } from '@/lib/auth/session';
import { getIdleTimeoutMinutes } from '@/lib/settings';
import { loadAuthUser } from '@/lib/auth/context';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  const token = req.headers.get('cookie')?.match(/pos_session=([^;]+)/)?.[1];
  const res = await validateSession(token, await getIdleTimeoutMinutes());
  if (res.status !== 'ok' || !res.session)
    return NextResponse.json({ status: res.status, mustChangePassword: false });
  const user = await loadAuthUser(res.session.userId);
  if (!user) return NextResponse.json({ status: 'invalid', mustChangePassword: false });
  return NextResponse.json({ status: 'ok', mustChangePassword: user.mustChangePassword });
}
```

Crear `src/middleware.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { decideRedirect } from '@/lib/auth/middleware-decide';

const IGNORE = [/^\/_next\//, /^\/favicon\.ico$/, /^\/api\/session\//, /^\/api\/health$/];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (IGNORE.some((re) => re.test(pathname))) return NextResponse.next();

  const hasSessionCookie = req.cookies.has('pos_session');
  let sessionStatus: 'ok' | 'idle' | 'invalid' = 'invalid';
  let mustChangePassword = false;

  if (hasSessionCookie) {
    const r = await fetch(new URL('/api/session/validate', req.url), {
      headers: { cookie: req.headers.get('cookie') ?? '' },
    });
    const data = (await r.json()) as { status: typeof sessionStatus; mustChangePassword: boolean };
    sessionStatus = data.status;
    mustChangePassword = data.mustChangePassword;
  }

  const decision = decideRedirect({ pathname, hasSessionCookie, sessionStatus, mustChangePassword });
  const res =
    decision.type === 'redirect'
      ? NextResponse.redirect(new URL(decision.to, req.url))
      : NextResponse.next();
  res.headers.set('x-pathname', pathname);
  return res;
}

export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'] };
```

- [ ] **Step 4: Verificación manual mínima**

Run: `npm run build`
Expected: compila. La verificación funcional completa (redirecciones reales) se cubre en los E2E de Task 17. Deja una nota en el PR: "middleware validado por E2E".

- [ ] **Step 5: Commit**

```bash
git add src/middleware.ts src/lib/auth/middleware-decide.ts src/lib/auth/middleware-decide.test.ts src/app/api/session/validate/route.ts
git commit -m "feat: middleware de sesión con validación en Node y decisión de rutas pura"
```

---

## Task 9: Esquemas de validación + flujo de bootstrap (`/setup`)

**Files:**
- Create: `src/lib/validation/auth.ts`, `src/lib/validation/auth.test.ts`
- Create: `src/lib/auth/bootstrap.ts`, `src/lib/auth/bootstrap.itest.ts`
- Create: `src/app/(auth)/setup/page.tsx`, `src/app/(auth)/setup/actions.ts`
- Create: `src/app/(auth)/layout.tsx`
- Create: `src/components/forms/Field.tsx`, `src/components/PasswordStrengthMeter.tsx`
- Modify: `src/app/page.tsx` (redirige a `/dashboard`)

**Interfaces:**
- Consumes: `hashPassword`, `passwordPolicyError` (T3), `createSession`, `SESSION_COOKIE` (T6), `getClientIp` (T7), `logActivity` (T5), `db` (T2).
- Produces:
  - `validation/auth.ts`: `setupSchema` (nombre ≥2, email válido, password, confirm), `loginSchema` (email, password), `changePasswordSchema` (currentPassword opcional, newPassword, confirm). Cada uno con `.superRefine` para "confirm coincide". Export `type SetupInput` etc.
  - `bootstrap.ts`: `isBootstrapNeeded(): Promise<boolean>` (`db.user.count() === 0`); `createFirstAdmin(input: SetupInput): Promise<{ userId: string }>` — crea el rol Administrador si no existe (defensivo), crea el usuario con `mustChangePassword: false`, registra `usuarios.crear` con `metadata: { bootstrap: true }`.
  - `setup/actions.ts`: `setupAction(prevState, formData): Promise<FormState>` — server action; valida, comprueba `isBootstrapNeeded` (si no, `ForbiddenError`), `createFirstAdmin`, `createSession`, set-cookie, `redirect('/dashboard')`.
  - `FormState = { ok: boolean; formError?: string; fieldErrors?: Record<string,string> }`.

- [ ] **Step 1: Tests de `validation/auth.ts` (fallan)**

Crear `src/lib/validation/auth.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { setupSchema, loginSchema } from './auth';

describe('setupSchema', () => {
  it('acepta datos válidos', () => {
    const r = setupSchema.safeParse({
      nombre: 'Ana', email: 'ana@pos.com', password: 'caballoAzul42', confirm: 'caballoAzul42',
    });
    expect(r.success).toBe(true);
  });
  it('rechaza si confirm no coincide', () => {
    const r = setupSchema.safeParse({
      nombre: 'Ana', email: 'ana@pos.com', password: 'caballoAzul42', confirm: 'otra',
    });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues.some((i) => i.path.includes('confirm'))).toBe(true);
  });
  it('rechaza email inválido', () => {
    expect(setupSchema.safeParse({ nombre: 'Ana', email: 'no', password: 'x'.repeat(10), confirm: 'x'.repeat(10) }).success).toBe(false);
  });
});

describe('loginSchema', () => {
  it('requiere email y password', () => {
    expect(loginSchema.safeParse({ email: '', password: '' }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Implementar `src/lib/validation/auth.ts`**

```ts
import { z } from 'zod';

const email = z.string().trim().toLowerCase().email('Correo inválido');
const password = z.string().min(1, 'Requerida');

export const loginSchema = z.object({ email, password });
export type LoginInput = z.infer<typeof loginSchema>;

export const setupSchema = z
  .object({
    nombre: z.string().trim().min(2, 'Mínimo 2 caracteres'),
    email,
    password: z.string().min(10, 'Mínimo 10 caracteres'),
    confirm: z.string(),
  })
  .superRefine((v, ctx) => {
    if (v.password !== v.confirm)
      ctx.addIssue({ code: 'custom', path: ['confirm'], message: 'Las contraseñas no coinciden' });
  });
export type SetupInput = z.infer<typeof setupSchema>;

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().optional(),
    newPassword: z.string().min(10, 'Mínimo 10 caracteres'),
    confirm: z.string(),
  })
  .superRefine((v, ctx) => {
    if (v.newPassword !== v.confirm)
      ctx.addIssue({ code: 'custom', path: ['confirm'], message: 'Las contraseñas no coinciden' });
  });
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
```

Run: `npm run test:unit -- validation/auth` → PASS.

- [ ] **Step 3: Test de integración de `bootstrap.ts` (falla)**

Crear `src/lib/auth/bootstrap.itest.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '@/lib/db';
import { isBootstrapNeeded, createFirstAdmin } from './bootstrap';
import { verifyPassword } from './password';

beforeEach(async () => {
  await db.activityLog.deleteMany();
  await db.session.deleteMany();
  await db.user.deleteMany();
});

describe('bootstrap', () => {
  it('isBootstrapNeeded true cuando no hay usuarios', async () => {
    expect(await isBootstrapNeeded()).toBe(true);
  });

  it('createFirstAdmin crea un Administrador utilizable', async () => {
    const { userId } = await createFirstAdmin({
      nombre: 'Ana', email: 'ana@pos.com', password: 'caballoAzul42', confirm: 'caballoAzul42',
    });
    const u = await db.user.findUniqueOrThrow({ where: { id: userId }, include: { role: true } });
    expect(u.role.nombre).toBe('Administrador');
    expect(u.mustChangePassword).toBe(false);
    expect(await verifyPassword(u.passwordHash, 'caballoAzul42')).toBe(true);
    expect(await isBootstrapNeeded()).toBe(false);
    const log = await db.activityLog.findFirst({ where: { accion: 'usuarios.crear' } });
    expect(log?.metadata).toMatchObject({ bootstrap: true });
  });
});
```

- [ ] **Step 4: Implementar `src/lib/auth/bootstrap.ts`**

```ts
import { db } from '@/lib/db';
import { hashPassword, passwordPolicyError } from './password';
import { logActivity } from '@/lib/audit';
import { ValidationError } from '@/lib/errors';
import type { SetupInput } from '@/lib/validation/auth';

export async function isBootstrapNeeded(): Promise<boolean> {
  return (await db.user.count()) === 0;
}

export async function createFirstAdmin(input: SetupInput): Promise<{ userId: string }> {
  const policy = passwordPolicyError(input.password, input.email);
  if (policy) throw new ValidationError({ password: policy });

  const passwordHash = await hashPassword(input.password);
  return db.$transaction(async (tx) => {
    const role = await tx.role.upsert({
      where: { nombre: 'Administrador' },
      update: { esSistema: true },
      create: { nombre: 'Administrador', esSistema: true, descripcion: 'Rol de sistema: Administrador' },
    });
    const user = await tx.user.create({
      data: { nombre: input.nombre, email: input.email, passwordHash, roleId: role.id, mustChangePassword: false },
    });
    await logActivity(
      { actorId: user.id, accion: 'usuarios.crear', entidad: 'User', entidadId: user.id,
        metadata: { bootstrap: true, email: user.email, nombre: user.nombre, rol: 'Administrador' } },
      tx,
    );
    return { userId: user.id };
  });
}
```

Run: `npm run test:integration -- bootstrap` → PASS.

- [ ] **Step 5: Implementar la UI de `/setup`**

`src/components/forms/Field.tsx`:

```tsx
export function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      {children}
      {error ? <span className="block text-sm text-red-600">{error}</span> : null}
    </label>
  );
}
```

`src/components/PasswordStrengthMeter.tsx` — client component: usa `@zxcvbn-ts/core` con `zxcvbnOptions.setOptions({ dictionary: commonDictionary })` (de `@zxcvbn-ts/language-common`), muestra una barra 0-4 y una etiqueta ("Muy débil"…"Fuerte"). No bloquea.

`src/app/(auth)/layout.tsx` — centra un `<main class="max-w-sm mx-auto mt-16">` con el nombre "POS" arriba.

`src/app/(auth)/setup/page.tsx` — server component:
- Si `!(await isBootstrapNeeded())` → `notFound()`.
- Renderiza `<SetupForm />` (client) que usa `useActionState(setupAction, { ok: false })`.
- Campos: nombre, email, password (+ `<PasswordStrengthMeter>`), confirm. Botón "Crear administrador".

`src/app/(auth)/setup/actions.ts`:

```ts
'use server';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { setupSchema } from '@/lib/validation/auth';
import { isBootstrapNeeded, createFirstAdmin } from '@/lib/auth/bootstrap';
import { createSession, SESSION_COOKIE, SESSION_TTL_MS } from '@/lib/auth/session';
import { getClientIp } from '@/lib/http';
import { logActivity } from '@/lib/audit';
import { ValidationError } from '@/lib/errors';

export type FormState = { ok: boolean; formError?: string; fieldErrors?: Record<string, string> };

export async function setupAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = setupSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const i of parsed.error.issues) fieldErrors[String(i.path[0])] = i.message;
    return { ok: false, fieldErrors };
  }
  if (!(await isBootstrapNeeded())) return { ok: false, formError: 'El sistema ya está configurado.' };

  let userId: string;
  try {
    ({ userId } = await createFirstAdmin(parsed.data));
  } catch (e) {
    if (e instanceof ValidationError) return { ok: false, fieldErrors: e.fields };
    throw e;
  }

  const h = await headers();
  const { token } = await createSession(userId, { ip: getClientIp(h), userAgent: h.get('user-agent') });
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: SESSION_TTL_MS / 1000,
  });
  await logActivity({ actorId: userId, accion: 'auth.login', ip: getClientIp(h), metadata: { via: 'setup' } });
  redirect('/dashboard');
}
```

`src/app/page.tsx`:

```tsx
import { redirect } from 'next/navigation';
export default function Home() { redirect('/dashboard'); }
```

- [ ] **Step 6: Verificar**

Run: `npm run test:unit && npm run test:integration && npm run build` → todo PASS/compila.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: flujo de bootstrap /setup y esquemas de validación de auth"
```

---

## Task 10: Flujo de login (`/login`)

**Files:**
- Create: `src/app/(auth)/login/page.tsx`, `src/app/(auth)/login/actions.ts`, `src/app/(auth)/login/LoginForm.tsx`
- Create: `src/lib/auth/login.ts`, `src/lib/auth/login.itest.ts`

**Interfaces:**
- Consumes: `loginSchema` (T9), `verifyPassword` (T3), `checkLoginRateLimit`/`recordLoginFailure`/`clearLoginFailures` (T7), `createSession`/`SESSION_COOKIE` (T6), `logActivity` (T5), `getClientIp` (T7), `db` (T2).
- Produces:
  - `login.ts`: `attemptLogin(input: { email: string; password: string; ip: string | null; userAgent: string | null }): Promise<{ ok: true; token: string; mustChangePassword: boolean } | { ok: false; reason: 'invalid' | 'rate_limited'; retryAfterSec?: number }>`. Mensaje genérico en la capa de acción; `attemptLogin` no revela por qué falló más allá de `reason`.
  - `login/actions.ts`: `loginAction(prev, formData): Promise<FormState>` — valida, llama `attemptLogin`, set-cookie en éxito, `redirect('/dashboard')` (el middleware ya reencaminará a `/cambiar-password` si toca).

- [ ] **Step 1: Test de integración de `attemptLogin` (falla)**

Crear `src/lib/auth/login.itest.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '@/lib/db';
import { hashPassword } from './password';
import { attemptLogin } from './login';
import { clearLoginFailures } from './rate-limit';

async function makeUser(over: Partial<{ activo: boolean; mustChangePassword: boolean }> = {}) {
  const role = await db.role.findFirstOrThrow({ where: { nombre: 'Cajero' } });
  return db.user.create({
    data: {
      nombre: 'L', email: 'l@pos.com', passwordHash: await hashPassword('caballoAzul42'),
      roleId: role.id, activo: over.activo ?? true, mustChangePassword: over.mustChangePassword ?? false,
    },
  });
}

beforeEach(async () => {
  await db.activityLog.deleteMany();
  await db.session.deleteMany();
  await db.user.deleteMany();
  clearLoginFailures('l@pos.com|1.1.1.1');
});

const ctx = { ip: '1.1.1.1', userAgent: 'jest' };

describe('attemptLogin', () => {
  it('éxito con credenciales correctas', async () => {
    await makeUser();
    const r = await attemptLogin({ email: 'l@pos.com', password: 'caballoAzul42', ...ctx });
    expect(r).toMatchObject({ ok: true, mustChangePassword: false });
    expect(await db.session.count()).toBe(1);
    expect(await db.activityLog.count({ where: { accion: 'auth.login' } })).toBe(1);
  });

  it('propaga mustChangePassword', async () => {
    await makeUser({ mustChangePassword: true });
    const r = await attemptLogin({ email: 'l@pos.com', password: 'caballoAzul42', ...ctx });
    expect(r).toMatchObject({ ok: true, mustChangePassword: true });
  });

  it('falla con contraseña incorrecta y audita auth.login_failed', async () => {
    await makeUser();
    const r = await attemptLogin({ email: 'l@pos.com', password: 'mala', ...ctx });
    expect(r).toEqual({ ok: false, reason: 'invalid' });
    expect(await db.activityLog.count({ where: { accion: 'auth.login_failed' } })).toBe(1);
  });

  it('falla con usuario inexistente sin lanzar', async () => {
    const r = await attemptLogin({ email: 'nadie@pos.com', password: 'x', ...ctx });
    expect(r).toEqual({ ok: false, reason: 'invalid' });
  });

  it('no crea sesión para usuario inactivo', async () => {
    await makeUser({ activo: false });
    const r = await attemptLogin({ email: 'l@pos.com', password: 'caballoAzul42', ...ctx });
    expect(r).toEqual({ ok: false, reason: 'invalid' });
    expect(await db.session.count()).toBe(0);
  });

  it('bloquea tras 5 fallos', async () => {
    await makeUser();
    for (let i = 0; i < 5; i++) await attemptLogin({ email: 'l@pos.com', password: 'mala', ...ctx });
    const r = await attemptLogin({ email: 'l@pos.com', password: 'caballoAzul42', ...ctx });
    expect(r).toMatchObject({ ok: false, reason: 'rate_limited' });
  });

  it('limpia el contador tras un login correcto', async () => {
    await makeUser();
    for (let i = 0; i < 3; i++) await attemptLogin({ email: 'l@pos.com', password: 'mala', ...ctx });
    await attemptLogin({ email: 'l@pos.com', password: 'caballoAzul42', ...ctx });
    // 3 fallos más no deben bloquear porque el contador se reseteó
    for (let i = 0; i < 3; i++) await attemptLogin({ email: 'l@pos.com', password: 'mala', ...ctx });
    const r = await attemptLogin({ email: 'l@pos.com', password: 'caballoAzul42', ...ctx });
    expect(r).toMatchObject({ ok: true });
  });
});
```

- [ ] **Step 2: Implementar `src/lib/auth/login.ts`**

```ts
import { db } from '@/lib/db';
import { verifyPassword } from './password';
import { createSession } from './session';
import { checkLoginRateLimit, recordLoginFailure, clearLoginFailures } from './rate-limit';
import { logActivity } from '@/lib/audit';

type Ctx = { email: string; password: string; ip: string | null; userAgent: string | null };
type Result =
  | { ok: true; token: string; mustChangePassword: boolean }
  | { ok: false; reason: 'invalid' | 'rate_limited'; retryAfterSec?: number };

export async function attemptLogin(input: Ctx): Promise<Result> {
  const email = input.email.trim().toLowerCase();
  const key = `${email}|${input.ip ?? 'sin-ip'}`;

  const rl = checkLoginRateLimit(key);
  if (rl.blocked) return { ok: false, reason: 'rate_limited', retryAfterSec: rl.retryAfterSec };

  const user = await db.user.findUnique({ where: { email } });
  const hash = user?.passwordHash ?? '$argon2id$v=19$m=19456,t=2,p=1$c2FsdHNhbHQ$aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
  const passwordOk = await verifyPassword(hash, input.password); // se ejecuta siempre (timing)

  if (!user || !user.activo || !passwordOk) {
    recordLoginFailure(key);
    await logActivity({ actorId: null, accion: 'auth.login_failed', ip: input.ip, metadata: { email } });
    return { ok: false, reason: 'invalid' };
  }

  clearLoginFailures(key);
  const { token } = await createSession(user.id, { ip: input.ip, userAgent: input.userAgent });
  await db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  await logActivity({ actorId: user.id, accion: 'auth.login', ip: input.ip });
  return { ok: true, token, mustChangePassword: user.mustChangePassword };
}
```

Run: `npm run test:integration -- login` → PASS.

- [ ] **Step 3: Implementar la UI de `/login`**

`src/app/(auth)/login/actions.ts`:

```ts
'use server';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { loginSchema } from '@/lib/validation/auth';
import { attemptLogin } from '@/lib/auth/login';
import { SESSION_COOKIE, SESSION_TTL_MS } from '@/lib/auth/session';
import { getClientIp } from '@/lib/http';
import type { FormState } from '@/app/(auth)/setup/actions';

export async function loginAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = loginSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, formError: 'Credenciales inválidas' };

  const h = await headers();
  const r = await attemptLogin({
    email: parsed.data.email, password: parsed.data.password,
    ip: getClientIp(h), userAgent: h.get('user-agent'),
  });

  if (!r.ok) {
    return {
      ok: false,
      formError: r.reason === 'rate_limited'
        ? `Demasiados intentos. Inténtalo de nuevo en ${Math.ceil((r.retryAfterSec ?? 0) / 60)} min.`
        : 'Credenciales inválidas',
    };
  }

  (await cookies()).set(SESSION_COOKIE, r.token, {
    httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: SESSION_TTL_MS / 1000,
  });
  redirect('/dashboard');
}
```

`src/app/(auth)/login/page.tsx` — server component: lee `searchParams.motivo` y muestra un aviso (`inactividad` → "Tu sesión se cerró por inactividad."; `sesion_cerrada` → "Tu sesión ha finalizado. Inicia sesión de nuevo."). Renderiza `<LoginForm />` (client, `useActionState(loginAction, {ok:false})`) con email, password, botón "Entrar", y el texto "¿Olvidaste tu contraseña? Contacta a un administrador para restablecerla."

- [ ] **Step 4: Verificar**

Run: `npm run test:unit && npm run test:integration && npm run build` → PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: flujo de login con rate limiting y auditoría"
```

---

## Task 11: Cambio de contraseña y logout

**Files:**
- Create: `src/app/(auth)/cambiar-password/page.tsx`, `.../actions.ts`, `.../ChangePasswordForm.tsx`
- Create: `src/lib/auth/change-password.ts`, `src/lib/auth/change-password.itest.ts`
- Create: `src/app/(app)/logout/route.ts` (o server action `logoutAction`)
- Create: `src/lib/auth/logout.ts`

**Interfaces:**
- Consumes: `changePasswordSchema` (T9), `verifyPassword`/`hashPassword`/`passwordPolicyError` (T3), `revokeAllForUser`/`revokeSessionByToken`/`SESSION_COOKIE` (T6), `getCurrentUser`/`requireUser` (T7), `logActivity` (T5), `db` (T2).
- Produces:
  - `change-password.ts`: `changePassword(input: { userId: string; currentPassword?: string; newPassword: string; requireCurrent: boolean; currentSessionId: string | null; ip: string | null }): Promise<void>` — si `requireCurrent`, valida `currentPassword`; aplica política; rehash; `mustChangePassword=false`; `revokeAllForUser(userId, currentSessionId)`; audita `auth.password_changed` con `{ forzado: !requireCurrent }`. Lanza `ValidationError` en fallos de entrada.
  - `logout.ts`: `logout(token: string | undefined, actorId: string | null, ip: string | null): Promise<void>` — `revokeSessionByToken`, audita `auth.logout`.
  - `logoutAction()` server action: hace `logout(...)`, borra cookie, `redirect('/login')`.

- [ ] **Step 1: Test de integración de `changePassword` (falla)**

Crear `src/lib/auth/change-password.itest.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '@/lib/db';
import { hashPassword, verifyPassword } from './password';
import { createSession, validateSession } from './session';
import { changePassword } from './change-password';
import { ValidationError } from '@/lib/errors';

async function makeUser(mustChange = false) {
  const role = await db.role.findFirstOrThrow({ where: { nombre: 'Cajero' } });
  return db.user.create({
    data: { nombre: 'C', email: `c${Math.random()}@pos.com`,
      passwordHash: await hashPassword('viejaClave12'), roleId: role.id, mustChangePassword: mustChange },
  });
}

beforeEach(async () => {
  await db.activityLog.deleteMany();
  await db.session.deleteMany();
  await db.user.deleteMany();
});

describe('changePassword', () => {
  it('flujo normal: exige la actual, rehash, limpia mustChangePassword', async () => {
    const u = await makeUser();
    await changePassword({
      userId: u.id, currentPassword: 'viejaClave12', newPassword: 'nuevaClave34',
      requireCurrent: true, currentSessionId: null, ip: null,
    });
    const after = await db.user.findUniqueOrThrow({ where: { id: u.id } });
    expect(await verifyPassword(after.passwordHash, 'nuevaClave34')).toBe(true);
    expect(after.mustChangePassword).toBe(false);
    const log = await db.activityLog.findFirst({ where: { accion: 'auth.password_changed' } });
    expect(log?.metadata).toMatchObject({ forzado: false });
  });

  it('rechaza si la contraseña actual es incorrecta', async () => {
    const u = await makeUser();
    await expect(changePassword({
      userId: u.id, currentPassword: 'mal', newPassword: 'nuevaClave34',
      requireCurrent: true, currentSessionId: null, ip: null,
    })).rejects.toBeInstanceOf(ValidationError);
  });

  it('flujo forzado: no exige la actual, forzado:true', async () => {
    const u = await makeUser(true);
    await changePassword({
      userId: u.id, newPassword: 'nuevaClave34',
      requireCurrent: false, currentSessionId: null, ip: null,
    });
    const log = await db.activityLog.findFirst({ where: { accion: 'auth.password_changed' } });
    expect(log?.metadata).toMatchObject({ forzado: true });
  });

  it('revoca las demás sesiones pero conserva la actual', async () => {
    const u = await makeUser();
    const keep = await createSession(u.id, {});
    const other = await createSession(u.id, {});
    const keepId = (await db.session.findFirstOrThrow({
      where: { tokenHash: (await import('./session')).hashToken(keep.token) },
    })).id;
    await changePassword({
      userId: u.id, currentPassword: 'viejaClave12', newPassword: 'nuevaClave34',
      requireCurrent: true, currentSessionId: keepId, ip: null,
    });
    expect((await validateSession(keep.token, 15)).status).toBe('ok');
    expect((await validateSession(other.token, 15)).status).toBe('invalid');
  });

  it('aplica la política de contraseña', async () => {
    const u = await makeUser();
    await expect(changePassword({
      userId: u.id, currentPassword: 'viejaClave12', newPassword: 'corta',
      requireCurrent: true, currentSessionId: null, ip: null,
    })).rejects.toBeInstanceOf(ValidationError);
  });
});
```

- [ ] **Step 2: Implementar `src/lib/auth/change-password.ts` y `src/lib/auth/logout.ts`**

```ts
// change-password.ts
import { db } from '@/lib/db';
import { hashPassword, verifyPassword, passwordPolicyError } from './password';
import { revokeAllForUser } from './session';
import { logActivity } from '@/lib/audit';
import { ValidationError } from '@/lib/errors';

export async function changePassword(input: {
  userId: string;
  currentPassword?: string;
  newPassword: string;
  requireCurrent: boolean;
  currentSessionId: string | null;
  ip: string | null;
}): Promise<void> {
  const user = await db.user.findUniqueOrThrow({ where: { id: input.userId } });

  if (input.requireCurrent) {
    if (!input.currentPassword || !(await verifyPassword(user.passwordHash, input.currentPassword)))
      throw new ValidationError({ currentPassword: 'La contraseña actual no es correcta.' });
  }

  const policy = passwordPolicyError(input.newPassword, user.email);
  if (policy) throw new ValidationError({ newPassword: policy });

  const passwordHash = await hashPassword(input.newPassword);
  await db.$transaction(async (tx) => {
    await tx.user.update({ where: { id: user.id }, data: { passwordHash, mustChangePassword: false } });
    await logActivity(
      { actorId: user.id, accion: 'auth.password_changed', ip: input.ip,
        metadata: { forzado: !input.requireCurrent } },
      tx,
    );
  });
  await revokeAllForUser(user.id, input.currentSessionId ?? undefined);
}
```

```ts
// logout.ts
import { revokeSessionByToken } from './session';
import { logActivity } from '@/lib/audit';

export async function logout(token: string | undefined, actorId: string | null, ip: string | null): Promise<void> {
  if (token) await revokeSessionByToken(token);
  await logActivity({ actorId, accion: 'auth.logout', ip });
}
```

Run: `npm run test:integration -- change-password` → PASS.

- [ ] **Step 3: UI de `/cambiar-password` + logout**

`src/app/(auth)/cambiar-password/actions.ts`:

```ts
'use server';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { changePasswordSchema } from '@/lib/validation/auth';
import { getCurrentUser } from '@/lib/auth/context';
import { changePassword } from '@/lib/auth/change-password';
import { validateSession, SESSION_COOKIE } from '@/lib/auth/session';
import { getIdleTimeoutMinutes } from '@/lib/settings';
import { getClientIp } from '@/lib/http';
import { ValidationError } from '@/lib/errors';
import { logout } from '@/lib/auth/logout';
import type { FormState } from '@/app/(auth)/setup/actions';

export async function changePasswordAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const parsed = changePasswordSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    const fe: Record<string, string> = {};
    for (const i of parsed.error.issues) fe[String(i.path[0])] = i.message;
    return { ok: false, fieldErrors: fe };
  }

  const h = await headers();
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const vs = await validateSession(token, await getIdleTimeoutMinutes());

  try {
    await changePassword({
      userId: user.id,
      currentPassword: parsed.data.currentPassword,
      newPassword: parsed.data.newPassword,
      requireCurrent: !user.mustChangePassword,
      currentSessionId: vs.session?.id ?? null,
      ip: getClientIp(h),
    });
  } catch (e) {
    if (e instanceof ValidationError) return { ok: false, fieldErrors: e.fields };
    throw e;
  }
  return { ok: true };
}

export async function logoutAction(): Promise<void> {
  const h = await headers();
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  const user = await getCurrentUser();
  await logout(token, user?.id ?? null, getClientIp(h));
  jar.delete(SESSION_COOKIE);
  redirect('/login');
}
```

`src/app/(auth)/cambiar-password/page.tsx` — server component: `const user = await getCurrentUser(); if (!user) redirect('/login')`. Pasa `forced={user.mustChangePassword}` al form. El form (client) muestra el campo "Contraseña actual" solo si `!forced`; en éxito (`state.ok`) muestra "Contraseña actualizada" y un enlace a `/dashboard`. Incluye `<PasswordStrengthMeter>` sobre `newPassword`.

- [ ] **Step 4: Verificar**

Run: `npm run test:unit && npm run test:integration && npm run build` → PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: cambio de contraseña (normal y forzado) y cierre de sesión"
```

---

## Task 12: Shell autenticado, navegación por permisos e inactividad

**Files:**
- Create: `src/app/(app)/layout.tsx`, `src/app/(app)/dashboard/page.tsx`
- Create: `src/components/PermissionGate.tsx`, `src/components/Sidebar.tsx`, `src/components/Topbar.tsx`
- Create: `src/components/InactivityWatcher.tsx`
- Create: `src/app/api/session/heartbeat/route.ts`, `src/app/api/session/heartbeat/route.itest.ts`
- Create: `src/lib/nav.ts`, `src/lib/nav.test.ts`

**Interfaces:**
- Consumes: `getCurrentUser` (T7), `can`/`PermissionKey` (T4), `getIdleTimeoutMinutes` (T6), `logoutAction` (T11), `touchSession`/`SESSION_COOKIE`/`validateSession` (T6).
- Produces:
  - `nav.ts`: `NAV_ITEMS: { href: string; label: string; permiso?: PermissionKey }[]`; `visibleNav(user): typeof NAV_ITEMS` — filtra por `can` (los `permiso: undefined` siempre visibles).
  - `PermissionGate.tsx`: server component `<PermissionGate permiso="x" user={user}>{children}</PermissionGate>` — renderiza children solo si `can(user, permiso)`.
  - `heartbeat/route.ts`: `POST` — lee cookie, `touchSession`, responde `{ ok: true, idleTimeoutMinutes }` o 401.
  - `InactivityWatcher.tsx`: client component. Props `{ idleTimeoutMinutes: number }`. Escucha `mousemove`/`keydown`/`click`/`scroll` (throttle 30s) → `POST /api/session/heartbeat`. A falta de 60s del timeout, muestra modal "Tu sesión se cerrará por inactividad" con cuenta atrás y botón "Seguir conectado" (llama heartbeat, cierra modal). Si llega a 0 → `window.location.href = '/login?motivo=inactividad'`.

- [ ] **Step 1: Test de `nav.ts` (falla)**

Crear `src/lib/nav.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { visibleNav, NAV_ITEMS } from './nav';
import type { AuthUser } from './auth/rbac';

const user = (perms: string[]): AuthUser => ({
  id: 'u', nombre: 'U', email: 'u@pos.com', roleId: 'r', roleName: 'R',
  permissions: new Set(perms), mustChangePassword: false,
});

describe('visibleNav', () => {
  it('siempre incluye los ítems sin permiso (Dashboard, Perfil)', () => {
    const hrefs = visibleNav(user([])).map((i) => i.href);
    expect(hrefs).toContain('/dashboard');
    expect(hrefs).toContain('/perfil');
  });
  it('oculta Usuarios sin usuarios.ver', () => {
    expect(visibleNav(user([])).some((i) => i.href === '/admin/usuarios')).toBe(false);
  });
  it('muestra Usuarios con usuarios.ver', () => {
    expect(visibleNav(user(['usuarios.ver'])).some((i) => i.href === '/admin/usuarios')).toBe(true);
  });
  it('NAV_ITEMS no tiene hrefs duplicados', () => {
    const h = NAV_ITEMS.map((i) => i.href);
    expect(new Set(h).size).toBe(h.length);
  });
});
```

- [ ] **Step 2: Implementar `src/lib/nav.ts`**

```ts
import { can, type AuthUser, type PermissionKey } from './auth/rbac';

export const NAV_ITEMS: { href: string; label: string; permiso?: PermissionKey }[] = [
  { href: '/dashboard', label: 'Inicio' },
  { href: '/admin/usuarios', label: 'Usuarios', permiso: 'usuarios.ver' },
  { href: '/admin/roles', label: 'Roles', permiso: 'roles.ver' },
  { href: '/admin/auditoria', label: 'Auditoría', permiso: 'auditoria.ver' },
  { href: '/admin/configuracion', label: 'Configuración', permiso: 'config.editar' },
  { href: '/perfil', label: 'Mi perfil' },
];

export function visibleNav(user: AuthUser) {
  return NAV_ITEMS.filter((i) => !i.permiso || can(user, i.permiso));
}
```

Run: `npm run test:unit -- nav` → PASS.

- [ ] **Step 3: Test de integración del heartbeat (falla)**

Crear `src/app/api/session/heartbeat/route.itest.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '@/lib/db';
import { hashPassword } from '@/lib/auth/password';
import { createSession, hashToken } from '@/lib/auth/session';
import { POST } from './route';

async function makeSession() {
  const role = await db.role.findFirstOrThrow({ where: { nombre: 'Cajero' } });
  const u = await db.user.create({
    data: { nombre: 'H', email: `h${Math.random()}@pos.com`, passwordHash: await hashPassword('xxxxxxxxxx'), roleId: role.id },
  });
  return createSession(u.id, {});
}

beforeEach(async () => {
  await db.session.deleteMany();
  await db.user.deleteMany();
});

describe('POST /api/session/heartbeat', () => {
  it('200 y toca la sesión con cookie válida', async () => {
    const { token } = await makeSession();
    // fuerza lastActivityAt viejo para que touchSession escriba
    await db.session.update({
      where: { tokenHash: hashToken(token) },
      data: { lastActivityAt: new Date(Date.now() - 5 * 60_000) },
    });
    const res = await POST(new Request('http://x/api/session/heartbeat', {
      method: 'POST', headers: { cookie: `pos_session=${token}` },
    }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ ok: true });
  });

  it('401 sin cookie', async () => {
    const res = await POST(new Request('http://x/api/session/heartbeat', { method: 'POST' }));
    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 4: Implementar `src/app/api/session/heartbeat/route.ts`**

```ts
import { NextResponse } from 'next/server';
import { SESSION_COOKIE, touchSession, validateSession } from '@/lib/auth/session';
import { getIdleTimeoutMinutes } from '@/lib/settings';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const token = req.headers.get('cookie')?.match(/pos_session=([^;]+)/)?.[1];
  const idle = await getIdleTimeoutMinutes();
  const vs = await validateSession(token, idle);
  if (vs.status !== 'ok') return NextResponse.json({ ok: false }, { status: 401 });
  await touchSession(token!);
  return NextResponse.json({ ok: true, idleTimeoutMinutes: idle });
}
```

Run: `npm run test:integration -- heartbeat` → PASS.

- [ ] **Step 5: Implementar el shell**

`src/components/PermissionGate.tsx`:

```tsx
import { can, type AuthUser, type PermissionKey } from '@/lib/auth/rbac';
export function PermissionGate(
  { permiso, user, children }: { permiso: PermissionKey; user: AuthUser | null; children: React.ReactNode },
) {
  return can(user, permiso) ? <>{children}</> : null;
}
```

`src/app/(app)/layout.tsx` — server component:

```tsx
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/context';
import { getIdleTimeoutMinutes } from '@/lib/settings';
import { Sidebar } from '@/components/Sidebar';
import { Topbar } from '@/components/Topbar';
import { InactivityWatcher } from '@/components/InactivityWatcher';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  const idle = await getIdleTimeoutMinutes();
  return (
    <div className="min-h-screen grid grid-cols-[240px_1fr] max-md:grid-cols-1">
      <Sidebar user={user} />
      <div className="flex flex-col">
        <Topbar user={user} />
        <main className="p-6">{children}</main>
      </div>
      <InactivityWatcher idleTimeoutMinutes={idle} />
    </div>
  );
}
```

`Sidebar.tsx` — usa `visibleNav(user)`, resalta la ruta activa (`usePathname` en un subcomponente client, o pasar `pathname` desde `headers().get('x-pathname')`). `Topbar.tsx` — nombre del usuario + menú con enlace a `/cambiar-password` y `<form action={logoutAction}><button>Cerrar sesión</button></form>`.

`InactivityWatcher.tsx` — client, según la spec del bloque Interfaces de esta tarea. Mantén el modal accesible (rol `dialog`, foco atrapado, `Esc` = "Seguir conectado").

`src/app/(app)/dashboard/page.tsx`:

```tsx
import { getCurrentUser } from '@/lib/auth/context';
export default async function Dashboard() {
  const user = await getCurrentUser();
  return <h1 className="text-xl font-semibold">Hola, {user?.nombre}</h1>;
}
```

- [ ] **Step 6: Verificar**

Run: `npm run test:unit && npm run test:integration && npm run build` → PASS.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: shell autenticado, navegación por permisos y vigilancia de inactividad"
```

---

## Task 13: Perfil, actividad propia y sesiones activas

**Files:**
- Create: `src/app/(app)/perfil/page.tsx`, `.../actions.ts`, `.../ProfileForm.tsx`, `.../SessionsList.tsx`
- Create: `src/app/(app)/perfil/actividad/page.tsx`
- Create: `src/lib/users/profile.ts`, `src/lib/users/profile.itest.ts`
- Create: `src/lib/activity/query.ts`, `src/lib/activity/query.itest.ts`
- Create: `src/lib/validation/user.ts`
- Create: `src/components/Pagination.tsx`

**Interfaces:**
- Consumes: `requireUser` (T7), `revokeSession`/`revokeAllForUser` (T6), `logActivity`/`actionLabel` (T5), `db` (T2).
- Produces:
  - `validation/user.ts`: `profileSchema` (nombre ≥2, telefono opcional `string().trim().max(30)`), `createUserSchema`, `editUserSchema` (Task 14 los usa también).
  - `profile.ts`: `updateOwnProfile(userId: string, input: { nombre: string; telefono?: string | null }, ip: string | null): Promise<void>` — update + audita `usuarios.editar` con `{ antes, despues, propio: true }`. `listUserSessions(userId: string): Promise<{ id: string; ip: string | null; userAgent: string | null; lastActivityAt: Date; createdAt: Date; actual: boolean }[]>` (recibe además el `currentSessionId` para marcar `actual`).
  - `activity/query.ts`: `queryActivity(filter: { actorId?: string; accion?: string; desde?: Date; hasta?: Date; page: number; pageSize: number }): Promise<{ rows: ActivityRow[]; total: number }>` donde `ActivityRow = { id: string; accion: string; accionLabel: string; actorNombre: string | null; entidad: string | null; entidadId: string | null; metadata: unknown; ip: string | null; createdAt: Date }`.

- [ ] **Step 1: Tests de integración (fallan)**

Crear `src/lib/users/profile.itest.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '@/lib/db';
import { hashPassword } from '@/lib/auth/password';
import { updateOwnProfile, listUserSessions } from './profile';
import { createSession } from '@/lib/auth/session';

async function makeUser() {
  const role = await db.role.findFirstOrThrow({ where: { nombre: 'Cajero' } });
  return db.user.create({
    data: { nombre: 'Pepe', email: `p${Math.random()}@pos.com`, passwordHash: await hashPassword('xxxxxxxxxx'), roleId: role.id },
  });
}

beforeEach(async () => {
  await db.activityLog.deleteMany();
  await db.session.deleteMany();
  await db.user.deleteMany();
});

describe('updateOwnProfile', () => {
  it('actualiza y audita con antes/después', async () => {
    const u = await makeUser();
    await updateOwnProfile(u.id, { nombre: 'Pepe Pérez', telefono: '600' }, '1.1.1.1');
    const after = await db.user.findUniqueOrThrow({ where: { id: u.id } });
    expect(after.nombre).toBe('Pepe Pérez');
    const log = await db.activityLog.findFirstOrThrow({ where: { accion: 'usuarios.editar' } });
    expect(log.metadata).toMatchObject({ antes: { nombre: 'Pepe' }, despues: { nombre: 'Pepe Pérez' }, propio: true });
  });
});

describe('listUserSessions', () => {
  it('marca la sesión actual', async () => {
    const u = await makeUser();
    const a = await createSession(u.id, { ip: '1.1.1.1' });
    const aId = (await db.session.findFirstOrThrow({
      where: { tokenHash: (await import('@/lib/auth/session')).hashToken(a.token) },
    })).id;
    await createSession(u.id, { ip: '2.2.2.2' });
    const list = await listUserSessions(u.id, aId);
    expect(list).toHaveLength(2);
    expect(list.find((s) => s.id === aId)?.actual).toBe(true);
  });
});
```

Crear `src/lib/activity/query.itest.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '@/lib/db';
import { logActivity } from '@/lib/audit';
import { queryActivity } from './query';

beforeEach(async () => {
  await db.activityLog.deleteMany();
  await db.user.deleteMany();
});

describe('queryActivity', () => {
  it('pagina y filtra por acción', async () => {
    for (let i = 0; i < 15; i++) await logActivity({ accion: 'auth.login' });
    await logActivity({ accion: 'auth.logout' });
    const p1 = await queryActivity({ accion: 'auth.login', page: 1, pageSize: 10 });
    expect(p1.rows).toHaveLength(10);
    expect(p1.total).toBe(15);
    const p2 = await queryActivity({ accion: 'auth.login', page: 2, pageSize: 10 });
    expect(p2.rows).toHaveLength(5);
  });

  it('incluye la etiqueta legible y el nombre del actor', async () => {
    const role = await db.role.findFirstOrThrow({ where: { nombre: 'Cajero' } });
    const u = await db.user.create({ data: { nombre: 'Zoe', email: 'z@pos.com', passwordHash: 'x', roleId: role.id } });
    await logActivity({ actorId: u.id, accion: 'auth.login' });
    const { rows } = await queryActivity({ page: 1, pageSize: 10 });
    expect(rows[0]).toMatchObject({ accionLabel: 'Inicio de sesión', actorNombre: 'Zoe' });
  });

  it('filtra por rango de fechas', async () => {
    await logActivity({ accion: 'auth.login' });
    const manana = new Date(Date.now() + 86_400_000);
    const { total } = await queryActivity({ desde: manana, page: 1, pageSize: 10 });
    expect(total).toBe(0);
  });
});
```

- [ ] **Step 2: Implementar `src/lib/validation/user.ts`, `src/lib/users/profile.ts`, `src/lib/activity/query.ts`**

`validation/user.ts`:

```ts
import { z } from 'zod';

export const profileSchema = z.object({
  nombre: z.string().trim().min(2, 'Mínimo 2 caracteres'),
  telefono: z.string().trim().max(30).optional().or(z.literal('')).transform((v) => (v ? v : null)),
});
export type ProfileInput = z.infer<typeof profileSchema>;

const rolePicker = z.string().min(1, 'Selecciona un rol');
export const createUserSchema = z.object({
  nombre: z.string().trim().min(2, 'Mínimo 2 caracteres'),
  email: z.string().trim().toLowerCase().email('Correo inválido'),
  telefono: z.string().trim().max(30).optional().or(z.literal('')).transform((v) => (v ? v : null)),
  roleId: rolePicker,
});
export type CreateUserInput = z.infer<typeof createUserSchema>;

export const editUserSchema = createUserSchema.extend({ id: z.string().min(1) });
export type EditUserInput = z.infer<typeof editUserSchema>;
```

`users/profile.ts`:

```ts
import { db } from '@/lib/db';
import { logActivity } from '@/lib/audit';

export async function updateOwnProfile(
  userId: string,
  input: { nombre: string; telefono?: string | null },
  ip: string | null,
): Promise<void> {
  const before = await db.user.findUniqueOrThrow({ where: { id: userId } });
  await db.$transaction(async (tx) => {
    await tx.user.update({ where: { id: userId }, data: { nombre: input.nombre, telefono: input.telefono ?? null } });
    await logActivity(
      { actorId: userId, accion: 'usuarios.editar', entidad: 'User', entidadId: userId,
        metadata: {
          propio: true,
          antes: { nombre: before.nombre, telefono: before.telefono },
          despues: { nombre: input.nombre, telefono: input.telefono ?? null },
        } },
      tx,
    );
  });
}

export async function listUserSessions(userId: string, currentSessionId: string | null) {
  const rows = await db.session.findMany({
    where: { userId, revokedAt: null },
    orderBy: { lastActivityAt: 'desc' },
  });
  return rows.map((s) => ({
    id: s.id, ip: s.ip, userAgent: s.userAgent,
    lastActivityAt: s.lastActivityAt, createdAt: s.createdAt,
    actual: s.id === currentSessionId,
  }));
}
```

`activity/query.ts`:

```ts
import { db } from '@/lib/db';
import { actionLabel } from '@/lib/audit';

export type ActivityRow = {
  id: string; accion: string; accionLabel: string; actorNombre: string | null;
  entidad: string | null; entidadId: string | null; metadata: unknown;
  ip: string | null; createdAt: Date;
};

export async function queryActivity(filter: {
  actorId?: string; accion?: string; desde?: Date; hasta?: Date; page: number; pageSize: number;
}): Promise<{ rows: ActivityRow[]; total: number }> {
  const where = {
    ...(filter.actorId ? { actorId: filter.actorId } : {}),
    ...(filter.accion ? { accion: filter.accion } : {}),
    ...(filter.desde || filter.hasta
      ? { createdAt: { ...(filter.desde ? { gte: filter.desde } : {}), ...(filter.hasta ? { lte: filter.hasta } : {}) } }
      : {}),
  };
  const [rows, total] = await Promise.all([
    db.activityLog.findMany({
      where, orderBy: { createdAt: 'desc' },
      skip: (filter.page - 1) * filter.pageSize, take: filter.pageSize,
      include: { actor: { select: { nombre: true } } },
    }),
    db.activityLog.count({ where }),
  ]);
  return {
    total,
    rows: rows.map((r) => ({
      id: r.id, accion: r.accion, accionLabel: actionLabel(r.accion),
      actorNombre: r.actor?.nombre ?? null, entidad: r.entidad, entidadId: r.entidadId,
      metadata: r.metadata, ip: r.ip, createdAt: r.createdAt,
    })),
  };
}
```

Run: `npm run test:integration -- profile query` → PASS.

- [ ] **Step 3: UI de perfil, sesiones y actividad**

`perfil/actions.ts`: `updateProfileAction` (`requireUser`, valida `profileSchema`, `updateOwnProfile`), `revokeMySessionAction(sessionId)` (`requireUser`; verifica que la sesión pertenece al usuario; `revokeSession`; audita `usuarios.sesiones_revocadas` con `{ objetivoUserId: user.id, cantidad: 1, propio: true }`), `revokeMyOtherSessionsAction()` (`revokeAllForUser(user.id, currentSessionId)` + audita con la cantidad).

`perfil/page.tsx` — server: `const user = await requireUser()`; obtiene `currentSessionId` vía `validateSession`; renderiza `<ProfileForm defaultValues={...} />`, botón "Cambiar contraseña" (link), y `<SessionsList sessions={await listUserSessions(user.id, currentSessionId)} />` con acciones de revocar. Email se muestra como solo lectura.

`perfil/actividad/page.tsx` — server: lee `searchParams` (`page`, `desde`, `hasta`), llama `queryActivity({ actorId: user.id, ... })`, pinta tabla (Acción, Fecha/hora, IP) + `<Pagination>`.

`components/Pagination.tsx` — recibe `page`, `pageSize`, `total`, `baseHref`; renderiza enlaces prev/next preservando query params.

- [ ] **Step 4: Verificar**

Run: `npm run test:unit && npm run test:integration && npm run build` → PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: perfil de usuario, sesiones activas e historial propio"
```

---

## Task 14: Administración de usuarios

**Files:**
- Create: `src/lib/users/admin.ts`, `src/lib/users/admin.itest.ts`
- Create: `src/lib/users/guards.ts`, `src/lib/users/guards.itest.ts`
- Create: `src/app/(app)/admin/usuarios/page.tsx`, `.../actions.ts`, `.../UserFormDialog.tsx`, `.../UserRow.tsx`
- Create: `src/app/(app)/admin/usuarios/[id]/page.tsx`
- Create: `src/components/DataTable.tsx`

**Interfaces:**
- Consumes: `requirePermission` (T7), `createUserSchema`/`editUserSchema` (T13), `hashPassword`/`generateTempPassword`/`passwordPolicyError` (T3), `revokeAllForUser` (T6), `logActivity` (T5), `MANAGER_GUARD_PERMISSIONS` (T4), `db` (T2).
- Produces:
  - `guards.ts`:
    - `roleHasAllGuardPermissions(roleId: string, tx?): Promise<boolean>` — el rol tiene TODOS los de `MANAGER_GUARD_PERMISSIONS`.
    - `countActiveGuardUsers(excludeUserId?: string, tx?): Promise<number>` — usuarios activos cuyo rol cumple el guard.
    - `assertGuardPreserved(opts: { excludeUserId?: string; prospectiveRoleId?: string; deactivating?: boolean }, tx?): Promise<void>` — lanza `ValidationError` si la operación dejaría el sistema con 0 usuarios-guardián. `prospectiveRoleId` simula un cambio de rol del `excludeUserId`.
  - `admin.ts`:
    - `listUsers(filter: { q?: string; roleId?: string; estado?: 'activos'|'inactivos'|'todos'; page: number; pageSize: number }): Promise<{ rows: UserListRow[]; total: number }>`.
    - `createUser(actorId: string, input: CreateUserInput, ip: string | null): Promise<{ userId: string; tempPassword: string }>`.
    - `updateUser(actorId: string, input: EditUserInput, ip: string | null): Promise<void>` — audita `usuarios.editar` (campos) y, si cambió el rol, además `usuarios.rol_cambiado`.
    - `setUserActive(actorId: string, targetId: string, activo: boolean, ip: string | null): Promise<void>` — al desactivar: `assertGuardPreserved`, `revokeAllForUser(targetId)`, audita `usuarios.desactivar`; al activar: audita `usuarios.activar`.
    - `resetUserPassword(actorId: string, targetId: string, motivo: string, ip: string | null): Promise<{ tempPassword: string }>` — set hash temporal, `mustChangePassword=true`, `revokeAllForUser(targetId)`, audita `usuarios.reset_password` con `{ motivo }`.
    - `adminRevokeUserSessions(actorId: string, targetId: string, ip: string | null): Promise<number>` — `revokeAllForUser`, audita `usuarios.sesiones_revocadas` con `{ objetivoUserId: targetId, cantidad }`.
  - `UserListRow = { id: string; nombre: string; email: string; roleNombre: string; activo: boolean; lastLoginAt: Date | null }`.

- [ ] **Step 1: Tests de `guards.ts` (fallan)**

Crear `src/lib/users/guards.itest.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '@/lib/db';
import { hashPassword } from '@/lib/auth/password';
import { assertGuardPreserved, countActiveGuardUsers } from './guards';
import { ValidationError } from '@/lib/errors';

async function user(roleName: string, activo = true) {
  const role = await db.role.findFirstOrThrow({ where: { nombre: roleName } });
  return db.user.create({
    data: { nombre: roleName, email: `${roleName}-${Math.random()}@pos.com`,
      passwordHash: await hashPassword('xxxxxxxxxx'), roleId: role.id, activo },
  });
}

beforeEach(async () => {
  await db.session.deleteMany();
  await db.user.deleteMany();
});

describe('guardianes del sistema', () => {
  it('cuenta al Administrador activo como guardián', async () => {
    await user('Administrador');
    expect(await countActiveGuardUsers()).toBe(1);
  });

  it('assertGuardPreserved lanza si desactivar deja 0 guardianes', async () => {
    const admin = await user('Administrador');
    await expect(assertGuardPreserved({ excludeUserId: admin.id, deactivating: true }))
      .rejects.toBeInstanceOf(ValidationError);
  });

  it('no lanza si queda otro Administrador activo', async () => {
    const a1 = await user('Administrador');
    await user('Administrador');
    await expect(assertGuardPreserved({ excludeUserId: a1.id, deactivating: true })).resolves.toBeUndefined();
  });

  it('lanza si cambiar el rol del único Administrador a Cajero rompe el guard', async () => {
    const admin = await user('Administrador');
    const cajero = await db.role.findFirstOrThrow({ where: { nombre: 'Cajero' } });
    await expect(assertGuardPreserved({ excludeUserId: admin.id, prospectiveRoleId: cajero.id }))
      .rejects.toBeInstanceOf(ValidationError);
  });
});
```

- [ ] **Step 2: Implementar `src/lib/users/guards.ts`**

```ts
import type { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { MANAGER_GUARD_PERMISSIONS } from '@/lib/auth/rbac';
import { ValidationError } from '@/lib/errors';

type Client = Prisma.TransactionClient | typeof db;

export async function roleHasAllGuardPermissions(roleId: string, tx: Client = db): Promise<boolean> {
  const count = await tx.rolePermission.count({
    where: { roleId, permiso: { in: [...MANAGER_GUARD_PERMISSIONS] } },
  });
  return count === MANAGER_GUARD_PERMISSIONS.length;
}

export async function countActiveGuardUsers(excludeUserId?: string, tx: Client = db): Promise<number> {
  const users = await tx.user.findMany({
    where: { activo: true, ...(excludeUserId ? { id: { not: excludeUserId } } : {}) },
    select: { roleId: true },
  });
  const guardRoleIds = new Set<string>();
  for (const roleId of new Set(users.map((u) => u.roleId))) {
    if (await roleHasAllGuardPermissions(roleId, tx)) guardRoleIds.add(roleId);
  }
  return users.filter((u) => guardRoleIds.has(u.roleId)).length;
}

export async function assertGuardPreserved(
  opts: { excludeUserId?: string; prospectiveRoleId?: string; deactivating?: boolean },
  tx: Client = db,
): Promise<void> {
  let remaining = await countActiveGuardUsers(opts.excludeUserId, tx);
  if (!opts.deactivating && opts.prospectiveRoleId && opts.excludeUserId) {
    if (await roleHasAllGuardPermissions(opts.prospectiveRoleId, tx)) remaining += 1;
  }
  if (remaining < 1) {
    throw new ValidationError(
      { _form: 'Esta acción dejaría al sistema sin ningún administrador con permisos de gestión.' },
      'Guardián del sistema requerido',
    );
  }
}
```

Run: `npm run test:integration -- guards` → PASS.

- [ ] **Step 3: Tests de `admin.ts` (fallan)**

Crear `src/lib/users/admin.itest.ts` — cubre:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '@/lib/db';
import { hashPassword, verifyPassword } from '@/lib/auth/password';
import { createSession, validateSession } from '@/lib/auth/session';
import {
  listUsers, createUser, updateUser, setUserActive, resetUserPassword, adminRevokeUserSessions,
} from './admin';
import { ValidationError } from '@/lib/errors';

let adminId: string;
async function roleId(nombre: string) {
  return (await db.role.findFirstOrThrow({ where: { nombre } })).id;
}

beforeEach(async () => {
  await db.activityLog.deleteMany();
  await db.session.deleteMany();
  await db.user.deleteMany();
  const admin = await db.user.create({
    data: { nombre: 'Admin', email: 'admin@pos.com', passwordHash: await hashPassword('xxxxxxxxxx'),
      roleId: await roleId('Administrador') },
  });
  adminId = admin.id;
});

describe('createUser', () => {
  it('crea usuario con contraseña temporal y mustChangePassword', async () => {
    const { userId, tempPassword } = await createUser(
      adminId, { nombre: 'Nuevo', email: 'nuevo@pos.com', telefono: null, roleId: await roleId('Cajero') }, null,
    );
    const u = await db.user.findUniqueOrThrow({ where: { id: userId } });
    expect(u.mustChangePassword).toBe(true);
    expect(await verifyPassword(u.passwordHash, tempPassword)).toBe(true);
    const log = await db.activityLog.findFirstOrThrow({ where: { accion: 'usuarios.crear', entidadId: userId } });
    expect(log.metadata).toMatchObject({ email: 'nuevo@pos.com', rol: 'Cajero' });
  });

  it('rechaza email duplicado con ValidationError', async () => {
    await expect(createUser(
      adminId, { nombre: 'X', email: 'admin@pos.com', telefono: null, roleId: await roleId('Cajero') }, null,
    )).rejects.toBeInstanceOf(ValidationError);
  });
});

describe('updateUser', () => {
  it('audita rol_cambiado cuando cambia el rol', async () => {
    const { userId } = await createUser(adminId, { nombre: 'R', email: 'r@pos.com', telefono: null, roleId: await roleId('Cajero') }, null);
    await updateUser(adminId, { id: userId, nombre: 'R', email: 'r@pos.com', telefono: null, roleId: await roleId('Gerente') }, null);
    expect(await db.activityLog.count({ where: { accion: 'usuarios.rol_cambiado', entidadId: userId } })).toBe(1);
  });

  it('impide bajar de rol al último Administrador', async () => {
    await expect(updateUser(
      adminId, { id: adminId, nombre: 'Admin', email: 'admin@pos.com', telefono: null, roleId: await roleId('Cajero') }, null,
    )).rejects.toBeInstanceOf(ValidationError);
  });
});

describe('setUserActive', () => {
  it('desactivar revoca sesiones y audita', async () => {
    const { userId } = await createUser(adminId, { nombre: 'D', email: 'd@pos.com', telefono: null, roleId: await roleId('Cajero') }, null);
    const s = await createSession(userId, {});
    await setUserActive(adminId, userId, false, null);
    expect((await db.user.findUniqueOrThrow({ where: { id: userId } })).activo).toBe(false);
    expect((await validateSession(s.token, 15)).status).toBe('invalid');
    expect(await db.activityLog.count({ where: { accion: 'usuarios.desactivar', entidadId: userId } })).toBe(1);
  });

  it('no permite auto-desactivarse', async () => {
    await expect(setUserActive(adminId, adminId, false, null)).rejects.toBeInstanceOf(ValidationError);
  });

  it('no permite desactivar al último Administrador', async () => {
    const other = await createUser(adminId, { nombre: 'O', email: 'o@pos.com', telefono: null, roleId: await roleId('Cajero') }, null);
    await expect(setUserActive(other.userId, adminId, false, null)).rejects.toBeInstanceOf(ValidationError);
  });
});

describe('resetUserPassword', () => {
  it('genera temporal, fuerza cambio, revoca sesiones y audita el motivo', async () => {
    const { userId } = await createUser(adminId, { nombre: 'P', email: 'p@pos.com', telefono: null, roleId: await roleId('Cajero') }, null);
    const s = await createSession(userId, {});
    const { tempPassword } = await resetUserPassword(adminId, userId, 'olvidó su contraseña', null);
    const u = await db.user.findUniqueOrThrow({ where: { id: userId } });
    expect(u.mustChangePassword).toBe(true);
    expect(await verifyPassword(u.passwordHash, tempPassword)).toBe(true);
    expect((await validateSession(s.token, 15)).status).toBe('invalid');
    const log = await db.activityLog.findFirstOrThrow({ where: { accion: 'usuarios.reset_password', entidadId: userId } });
    expect(log.metadata).toMatchObject({ motivo: 'olvidó su contraseña' });
  });
});

describe('listUsers', () => {
  it('filtra por búsqueda y estado', async () => {
    await createUser(adminId, { nombre: 'Zoraida', email: 'zoraida@pos.com', telefono: null, roleId: await roleId('Cajero') }, null);
    const r = await listUsers({ q: 'zora', estado: 'todos', page: 1, pageSize: 10 });
    expect(r.rows.map((x) => x.email)).toContain('zoraida@pos.com');
  });
});
```

- [ ] **Step 4: Implementar `src/lib/users/admin.ts`**

Puntos clave de la implementación (todas las funciones auditan dentro de `db.$transaction` y usan las guardas):

```ts
import { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { hashPassword, generateTempPassword } from '@/lib/auth/password';
import { revokeAllForUser } from '@/lib/auth/session';
import { logActivity } from '@/lib/audit';
import { ValidationError } from '@/lib/errors';
import { assertGuardPreserved } from './guards';
import type { CreateUserInput, EditUserInput } from '@/lib/validation/user';

export type UserListRow = {
  id: string; nombre: string; email: string; roleNombre: string; activo: boolean; lastLoginAt: Date | null;
};

export async function listUsers(filter: {
  q?: string; roleId?: string; estado?: 'activos' | 'inactivos' | 'todos'; page: number; pageSize: number;
}): Promise<{ rows: UserListRow[]; total: number }> {
  const where: Prisma.UserWhereInput = {
    ...(filter.roleId ? { roleId: filter.roleId } : {}),
    ...(filter.estado === 'inactivos' ? { activo: false } : filter.estado === 'todos' ? {} : { activo: true }),
    ...(filter.q
      ? { OR: [{ nombre: { contains: filter.q, mode: 'insensitive' } }, { email: { contains: filter.q, mode: 'insensitive' } }] }
      : {}),
  };
  const [rows, total] = await Promise.all([
    db.user.findMany({
      where, orderBy: { nombre: 'asc' },
      skip: (filter.page - 1) * filter.pageSize, take: filter.pageSize,
      include: { role: { select: { nombre: true } } },
    }),
    db.user.count({ where }),
  ]);
  return {
    total,
    rows: rows.map((u) => ({
      id: u.id, nombre: u.nombre, email: u.email, roleNombre: u.role.nombre,
      activo: u.activo, lastLoginAt: u.lastLoginAt,
    })),
  };
}

export async function createUser(actorId: string, input: CreateUserInput, ip: string | null) {
  const tempPassword = generateTempPassword();
  const passwordHash = await hashPassword(tempPassword);
  try {
    const userId = await db.$transaction(async (tx) => {
      const role = await tx.role.findUniqueOrThrow({ where: { id: input.roleId } });
      const user = await tx.user.create({
        data: {
          nombre: input.nombre, email: input.email, telefono: input.telefono ?? null,
          passwordHash, roleId: input.roleId, mustChangePassword: true, createdById: actorId,
        },
      });
      await logActivity(
        { actorId, accion: 'usuarios.crear', entidad: 'User', entidadId: user.id,
          metadata: { nombre: user.nombre, email: user.email, telefono: user.telefono, rol: role.nombre } },
        tx,
      );
      return user.id;
    });
    return { userId, tempPassword };
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')
      throw new ValidationError({ email: 'Ya existe un usuario con ese correo.' });
    throw e;
  }
}

export async function updateUser(actorId: string, input: EditUserInput, ip: string | null): Promise<void> {
  await db.$transaction(async (tx) => {
    const before = await tx.user.findUniqueOrThrow({ where: { id: input.id }, include: { role: true } });
    if (before.roleId !== input.roleId) {
      await assertGuardPreserved({ excludeUserId: input.id, prospectiveRoleId: input.roleId }, tx);
    }
    let newRole = before.role;
    if (before.roleId !== input.roleId) newRole = await tx.role.findUniqueOrThrow({ where: { id: input.roleId } });

    try {
      await tx.user.update({
        where: { id: input.id },
        data: { nombre: input.nombre, email: input.email, telefono: input.telefono ?? null, roleId: input.roleId },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')
        throw new ValidationError({ email: 'Ya existe un usuario con ese correo.' });
      throw e;
    }

    const camposAntes: Record<string, unknown> = {};
    const camposDespues: Record<string, unknown> = {};
    for (const k of ['nombre', 'email', 'telefono'] as const) {
      if ((before as any)[k] !== (input as any)[k]) { camposAntes[k] = (before as any)[k]; camposDespues[k] = (input as any)[k] ?? null; }
    }
    if (Object.keys(camposDespues).length) {
      await logActivity(
        { actorId, accion: 'usuarios.editar', entidad: 'User', entidadId: input.id,
          metadata: { antes: camposAntes, despues: camposDespues } }, tx,
      );
    }
    if (before.roleId !== input.roleId) {
      await logActivity(
        { actorId, accion: 'usuarios.rol_cambiado', entidad: 'User', entidadId: input.id,
          metadata: { rolAntes: before.role.nombre, rolDespues: newRole.nombre } }, tx,
      );
    }
  });
}

export async function setUserActive(actorId: string, targetId: string, activo: boolean, ip: string | null): Promise<void> {
  if (!activo && actorId === targetId)
    throw new ValidationError({ _form: 'No puedes desactivar tu propia cuenta.' });
  await db.$transaction(async (tx) => {
    if (!activo) await assertGuardPreserved({ excludeUserId: targetId, deactivating: true }, tx);
    await tx.user.update({ where: { id: targetId }, data: { activo } });
    await logActivity(
      { actorId, accion: activo ? 'usuarios.activar' : 'usuarios.desactivar', entidad: 'User', entidadId: targetId, ip },
      tx,
    );
  });
  if (!activo) await revokeAllForUser(targetId);
}

export async function resetUserPassword(actorId: string, targetId: string, motivo: string, ip: string | null) {
  if (!motivo.trim()) throw new ValidationError({ motivo: 'Indica el motivo del restablecimiento.' });
  const tempPassword = generateTempPassword();
  const passwordHash = await hashPassword(tempPassword);
  await db.$transaction(async (tx) => {
    await tx.user.update({ where: { id: targetId }, data: { passwordHash, mustChangePassword: true } });
    await logActivity(
      { actorId, accion: 'usuarios.reset_password', entidad: 'User', entidadId: targetId, ip, metadata: { motivo } },
      tx,
    );
  });
  await revokeAllForUser(targetId);
  return { tempPassword };
}

export async function adminRevokeUserSessions(actorId: string, targetId: string, ip: string | null): Promise<number> {
  const cantidad = await revokeAllForUser(targetId);
  await logActivity({
    actorId, accion: 'usuarios.sesiones_revocadas', entidad: 'User', entidadId: targetId, ip,
    metadata: { objetivoUserId: targetId, cantidad },
  });
  return cantidad;
}
```

Run: `npm run test:integration -- users/admin` → PASS.

- [ ] **Step 5: UI de `/admin/usuarios`**

`admin/usuarios/actions.ts` — cada acción: `const actor = await requirePermission('usuarios.XXX')`, valida con Zod, llama a la función de `admin.ts`, captura `ValidationError` → `FormState`, en éxito hace `revalidatePath('/admin/usuarios')`. `createUserAction` / `resetPasswordAction` devuelven `{ ok: true, tempPassword }` para que la UI la muestre una sola vez en un diálogo con botón "Copiar".

`admin/usuarios/page.tsx` — server: `await requirePermission('usuarios.ver')`; lee `searchParams` (`q`, `rol`, `estado`, `page`); `listUsers(...)`; `<DataTable>` con columnas Nombre, Email, Rol, Estado (badge), Último acceso; botón "Crear usuario" (abre `<UserFormDialog>` client) visible con `PermissionGate permiso="usuarios.crear"`. Cada fila enlaza a `/admin/usuarios/[id]`.

`admin/usuarios/[id]/page.tsx` — server: `requirePermission('usuarios.ver')`; muestra datos; formularios de Editar (`PermissionGate usuarios.editar`), Activar/Desactivar (oculto si `id === actor.id`), Restablecer contraseña con campo motivo (`PermissionGate usuarios.reset_password`), y "Cerrar todas las sesiones" (`PermissionGate usuarios.editar`). Los diálogos de contraseña temporal muestran el valor una vez.

`components/DataTable.tsx` — tabla genérica: `columns: { key; header; render? }[]`, `rows`, responsive (scroll horizontal en móvil, `min-w` en `<table>`).

- [ ] **Step 6: Verificar**

Run: `npm run test:unit && npm run test:integration && npm run build` → PASS.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: administración de usuarios (alta, edición, baja, reset, guardas de sistema)"
```

---

## Task 15: Administración de roles y permisos

**Files:**
- Create: `src/lib/roles/admin.ts`, `src/lib/roles/admin.itest.ts`
- Create: `src/lib/validation/role.ts`
- Create: `src/app/(app)/admin/roles/page.tsx`, `.../actions.ts`, `.../[id]/page.tsx`, `.../RoleForm.tsx`, `.../PermissionChecklist.tsx`

**Interfaces:**
- Consumes: `requirePermission` (T7), `PERMISSIONS`/`ALL_PERMISSION_KEYS`/`ADMIN_LOCKED_PERMISSIONS`/`MANAGER_GUARD_PERMISSIONS` (T4), `assertGuardPreserved`... (usaremos una variante), `logActivity` (T5), `db` (T2).
- Produces:
  - `validation/role.ts`: `roleSchema` (`nombre` trim min 2, `descripcion` opcional, `permisos: z.array(z.string())` — se filtran contra `ALL_PERMISSION_KEYS` en el server).
  - `roles/admin.ts`:
    - `listRoles(): Promise<{ id: string; nombre: string; descripcion: string | null; esSistema: boolean; usuarios: number; permisos: string[] }[]>`.
    - `getRole(id: string)` → mismo shape que un elemento de `listRoles` o `null`.
    - `createRole(actorId, input: { nombre: string; descripcion?: string | null; permisos: string[] }, ip): Promise<{ id: string }>` — permisos saneados; audita `roles.crear` con `{ despues: { nombre, permisos } }`.
    - `updateRole(actorId, id, input, ip): Promise<void>` — reglas:
      - Rol Administrador: no se pueden retirar `ADMIN_LOCKED_PERMISSIONS` (se re-añaden silenciosamente); no se puede renombrar (`esSistema`).
      - Si el rol es de un guardián y el nuevo set de permisos deja de tener TODOS los `MANAGER_GUARD_PERMISSIONS` y hay usuarios activos con ese rol y no queda otro guardián → `ValidationError`.
      - `esSistema`: se permite editar permisos y descripción, no el `nombre`.
      - Audita `roles.editar` con `{ antes: { permisos }, despues: { permisos } , nombreAntes, nombreDespues }`.
    - `deleteRole(actorId, id, ip): Promise<void>` — `ValidationError` si `esSistema` o si tiene usuarios; audita `roles.borrar` con `{ nombre, permisos }`.

- [ ] **Step 1: Tests (fallan)**

Crear `src/lib/roles/admin.itest.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '@/lib/db';
import { hashPassword } from '@/lib/auth/password';
import { listRoles, createRole, updateRole, deleteRole } from './admin';
import { ValidationError } from '@/lib/errors';
import { ADMIN_LOCKED_PERMISSIONS } from '@/lib/auth/rbac';

let actorId: string;
beforeEach(async () => {
  await db.activityLog.deleteMany();
  await db.user.deleteMany();
  await db.rolePermission.deleteMany({ where: { role: { esSistema: false } } });
  await db.role.deleteMany({ where: { esSistema: false } });
  const admin = await db.role.findFirstOrThrow({ where: { nombre: 'Administrador' } });
  actorId = (await db.user.create({
    data: { nombre: 'A', email: 'a@pos.com', passwordHash: await hashPassword('xxxxxxxxxx'), roleId: admin.id },
  })).id;
});

describe('createRole', () => {
  it('crea un rol con permisos saneados', async () => {
    const { id } = await createRole(actorId, { nombre: 'Supervisor', permisos: ['usuarios.ver', 'inventado.xxx'] }, null);
    const r = (await listRoles()).find((x) => x.id === id)!;
    expect(r.permisos).toEqual(['usuarios.ver']);
    expect(await db.activityLog.count({ where: { accion: 'roles.crear' } })).toBe(1);
  });
  it('rechaza nombre duplicado', async () => {
    await createRole(actorId, { nombre: 'Supervisor', permisos: [] }, null);
    await expect(createRole(actorId, { nombre: 'Supervisor', permisos: [] }, null)).rejects.toBeInstanceOf(ValidationError);
  });
});

describe('updateRole', () => {
  it('no permite quitar los permisos blindados del Administrador', async () => {
    const admin = await db.role.findFirstOrThrow({ where: { nombre: 'Administrador' } });
    await updateRole(actorId, admin.id, { nombre: 'Administrador', permisos: ['usuarios.ver'] }, null);
    const after = await db.rolePermission.findMany({ where: { roleId: admin.id } });
    for (const p of ADMIN_LOCKED_PERMISSIONS) expect(after.map((x) => x.permiso)).toContain(p);
  });

  it('no permite renombrar un rol de sistema', async () => {
    const cajero = await db.role.findFirstOrThrow({ where: { nombre: 'Cajero' } });
    await expect(updateRole(actorId, cajero.id, { nombre: 'Caja', permisos: [] }, null))
      .rejects.toBeInstanceOf(ValidationError);
  });

  it('bloquea dejar al sistema sin guardián al editar el rol del único admin', async () => {
    // el único usuario guardián es actorId con rol Administrador; si le quitamos roles.gestionar del rol...
    const admin = await db.role.findFirstOrThrow({ where: { nombre: 'Administrador' } });
    // permisos = todos menos roles.gestionar y usuarios.editar → seguirían blindados y re-añadidos,
    // así que este test valida un rol NO-admin: creamos guardián alterno
    const custom = await createRole(actorId, { nombre: 'Gestor', permisos: ['roles.gestionar', 'usuarios.editar'] }, null);
    await db.user.update({ where: { id: actorId }, data: { roleId: custom.id } });
    await expect(updateRole(actorId, custom.id, { nombre: 'Gestor', permisos: ['usuarios.ver'] }, null))
      .rejects.toBeInstanceOf(ValidationError);
  });
});

describe('deleteRole', () => {
  it('no borra un rol de sistema', async () => {
    const cajero = await db.role.findFirstOrThrow({ where: { nombre: 'Cajero' } });
    await expect(deleteRole(actorId, cajero.id, null)).rejects.toBeInstanceOf(ValidationError);
  });
  it('no borra un rol con usuarios', async () => {
    const { id } = await createRole(actorId, { nombre: 'ConGente', permisos: [] }, null);
    await db.user.update({ where: { id: actorId }, data: { roleId: id } });
    await expect(deleteRole(actorId, id, null)).rejects.toBeInstanceOf(ValidationError);
  });
  it('borra un rol vacío y audita', async () => {
    const { id } = await createRole(actorId, { nombre: 'Vacio', permisos: [] }, null);
    await deleteRole(actorId, id, null);
    expect(await db.role.findUnique({ where: { id } })).toBeNull();
    expect(await db.activityLog.count({ where: { accion: 'roles.borrar' } })).toBe(1);
  });
});
```

- [ ] **Step 2: Implementar `src/lib/validation/role.ts` y `src/lib/roles/admin.ts`**

`validation/role.ts`:

```ts
import { z } from 'zod';
export const roleSchema = z.object({
  nombre: z.string().trim().min(2, 'Mínimo 2 caracteres'),
  descripcion: z.string().trim().max(200).optional().or(z.literal('')).transform((v) => (v ? v : null)),
  permisos: z.array(z.string()).default([]),
});
export type RoleInput = z.infer<typeof roleSchema>;
```

`roles/admin.ts` — implementación (resumen de reglas ya en Interfaces):

```ts
import { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import {
  ALL_PERMISSION_KEYS, ADMIN_LOCKED_PERMISSIONS, MANAGER_GUARD_PERMISSIONS,
} from '@/lib/auth/rbac';
import { logActivity } from '@/lib/audit';
import { ValidationError } from '@/lib/errors';

const VALID = new Set<string>(ALL_PERMISSION_KEYS);
const sanitize = (perms: string[]) => [...new Set(perms.filter((p) => VALID.has(p)))];

export async function listRoles() {
  const roles = await db.role.findMany({
    orderBy: [{ esSistema: 'desc' }, { nombre: 'asc' }],
    include: { permissions: true, _count: { select: { users: true } } },
  });
  return roles.map((r) => ({
    id: r.id, nombre: r.nombre, descripcion: r.descripcion, esSistema: r.esSistema,
    usuarios: r._count.users, permisos: r.permissions.map((p) => p.permiso).sort(),
  }));
}

export async function getRole(id: string) {
  return (await listRoles()).find((r) => r.id === id) ?? null;
}

async function setPermissions(tx: Prisma.TransactionClient, roleId: string, permisos: string[]) {
  await tx.rolePermission.deleteMany({ where: { roleId } });
  if (permisos.length)
    await tx.rolePermission.createMany({ data: permisos.map((permiso) => ({ roleId, permiso })) });
}

export async function createRole(
  actorId: string, input: { nombre: string; descripcion?: string | null; permisos: string[] }, ip: string | null,
) {
  const permisos = sanitize(input.permisos);
  try {
    return await db.$transaction(async (tx) => {
      const role = await tx.role.create({ data: { nombre: input.nombre, descripcion: input.descripcion ?? null, esSistema: false } });
      await setPermissions(tx, role.id, permisos);
      await logActivity(
        { actorId, accion: 'roles.crear', entidad: 'Role', entidadId: role.id, ip,
          metadata: { despues: { nombre: role.nombre, permisos } } }, tx,
      );
      return { id: role.id };
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')
      throw new ValidationError({ nombre: 'Ya existe un rol con ese nombre.' });
    throw e;
  }
}

export async function updateRole(
  actorId: string, id: string, input: { nombre: string; descripcion?: string | null; permisos: string[] }, ip: string | null,
) {
  await db.$transaction(async (tx) => {
    const role = await tx.role.findUniqueOrThrow({ where: { id }, include: { permissions: true, _count: { select: { users: true } } } });
    let permisos = sanitize(input.permisos);
    const antes = role.permissions.map((p) => p.permiso).sort();

    if (role.nombre === 'Administrador') {
      for (const p of ADMIN_LOCKED_PERMISSIONS) if (!permisos.includes(p)) permisos.push(p);
    }
    if (role.esSistema && input.nombre.trim() !== role.nombre)
      throw new ValidationError({ nombre: 'No se puede renombrar un rol de sistema.' });

    // guardián del sistema
    const eraGuardian = MANAGER_GUARD_PERMISSIONS.every((p) => antes.includes(p));
    const seguiraGuardian = MANAGER_GUARD_PERMISSIONS.every((p) => permisos.includes(p));
    if (eraGuardian && !seguiraGuardian && role._count.users > 0) {
      const otrosGuardianes = await tx.user.count({
        where: {
          activo: true, roleId: { not: id },
          role: { permissions: { some: {} } },
        },
      });
      // recuento fino: ¿algún otro rol con usuarios activos cumple el guard?
      const rolesConGuard = await tx.role.findMany({
        where: { id: { not: id }, permissions: { some: { permiso: { in: [...MANAGER_GUARD_PERMISSIONS] } } } },
        include: { permissions: true, _count: { select: { users: { where: { activo: true } } } } },
      });
      const hayOtro = rolesConGuard.some(
        (r) => r._count.users > 0 && MANAGER_GUARD_PERMISSIONS.every((p) => r.permissions.some((x) => x.permiso === p)),
      );
      void otrosGuardianes;
      if (!hayOtro)
        throw new ValidationError({ _form: 'Esta edición dejaría al sistema sin un administrador con permisos de gestión.' });
    }

    const nombreFinal = role.esSistema ? role.nombre : input.nombre.trim();
    try {
      await tx.role.update({ where: { id }, data: { nombre: nombreFinal, descripcion: input.descripcion ?? null } });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')
        throw new ValidationError({ nombre: 'Ya existe un rol con ese nombre.' });
      throw e;
    }
    await setPermissions(tx, id, permisos);
    await logActivity(
      { actorId, accion: 'roles.editar', entidad: 'Role', entidadId: id, ip,
        metadata: { nombreAntes: role.nombre, nombreDespues: nombreFinal, antes: { permisos: antes }, despues: { permisos: permisos.sort() } } },
      tx,
    );
  });
}

export async function deleteRole(actorId: string, id: string, ip: string | null): Promise<void> {
  await db.$transaction(async (tx) => {
    const role = await tx.role.findUniqueOrThrow({ where: { id }, include: { permissions: true, _count: { select: { users: true } } } });
    if (role.esSistema) throw new ValidationError({ _form: 'No se puede borrar un rol de sistema.' });
    if (role._count.users > 0) throw new ValidationError({ _form: 'Reasigna primero los usuarios de este rol.' });
    await tx.role.delete({ where: { id } });
    await logActivity(
      { actorId, accion: 'roles.borrar', entidad: 'Role', entidadId: id, ip,
        metadata: { nombre: role.nombre, permisos: role.permissions.map((p) => p.permiso) } }, tx,
    );
  });
}
```

Run: `npm run test:integration -- roles/admin` → PASS.

- [ ] **Step 3: UI de `/admin/roles`**

`admin/roles/actions.ts` — `createRoleAction` / `updateRoleAction` / `deleteRoleAction`: `await requirePermission('roles.gestionar')`, valida `roleSchema`, llama, captura `ValidationError`, `revalidatePath`.

`admin/roles/page.tsx` — server: `requirePermission('roles.ver')`; `listRoles()`; tabla (Nombre, Descripción, Nº usuarios, badge "Sistema"); botón "Nuevo rol" con `PermissionGate roles.gestionar`; cada fila → `/admin/roles/[id]`.

`admin/roles/[id]/page.tsx` — server: `requirePermission('roles.ver')`; `<RoleForm>` (client) con `nombre` (disabled si `esSistema`), `descripcion`, y `<PermissionChecklist>` que itera `PERMISSIONS` agrupado por módulo con checkboxes; los `ADMIN_LOCKED_PERMISSIONS` aparecen marcados y `disabled` cuando el rol es Administrador. Botón "Guardar" y "Eliminar rol" (oculto si `esSistema` o `usuarios > 0`), ambos con `PermissionGate roles.gestionar`. Aviso: "Cambiar estos permisos afecta a N usuarios; se aplicará en su próxima acción."

- [ ] **Step 4: Verificar**

Run: `npm run test:unit && npm run test:integration && npm run build` → PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: administración de roles y catálogo de permisos con guardas"
```

---

## Task 16: Visor del log de auditoría y exportación CSV

**Files:**
- Create: `src/app/(app)/admin/auditoria/page.tsx`, `.../AuditFilters.tsx`, `.../AuditRow.tsx`
- Create: `src/app/(app)/admin/auditoria/export/route.ts`, `src/app/(app)/admin/auditoria/export/route.itest.ts`
- Create: `src/lib/activity/csv.ts`, `src/lib/activity/csv.test.ts`
- Create: `src/lib/activity/actions-catalog.ts`

**Interfaces:**
- Consumes: `queryActivity` (T13), `requirePermission` (T7), `actionLabel` (T5), `AuditAction` list (T5).
- Produces:
  - `activity/actions-catalog.ts`: `AUDIT_ACTIONS: { value: string; label: string }[]` — todas las acciones conocidas con su etiqueta (para el `<select>` de filtro). Deriva de las claves de `LABELS` en `audit.ts` (exporta `KNOWN_ACTIONS` desde ahí).
  - `activity/csv.ts`: `toCsv(rows: ActivityRow[]): string` — cabecera `Fecha,Acción,Usuario,Entidad,ID entidad,IP,Detalle`; cada campo escapado (comillas dobles, `"` → `""`, envuelto si contiene `,`/`"`/`\n`); `Detalle` = `JSON.stringify(metadata)`. Fecha en ISO local `es-MX`.
  - `export/route.ts`: `GET` — `requirePermission('auditoria.ver')`; lee los mismos filtros que la página desde `searchParams`; llama `queryActivity` con `pageSize` alto (cap 5000) y `page: 1`; responde `text/csv; charset=utf-8` con `Content-Disposition: attachment; filename="auditoria-<fecha>.csv"` y BOM `﻿` al inicio (Excel).

- [ ] **Step 1: Test de `toCsv` (falla)**

Crear `src/lib/activity/csv.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { toCsv } from './csv';
import type { ActivityRow } from '@/lib/activity/query';

const row = (over: Partial<ActivityRow>): ActivityRow => ({
  id: '1', accion: 'usuarios.crear', accionLabel: 'Alta de usuario', actorNombre: 'Ana',
  entidad: 'User', entidadId: 'u1', metadata: { email: 'x@pos.com' }, ip: '1.2.3.4',
  createdAt: new Date('2026-09-02T10:00:00Z'), ...over,
});

describe('toCsv', () => {
  it('incluye la cabecera y una fila', () => {
    const csv = toCsv([row({})]);
    const [header, line] = csv.trim().split('\n');
    expect(header).toBe('Fecha,Acción,Usuario,Entidad,ID entidad,IP,Detalle');
    expect(line).toContain('Alta de usuario');
    expect(line).toContain('Ana');
  });

  it('escapa comas y comillas', () => {
    const csv = toCsv([row({ actorNombre: 'Pérez, Ana "La Jefa"' })]);
    expect(csv).toContain('"Pérez, Ana ""La Jefa"""');
  });

  it('serializa metadata como JSON en Detalle', () => {
    const csv = toCsv([row({ metadata: { a: 1 } })]);
    expect(csv).toContain('{""a"":1}');
  });

  it('usa "Sistema" cuando no hay actor', () => {
    expect(toCsv([row({ actorNombre: null })])).toContain('Sistema');
  });
});
```

- [ ] **Step 2: Implementar `src/lib/activity/csv.ts` y `actions-catalog.ts`**

```ts
// csv.ts
import type { ActivityRow } from '@/lib/activity/query';

const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
const fmtFecha = (d: Date) =>
  new Intl.DateTimeFormat('es-MX', { dateStyle: 'short', timeStyle: 'medium' }).format(d);

export function toCsv(rows: ActivityRow[]): string {
  const header = 'Fecha,Acción,Usuario,Entidad,ID entidad,IP,Detalle';
  const lines = rows.map((r) =>
    [
      fmtFecha(r.createdAt),
      r.accionLabel,
      r.actorNombre ?? 'Sistema',
      r.entidad ?? '',
      r.entidadId ?? '',
      r.ip ?? '',
      JSON.stringify(r.metadata ?? {}),
    ].map(esc).join(','),
  );
  return [header, ...lines].join('\n') + '\n';
}
```

```ts
// actions-catalog.ts
import { KNOWN_ACTIONS, actionLabel } from '@/lib/audit';
export const AUDIT_ACTIONS = KNOWN_ACTIONS.map((value) => ({ value, label: actionLabel(value) }));
```

En `audit.ts` añade: `export const KNOWN_ACTIONS = Object.keys(LABELS);`

Run: `npm run test:unit -- activity/csv` → PASS.

- [ ] **Step 3: Test de integración del endpoint de export (falla)**

Crear `src/app/(app)/admin/auditoria/export/route.itest.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { db } from '@/lib/db';
import { hashPassword } from '@/lib/auth/password';
import { createSession } from '@/lib/auth/session';
import { logActivity } from '@/lib/audit';

const cookieStore = { value: undefined as string | undefined };
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: () => (cookieStore.value ? { value: cookieStore.value } : undefined) }),
  headers: async () => new Headers(),
}));
import { GET } from './route';

beforeEach(async () => {
  await db.activityLog.deleteMany();
  await db.session.deleteMany();
  await db.user.deleteMany();
});

describe('GET /admin/auditoria/export', () => {
  it('403 sin permiso', async () => {
    const cajero = await db.role.findFirstOrThrow({ where: { nombre: 'Cajero' } });
    const u = await db.user.create({ data: { nombre: 'C', email: 'c@pos.com', passwordHash: await hashPassword('xxxxxxxxxx'), roleId: cajero.id } });
    cookieStore.value = (await createSession(u.id, {})).token;
    const res = await GET(new Request('http://x/admin/auditoria/export'));
    expect(res.status).toBe(403);
  });

  it('devuelve CSV con permiso auditoria.ver', async () => {
    const admin = await db.role.findFirstOrThrow({ where: { nombre: 'Administrador' } });
    const u = await db.user.create({ data: { nombre: 'A', email: 'a@pos.com', passwordHash: await hashPassword('xxxxxxxxxx'), roleId: admin.id } });
    cookieStore.value = (await createSession(u.id, {})).token;
    await logActivity({ actorId: u.id, accion: 'auth.login' });
    const res = await GET(new Request('http://x/admin/auditoria/export'));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/csv');
    const body = await res.text();
    expect(body).toContain('Inicio de sesión');
  });
});
```

- [ ] **Step 4: Implementar `export/route.ts`**

```ts
import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/context';
import { queryActivity } from '@/lib/activity/query';
import { toCsv } from '@/lib/activity/csv';
import { ForbiddenError } from '@/lib/errors';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  try {
    await requirePermission('auditoria.ver');
  } catch (e) {
    if (e instanceof ForbiddenError) return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }
  const url = new URL(req.url);
  const desdeStr = url.searchParams.get('desde');
  const hastaStr = url.searchParams.get('hasta');
  const { rows } = await queryActivity({
    actorId: url.searchParams.get('actor') ?? undefined,
    accion: url.searchParams.get('accion') ?? undefined,
    desde: desdeStr ? new Date(desdeStr) : undefined,
    hasta: hastaStr ? new Date(hastaStr) : undefined,
    page: 1,
    pageSize: 5000,
  });
  const csv = '﻿' + toCsv(rows);
  const fecha = new Date().toISOString().slice(0, 10);
  return new NextResponse(csv, {
    status: 200,
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="auditoria-${fecha}.csv"`,
    },
  });
}
```

Run: `npm run test:integration -- auditoria/export` → PASS.

- [ ] **Step 5: UI de `/admin/auditoria`**

`admin/auditoria/page.tsx` — server: `await requirePermission('auditoria.ver')`; lee `searchParams` (`actor`, `accion`, `desde`, `hasta`, `page`); `queryActivity({...})`; `<AuditFilters>` (client, form GET: `<select>` de actor cargado de `db.user` [nombre, id], `<select>` de acción desde `AUDIT_ACTIONS`, dos `<input type="date">`); tabla con columnas Fecha/hora, Acción (`accionLabel`), Usuario (`actorNombre ?? 'Sistema'`), Entidad, IP, y una columna "Detalle" con `<details>` que hace `JSON.stringify(metadata, null, 2)` en `<pre>`. `<Pagination>` abajo. Botón/enlace "Exportar CSV" que apunta a `/admin/auditoria/export?<mismos query params>` (enlace normal `<a>` para que el navegador descargue).

- [ ] **Step 6: Verificar**

Run: `npm run test:unit && npm run test:integration && npm run build` → PASS.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: visor de auditoría con filtros y exportación CSV"
```

---

## Task 17: Configuración del timeout de inactividad

**Files:**
- Create: `src/app/(app)/admin/configuracion/page.tsx`, `.../actions.ts`, `.../InactivityForm.tsx`
- Create: `src/lib/validation/settings.ts`, `src/lib/validation/settings.test.ts`
- Create: `src/lib/settings-admin.ts`, `src/lib/settings-admin.itest.ts`

**Interfaces:**
- Consumes: `requirePermission` (T7), `getSetting`/`setSetting` (T6), `logActivity` (T5).
- Produces:
  - `validation/settings.ts`: `idleTimeoutSchema = z.object({ minutes: z.coerce.number().int().min(1, 'Mínimo 1').max(240, 'Máximo 240') })`.
  - `settings-admin.ts`: `updateIdleTimeout(actorId: string, minutes: number, ip: string | null): Promise<void>` — lee valor anterior, `setSetting('session.idleTimeoutMinutes', minutes)`, audita `config.editar` con `{ clave: 'session.idleTimeoutMinutes', antes, despues: minutes }`.

- [ ] **Step 1: Tests (fallan)**

Crear `src/lib/validation/settings.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { idleTimeoutSchema } from './settings';

describe('idleTimeoutSchema', () => {
  it('coerce string a número', () => {
    expect(idleTimeoutSchema.parse({ minutes: '20' })).toEqual({ minutes: 20 });
  });
  it('rechaza < 1', () => {
    expect(idleTimeoutSchema.safeParse({ minutes: 0 }).success).toBe(false);
  });
  it('rechaza > 240', () => {
    expect(idleTimeoutSchema.safeParse({ minutes: 999 }).success).toBe(false);
  });
});
```

Crear `src/lib/settings-admin.itest.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '@/lib/db';
import { hashPassword } from '@/lib/auth/password';
import { updateIdleTimeout } from './settings-admin';
import { getIdleTimeoutMinutes } from './settings';

let actorId: string;
beforeEach(async () => {
  await db.activityLog.deleteMany();
  await db.user.deleteMany();
  await db.appSetting.upsert({
    where: { clave: 'session.idleTimeoutMinutes' }, update: { valor: 15 }, create: { clave: 'session.idleTimeoutMinutes', valor: 15 },
  });
  const admin = await db.role.findFirstOrThrow({ where: { nombre: 'Administrador' } });
  actorId = (await db.user.create({
    data: { nombre: 'A', email: 'a@pos.com', passwordHash: await hashPassword('xxxxxxxxxx'), roleId: admin.id },
  })).id;
});

describe('updateIdleTimeout', () => {
  it('persiste y audita antes/después', async () => {
    await updateIdleTimeout(actorId, 30, '1.1.1.1');
    expect(await getIdleTimeoutMinutes()).toBe(30);
    const log = await db.activityLog.findFirstOrThrow({ where: { accion: 'config.editar' } });
    expect(log.metadata).toMatchObject({ clave: 'session.idleTimeoutMinutes', antes: 15, despues: 30 });
  });
});
```

- [ ] **Step 2: Implementar**

```ts
// validation/settings.ts
import { z } from 'zod';
export const idleTimeoutSchema = z.object({
  minutes: z.coerce.number().int().min(1, 'Mínimo 1 minuto').max(240, 'Máximo 240 minutos'),
});
```

```ts
// settings-admin.ts
import { db } from '@/lib/db';
import { getSetting, setSetting } from './settings';
import { logActivity } from '@/lib/audit';

export async function updateIdleTimeout(actorId: string, minutes: number, ip: string | null): Promise<void> {
  const antes = await getSetting<number>('session.idleTimeoutMinutes', 15);
  await db.$transaction(async (tx) => {
    // setSetting usa `db`; para transacción reproducimos el upsert con tx
    await tx.appSetting.upsert({
      where: { clave: 'session.idleTimeoutMinutes' },
      update: { valor: minutes }, create: { clave: 'session.idleTimeoutMinutes', valor: minutes },
    });
    await logActivity(
      { actorId, accion: 'config.editar', entidad: 'AppSetting', entidadId: 'session.idleTimeoutMinutes', ip,
        metadata: { clave: 'session.idleTimeoutMinutes', antes, despues: minutes } },
      tx,
    );
  });
  void setSetting;
}
```

Run: `npm run test:unit -- validation/settings && npm run test:integration -- settings-admin` → PASS.

- [ ] **Step 3: UI de `/admin/configuracion`**

`configuracion/actions.ts`: `updateInactivityAction` — `const actor = await requirePermission('config.editar')`; valida `idleTimeoutSchema`; `updateIdleTimeout(actor.id, minutes, ip)`; `revalidatePath('/admin/configuracion')`; devuelve `{ ok: true }`.

`configuracion/page.tsx` — server: `await requirePermission('config.editar')`; `const minutes = await getIdleTimeoutMinutes()`; `<InactivityForm defaultMinutes={minutes} />` (client, `useActionState`): un `<input type="number" min={1} max={240}>` + botón "Guardar" + texto "Los usuarios cerrarán sesión tras este tiempo sin actividad. Verán un aviso 1 minuto antes." Al guardar con éxito muestra "Configuración actualizada".

- [ ] **Step 4: Verificar**

Run: `npm run test:unit && npm run test:integration && npm run build` → PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: pantalla de configuración del timeout de inactividad"
```

---

## Task 18: Pruebas E2E (Playwright)

**Files:**
- Create: `playwright.config.ts`
- Create: `test/playwright.global-setup.ts`, `test/playwright.global-teardown.ts`
- Create: `e2e/helpers.ts`
- Create: `e2e/setup-login.spec.ts`, `e2e/user-lifecycle.spec.ts`, `e2e/inactivity.spec.ts`, `e2e/sessions.spec.ts`

**Interfaces:**
- Consumes: la app completa construida; `startEphemeralPg`/`stopEphemeralPg` de `test/pg-embedded.ts` (Task 1).
- Produces: 4 specs verdes contra un servidor real respaldado por Postgres embebido efímero.

- [ ] **Step 1: Configurar Playwright con Postgres embebido**

`test/playwright.global-setup.ts`:

```ts
import { writeFileSync } from 'node:fs';
import { startEphemeralPg } from './pg-embedded';

export default async function globalSetup() {
  const urls = await startEphemeralPg(54330, ['pos_e2e']);
  // el webServer se lanza como proceso hijo; le pasamos la URL por archivo
  writeFileSync('.e2e-db-url', urls['pos_e2e']);
  process.env.DATABASE_URL = urls['pos_e2e'];
}
```

`test/playwright.global-teardown.ts`:

```ts
import { rmSync } from 'node:fs';
import { stopEphemeralPg } from './pg-embedded';

export default async function globalTeardown() {
  await stopEphemeralPg();
  rmSync('.e2e-db-url', { force: true });
}
```

`playwright.config.ts`:

```ts
import { defineConfig } from '@playwright/test';
import { readFileSync, existsSync } from 'node:fs';

const dbUrl = existsSync('.e2e-db-url') ? readFileSync('.e2e-db-url', 'utf8').trim() : '';

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  workers: 1,
  globalSetup: './test/playwright.global-setup.ts',
  globalTeardown: './test/playwright.global-teardown.ts',
  use: { baseURL: 'http://localhost:3100', trace: 'on-first-retry' },
  webServer: {
    command: 'npm run build && npm run start -- -p 3100',
    url: 'http://localhost:3100/login',
    reuseExistingServer: false,
    timeout: 180_000,
    env: { DATABASE_URL: dbUrl, NODE_ENV: 'production' },
  },
});
```

> `globalSetup` corre antes de que Playwright lea `webServer.env`; por eso se pasa la URL vía `.e2e-db-url` (gitignored) que `playwright.config.ts` lee de forma síncrona al cargar. Añade `.e2e-db-url` a `.gitignore`.
> Cada spec E2E asume BD limpia salvo por el seed: usa un `test.beforeEach` que trunca `User`, `Session`, `ActivityLog` y roles no-sistema vía un endpoint de test `POST /api/test/reset` (solo montado si `NODE_ENV !== 'production'`)... como el webServer corre en `production`, mejor: expón un pequeño script `tsx test/reset-e2e-db.ts` y llámalo desde `helpers.ts` con `execFileSync` antes de cada archivo, **o** ejecuta los specs en orden y haz que cada uno cree sus propios emails únicos. Enfoque elegido: cada spec usa emails únicos por test y no depende de aislamiento entre specs; el único estado global es "existe o no el Administrador de bootstrap", que el primer `doSetup` fija.

- [ ] **Step 2: `e2e/helpers.ts`**

```ts
import { expect, type Page } from '@playwright/test';

export async function doSetup(page: Page, email = 'admin@pos.com', pass = 'caballoAzul42') {
  await page.goto('/setup');
  await page.getByLabel('Nombre').fill('Admin');
  await page.getByLabel('Correo').fill(email);
  await page.getByLabel('Contraseña', { exact: true }).fill(pass);
  await page.getByLabel('Confirmar contraseña').fill(pass);
  await page.getByRole('button', { name: 'Crear administrador' }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

export async function login(page: Page, email: string, pass: string) {
  await page.goto('/login');
  await page.getByLabel('Correo').fill(email);
  await page.getByLabel('Contraseña').fill(pass);
  await page.getByRole('button', { name: 'Entrar' }).click();
}
```

- [ ] **Step 3: `e2e/setup-login.spec.ts`**

```ts
import { test, expect } from '@playwright/test';
import { doSetup, login } from './helpers';

test('setup crea el admin y entra sin cambio forzado', async ({ page }) => {
  await doSetup(page);
  await expect(page.getByRole('heading', { name: /Hola, Admin/ })).toBeVisible();
});

test('la ruta /setup deja de existir tras el bootstrap', async ({ page }) => {
  await doSetup(page);
  await page.goto('/setup');
  await expect(page.getByText(/no encontrada|404/i)).toBeVisible();
});

test('login fallido muestra mensaje genérico', async ({ page }) => {
  await doSetup(page);
  await page.goto('/login'); // ya con sesión → redirige a dashboard, cerramos sesión primero
  await page.getByRole('button', { name: 'Cerrar sesión' }).click();
  await login(page, 'admin@pos.com', 'incorrecta');
  await expect(page.getByText('Credenciales inválidas')).toBeVisible();
});
```

- [ ] **Step 4: `e2e/user-lifecycle.spec.ts`**

```ts
import { test, expect } from '@playwright/test';
import { doSetup, login } from './helpers';

test('admin crea cajero, el cajero entra con temporal y se le fuerza el cambio', async ({ page, context }) => {
  await doSetup(page);
  await page.goto('/admin/usuarios');
  await page.getByRole('button', { name: 'Crear usuario' }).click();
  await page.getByLabel('Nombre').fill('Caja Uno');
  await page.getByLabel('Correo').fill('caja1@pos.com');
  await page.getByLabel('Rol').selectOption({ label: 'Cajero' });
  await page.getByRole('button', { name: 'Guardar' }).click();

  const temp = await page.getByTestId('temp-password').innerText();
  expect(temp).toHaveLength(12);

  await page.getByRole('button', { name: 'Cerrar sesión' }).click();
  await login(page, 'caja1@pos.com', temp);
  await expect(page).toHaveURL(/\/cambiar-password/);

  await page.getByLabel('Nueva contraseña').fill('cajaSegura99');
  await page.getByLabel('Confirmar contraseña').fill('cajaSegura99');
  await page.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByText('Contraseña actualizada')).toBeVisible();
  await page.goto('/dashboard');
  await expect(page.getByRole('heading', { name: /Hola, Caja Uno/ })).toBeVisible();
});

test('un cajero no puede entrar a /admin/usuarios', async ({ page }) => {
  // reutiliza el cajero del test anterior no es fiable entre tests aislados; crea uno aquí
  await doSetup(page);
  await page.goto('/admin/usuarios');
  await page.getByRole('button', { name: 'Crear usuario' }).click();
  await page.getByLabel('Nombre').fill('Caja Dos');
  await page.getByLabel('Correo').fill('caja2@pos.com');
  await page.getByLabel('Rol').selectOption({ label: 'Cajero' });
  await page.getByRole('button', { name: 'Guardar' }).click();
  const temp = await page.getByTestId('temp-password').innerText();
  await page.getByRole('button', { name: 'Cerrar sesión' }).click();
  await login(page, 'caja2@pos.com', temp);
  await page.getByLabel('Nueva contraseña').fill('cajaSegura99');
  await page.getByLabel('Confirmar contraseña').fill('cajaSegura99');
  await page.getByRole('button', { name: 'Guardar' }).click();
  await page.goto('/admin/usuarios');
  await expect(page.getByText(/no tienes permiso/i)).toBeVisible();
});
```

> Nota de implementación: el diálogo de contraseña temporal debe exponer `data-testid="temp-password"`. La página de "acceso denegado" (`error.tsx` que capture `ForbiddenError` con code `FORBIDDEN`) muestra "No tienes permiso para ver esta página".

- [ ] **Step 5: `e2e/inactivity.spec.ts`**

```ts
import { test, expect } from '@playwright/test';
import { doSetup } from './helpers';

test('el aviso de inactividad aparece y "Seguir conectado" mantiene la sesión', async ({ page }) => {
  await doSetup(page);
  // baja el timeout a 1 min desde configuración
  await page.goto('/admin/configuracion');
  await page.getByLabel(/minutos/i).fill('1');
  await page.getByRole('button', { name: 'Guardar' }).click();

  // el watcher muestra el modal a falta de 60s => con timeout 1min, casi inmediatamente sin actividad
  await expect(page.getByRole('dialog', { name: /inactividad/i })).toBeVisible({ timeout: 20_000 });
  await page.getByRole('button', { name: 'Seguir conectado' }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
  await page.goto('/dashboard');
  await expect(page).toHaveURL(/\/dashboard/);
});
```

> Para que este test sea rápido y estable, el `InactivityWatcher` debe leer `idleTimeoutMinutes` y mostrar el modal cuando resten ≤ 60s; con 1 min el modal sale enseguida. Si resulta flaky, permite override por query `?idleTest=1` que fuerza el modal a los 3s SOLO cuando `NODE_ENV !== 'production'`.

- [ ] **Step 6: `e2e/sessions.spec.ts`**

```ts
import { test, expect } from '@playwright/test';
import { doSetup, login } from './helpers';

test('cerrar todas las demás sesiones invalida la otra', async ({ browser }) => {
  const ctxA = await browser.newContext();
  const pageA = await ctxA.newPage();
  await doSetup(pageA);

  const ctxB = await browser.newContext();
  const pageB = await ctxB.newPage();
  await login(pageB, 'admin@pos.com', 'caballoAzul42');
  await expect(pageB).toHaveURL(/\/dashboard/);

  await pageA.goto('/perfil');
  await pageA.getByRole('button', { name: 'Cerrar todas las demás' }).click();

  await pageB.goto('/dashboard');
  await expect(pageB).toHaveURL(/\/login/);
});
```

- [ ] **Step 7: Ejecutar la suite E2E**

Run: `npm run test:e2e`
Expected: los 4 specs PASS (algunos con varios tests). Ajusta selectores/labels a la implementación real de las Tasks 9-17 (los `getByLabel` deben cuadrar con los `<label>` reales).

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "test: pruebas E2E de auth, ciclo de usuario, inactividad y sesiones"
```

---

## Task 19: Integración continua

**Files:**
- Create: `.github/workflows/ci.yml`
- Modify: `README.md` (sección "Desarrollo": requisitos, variables de entorno, comandos)

**Interfaces:**
- Consumes: todos los scripts npm.
- Produces: workflow que corre en cada push/PR: `lint`, `typecheck`, `test:unit`, `test:integration`. Los tests de integración traen su propio Postgres (`embedded-postgres` vía `globalSetup`), así que **no hace falta service container**. E2E queda como job `workflow_dispatch` opcional (documentar en README cómo correrlo localmente).

- [ ] **Step 1: Escribir `.github/workflows/ci.yml`**

```yaml
name: CI
on:
  push: { branches: ['**'] }
  pull_request: {}

jobs:
  verificar:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20', cache: 'npm' }
      - run: npm ci
      - run: npx prisma generate
      - run: npm run lint
      - run: npm run typecheck
      - run: npm run test:unit
      - run: npm run test:integration   # globalSetup levanta @embedded-postgres/linux-x64
```

> `@embedded-postgres/linux-x64` corre en los runners `ubuntu-latest` sin Docker. Si diera problemas de glibc, alternativa: reañadir un `services: postgres:17` y hacer que `test/vitest.global-setup.ts` detecte `process.env.CI` y use `DATABASE_URL_TEST` del contenedor en lugar de arrancar el embebido.

- [ ] **Step 2: Escribir la sección "Desarrollo" del README**

Incluye: requisitos (Node ≥ 20; PostgreSQL **no** hace falta instalarlo — lo trae `embedded-postgres`), copiar `.env.example` → `.env`, `npm install`, `npm run db:start` (deja la terminal abierta), en otra terminal `npm run db:migrate` + `npm run db:seed` + `npm run dev`, y la tabla de comandos (`test`, `test:integration`, `test:e2e`, `db:start`/`db:stop`, `db:reset`). Documenta el **bootstrap**: al abrir por primera vez, ir a `/setup` para crear el Administrador. Menciona que `.pgdata/` es la BD local persistente y se puede borrar para empezar de cero.

- [ ] **Step 3: Verificar en local lo que hará el CI**

Run: `npm ci && npx prisma generate && npm run lint && npm run typecheck && npm run test:unit && npm run test:integration`
Expected: todo PASS (no requiere `db:start`; integración usa su Postgres efímero).

- [ ] **Step 4: Commit y push**

```bash
git add -A
git commit -m "chore: workflow de CI y documentación de desarrollo"
```

Si hay remoto configurado: `git push -u origin <rama>` y verifica que el workflow pasa en verde. Si no hay remoto, deja constancia en el PR/entrega de que el CI está listo para cuando se añada.

---

## Cobertura del spec (self-review)

| Requisito del spec | Tarea(s) |
|---|---|
| Stack Next.js + Prisma + PostgreSQL + Tailwind + Vitest + Playwright | 1 |
| Modelos `User`, `Role`, `RolePermission`, `Session`, `ActivityLog`, `AppSetting` | 2 |
| Roles de sistema sembrados y editables; Administrador con todos los permisos | 2, 15 |
| Hash Argon2id; nunca loguear el hash; contraseñas temporales | 3 |
| Política de contraseña (≥10, ≠ email, no comunes) | 3, 11 |
| Catálogo de permisos agrupado por módulo; `can()` | 4 |
| Blindaje del Administrador (`ADMIN_LOCKED_PERMISSIONS`) | 4, 15 |
| Guardián del sistema (≥1 admin gestor activo) | 4, 14, 15 |
| `logActivity` transaccional + etiquetas legibles + acciones del Bloque 1 | 5 |
| Sesiones propias: token opaco, `tokenHash`, cookie `httpOnly`+`Secure`+`SameSite=Lax` | 6 |
| Expiración 8h deslizante; `touchSession` con throttle 60s | 6 |
| Corte por inactividad server-side (15 min configurable) | 6, 8, 12, 17 |
| `revokeSession` / `revokeAllForUser` (cerrar otras sesiones) | 6, 13, 14 |
| `getClientIp` sin confiar en `x-forwarded-for` sin sanear | 7 |
| Rate limiting de login (5 / 15 min → bloqueo 15 min) | 7, 10 |
| `requireUser` / `requirePermission` + auditoría `auth.forbidden` | 7 |
| Middleware: sin sesión → `/login`; inactividad → `?motivo=inactividad`; `mustChangePassword` → `/cambiar-password` | 8 |
| Validación Zod en servidor antes de la BD | 9-17 |
| Bootstrap `/setup` (único, luego 404), primer Administrador | 9 |
| Login `/login` con mensajes genéricos y anti-enumeración (verify siempre) | 10 |
| Cambio de contraseña normal y forzado; revoca las demás sesiones | 11 |
| Logout revoca sesión y audita | 11 |
| Shell responsive; navegación mostrada/oculta por `can()` | 12 |
| Aviso de inactividad 1 min antes + `POST /api/session/heartbeat` | 12 |
| `/perfil` editar nombre/teléfono (avatar placeholder); email solo con permiso | 13 |
| `/perfil/actividad` historial propio paginado con filtro de fechas | 13 |
| Sesiones activas del propio usuario con revocar individual / todas | 13 |
| `/admin/usuarios`: listar, filtrar, buscar; crear (temporal, `mustChangePassword`) | 14 |
| Editar usuario + `usuarios.rol_cambiado`; activar/desactivar (baja lógica, revoca sesiones) | 14 |
| No auto-desactivación; no dejar el sistema sin admin gestor | 14, 15 |
| Restablecer contraseña con motivo obligatorio; muestra temporal una vez | 14 |
| Admin revoca todas las sesiones de otro usuario | 14 |
| `/admin/roles`: CRUD + checklist de permisos por módulo; no borrar rol de sistema / con usuarios | 15 |
| Aviso "afecta a N usuarios" al editar permisos de un rol | 15 |
| `/admin/auditoria`: tabla paginada, filtros (actor, acción, fechas, entidad), detalle `metadata` | 16 |
| Exportar CSV del log (PDF/Excel fuera de alcance) | 16 |
| Configuración del `session.idleTimeoutMinutes` (`config.editar`, audita antes/después) | 17 |
| Cabeceras de seguridad (`HSTS`, `nosniff`, `X-Frame-Options`, CSP básica) | Ver nota ↓ |
| E2E: setup→login, ciclo de usuario, inactividad, sesiones | 18 |
| CI: lint + typecheck + unit + integración | 19 |
| PostgreSQL local sin instalación (`embedded-postgres`) | 1 (Global Constraints, Steps 4-7) |
| Backups de BD | Fuera de código: nota operativa en README (Task 19) |

**Nota — cabeceras de seguridad:** añádelas en `next.config.ts` (`async headers()`) como parte de la **Task 1** (amplía su Step 3 con el bloque `headers`) o, si se te pasó, como un commit menor dentro de la Task 12. Valores: `Strict-Transport-Security: max-age=63072000; includeSubDomains`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Content-Security-Policy: default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'` (ajusta si Next requiere `'unsafe-inline'`/nonce para hidratación).

**Placeholder scan:** sin `TBD`/`TODO`/"implementar después" en pasos de código. Las tres referencias a "fuera de alcance" (avatar upload, email reset, PDF/Excel) son límites explícitos del spec, no huecos del plan.

**Consistencia de tipos:** `hashToken`, `SESSION_COOKIE`, `validateSession`/`ValidatedSession.status` (`'ok'|'idle'|'invalid'`), `FormState`, `ActivityRow`, `AuthUser`, `ValidationError.fields`, `MANAGER_GUARD_PERMISSIONS`, `ADMIN_LOCKED_PERMISSIONS` se usan con la misma firma en todas las tareas que los consumen. `FormState` se define en `setup/actions.ts` (Task 9) y se reimporta desde ahí en Tasks 10-17.

---

## Notas de ejecución

- **PostgreSQL local sin instalación:** la máquina no tiene PostgreSQL, Docker ni acceso al CDN de EDB (403). Se usa `embedded-postgres` (spike verificado: PostgreSQL 17.10 arranca en Windows x64). Dev = instancia persistente en `.pgdata/` puerto 54329 (`npm run db:start`, dejar en background); tests = instancia efímera puerto 54330 vía `globalSetup`. Ver Global Constraints y Task 1 Steps 4-7.
- **Orden de arranque para los subagentes:** Task 2+ necesitan `npm run db:start` corriendo (background) para `prisma migrate dev` / `db:seed`. Los `npm run test:integration` NO lo necesitan (traen su propio Postgres). No arranques dos `db:start` a la vez (colisión de puerto/PID).
- **Dependencia entre Task 2 y Task 4:** `prisma/seed.ts` y `seed.itest.ts` importan `@/lib/auth/rbac`. Ejecuta las tareas en orden; el subagente de Task 4 re-ejecuta `test:integration -- seed`.
- **Runtime del middleware:** Task 8 evita Prisma en Edge llamando a `/api/session/validate` (Node). Si prefieres Prisma en Edge, sustituye por `@prisma/adapter-*` + driver serverless y elimina ese Route Handler; el resto del plan no cambia.
- **Windows:** rutas `/c/Users/papor/...` en Bash. `execFileSync('npx', …)` en `test/pg-embedded.ts` puede necesitar `npx.cmd` o `{ shell: true }`. Para envs inline en scripts se usa `cross-env`.
- **Aislamiento de tests de integración:** `fileParallelism: false` + limpieza por `beforeEach`. Cada archivo `.itest.ts` limpia las tablas que toca. No borres los roles `esSistema` (varios tests dependen del seed).
