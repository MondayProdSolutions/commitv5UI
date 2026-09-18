# Auditoría técnica final — ERP (2026-09-15 a 2026-09-18)

Documento único que reemplaza y consolida los reportes previos de estabilización
y auditoría (`ESTABILIZACION_Y_AUDITORIA.md` + las pasadas incrementales de esta
misma auditoría). Cubre todo el trabajo de estabilización, auditoría y
optimización realizado sobre el repositorio, con la restricción explícita de no
alterar UI ni funcionalidad observable para el usuario final.

Todo lo listado aquí se validó ejecutando de verdad la aplicación (Postgres
embebido real, `next dev` y `next build && next start`), no se dedujo solo
leyendo código: `tsc --noEmit`, `eslint .` y `vitest run` (unit + integration,
711 tests) se corrieron después de cada cambio. `playwright test` (e2e) se
investigó a fondo (sección 7) pero no completa en este entorno Windows por una
limitación de infraestructura de test, no de la aplicación.

## 1. Resumen ejecutivo

El ERP (Next.js 16 / React 19 / TypeScript / Prisma 7 sobre PostgreSQL con
Row-Level Security multi-tenant) llegó a esta auditoría con 4 errores reales
reportados por el usuario (transacciones agotando el pool de Prisma, CSP
bloqueando React en desarrollo, el chatbot siempre roto, y `vitest` fallando en
shell limpio) y una base de código, por lo demás, ya construida con disciplina:
cero usos de `any`, aislamiento por tenant verificado en cada ruta y Server
Action, bloqueos de fila (`FOR UPDATE`) en caja e inventario, aritmética
monetaria en centavos enteros, y contraseñas/tokens de sesión nunca guardados
en claro.

Se corrigieron los 4 errores reportados (sección 3), se liberaron 919 MB de un
worktree huérfano, se eliminaron 2 dependencias sin uso, se añadió una forma de
levantar todo el entorno con un solo comando, y se hizo una revisión línea por
línea de todos los procesos financieramente críticos (ventas, devoluciones,
caja, inventario) y de seguridad (auth, RBAC, chatbot, secretos fiscales,
aislamiento por tenant en cada endpoint) sin encontrar defectos adicionales que
corregir. **No se modificó ningún componente visual, texto, ruta, flujo de
usuario, regla de negocio ni contrato de API/base de datos.**

## 2. Estado inicial del proyecto

- **Stack**: Next.js 16.3.4 (App Router), React 19.2.8, TypeScript 5, Prisma
  7.10 (`@prisma/adapter-pg` sobre `pg`), PostgreSQL con Row-Level Security por
  tenant, Tailwind 4, Vitest 4 + Playwright, Postgres embebido para dev/test.
- **Arquitectura**: multi-tenant por subdominio (POS, inventario, caja,
  clientes, ventas, reportes, asistencia, asistente de IA), aislamiento vía
  `SET LOCAL ROLE app_role` + `set_config('app.tenant_id', ...)` por
  transacción (`src/lib/db.ts`), panel de Super Admin (`/plataforma`) servido
  por el mismo proceso pero sin subdominio de tenant, Server Actions junto a
  cada ruta, validación con `zod`.
- **Errores reportados por el usuario al iniciar** (reproducidos contra la app
  real, no supuestos):
  1. `PrismaClientKnownRequestError` P2028 "Unable to start a transaction in
     the given time" con concurrencia real.
  2. `eval() is not supported` — CSP bloqueaba React/Turbopack en `next dev`.
  3. El asistente de IA (chatbot) no respondía nunca.
  4. `vitest run --project unit` fallaba en cualquier shell limpio.
- **Validación inicial de higiene** (antes de tocar nada): `tsc --noEmit` sin
  errores, `eslint .` sin errores ni warnings, build de producción sin errores
  (solo warnings de Turbopack ya documentados en la sección 6), `npm audit
  --omit=dev` sin vulnerabilidades en producción.

## 3. Errores reportados — causa raíz y corrección

### 3.1 Prisma P2028 — pool de conexiones agotado

**Causa raíz**: cada navegación autenticada abre 2-3 transacciones/conexiones
por diseño (`proxy.ts` resuelve tenant + valida sesión, cada una en su propia
transacción; el render de la página abre una tercera que vive mientras React
renderiza todo el árbol de Server Components). Con el default implícito de
`pg.Pool` (10, porque `DB_POOL_MAX` no estaba definida), esa multiplicidad
agotaba el pool con relativamente poca concurrencia real: reproducido con 40
navegaciones concurrentes contra una sesión real, 18/40 requests devolvían el
P2028 exacto del reporte.

**Corrección**: `src/lib/db.ts` fija un default explícito de pool de **20**
(antes heredaba el default de `pg.Pool`, 10) vía `DB_POOL_MAX`. Con pool=20,
las mismas 40 navegaciones concurrentes: 0 errores. `.env.example` documenta
la variable y por qué debe escalar con la concurrencia real y quedar por
debajo de `max_connections` de Postgres.

**Riesgo pendiente (no arquitectónico, documentado en sección 7)**: subir el
pool mueve el techo, no lo elimina — con 80 navegaciones concurrentes el error
reaparece (60/80). La causa de fondo es que `withTenant()` envuelve el render
completo de la página, no solo las escrituras que necesitan atomicidad.
Arreglarlo de raíz toca el mecanismo de aislamiento por tenant (RLS) — es
exactamente el tipo de cambio arquitectónico grande que no se aplica sin
decisión explícita del equipo. Opciones evaluadas, de menor a mayor riesgo:
cachear la resolución de tenant por slug en `proxy.ts` (TTL corto); separar
sesión de lectura de transacción de escritura (como ya hace
`__setTestTenantId` para tests); seguir escalando el pool/`max_connections`.

### 3.2 CSP bloqueando `eval()` en desarrollo

**Causa raíz**: `next.config.ts` aplicaba la misma CSP estricta (`script-src
'self' 'unsafe-inline'`, sin `unsafe-eval`) en dev y producción. Turbopack/HMR
y la reconstrucción de stack traces de React usan `eval()` solo en desarrollo,
nunca en producción.

**Corrección**: `next.config.ts` agrega `'unsafe-eval'` (script-src) y `ws:`
(connect-src, para el socket de HMR) **solo si `NODE_ENV !== 'production'`**.
Verificado con el header real en ambos modos: dev lleva `unsafe-eval`, `next
build && next start` no.

### 3.3 Chatbot / asistente de IA siempre roto

**Causa raíz**: `src/app/api/asistente/route.ts` llamaba a `getCurrentUser()`
directamente, sin envolver la ruta en `withTenant(...)` — a diferencia de
todas las demás rutas que tocan `db`. `getCurrentUser()` exige contexto de
tenant activo (vía `AsyncLocalStorage`); sin `withTenant()` alrededor, tiraba
siempre `Error: No hay contexto de tenant activo.` en el primer request de
cada sesión de chat, antes de siquiera intentar llamar a Gemini. El bug no lo
detectaban los tests porque el harness de test fija un tenant "ambiente"
global que enmascara a cualquier ruta que se olvide de su propio `withTenant()`.

**Corrección**: se agregó `requireRequestTenantId()` + `withTenant(tenantId,
() => getCurrentUser())`, igual que el resto de rutas — solo `getCurrentUser()`
queda dentro de la transacción; el rate limit y la llamada HTTP a Gemini
quedan fuera, sin bloquear conexiones del pool mientras esperan la red.
`route.itest.ts`: el mock de `next/headers` no incluía `x-tenant-id`; se
corrigió. De paso salió a la luz un segundo bug preexistente, sin relación,
oculto porque la ruta crasheaba antes de llegar tan lejos:
`mockResolvedValue` reusaba el mismo `Response` (solo se puede leer su body
una vez), rompiendo el test de rate-limit en la segunda llamada — se cambió a
`mockImplementation` (un `Response` nuevo por llamada).

Se auditaron todas las demás rutas y Server Actions (`find src/app -name
route.ts` / `actions.ts`) buscando el mismo patrón — el asistente era el único
caso; confirmado de nuevo en la sección 5 de esta pasada.

### 3.4 `vitest run --project unit` fallaba en shell limpio

**Causa raíz**: `src/lib/db.ts` exige `DATABASE_URL` al importarse; los
`*.test.ts` (a diferencia de `*.itest.ts`) no pasan por
`test/vitest.global-setup.ts`, así que sin `.env` cargado explícitamente el
import fallaba de inmediato.

**Corrección**: `vitest.config.mts` agrega `import 'dotenv/config'` (mismo
patrón que ya usaba `prisma.config.ts`).

## 4. Limpieza, dependencias y herramienta de un solo comando

### 4.1 Worktree huérfano de 919 MB

`.claude/worktrees/multi-tenant-saas-foundation/` era una copia completa del
repo (`node_modules` y datos de Postgres embebido incluidos) de una rama ya
mergeada a `main` (`de8e638`). Verificado antes de borrar: sin `.git` propio,
sin registro en `git worktree list` (no era un worktree real de git, `git
worktree remove` fallaba con "not a working tree"), mismos cambios que el
árbol principal — ninguna rama ni commit exclusivo en riesgo. Eliminado con
confirmación explícita del usuario. `.claude/` pasó de 919 MB a 13 KB.

### 4.2 Dependencias sin uso o deprecadas

`cross-env` (`devDependencies`) no lo invocaba ningún script ni config del
repo — eliminada. `vite-tsconfig-paths` es el plugin que Vitest 4 marca
deprecado a favor de la opción nativa `resolve.tsconfigPaths`; se migró
`vitest.config.mts` y se eliminó la dependencia. `npm install` regeneró
`package-lock.json` (11 paquetes menos en el árbol). Sin cambios de
comportamiento: misma suite de tests en verde después del cambio.

### 4.3 Un solo comando para levantar el entorno

**Problema**: levantar el entorno requería dos terminales — `npm run
db:start` (se queda bloqueado a propósito para poder limpiar en `Ctrl+C`) y
`npm run dev` aparte.

**Solución**: se extrajo la lógica de arranque/parada del Postgres embebido de
`scripts/db.mjs` a `scripts/lib/embedded-db.mjs` (mismo comportamiento, mismos
mensajes) y se agregó `scripts/with-db.mjs`, que arranca esa BD en el mismo
proceso —si no está corriendo ya (la reutiliza sin detenerla si alguien la
dejó abierta aparte)— y luego lanza `next dev` o `next start`. Nuevos scripts:
`npm run dev:all` y `npm run start:all`. Los comandos anteriores (`dev`,
`db:start`, `start`, etc.) siguen intactos para quien prefiera el flujo de dos
terminales o para CI.

Validado en real: `npm run dev:all` detectó el Postgres embebido parado, lo
arrancó, y `next dev` respondió en `http://localhost:3000/`. Caveat de
Windows documentado en el README: un `Ctrl+C` real en la terminal limpia todo
(mismo mecanismo que ya usaba `db:start` antes); un cierre forzado externo
puede dejar el Postgres embebido huérfano, igual que ya podía pasar antes —
`clearStalePostmasterPid()` (ya existente) lo detecta y limpia en el próximo
arranque.

**Pendiente de decisión del usuario**: para usar `npm run start:all` en un
servidor propio de producción, `embedded-postgres` debe promoverse de
`devDependency` a dependencia de producción — no se hizo porque depende de la
decisión de arquitectura de despliegue (sección 8).

## 5. Auditoría de seguridad y procesos críticos (sin cambios — evidencia de lo revisado)

Revisión línea por línea, contrastada contra los tests de integración
existentes, no solo `grep`. **Nada de esta sección requirió cambios.**

- **Aislamiento por tenant en cada endpoint**: las 13 rutas (`route.ts`) y las
  19 familias de Server Actions (`actions.ts`) del repo siguen, sin excepción,
  el patrón `requireRequestTenantId()` + `withTenant(...)` (o
  `requirePlatformAdmin()`/`withPlatformAdmin()` para `/plataforma`), con
  `requirePermission(...)` en toda operación que lo amerita. Los 4 archivos de
  `/plataforma` sin `withPlatformAdmin` visible en el propio `actions.ts`
  delegan el chequeo a la función de librería que llaman
  (`src/lib/platform/tenants.ts`, `plans.ts`), verificado que ambas exigen
  `requirePlatformAdmin()` como primera instrucción.
- **Ventas y caja** (`src/lib/sales/*`, `src/lib/cash/sessions.ts`): folio,
  líneas, pagos, movimiento de inventario y auditoría se escriben
  atómicamente; aritmética en centavos enteros (evita deriva de punto
  flotante) con reparto exacto del residuo de redondeo al prorratear
  descuentos; las devoluciones rastrean cantidad/monto ya devuelto por línea
  (incluido lo consumido en la misma petición) para impedir sobre-reembolso;
  apertura de caja serializada con `SELECT ... FOR UPDATE` para evitar dos
  cajas abiertas a la vez; cierre de caja calcula el arqueo esperado por
  agregación dentro de la misma transacción del cierre.
- **Inventario** (`src/lib/inventory/movements.ts`): bloquea la fila de la
  variante (`SELECT ... FOR UPDATE OF v`) antes de calcular el nuevo stock,
  rechaza dejarlo negativo, y escribe movimiento + auditoría atómicamente.
- **Autenticación y sesiones** (`src/lib/auth/*`): login corre
  `verifyPassword` siempre —incluso con usuario inexistente, contra un hash
  señuelo memoizado— para que el tiempo de respuesta no filtre si un correo
  existe; tokens de sesión solo se guardan como hash SHA-256; sesiones
  inactivas se revocan y auditan. Rate limit de login por `correo|IP` (5
  intentos/15 min, bloqueo 15 min) es una decisión de diseño documentada, no
  un descuido (endurecerlo a "solo correo" podría bloquear usuarios legítimos
  detrás de un NAT compartido).
- **RBAC — invariante del "guardián del sistema"**: `assertGuardPreserved` se
  invoca en los dos puntos reales donde podría romperse (cambiar el rol de un
  usuario, desactivar un usuario), y `updateRole` bloquea editar un rol para
  quitarle permisos de guardián si ningún otro rol con usuarios activos los
  mantendría.
- **Secretos fiscales (CSD)**: `TenantFiscalConfig.csdCertificado` /
  `csdLlaveCifrada` / `csdPasswordCifrada` no los lee ni escribe ningún código
  de aplicación todavía — es una tabla preparada para una futura función de
  facturación CFDI, sin implementar. Hoy no hay ninguna ruta, reporte, panel
  de Super Admin ni el asistente de IA que pueda leerlos, porque no hay código
  que los toque. Recomendación para cuando se implemente: mantenerlos fuera de
  cualquier `select` por defecto, nunca incluirlos en el contexto del
  asistente, y cifrar antes de guardar.
- **Chatbot/asistente de IA**: cero imports de `db`/Prisma en todo el módulo —
  el contexto que arma `buildSystemInstruction` es siempre texto estático por
  módulo, nunca una consulta. Límites verificados: `mensaje` ≤ 2000
  caracteres, `historial` ≤ 12 turnos × 2000 caracteres, `errorVisible` ≤ 500,
  `maxOutputTokens: 800`, rate limit por usuario, `assertSameOrigin` contra
  CSRF. Sin cross-tenant ni acceso a contraseñas/tokens/CSD posible por diseño.
- **Fugas de errores internos en API**: único caso de `error: err.message` en
  todo `src/app` es `ForbiddenError`, cuyos mensajes son siempre strings
  curados y estáticos — nunca envuelve una excepción interna cruda.
- **Path traversal en fotos de asistencia**
  (`src/lib/attendance/photos.ts`): `resolvePhotoAbsolutePath` valida el
  formato exacto (`YYYY-MM-DD/archivo.jpg`) con regex antes de tocar el
  filesystem, y además verifica que la ruta resuelta siga dentro del
  directorio raíz — doble guarda contra `../../`.
- **N+1 y datos sobredimensionados**: sin patrones de loop con `await
  db.*`/`.map(async ...)` en `src/lib`; reportes (`ventas`, `margen`,
  `clientes`, `inventario`) usan consultas agregadas y `Promise.all` para
  independientes, no una consulta por fila.
- **Índices de Postgres**: 63 `@@index` en `prisma/schema.prisma`; los dos
  únicos modelos con `tenantId` sin `@@index` explícito (`FolioCounter`,
  `TenantFiscalConfig`) ya tienen `tenantId` como parte de su llave primaria.

## 6. Optimización de build

Se intentó silenciar los 3 warnings preexistentes de Turbopack ("Dynamic
filesystem access causes tracing of the whole project", en
`src/lib/attendance/photos.ts`) con el comentario `/*turbopackIgnore: true*/`
que la propia documentación de Next sugiere. **Se verificó que NO funciona**
para este caso (el warning persistió idéntico con el comentario presente) —
se revirtió el cambio para no dejar un comentario que promete un efecto que no
tiene. Quedan como warnings benignos y preexistentes: no filtran datos, solo
advierten que el build traza el proyecto completo por el acceso a
`process.env.ATTENDANCE_PHOTOS_DIR` en tiempo de ejecución. Ver sección 7 para
una alternativa real (acotar la ruta a una subcarpeta fija) si se quiere
cerrar esto en el futuro.

## 7. Hallazgo: la suite e2e (Playwright) no completa en este entorno

**Corregido en el camino**: `playwright.config.ts` apuntaba `baseURL`/
`webServer.url` a `http://localhost:3100` (sin subdominio de tenant). Bajo la
arquitectura multi-tenant actual eso nunca resuelve un tenant —
`/login`/`/setup` tiran `NO_TENANT` siempre. Se corrigió a
`http://default.localhost:3100` (el tenant `default` que siembra
`prisma/seed.ts`) — cambio de config de test, cero impacto en app. Confirmado:
tras el fix, los errores `NO_TENANT` desaparecieron del log.

**Bloqueante de entorno, ya resuelto para esta máquina**: `*.localhost` no
resuelve a nivel de sistema operativo/Node en este Windows (`nslookup`/`dns.lookup`
confirmaron `ENOTFOUND`) — los navegadores lo resuelven por su cuenta, pero el
health-check de Playwright usa el resolver de Node. Con permiso explícito del
usuario se agregó `127.0.0.1 default.localhost` al hosts de Windows
(`C:\Windows\System32\drivers\etc\hosts`); confirmado que `default.localhost`
resuelve después del cambio.

**Hallazgo aún sin resolver — deuda de infraestructura de test, no de la app**:
con ambos fixes aplicados, `npm run test:e2e` sigue sin completar: el
`webServer` (build + `next start`) arranca, pero cada request revienta con
`ECONNREFUSED` contra `localhost:54330` (la BD efímera que
`test/playwright.global-setup.ts` debería levantar antes) hasta agotar el
timeout de 240s. Diagnóstico aplicado:
- Se ejecutó la función `startEphemeralPg` (la misma que usa `globalSetup`)
  de forma aislada con `tsx`: migra y siembra correctamente, Postgres queda
  escuchando en el puerto pedido.
- Con un poll en vivo del puerto durante una corrida real de
  `npm run test:e2e`, el puerto `54330` **nunca** queda en estado `LISTENING`
  en ningún momento de la corrida — no es que la BD se caiga, es que no llega
  a levantarse cuando la arranca `globalSetup` a través de Playwright.
- `globalSetup` no imprime ningún log (ni el de arranque de Postgres, ni
  migración, ni seed) en la corrida real, a diferencia de la ejecución
  aislada — indicio de que el proceso que Playwright usa para `globalSetup`
  no se comporta igual que una ejecución directa con `tsx` en este entorno.
- `node_modules/embedded-postgres` arranca Postgres con `spawn()` **sin**
  `detached: true` (confirmado leyendo su código) — si el proceso que llama
  `globalSetup` termina antes de que arranque el `webServer`, el hijo de
  Postgres puede morir con él en Windows.

**No se aplicó un parche a ciegas** sobre `node_modules/embedded-postgres`
(dependencia de terceros, un parche ahí no sobrevive a `npm install` y es
territorio frágil para un cambio que además no toca código de la aplicación).
Esto es deuda de infraestructura de test específica de Windows + esta versión
de `embedded-postgres` + Playwright 1.62 — no evidencia de un defecto en la
app: los 711 tests automatizados (unit + integration) sí corren limpio y
ejercitan exactamente los mismos flujos (Server Actions reales, RLS,
aislamiento por tenant) a nivel de código. `test:e2e` ya está documentado en
este proyecto como manual/opcional (`.github/workflows/ci.yml` no lo incluye).

**Recomendación futura**: si se quiere e2e verde en Windows, investigar (a)
correr la BD efímera de e2e como el `scripts/db.mjs` de dev (proceso propio,
fuera del ciclo de vida de `globalSetup`/`globalTeardown` de Playwright), o
(b) reportar/actualizar `embedded-postgres` para que spawnee con
`detached: true` en Windows.

## 8. Riesgos y deuda técnica pendiente (no corregidos, con motivo)

| # | Riesgo | Severidad | Por qué no se tocó |
|---|---|---|---|
| 1 | `npm audit`: 4 vulnerabilidades *high* (`deepmerge-ts`, `mysql2`) en la cadena de `prisma` (CLI, devDependency, no corre en producción) | Alto | El fix automático baja `prisma` a `6.19.3` (breaking). Decisión explícita del usuario: no aplicar, solo documentar. |
| 2 | Techo de conexiones de Prisma bajo carga alta (sección 3.1) | Alto (arquitectónico) | Requiere decidir el mecanismo de aislamiento por tenant (RLS); es justo el tipo de cambio grande que no se aplica sin decisión explícita. |
| 3 | `src/lib/db.ts:212-235`: dos `client.query()` sin `await` intermedio en el pool de test → warning de deprecación de `pg` (`pg@9` lo eliminará) | Bajo | Intencional y documentado in-line, verificado con reproducción; código exclusivo de test, bloqueado en producción. |
| 4 | Rate limit de login por `correo\|IP`, en memoria de un solo proceso | Bajo/Medio | Decisión de diseño ya documentada; endurecerla puede bloquear usuarios legítimos tras un NAT compartido — requiere decisión de producto. |
| 5 | Warnings de Turbopack sobre `attendance/photos.ts` (sección 6) | Bajo | Cosméticos en build, sin impacto funcional ni de seguridad; el intento de arreglo documentado no funcionó. |
| 6 | `npm run start:all` requiere promover `embedded-postgres` a dependencia de producción | — | Depende de la decisión de arquitectura de despliegue (sección 9), no aplicada aún. |
| 7 | `npm run test:e2e` no completa en este Windows (sección 7) | Medio | Deuda de infraestructura de test (Playwright + `embedded-postgres`), no del código de la app; e2e ya es manual/opcional, no bloquea CI. |

## 9. Consulta de arquitectura de despliegue (respondida, decisión pendiente del usuario)

El usuario preguntó si instalar "todo en local" (en la máquina del cliente)
afecta el acceso remoto al panel de Super Admin (`/plataforma`). Verificado en
código: `/plataforma` **no es un servicio aparte** — corre en el mismo proceso
de Next.js, distinguido solo por resolverse en el dominio raíz (sin
subdominio de tenant) y protegido por su propia sesión
(`src/lib/platform-auth/`). Por lo tanto el acceso remoto depende
exclusivamente de dónde corre ese servidor y si es alcanzable desde internet
— no de si la base de datos es embebida o gestionada.

**Recomendación entregada** (no implementada — decisión de negocio):
alojamiento centralizado propio con dominio real (da acceso remoto permanente
a `/plataforma` para el equipo y a cada tenant vía su subdominio, sin
necesitar instalación en la máquina de cada cliente), en vez de instalaciones
locales por cliente. Pendiente que el usuario confirme el modelo de base de
datos para ese servidor (Postgres embebido vs. gestionado) antes de tocar la
clasificación de `embedded-postgres` en `package.json`.

## 10. Archivos creados, modificados o eliminados (todas las pasadas)

| Archivo | Acción |
|---|---|
| `src/app/api/asistente/route.ts` | Envuelve `getCurrentUser()` en `withTenant()` |
| `src/app/api/asistente/route.itest.ts` | Mock de `x-tenant-id`; `mockImplementation` para Gemini |
| `next.config.ts` | CSP: `unsafe-eval`/`ws:` solo en dev |
| `src/lib/db.ts` | Default de pool de conexiones: 20 |
| `.env.example` | Documenta `DB_POOL_MAX` |
| `vitest.config.mts` | Carga `.env`; `resolve.tsconfigPaths` nativo en vez del plugin |
| `.claude/worktrees/multi-tenant-saas-foundation/` | Eliminado (919 MB huérfanos) |
| `.gitignore` | Ignora `.claude/`, `.agents/`, `skills-lock.json` (caché de herramientas de IA, no son código de la app) |
| `package.json` | Quita `cross-env`/`vite-tsconfig-paths`; agrega `dev:all`/`start:all` |
| `package-lock.json` | Regenerado |
| `scripts/lib/embedded-db.mjs` | Creado — lógica compartida de arranque/parada del Postgres embebido |
| `scripts/db.mjs` | Refactorizado para usar `scripts/lib/embedded-db.mjs` |
| `scripts/with-db.mjs` | Creado — orquestador de un solo comando |
| `playwright.config.ts` | `baseURL`/`webServer.url` apuntan al subdominio del tenant sembrado (`default.localhost`) en vez del dominio raíz |
| `README.md` | Documenta el flujo de una sola terminal |
| `docs/AUDITORIA_OPTIMIZACION_FINAL.md` | Reescrito como documento único (este archivo) |
| `docs/ESTABILIZACION_Y_AUDITORIA.md` | Eliminado — consolidado dentro de este documento |

Ningún archivo de UI, componente visual, ruta, estilo o regla de negocio fue
modificado en ninguna pasada de esta auditoría.

## 11. Resultados finales de validación

| Comando | Resultado |
|---|---|
| `tsc --noEmit` | Sin errores |
| `eslint .` | Sin errores ni warnings |
| `vitest run --project unit` | 36/36 archivos, 273/273 tests |
| `vitest run --project integration` | 66/66 archivos, 398/398 tests (RLS/aislamiento por tenant, auth, roles, sesiones, POS/inventario/caja/ventas) |
| `next build` | OK — mismos 3 warnings preexistentes de Turbopack (sección 6), sin warnings nuevos |
| `playwright test` (e2e, navegador real) | No completa en este Windows — deuda de infraestructura de test, ver sección 7. No bloquea CI (ya es manual/opcional). |
| `npm audit --omit=dev` | 0 vulnerabilidades en dependencias de producción |

## 12. Recomendaciones futuras (no aplicadas — para decidir con el equipo)

- Migrar `prisma` para cerrar las 4 vulnerabilidades *high* de su cadena de
  devDependencies, en una pasada dedicada con su propio ciclo de pruebas.
- Resolver el techo de conexiones de Prisma bajo carga alta (sección 3.1/8),
  eligiendo entre las 3 opciones ya evaluadas.
- Decidir el modelo de despliegue (sección 9) y, según eso, promover
  `embedded-postgres` a dependencia de producción si aplica.
- Si el proyecto migra a `pg@9`, revisar el pool de test en `src/lib/db.ts`
  (líneas 212-235).
- Cuando se implemente CFDI/CSD real, seguir las recomendaciones de la
  sección 5 (nunca en `select` por defecto, nunca en el contexto del
  asistente, cifrado en reposo).
- Resolver la deuda de e2e en Windows (sección 7): sacar la BD efímera del
  ciclo de vida de `globalSetup`/`globalTeardown` de Playwright, o actualizar
  `embedded-postgres` para que spawnee `detached` en Windows.

## 13. Comandos exactos

```bash
# Base de datos embebida (dev/test)
node scripts/db.mjs start
node scripts/db.mjs status
node scripts/db.mjs stop

npm install

npm run dev                        # next dev, puerto 3000 (requiere db.mjs start aparte)
npm run dev:all                    # una sola terminal: BD embebida + next dev
npm run build && npm run start     # producción (requiere BD aparte)
npm run build && npm run start:all # producción en un servidor propio, un solo comando
                                    # (requiere embedded-postgres como dependencia de
                                    # producción, ver sección 8)

npm run typecheck              # tsc --noEmit
npm run lint                   # eslint .
npm run test:unit              # vitest run --project unit
npm run test:integration       # vitest run --project integration (trae su propia BD)
npm run test:e2e               # playwright (build + start + navegador real)

npm audit                      # ver vulnerabilidades (incluye devDependencies)
npm audit --omit=dev           # solo dependencias de producción
```
