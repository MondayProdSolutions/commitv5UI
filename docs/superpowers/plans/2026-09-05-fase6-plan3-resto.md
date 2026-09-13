# FASE 6 Plan 3 — Resto del sistema Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Retematizar Inventario, Productos, Clientes, Categorías, Reportes, Admin (Usuarios/Roles/Auditoría/Configuración) y Auth (Login/Setup/Cambiar-contraseña) con los primitivos de Plan 1, reemplazar los 5 `window.confirm()` restantes por `ConfirmDialog`, y recoger 3 ítems diferidos de Plan 2 — sin cambiar ninguna regla de negocio, permiso, validación ni server action.

**Architecture:** Cada archivo conserva su estado / lógica / server actions exactos. El trabajo es: (a) sustituir botones `bg-slate-900`/`bg-red-600` manuales por `<Button>` (o, para `<Link>`/`<a>`, por las clases equivalentes); (b) sustituir los `Badge`/`EstadoBadge`/`Section`/`KpiCard` locales duplicados por los primitivos compartidos; (c) migrar los `window.confirm()` a `ConfirmDialog` con el patrón `useState`+`requestSubmit()` ya probado 2× en Plan 2; (d) re-tematizar las gráficas SVG de gris a índigo. Los modales de formulario manuales (`CategoryForm`, `UserFormDialog`) conservan su estructura de overlay — solo se re-tematizan sus botones.

**Tech Stack:** Next.js 16.3.4 App Router, React 19.2, TypeScript strict, Tailwind v4.

**Spec:** `docs/superpowers/specs/2026-09-05-fase6-diseno-ui-ux-design.md` (§5.1, §5.5, §5.6, §5.7, §3.1, §6, §7, §8, §9).

## Global Constraints

- **Sin cambio de regla de negocio, cálculo, permiso, validación ni server action en ningún archivo.** Cada tarea preserva el `formAction` / server action exacto, sus parámetros, los `name=` de los inputs y los `<input type="hidden">`.
- **Excepción aprobada:** dos formularios GANAN un paso de confirmación que hoy no tienen: `UserAdminActions.tsx` (`ActivateToggleForm`, al desactivar usuario) y — implícito en cada migración — ninguna server action cambia; el gate es puramente de UI.
- **`Button` (`src/components/ui/Button.tsx`) es un `<button>` HTML.** Nunca envuelve un `<Link>`/`<a>`. Donde hoy un `<Link>`/`<a>` está estilizado como botón, se le aplican manualmente las clases equivalentes (ver **Recipe L1/L2** abajo).
- **`Button variant="primary"` es índigo (`bg-indigo-600`), no `bg-slate-900`.** Migrar un botón `bg-slate-900` a `<Button variant="primary">` CAMBIA su color a índigo — es el retema pedido por la spec §3.1, no un efecto colateral.
- **`Button` no tiene variante verde.** Las acciones "restaurar"/"reactivar" (hoy `bg-green-600`) migran a `variant="primary"` (índigo). Las acciones "archivar"/"desactivar" (hoy `bg-red-600` sólido) migran a `variant="danger-solid"`. Los botones outline-rojo (`border-red-300 text-red-700`) migran a `variant="danger"`. El verde queda SOLO para badges/banners (spec §3.1).
- **`Card` (`rounded-lg border border-slate-200 bg-white p-5`) solo renderiza `<div>`.** Los `<form method="get">` de filtros y los `<form>` con `action`/`ref` NO se envuelven en `Card` — conservan su `className` manual; solo su botón "Filtrar"/submit cambia. Contenedores manuales `rounded-lg border border-slate-200 bg-white p-4` que SÍ son `<div>` migran a `<Card>` (el padding pasa de `p-4` a `p-5` — deliberado, ambos permitidos por spec §3.3).
- **Los modales de formulario `CategoryForm.tsx` y `UserFormDialog.tsx` NO se migran a `<dialog>` nativo ni a un primitivo nuevo** (la spec fija 6 primitivos; un `Modal` genérico está fuera de alcance). Solo se re-tematizan sus botones internos. Su falta de cierre-por-Escape/backdrop/foco queda como deuda documentada para un follow-up.
- **`ConfirmDialog` se usa SOLO para confirmar acciones destructivas** (`description` es `string`, no ReactNode). Los 5 `window.confirm()` a migrar: `RoleForm` (borrar rol), `CategoryTree` (archivar categoría raíz), `ProductAdminActions` (archivar producto), `VariantEditor` (archivar variante), `ClienteAdminActions` (archivar cliente). Más 1 confirmación NUEVA: `UserAdminActions.ActivateToggleForm` (desactivar usuario). Todos usan la **Recipe C1** abajo.
- **NO TOCAR:** `PasswordStrengthMeter.tsx`, `DataTable.tsx`, `Pagination.tsx`, `Field.tsx`, `PermissionGate.tsx`, cualquier `route.ts` de export CSV, cualquier `actions.ts`, cualquier `page.tsx` server-only que solo tenga layout sin botones/badges.
- **602+ pruebas previas + los 2 de Plan 1 + el nuevo de Plan 2 (605 en total: 233 unit + 334 integración + 38 E2E) deben seguir en verde.** Ningún texto/rol accesible usado como selector E2E cambia de contenido — solo el elemento/clases que lo envuelven, salvo donde una tarea lo indique explícitamente con el ajuste E2E en el mismo commit (spec §9). Tests E2E acoplados relevantes: `e2e/user-lifecycle.spec.ts` (usa `UserFormDialog` intensivamente — su markup de overlay `<div className="fixed inset-0 z-50...">` NO cambia), `e2e/clientes.spec.ts`, `e2e/productos-inventario.spec.ts`, `e2e/reportes.spec.ts`, `e2e/setup-login.spec.ts`.
- **TypeScript strict:** sin `any`, sin `console.*`, cada archivo debe quedar en **0 errores Y 0 warnings** de lint (ojo con imports que dejen de usarse tras un swap — elimínalos). **Commits:** Conventional Commits en español, terminando EXACTAMENTE con:
  ```
  Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01EnFJHWm8zVoqgkmfwwcRHi
  ```
- **Sin push, sin remoto, sin deploy.** Todo local.

---

## Recetas compartidas (referenciadas por las tareas)

### Recipe B1 — botón submit `bg-slate-900` → `<Button variant="primary">`

Patrón actual (con variaciones de `disabled:opacity-50`/`-60`, `shadow-sm`, `w-full`, `transition-colors`):
```tsx
<button type="submit" disabled={pending} className="rounded-md bg-slate-900 px-... text-sm font-medium text-white ... hover:bg-slate-700 disabled:opacity-...">
  {pending ? 'Xndo…' : 'X'}
</button>
```
→
```tsx
<Button type="submit" variant="primary" pending={pending} pendingLabel="Xndo…">
  X
</Button>
```
- Si el original tiene `w-full`, añade `className="w-full"` al `<Button>`.
- No repitas `disabled={pending}` — `Button` lo combina internamente. Si el original además tenía `disabled={pending || otra}`, pasa `disabled={otra}` y deja `pending={pending}` aparte.
- Añade `import { Button } from '@/components/ui/Button';` (una sola vez por archivo).

### Recipe B2 — botón `type="button"` no-submit `bg-slate-900` (toggles, "Entendido", "Cerrar")

```tsx
<button type="button" onClick={...} className="rounded-md bg-slate-900 ...">X</button>
```
→ `<Button type="button" variant="primary" onClick={...}>X</Button>` (+ `className="w-full"` si lo tenía).

### Recipe B3 — botón secundario `border border-slate-300 ... hover:bg-slate-50`

→ `<Button type="..." variant="secondary" ...>X</Button>` (size `sm` si el original era `px-2.5 py-1`/`text-xs`). Para el patrón `pending ? 'Xndo…' : 'X'`, usa `pending={pending} pendingLabel="Xndo…"`.

### Recipe B4 — botón destructivo

- `bg-red-600 hover:bg-red-700` sólido → `<Button variant="danger-solid" ...>`.
- `border border-red-300 text-red-700 hover:bg-red-50` outline → `<Button variant="danger" ...>`.

### Recipe L1 — `<Link>`/`<a>` estilizado como botón PRIMARIO

Sustituye su `className` completo por exactamente esta cadena (equivalente a `Button variant="primary" size="md"` tras el Task 1, que sube el alto a 40px):
```
inline-flex items-center justify-center gap-1.5 rounded-md bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-1
```
(Si el original tenía `w-full`/`text-center`, consérvalos añadiéndolos a la cadena.)

### Recipe L2 — `<Link>`/`<a>` estilizado como botón SECUNDARIO (típ. "Exportar CSV")

```
inline-flex items-center justify-center gap-1.5 rounded-md border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-1
```

### Recipe D1 — `<Badge>` compartido reemplaza un `Badge`/`EstadoBadge`/`SistemaBadge`/`ArchivadaBadge` local o un pill inline

- Añade `import { Badge } from '@/components/ui/Badge';`.
- Elimina la función/const local `Badge`/`EstadoBadge`/… SI su único trabajo era pintar el pill. Si envuelve lógica de dominio (elige tono según estado), **consérvala** pero haz que devuelva `<Badge tone={...}>…</Badge>`.
- Mapa de tono (nombres viejos → primitivo): `green`/`ok`/`activo`/`activa`/`disponible` → `success`; `amber`/`bajo`/`no_disponible`/`requiere factura` → `warning`; `red`/`agotado`/`faltante` → `danger`; `slate`/`archivado`/`archivada`/`inactivo`/`cancelada`/`sistema`/`genérico` → `neutral`.
- El caso "sin valor" que hoy pinta `<span className="text-slate-400">—</span>` se queda igual (NO es un Badge).

### Recipe S1 — `Section` local → `Card`

La función local `Section({ title, children })` hoy es:
```tsx
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">{title}</h2>
      {children}
    </div>
  );
}
```
→ (conserva la función y su firma; solo cambia el `<div>` por `<Card>`):
```tsx
import { Card } from '@/components/ui/Card';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">{title}</h2>
      {children}
    </Card>
  );
}
```

### Recipe C1 — `window.confirm()` en `onSubmit` → `ConfirmDialog`

El patrón actual, presente en `RoleForm`/`CategoryTree`/`ProductAdminActions`/`VariantEditor`/`ClienteAdminActions`:
```tsx
<form
  action={someServerAction}
  onSubmit={(e) => {
    if (/* condición */ && !window.confirm('¿…?')) e.preventDefault();
  }}
>
  <input type="hidden" name="id" value={id} />
  {/* ...posibles alertas... */}
  <button type="submit" disabled={pending} className="...">
    {pending ? 'Xndo…' : 'X'}
  </button>
</form>
```
→ (añade `useState`/`useRef`; el botón deja de ser `type="submit"` y pasa a abrir el diálogo; `onConfirm` dispara el submit real vía `requestSubmit()`):
```tsx
'use client';
// añade a los imports:
import { useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';

// dentro del componente:
const [confirmOpen, setConfirmOpen] = useState(false);
const formRef = useRef<HTMLFormElement>(null);

// el <form> pierde el onSubmit; gana ref:
<form ref={formRef} action={someServerAction}>
  <input type="hidden" name="id" value={id} />
  {/* ...alertas sin cambios... */}
  <Button
    type="button"
    variant="danger-solid"   /* o "danger" si el original era outline-rojo */
    pending={pending}
    pendingLabel="Xndo…"
    onClick={() => {
      if (/* misma condición que tenía el confirm, o true si no había */) setConfirmOpen(true);
      else formRef.current?.requestSubmit(); /* solo si había condición: la rama sin-confirm hace submit directo */
    }}
  >
    X
  </Button>

  <ConfirmDialog
    open={confirmOpen}
    onOpenChange={setConfirmOpen}
    title="¿X?"
    description="<el texto que estaba dentro de window.confirm(), reformulado sin el '¿…?' inicial si hace falta; añade 'Esta acción no se puede deshacer.' cuando aplique>"
    confirmLabel="X"
    onConfirm={() => {
      setConfirmOpen(false);
      formRef.current?.requestSubmit();
    }}
  />
</form>
```
- **Ninguno de estos 5 forms tiene un `<input>` de texto visible** (solo `<input type="hidden">`), así que NO hay riesgo de envío implícito por `Enter` y NO hace falta el guard `onKeyDown` del Plan 2. Verifícalo en cada archivo.
- Donde el `window.confirm()` era condicional (`CategoryTree`: solo si `isRoot`), la rama sin-confirmación hace `formRef.current?.requestSubmit()` directo desde el `onClick`.
- El texto visible del botón NO cambia (solo el elemento). Si un test E2E hace `.click()` sobre ese botón y luego espera el efecto inmediato, hay que añadirle en el MISMO commit el clic en el botón del `ConfirmDialog` (`getByRole('dialog').getByRole('button', { name: 'X' })`) — cada tarea con `ConfirmDialog` lo indica y corre el E2E correspondiente.

### Recipe K1 — `KpiCard` local de reportes → primitivo compartido

Los 4 reportes definen `function KpiCard({ titulo, valor })`. Elimínala y usa el primitivo:
```tsx
import { KpiCard } from '@/components/ui/KpiCard';
// las llamadas: <KpiCard titulo="X" valor={v} />  →  <KpiCard label="X" value={v} />
```
El primitivo usa `p-4`/`text-xs`/`text-2xl font-bold tracking-tight` (vs el local `p-5`/`text-sm`/`text-2xl font-semibold`) — cambio visual menor y deliberado. En `reportes/inventario/page.tsx` el `KpiCard` local tiene una prop `extra` (un `<Link>` "Ver detalle"): para esa tarjeta usa `href="/inventario/stock-bajo"` del primitivo (hace toda la tarjeta un enlace) y elimina el `<Link>` "Ver detalle" separado.

---

## Estructura de archivos

Ver cada tarea. En total: ~40 archivos modificados, 0 creados. Los `actions.ts`, `route.ts`, `DataTable`/`Pagination`/`Field`/`PermissionGate`/`PasswordStrengthMeter` NO se tocan.

---

## Task 1: `Button` — alto táctil 40px (deuda Plan 2 §6)

**Files:** Modify: `src/components/ui/Button.tsx`

**Interfaces:** Sin cambio de API. Afecta el alto renderizado de TODOS los `<Button size="md">` del sistema (Plan 1 + Plan 2 ya lo usan en todas partes).

- [ ] **Step 1:** En `SIZE_CLASSES`, cambia la línea `md`:
```ts
const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: 'px-2.5 py-1.5 text-xs',
  md: 'px-4 py-2.5 text-sm',
};
```
(`py-2` → `py-2.5`: 8px→10px de padding vertical; con `text-sm` (line-height 20px) el alto pasa de ~36px a 40px, cumpliendo spec §6. `sm` NO cambia — es para acciones densas en filas/popovers donde 40px rompería el layout y contradiría "menos elementos, mejor organizados".)

- [ ] **Step 2:** Run `npm run typecheck && npm run lint && npm run build && npm run test:unit && npm run test:e2e`. Expected: 0 errores; 233/233 unit; 38/38 E2E (los tests hacen `.click()`, insensible al alto).

- [ ] **Step 3:** Commit:
```bash
git add src/components/ui/Button.tsx
git commit -m "fix(diseno): Button md sube a 40px de alto táctil (spec §6)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01EnFJHWm8zVoqgkmfwwcRHi"
```

---

## Task 2: `SesionAbiertaResumen` — fondo de apertura como cifra destacada (deuda Plan 2 §5.3)

**Files:** Modify: `src/app/(app)/caja/SesionAbiertaResumen.tsx`

**Interfaces:** Sin cambio de props (`{ session: CashSessionDetail }`). Sigue prohibido leer `esperadoEfectivo`/`diferencia`/`efectivoContado`.

- [ ] **Step 1:** Reemplaza el primer `<Card>` (el bloque "Fondo") completo. Actual:
```tsx
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Caja {session.folio}</h2>
            <p className="text-sm text-slate-600">
              Abierta por {session.abiertaPorNombre} · {fmtFechaMX(session.abiertaEn)}
            </p>
          </div>
          <p className="text-sm font-medium text-slate-700">
            Fondo {money(session.fondoApertura)}
          </p>
        </div>
      </Card>
```
→
```tsx
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Caja {session.folio}</h2>
            <p className="text-sm text-slate-600">
              Abierta por {session.abiertaPorNombre} · {fmtFechaMX(session.abiertaEn)}
            </p>
          </div>
          <div className="rounded-md bg-slate-50 px-3 py-2 text-right">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Fondo</p>
            <p className="text-lg font-bold tabular-nums text-slate-900">
              {money(session.fondoApertura)}
            </p>
          </div>
        </div>
      </Card>
```

- [ ] **Step 2:** Run `npm run typecheck && npm run lint && npm run build && npm run test:e2e -- caja`. Expected: 0 errores; los tests de caja pasan (ninguno asierta sobre el markup exacto del fondo — verifica en tu reporte que `e2e/caja.spec.ts` no hace `getByText` sobre "Fondo $..." como una sola cadena; si lo hiciera, ajústalo).

- [ ] **Step 3:** Commit:
```bash
git add "src/app/(app)/caja/SesionAbiertaResumen.tsx"
git commit -m "feat(diseno): fondo de apertura como cifra destacada en el panel de caja

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01EnFJHWm8zVoqgkmfwwcRHi"
```

---

## Task 3: `PaymentPanel` — método de pago resaltado con el acento (deuda Plan 2 §5.2)

**Files:** Modify: `src/app/(app)/ventas/PaymentPanel.tsx`

**Interfaces:** Sin cambio de props ni de estado. `p.metodo` y `updateRow(i, { metodo })` se conservan exactamente — solo cambia el widget de `<select>` a 3 botones segmentados.

- [ ] **Step 1:** Localiza el `<select value={p.metodo} onChange={...}>` dentro del `.map` de filas de pago. Actualmente:
```tsx
            <select
              value={p.metodo}
              onChange={(e) => updateRow(i, { metodo: e.target.value as MetodoPago })}
              className="rounded-md border border-slate-300 px-2 py-1.5 text-sm outline-none focus:border-slate-500 focus:ring-1 focus:ring-slate-500"
            >
              {METODOS.map((m) => (
                <option key={m} value={m}>
                  {METODO_LABEL[m]}
                </option>
              ))}
            </select>
```
Reemplázalo por un grupo segmentado (mismo estado, mismo handler):
```tsx
            <div className="inline-flex rounded-md border border-slate-300 p-0.5" role="group">
              {METODOS.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => updateRow(i, { metodo: m })}
                  aria-pressed={p.metodo === m}
                  className={
                    'rounded px-2.5 py-1 text-xs font-medium transition-colors ' +
                    (p.metodo === m
                      ? 'bg-indigo-600 text-white'
                      : 'text-slate-600 hover:bg-slate-100')
                  }
                >
                  {METODO_LABEL[m]}
                </button>
              ))}
            </div>
```

- [ ] **Step 2:** Run `npm run typecheck && npm run lint && npm run build && npm run test:e2e -- ventas`. Expected: 0 errores; 7/7 ventas E2E. **Ojo:** si algún test de `ventas.spec.ts` selecciona el método de pago con `selectOption(...)` sobre ese `<select>`, ahora hay que hacer `.getByRole('button', { name: 'Tarjeta' }).click()` etc. — ajústalo en el MISMO commit y documenta el cambio en tu reporte. (Los flujos de venta más comunes usan "Efectivo exacto" que NO toca este control, así que puede que no haga falta ningún cambio — verifícalo.)

- [ ] **Step 3:** Commit:
```bash
git add "src/app/(app)/ventas/PaymentPanel.tsx" e2e/ventas.spec.ts
git commit -m "feat(diseno): método de pago como control segmentado con el acento índigo

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01EnFJHWm8zVoqgkmfwwcRHi"
```
(Si el E2E no necesitó cambios, omite `e2e/ventas.spec.ts` del `git add`.)

---

## Task 4: `inputClass` compartido — foco índigo

**Files:** Modify: `src/app/(app)/ventas/types.ts`

**Interfaces:** `inputClass` (exportado) — mismo nombre, mismo tipo (`string`). Lo importan ya varios archivos (`PeriodFilterForm`, formularios de Plan 2). Cambiar su color de foco los beneficia a todos.

- [ ] **Step 1:** En `src/app/(app)/ventas/types.ts`, la constante `inputClass` actual es:
```ts
export const inputClass =
  'block w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm outline-none focus:border-slate-500 focus:ring-1 focus:ring-slate-500';
```
Cambia solo el color de foco:
```ts
export const inputClass =
  'block w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500';
```

- [ ] **Step 2:** Run `npm run typecheck && npm run lint && npm run build && npm run test:e2e`. Expected: 0 errores; 38/38 E2E (ningún test asierta sobre el color de foco de un input).

- [ ] **Step 3:** Commit:
```bash
git add "src/app/(app)/ventas/types.ts"
git commit -m "feat(diseno): foco índigo en el inputClass compartido (spec §7)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01EnFJHWm8zVoqgkmfwwcRHi"
```

---

## Task 5: Gráficas SVG — re-tema de gris a índigo (spec §5.6)

**Files:** Modify: `src/components/charts/BarChart.tsx`, `src/components/charts/LineChart.tsx`

**Interfaces:** Sin cambio de API (`BarChart`/`LineChart` mantienen sus props). Solo cambian clases de color de los elementos de datos; los textos de eje siguen en slate para legibilidad.

- [ ] **Step 1: `BarChart.tsx`** — 3 cambios de clase, nada más:
  - Línea `<div className="h-3 w-full rounded bg-slate-100">` → `bg-indigo-100`.
  - Línea `<div className="h-3 rounded bg-slate-700" ...>` → `bg-indigo-600`.
  - Línea `<rect ... className="fill-slate-700" />` → `fill-indigo-600`.
  - **NO cambies** `fill-slate-600` (etiqueta eje X), `fill-slate-900` (valor sobre barra), `text-slate-500`/`text-slate-600`/`text-slate-900` de la variante horizontal.

- [ ] **Step 2: `LineChart.tsx`** — 3 cambios:
  - `<path d={areaPath} className="fill-slate-200" />` → `fill-indigo-100`.
  - `<path d={linePath} className="fill-none stroke-slate-700" strokeWidth={2} />` → `stroke-indigo-600`.
  - `<circle ... className="fill-slate-700" />` → `fill-indigo-600`.
  - **NO cambies** `fill-slate-600` (eje X), `text-slate-500`/`text-slate-600`/`text-slate-900`.

- [ ] **Step 3:** Run `npm run typecheck && npm run lint && npm run build && npm run test:e2e -- reportes`. Expected: 0 errores; los E2E de reportes pasan (asertan sobre datos/valores, no colores SVG).

- [ ] **Step 4:** Commit:
```bash
git add src/components/charts/BarChart.tsx src/components/charts/LineChart.tsx
git commit -m "feat(diseno): gráficas de reportes con el acento índigo

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01EnFJHWm8zVoqgkmfwwcRHi"
```

---

## Task 6: Reportes — `PeriodFilterForm` + `reportes/page.tsx`

**Files:** Modify: `src/app/(app)/reportes/PeriodFilterForm.tsx`, `src/app/(app)/reportes/page.tsx`

- [ ] **Step 1: `PeriodFilterForm.tsx`**
  - Chips de atajo: el estado activo `'bg-slate-900 text-white'` → `'bg-indigo-600 text-white'` (deja el inactivo `bg-slate-100 text-slate-700 hover:bg-slate-200` igual). Son `<Link>`, quedan como chips.
  - Botón "Aplicar rango" (`<button type="submit" className="rounded-md bg-slate-900 px-4 py-2 ... hover:bg-slate-700">`) → **Recipe B1** sin `pending` (es un form GET sin estado pending): `<Button type="submit" variant="primary">Aplicar rango</Button>`. Añade `import { Button } from '@/components/ui/Button';`. (`Button.tsx` no lleva `'use client'` ni usa hooks propios — renderiza sin problema en este Server Component.)
  - "Limpiar" (`<Link>` texto) sin cambios.

- [ ] **Step 2: `reportes/page.tsx`** — las 4 tarjetas de navegación son `<Link className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm hover:border-slate-300">`. Cambia solo `hover:border-slate-300` → `hover:border-indigo-300` y añade `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500` a cada una. No las envuelvas en `Card` (son `<Link>` con hover propio).

- [ ] **Step 3:** Run `npm run typecheck && npm run lint && npm run build`. Expected: 0 errores.

- [ ] **Step 4:** Commit:
```bash
git add "src/app/(app)/reportes/PeriodFilterForm.tsx" "src/app/(app)/reportes/page.tsx"
git commit -m "feat(diseno): reportes — filtro de período y tarjetas con acento índigo

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01EnFJHWm8zVoqgkmfwwcRHi"
```

---

## Task 7: Reportes — 4 páginas de reporte (`KpiCard` compartido + Exportar CSV)

**Files:** Modify: `src/app/(app)/reportes/ventas/page.tsx`, `reportes/inventario/page.tsx`, `reportes/margen/page.tsx`, `reportes/clientes/page.tsx`

**Interfaces:** Consumes: `KpiCard` (`@/components/ui/KpiCard`, props `label`/`value`/`hint?`/`tone?`/`href?`).

- [ ] **Step 1:** En cada uno de los 4 archivos:
  - Elimina la función local `function KpiCard({ titulo, valor })` (en `inventario` tiene además `extra?: React.ReactNode` — ver **Recipe K1** para ese caso).
  - Añade `import { KpiCard } from '@/components/ui/KpiCard';`.
  - Cambia cada llamada `<KpiCard titulo="X" valor={v} />` → `<KpiCard label="X" value={v} />`.
  - En `reportes/inventario/page.tsx`: la tarjeta "Stock bajo/agotado" que usaba `extra={<Link href="/inventario/stock-bajo" ...>Ver detalle</Link>}` → `<KpiCard label="..." value={v} href="/inventario/stock-bajo" />` (elimina el `<Link>` "Ver detalle" separado y su markup). Si además hay `tone` warning cuando el conteo > 0, pásalo: `tone={n > 0 ? 'warning' : 'default'}`.

- [ ] **Step 2:** En cada archivo, el enlace "Exportar CSV" es un `<a href={...} className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50">` → aplícale la cadena de **Recipe L2** (reemplaza su `className` completo).

- [ ] **Step 3:** Las "tarjetas de gráfica" (`<div className="rounded-lg border border-slate-200 bg-white p-5"><h2 className="mb-3 text-lg font-semibold text-slate-900">…</h2>…</div>`) — envuélvelas en `<Card>` conservando el `<h2>` dentro: `<Card><h2 className="mb-3 text-lg font-semibold text-slate-900">…</h2>…</Card>`. Añade `import { Card } from '@/components/ui/Card';` donde toque. (El `<div className="space-y-2">` de las secciones de tabla NO cambia.)

- [ ] **Step 4:** Run `npm run typecheck && npm run lint && npm run build && npm run test:e2e -- reportes`. Expected: 0 errores; E2E de reportes en verde. **Ojo:** `reportes.spec.ts` puede asertar sobre el texto de un KPI (ej. `getByText('Ingreso neto')` seguido de un valor). El texto `label` NO cambia respecto a `titulo`, así que debería seguir pasando — verifícalo; si un selector dependía de la clase `text-2xl font-semibold` (improbable), ajústalo.

- [ ] **Step 5:** Commit:
```bash
git add "src/app/(app)/reportes/ventas/page.tsx" "src/app/(app)/reportes/inventario/page.tsx" "src/app/(app)/reportes/margen/page.tsx" "src/app/(app)/reportes/clientes/page.tsx"
git commit -m "feat(diseno): reportes usan KpiCard y Card compartidos; Exportar CSV re-tematizado

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01EnFJHWm8zVoqgkmfwwcRHi"
```

---

## Task 8: Inventario — 3 páginas de listado

**Files:** Modify: `src/app/(app)/inventario/page.tsx`, `inventario/stock-bajo/page.tsx`, `inventario/movimientos/page.tsx`

- [ ] **Step 1: `inventario/page.tsx`**
  - `function EstadoBadge({ estado: 'ok'|'bajo'|'agotado' })` con `ESTADO_STYLE` (`bg-green-100/amber-100/red-100 text-*-800`) → **Recipe D1**: conserva `EstadoBadge` como wrapper, que devuelva `<Badge tone={estado === 'ok' ? 'success' : estado === 'bajo' ? 'warning' : 'danger'}>{ESTADO_LABEL[estado]}</Badge>`. Elimina `ESTADO_STYLE`.
  - Botón "Filtrar" (`bg-slate-900`, submit de `<form method="get">`) → **Recipe B1** sin `pending`: `<Button type="submit" variant="primary">Filtrar</Button>`.
  - Las 3 stat cards `<div className="rounded-lg border border-slate-200 bg-white p-4">` (la 3ª es un `<Link>`): las 2 primeras → `<Card>` (`p-4`→`p-5`); la 3ª (`<Link>`) conserva estructura pero cambia `hover:border-slate-300` (si lo tiene) → `hover:border-indigo-300` y añade focus ring índigo. Los números `text-red-600`/`text-amber-600` se quedan (semánticos).

- [ ] **Step 2: `inventario/stock-bajo/page.tsx`** — la columna "Acción" es un `<Link className="text-slate-600 hover:text-slate-900 hover:underline">` → cambia a `text-indigo-600 hover:text-indigo-700 hover:underline`. Nada más.

- [ ] **Step 3: `inventario/movimientos/page.tsx`**
  - `<Link>` "Registrar movimiento" (`bg-slate-900`) → **Recipe L1**.
  - Botón "Filtrar" (`bg-slate-900`, submit) → `<Button type="submit" variant="primary">Filtrar`.
  - `<a download>` "Exportar CSV" (`border border-slate-300 bg-white ... hover:bg-slate-50`) → **Recipe L2**.
  - `function Cantidad` (span con `text-green-700`/`text-red-700`/`text-slate-500` según signo) — se queda; NO es un badge, es color semántico de una cifra.

- [ ] **Step 4:** Run `npm run typecheck && npm run lint && npm run build && npm run test:e2e -- productos-inventario`. Expected: 0 errores; E2E en verde.

- [ ] **Step 5:** Commit:
```bash
git add "src/app/(app)/inventario/page.tsx" "src/app/(app)/inventario/stock-bajo/page.tsx" "src/app/(app)/inventario/movimientos/page.tsx"
git commit -m "feat(diseno): listados de Inventario usan Badge/Card/Button compartidos

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01EnFJHWm8zVoqgkmfwwcRHi"
```

---

## Task 9: Inventario — `MovementForm`

**Files:** Modify: `src/app/(app)/inventario/movimientos/nuevo/MovementForm.tsx`

- [ ] **Step 1:**
  - Añade `import { Button } from '@/components/ui/Button';`.
  - Elimina la `const inputClass` local; añade `import { inputClass } from '@/app/(app)/ventas/types';` (misma cadena salvo foco, ahora índigo por Task 4).
  - Botón "Buscar" (`bg-slate-900`, submit, `disabled:opacity-50`, `pending ? 'Buscando…' : 'Buscar'`) → `<Button type="submit" variant="primary" pending={searchPending} pendingLabel="Buscando…">Buscar</Button>`.
  - Botón "Registrar movimiento" (`w-full bg-slate-900`, `disabled={pending || !variantId}`, `pending ? 'Registrando…' : 'Registrar movimiento'`) → `<Button type="submit" variant="primary" className="w-full" disabled={!variantId} pending={pending} pendingLabel="Registrando…">Registrar movimiento</Button>`.
  - Contenedores: el buscador es `<div className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">` (un `<div>` que contiene el `<form action={searchAction}>`) → migra ese `<div>` a `<Card className="space-y-3">`; añade `import { Card } from '@/components/ui/Card';`. El bloque de registro es `<form action={formAction} className="space-y-4 rounded-lg border border-slate-200 bg-white p-4">` (un `<form>`, no un `<div>`) → **NO lo toques** (los forms conservan su wrapper manual).

- [ ] **Step 2:** Run `npm run typecheck && npm run lint && npm run build && npm run test:e2e -- productos-inventario`. Expected: 0 errores.

- [ ] **Step 3:** Commit:
```bash
git add "src/app/(app)/inventario/movimientos/nuevo/MovementForm.tsx"
git commit -m "feat(diseno): MovementForm usa Button/Card e inputClass compartido

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01EnFJHWm8zVoqgkmfwwcRHi"
```

---

## Task 10: Productos — `page.tsx` + `ProductRow.tsx`

**Files:** Modify: `src/app/(app)/productos/page.tsx`, `src/app/(app)/productos/ProductRow.tsx`

- [ ] **Step 1: `productos/page.tsx`**
  - `function EstadoBadge({ estado: ProductEstado })` con `ESTADO_STYLE` (4 estados: activo/no_disponible/agotado/archivado con `bg-green-100/amber-100/red-100/slate-200`) → **Recipe D1**: conserva el wrapper, devuelve `<Badge tone={{ activo:'success', no_disponible:'warning', agotado:'danger', archivado:'neutral' }[estado]}>{ESTADO_LABEL[estado]}</Badge>`. Elimina `ESTADO_STYLE`.
  - `<Link>` "Nuevo producto" (`bg-slate-900`, dentro de `PermissionGate`) → **Recipe L1**.
  - Botón "Filtrar" (`bg-slate-900`, submit) → `<Button type="submit" variant="primary">Filtrar`.
  - Elimina la `const inputClass` local; importa de `@/app/(app)/ventas/types`.

- [ ] **Step 2: `ProductRow.tsx`** — única clase: `'hover:bg-slate-50 focus:bg-slate-50 focus:outline-none' + (href ? ' cursor-pointer' : '')` → `'hover:bg-slate-50 focus-visible:bg-indigo-50 focus-visible:outline-none' + ...`. (Cambio mínimo de foco; deja el hover en slate.)

- [ ] **Step 3:** Run `npm run typecheck && npm run lint && npm run build && npm run test:e2e -- productos-inventario`. Expected: 0 errores.

- [ ] **Step 4:** Commit:
```bash
git add "src/app/(app)/productos/page.tsx" "src/app/(app)/productos/ProductRow.tsx"
git commit -m "feat(diseno): listado de Productos usa Badge/Button compartidos

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01EnFJHWm8zVoqgkmfwwcRHi"
```

---

## Task 11: Productos — `[id]/page.tsx` + `ProductForm.tsx`

**Files:** Modify: `src/app/(app)/productos/[id]/page.tsx`, `src/app/(app)/productos/ProductForm.tsx`

- [ ] **Step 1: `productos/[id]/page.tsx`**
  - `function Section` local → **Recipe S1** (`<Card>` + `<h2>`).
  - El pill inline "Archivado" (`<span className="rounded-full bg-slate-200 px-3 py-1 text-xs font-medium text-slate-600">Archivado</span>`) → `<Badge tone="neutral">Archivado</Badge>`. Añade `import { Badge } from '@/components/ui/Badge';`.
  - El placeholder de imagen `border-dashed border-slate-300 bg-slate-50` se queda.

- [ ] **Step 2: `ProductForm.tsx`**
  - Añade `import { Button } from '@/components/ui/Button';`.
  - Elimina `const inputClass` local; importa de `@/app/(app)/ventas/types`.
  - Selector de tipo (2 botones toggle): estado activo `'bg-slate-900 text-white'` → `'bg-indigo-600 text-white'` (deja el inactivo `border border-slate-300 bg-white text-slate-700 hover:bg-slate-100` igual). Son `type="button"` de un toggle — quedan como botones custom (no `Button`, para preservar el aspecto segmentado).
  - Botón "Quitar" variante (`text-xs font-medium text-red-600 hover:text-red-700`) → se queda (link de texto).
  - Botón "Añadir variante" (`border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100`) → `<Button type="button" variant="secondary" size="sm" onClick={...}>Añadir variante</Button>`.
  - Botón submit final (`bg-slate-900`, `disabled={pending}`, `pending ? 'Guardando…' : isEdit ? 'Guardar cambios' : 'Crear producto'`) → conserva el ternario del texto vía `pendingLabel`: `<Button type="submit" variant="primary" pending={pending} pendingLabel="Guardando…">{isEdit ? 'Guardar cambios' : 'Crear producto'}</Button>`.
  - El contenedor de la sección opcional `<div className="space-y-4 rounded-lg border border-slate-200 bg-slate-50 p-4">` se queda (es la "sección opcional claramente separada" de spec §5.5 — solo cambia si quieres `p-5`, opcional; déjalo en `p-4` para diferenciarlo visualmente de las Cards blancas).

- [ ] **Step 3:** Run `npm run typecheck && npm run lint && npm run build && npm run test:e2e -- productos-inventario`. Expected: 0 errores; los E2E que crean productos (`crearProductoSimple` etc.) siguen pasando — el texto de los botones ("Crear producto", "Guardar cambios", "Añadir variante") NO cambia.

- [ ] **Step 4:** Commit:
```bash
git add "src/app/(app)/productos/[id]/page.tsx" "src/app/(app)/productos/ProductForm.tsx"
git commit -m "feat(diseno): detalle y formulario de Producto usan Card/Badge/Button

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01EnFJHWm8zVoqgkmfwwcRHi"
```

---

## Task 12: Productos — `VariantEditor.tsx` + `ProductAdminActions.tsx` (`ConfirmDialog`)

**Files:** Modify: `src/app/(app)/productos/VariantEditor.tsx`, `src/app/(app)/productos/ProductAdminActions.tsx`

- [ ] **Step 1: `VariantEditor.tsx`**
  - Añade `import { Button } from '@/components/ui/Button';` y `import { Badge } from '@/components/ui/Badge';`.
  - Elimina `const inputClass` local; importa de `@/app/(app)/ventas/types`.
  - Pills inline: `rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500` ("Predeterminada") y `rounded-full bg-slate-200 px-2 py-0.5 text-xs text-slate-600` ("Archivada") → `<Badge tone="neutral">Predeterminada</Badge>` / `<Badge tone="neutral">Archivada</Badge>`.
  - Botón "Guardar variante" (`bg-slate-900`) → `<Button type="submit" variant="primary" pending={pending} pendingLabel="Guardando…">Guardar variante</Button>`.
  - Botón "Marcar disponible/no disponible" (`border border-slate-300 px-2.5 py-1 text-xs`) → `<Button type="submit" variant="secondary" size="sm" pending={dispPending} pendingLabel="Aplicando…">{variant.disponible ? 'Marcar no disponible' : 'Marcar disponible'}</Button>`.
  - Botón "Añadir variante" (`AddVariantForm`, `bg-slate-900`) → `<Button type="submit" variant="primary" pending={...} pendingLabel="...">Añadir variante</Button>` (usa el `pending` del `useActionState` correspondiente — inspecciona el nombre real en el archivo).
  - Botón "Convertir" (`ConvertForm`, `bg-slate-900`) → mismo tratamiento.
  - Botones "Quitar" de fila draft (`text-red-600`) → se quedan.
  - **`window.confirm()` de "Archivar variante"** (`onSubmit` del `<form action={archAction}>`) → **Recipe C1**. El form tiene 2 `<input type="hidden">` (`variantId`, `productId`), ningún input de texto → sin guard de Enter. El botón era outline-rojo (`border border-red-300 text-red-700 hover:bg-red-50`) → `<Button type="button" variant="danger" size="sm" ...>`. `title="¿Archivar esta variante?"`, `description="Podrás seguir consultando su historial. Esta acción se puede revertir restaurando la variante."`, `confirmLabel="Archivar variante"`. `onConfirm` → `setConfirmOpen(false)` + `formRef.current?.requestSubmit()`. Como este componente renderiza MÚLTIPLES `VariantCard`, el `useState`/`useRef` del diálogo van DENTRO de `VariantCard` (uno por tarjeta), no en el nivel superior.

- [ ] **Step 2: `ProductAdminActions.tsx`** (`ArchiveRestoreForm` + `DisponibilidadForm`)
  - Añade imports de `Button` y (para `ArchiveRestoreForm`) `ConfirmDialog`, `useRef`, `useState`.
  - `ArchiveRestoreForm`: **Recipe C1**. Form con 1 `<input type="hidden" name="id">`, sin input de texto. El botón hoy es un ternario de color (`bg-green-600` restaurar / `bg-red-600` archivar) con texto ternario. Nuevo: `<Button type="button" variant={archivado ? 'primary' : 'danger-solid'} pending={pending} pendingLabel="Aplicando…" onClick={archivado ? () => formRef.current?.requestSubmit() : () => setConfirmOpen(true)}>{archivado ? 'Restaurar producto' : 'Archivar producto'}</Button>` — es decir: **restaurar NO abre diálogo** (submit directo), **archivar SÍ**. `ConfirmDialog` (solo relevante para la rama archivar): `title="¿Archivar este producto?"`, `description="Se archivarán también todas sus variantes. Podrás restaurarlo después."`, `confirmLabel="Archivar producto"`.
  - `DisponibilidadForm`: botón (`border border-slate-300 px-4 py-2`) → `<Button type="submit" variant="secondary" pending={pending} pendingLabel="Aplicando…">{disponible ? 'Marcar todo el producto como no disponible' : 'Marcar todo el producto como disponible'}</Button>`. Sin `ConfirmDialog`.

- [ ] **Step 3:** Run `npm run typecheck && npm run lint && npm run build && npm run test:e2e -- productos-inventario`. Expected: 0 errores. **Si** `productos-inventario.spec.ts` archiva un producto/variante y esperaba el efecto tras un clic (sin `page.on('dialog')`), ahora hay que añadir el clic en `getByRole('dialog').getByRole('button', { name: 'Archivar producto' })` (o `'Archivar variante'`) — ajústalo en el mismo commit y documéntalo. Si usaba `page.on('dialog', d => d.accept())`, elimina ese listener (queda muerto) y añade el clic del diálogo.

- [ ] **Step 4:** Commit:
```bash
git add "src/app/(app)/productos/VariantEditor.tsx" "src/app/(app)/productos/ProductAdminActions.tsx" e2e/productos-inventario.spec.ts
git commit -m "feat(diseno): VariantEditor/ProductAdminActions — Button/Badge y ConfirmDialog al archivar

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01EnFJHWm8zVoqgkmfwwcRHi"
```
(Si el E2E no necesitó cambios, omítelo del `git add` y del mensaje.)

---

## Task 13: Categorías — `page.tsx` + `CategoryForm.tsx` + `sin-categoria-activa/` + `RecategorizeForm.tsx`

**Files:** Modify: `src/app/(app)/categorias/page.tsx`, `categorias/CategoryForm.tsx`, `categorias/sin-categoria-activa/page.tsx`, `categorias/sin-categoria-activa/RecategorizeForm.tsx`

- [ ] **Step 1: `CategoryForm.tsx`** (modal manual — solo re-tema de botones, NO se migra el overlay)
  - Añade `import { Button } from '@/components/ui/Button';`.
  - Elimina `const inputClass` local; importa de `@/app/(app)/ventas/types`.
  - `btnClass` por defecto (trigger, `bg-slate-900 ... shadow-sm hover:bg-slate-700`): el trigger es un `<button type="button">` → cambia `btnClass` a la cadena de **Recipe B2** aplicada, o mejor: envuelve el trigger en `<Button type="button" variant="primary" onClick={...} className={triggerClassName}>` — pero `triggerClassName` a veces trae `linkBtn` (secundario). Simplificación segura: si `triggerClassName` está definido, deja el `<button className={triggerClassName}>` como está (lo re-tematiza Task 14 desde `linkBtn`); si NO, usa `<Button type="button" variant="primary" onClick={...}>{triggerLabel ?? tituloFor(mode)}</Button>`.
  - Botón "✕" cerrar (`text-slate-400 hover:text-slate-600`) → se queda.
  - Botón "Cerrar" del estado ok (`w-full bg-slate-900`) → `<Button type="button" variant="primary" className="w-full" onClick={onClose}>Cerrar</Button>`.
  - Botón "Cancelar" (`border border-slate-300`) → `<Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>`.
  - Botón submit (`bg-slate-900`, `pending ? 'Guardando…' : isEdit ? 'Guardar cambios' : 'Crear'`) → `<Button type="submit" variant="primary" pending={pending} pendingLabel="Guardando…">{isEdit ? 'Guardar cambios' : 'Crear'}</Button>`.

- [ ] **Step 2: `categorias/page.tsx`** — el aviso de productos huérfanos `bg-amber-50 px-3 py-2 text-sm text-amber-800` se queda. Toggle "Mostrar/Ocultar archivadas" (`<Link>` texto slate) → cambia su color a `text-indigo-600 hover:text-indigo-700`. El trigger de `<CategoryForm mode="crear-raiz">` se re-tematiza vía Step 1.

- [ ] **Step 3: `sin-categoria-activa/page.tsx`** — solo layout + `DataTable` + `Pagination`; sin botones/badges propios. El breadcrumb `<Link className="text-sm text-slate-500 hover:text-slate-700">` → `text-slate-500 hover:text-slate-700` se queda (breadcrumb, neutro). Sin cambios salvo que encuentres un `bg-slate-900`.

- [ ] **Step 4: `RecategorizeForm.tsx`** — botón "Cambiar categoría" (`border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60`) → `<Button type="submit" variant="secondary" size="sm" pending={pending} pendingLabel="Cambiando…">Cambiar categoría</Button>`. Feedback inline `text-xs text-green-700`/`text-xs text-red-700` se queda. `selectClass` local → puedes importar `inputClass` compartido si aplica al `<select>` (verifica que las clases encajen; si no, déjalo).

- [ ] **Step 5:** Run `npm run typecheck && npm run lint && npm run build && npm run test:e2e -- productos-inventario`. Expected: 0 errores (los E2E de categorías viven en `productos-inventario.spec.ts` o `ventas.spec.ts` — el helper `crearCategoriaRaiz` usa `getByRole('button', { name: 'Crear', exact: true })` dentro del modal; ese texto NO cambia).

- [ ] **Step 6:** Commit:
```bash
git add "src/app/(app)/categorias/page.tsx" "src/app/(app)/categorias/CategoryForm.tsx" "src/app/(app)/categorias/sin-categoria-activa/page.tsx" "src/app/(app)/categorias/sin-categoria-activa/RecategorizeForm.tsx"
git commit -m "feat(diseno): Categorías — Button compartido e inputClass (modal sin cambio estructural)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01EnFJHWm8zVoqgkmfwwcRHi"
```

---

## Task 14: Categorías — `CategoryTree.tsx` (`ConfirmDialog` al archivar raíz)

**Files:** Modify: `src/app/(app)/categorias/CategoryTree.tsx`

- [ ] **Step 1:**
  - Añade `import { Button } from '@/components/ui/Button';` y `import { Badge } from '@/components/ui/Badge';` y `import { useRef, useState } from 'react';` (junto al `useActionState` ya importado).
  - `const linkBtn` (`rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60`) — este es el estilo "secundario sm". Los botones que lo usan directamente (Restaurar, Editar/Añadir subcategoría vía `triggerClassName`) → sustituye los `<button className={linkBtn}>` por `<Button variant="secondary" size="sm" ...>`. Para los `CategoryForm` que reciben `triggerClassName={linkBtn}`: cámbialo a que `CategoryForm` renderice un `<Button variant="secondary" size="sm">` — pero como Task 13 dejó ese camino con `<button className={triggerClassName}>`, aquí pásale la cadena secundaria de **Recipe** equivalente. Simplificación: deja `linkBtn` como cadena pero actualiza su valor para incluir el focus ring índigo: no hace falta — `Button secondary` ya lo trae. Para el `triggerClassName` de `CategoryForm`, mantén `linkBtn` (es un `<button>` estilizado, aceptable como secundario re-tematizado; su color ya es slate-neutro, sin `bg-slate-900`).
  - `function ArchivadaBadge()` (`inline-flex items-center rounded-full bg-slate-200 px-2.5 py-0.5 text-xs font-medium text-slate-600`) → elimínala; usa `<Badge tone="neutral">Archivada</Badge>` en su sitio de uso (`NodeCard`).
  - `NodeCard`'s `<div className="rounded-lg border border-slate-200 bg-white p-3">` → déjalo en `p-3` (es una tarjeta compacta de árbol; `Card` forzaría `p-5` y rompería la densidad del árbol). NO migrar a `Card`.
  - El empty state `<p className="rounded-lg border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500">No hay categorías todavía.</p>` → `<div className="rounded-lg border border-slate-200 bg-white"><EmptyState message="No hay categorías todavía." /></div>`. Añade `import { EmptyState } from '@/components/ui/EmptyState';`.
  - **`window.confirm()` de "Archivar" (solo `isRoot`)** en `NodeActions` → **Recipe C1**, con `useState`/`useRef` DENTRO de `NodeActions` (se renderiza uno por nodo). El form de archivar tiene 1 `<input type="hidden" name="id">`, sin input de texto. El botón "Archivar" hoy usa `linkBtn` (secundario sm) → `<Button type="button" variant="secondary" size="sm" pending={archPending} pendingLabel="Archivando…" onClick={() => { if (isRoot) setConfirmOpen(true); else formRef.current?.requestSubmit(); }}>Archivar</Button>`. `ConfirmDialog`: `title="¿Archivar esta categoría?"`, `description="Se archivará esta categoría y todas sus subcategorías. Los productos conservan su categoría y podrás recategorizarlos después."`, `confirmLabel="Archivar"`. El `formRef` va sobre el `<form action={archAction}>`.
  - El form de "Restaurar" no cambia de lógica; su botón `linkBtn` → `<Button type="submit" variant="secondary" size="sm" pending={restPending} pendingLabel="Restaurando…">Restaurar</Button>`.

- [ ] **Step 2:** Run `npm run typecheck && npm run lint && npm run build && npm run test:e2e -- productos-inventario`. Expected: 0 errores. Si un E2E archiva una categoría RAÍZ y esperaba el efecto tras un clic con `page.on('dialog')`, adáptalo (clic en el botón "Archivar" del `ConfirmDialog`) en el mismo commit.

- [ ] **Step 3:** Commit:
```bash
git add "src/app/(app)/categorias/CategoryTree.tsx" e2e/productos-inventario.spec.ts
git commit -m "feat(diseno): CategoryTree usa Button/Badge/EmptyState y ConfirmDialog al archivar raíz

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01EnFJHWm8zVoqgkmfwwcRHi"
```
(Si el E2E no necesitó cambios, omítelo.)

---

## Task 15: Clientes — `page.tsx` + `CustomerRow.tsx` + `nuevo/page.tsx`

**Files:** Modify: `src/app/(app)/clientes/page.tsx`, `src/app/(app)/clientes/CustomerRow.tsx`, `src/app/(app)/clientes/nuevo/page.tsx`

- [ ] **Step 1: `clientes/page.tsx`**
  - `function Badge({ tone: 'green'|'slate' })` local → **Recipe D1**: elimínala, `import { Badge } from '@/components/ui/Badge';`, y en las columnas "Facturable"/"Estado" cambia `<Badge tone="green">` → `<Badge tone="success">`, `<Badge tone="slate">` → `<Badge tone="neutral">`.
  - `<Link>` "Nuevo cliente" (`bg-slate-900`) → **Recipe L1**.
  - Botón "Filtrar" (`bg-slate-900`, submit) → `<Button type="submit" variant="primary">Filtrar`.
  - Elimina `const inputClass` local; importa de `@/app/(app)/ventas/types` (nota: la versión local NO tiene `w-full`; el uso en `<input name="q">` le añade `' w-64'` — al usar la compartida que SÍ trae `w-full`, quita el `' w-64'` o cámbialo por `' sm:w-64'`; para el `<select name="estado">` la compartida con `w-full` está bien). Verifica visualmente que no rompa el layout del filtro; si `w-full` estorba, deja el `inputClass` local pero actualiza su foco a índigo.

- [ ] **Step 2: `CustomerRow.tsx`** — clase `'hover:bg-slate-50 focus:bg-slate-50 focus:outline-none' + ...` → `'hover:bg-slate-50 focus-visible:bg-indigo-50 focus-visible:outline-none' + ...`.

- [ ] **Step 3: `clientes/nuevo/page.tsx`** — el `<div className="rounded-lg border border-slate-200 bg-white p-5">` que envuelve `<CustomerForm mode="crear" />` → `<Card>`. `import { Card } from '@/components/ui/Card';`. Breadcrumb `<Link>` se queda.

- [ ] **Step 4:** Run `npm run typecheck && npm run lint && npm run build && npm run test:e2e -- clientes`. Expected: 0 errores.

- [ ] **Step 5:** Commit:
```bash
git add "src/app/(app)/clientes/page.tsx" "src/app/(app)/clientes/CustomerRow.tsx" "src/app/(app)/clientes/nuevo/page.tsx"
git commit -m "feat(diseno): listado y alta de Clientes usan Badge/Card/Button

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01EnFJHWm8zVoqgkmfwwcRHi"
```

---

## Task 16: Clientes — `[id]/page.tsx` + `CustomerForm.tsx` + `ClienteAdminActions.tsx` (`ConfirmDialog`)

**Files:** Modify: `src/app/(app)/clientes/[id]/page.tsx`, `src/app/(app)/clientes/CustomerForm.tsx`, `src/app/(app)/clientes/ClienteAdminActions.tsx`

- [ ] **Step 1: `clientes/[id]/page.tsx`**
  - `function Section` → **Recipe S1**.
  - `function Badge({ tone: 'green'|'slate'|'amber' })` → **Recipe D1**: elimínala; en los 3 usos: Genérico `<Badge tone="amber">` → `tone="warning"`; Archivado `<Badge tone="slate">` → `tone="neutral"`; Facturable `<Badge tone="green">` → `tone="success"`.

- [ ] **Step 2: `CustomerForm.tsx`**
  - Elimina `function SubmitBtn` local; añade `import { Button } from '@/components/ui/Button';`. Sustituye `<SubmitBtn label={mode === 'crear' ? 'Crear cliente' : 'Guardar cambios'} />` por un componente inline que use `useFormStatus`:
```tsx
function SubmitBtn({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="primary" pending={pending} pendingLabel="Guardando…">
      {label}
    </Button>
  );
}
```
  (Conserva `import { useFormStatus } from 'react-dom';`.)
  - Elimina `const inputClass` local; importa de `@/app/(app)/ventas/types`.
  - `function Err` local se queda (texto de error de campo; no hay primitivo).
  - El acordeón "Datos de facturación (CFDI)" (`<div className="rounded-lg border border-slate-200">` + `<button type="button">` header con `▲/▼`) — se queda (es la "sección opcional claramente separada" de spec §5.5; ya cumple). Cambia solo el `text-slate-400` del `▲/▼` → `text-slate-500` (contraste AA).
  - `<fieldset>` "Datos de contacto" con `<legend>` uppercase — se queda.

- [ ] **Step 3: `ClienteAdminActions.tsx`** → **Recipe C1**.
  - Form con 1 `<input type="hidden" name="id">`, sin input de texto → sin guard de Enter.
  - Botón hoy: ternario de color (`bg-green-600` restaurar / `bg-red-600` archivar) + texto ternario. Nuevo: `<Button type="button" variant={archivado ? 'primary' : 'danger-solid'} pending={pending} pendingLabel="Aplicando…" onClick={archivado ? () => formRef.current?.requestSubmit() : () => setConfirmOpen(true)}>{archivado ? 'Restaurar cliente' : 'Archivar cliente'}</Button>`.
  - `ConfirmDialog` (rama archivar): `title="¿Archivar este cliente?"`, `description="Dejará de aparecer en los listados activos. Podrás restaurarlo después."`, `confirmLabel="Archivar cliente"`.

- [ ] **Step 4:** Run `npm run typecheck && npm run lint && npm run build && npm run test:e2e -- clientes`. Expected: 0 errores. Si `clientes.spec.ts` archiva un cliente esperando el efecto tras un clic (con `page.on('dialog')`), adapta (clic en "Archivar cliente" del `ConfirmDialog`) en el mismo commit.

- [ ] **Step 5:** Commit:
```bash
git add "src/app/(app)/clientes/[id]/page.tsx" "src/app/(app)/clientes/CustomerForm.tsx" "src/app/(app)/clientes/ClienteAdminActions.tsx" e2e/clientes.spec.ts
git commit -m "feat(diseno): detalle/formulario/archivar de Clientes — Card/Badge/Button + ConfirmDialog

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01EnFJHWm8zVoqgkmfwwcRHi"
```
(Si el E2E no necesitó cambios, omítelo.)

---

## Task 17: Admin — Usuarios (`page` + `[id]` + `UserRow` + `UserFormDialog` + `UserAdminActions`)

**Files:** Modify: `src/app/(app)/admin/usuarios/page.tsx`, `admin/usuarios/[id]/page.tsx`, `admin/usuarios/UserRow.tsx`, `admin/usuarios/UserFormDialog.tsx`, `admin/usuarios/UserAdminActions.tsx`

- [ ] **Step 1: `admin/usuarios/page.tsx`**
  - `function EstadoBadge` (span `bg-green-100 text-green-800` / `bg-slate-200 text-slate-600`) → **Recipe D1**: elimínala, usa `<Badge tone={activo ? 'success' : 'neutral'}>{activo ? 'Activo' : 'Inactivo'}</Badge>` en la columna.
  - Botón "Filtrar" (`bg-slate-900`) → `<Button type="submit" variant="primary">Filtrar`.
  - Los 3 `inputClass` inline repetidos en el JSX → extrae a `import { inputClass } from '@/app/(app)/ventas/types'` y úsalo.

- [ ] **Step 2: `admin/usuarios/[id]/page.tsx`**
  - `function Section` → **Recipe S1**.
  - El estado como texto plano `{user.activo ? 'Activo' : 'Inactivo'}` (línea ~72) → `<Badge tone={user.activo ? 'success' : 'neutral'}>{user.activo ? 'Activo' : 'Inactivo'}</Badge>` (consistencia con la lista). `import { Badge } from '@/components/ui/Badge';`.

- [ ] **Step 3: `UserRow.tsx`** — `hover:bg-slate-50 focus:bg-slate-50` → `hover:bg-slate-50 focus-visible:bg-indigo-50 focus-visible:outline-none`.

- [ ] **Step 4: `UserFormDialog.tsx`** (modal overlay manual — NO se migra la estructura; solo botones)
  - `import { Button } from '@/components/ui/Button';`. `import { inputClass } from '@/app/(app)/ventas/types'` (elimina la local).
  - Trigger "Editar"/"Crear usuario" (`bg-slate-900 shadow-sm`) → **Recipe B2**: `<Button type="button" variant="primary" onClick={() => setOpen(true)}>{isEdit ? 'Editar' : 'Crear usuario'}</Button>`.
  - Botones "Entendido" y "Cerrar" (`w-full bg-slate-900`) → `<Button type="button" variant="primary" className="w-full" onClick={() => setOpen(false)}>Entendido</Button>` / `…>Cerrar</Button>`.
  - "Cancelar" (`border border-slate-300`) → `<Button type="button" variant="secondary" onClick={() => setOpen(false)}>Cancelar</Button>`.
  - Submit (`bg-slate-900`, `pending ? 'Guardando…' : isEdit ? 'Guardar cambios' : 'Crear'`) → `<Button type="submit" variant="primary" pending={pending} pendingLabel="Guardando…">{isEdit ? 'Guardar cambios' : 'Crear'}</Button>`.
  - Botón "✕" cerrar y `TempPasswordPanel`'s "Copiar" (`border border-slate-300 bg-white text-xs`): "Copiar" → `<Button type="button" variant="secondary" size="sm" onClick={...}>{copied ? 'Copiado' : 'Copiar'}</Button>`. El "✕" se queda.
  - **NO cambies** `<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">` ni el panel `<div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">` — E2E `user-lifecycle.spec.ts` depende de este markup y de `getByRole('button', { name: 'Crear', exact: true })` para localizar el form dentro del overlay.

- [ ] **Step 5: `UserAdminActions.tsx`**
  - `import { Button } from '@/components/ui/Button';`, y para `ActivateToggleForm`: `import { ConfirmDialog } from '@/components/ui/ConfirmDialog';`, `useRef`, `useState`. `import { inputClass } from '@/app/(app)/ventas/types'` (elimina local).
  - `ActivateToggleForm` → **Recipe C1** (confirmación NUEVA, hoy no hay). Form con 2 `<input type="hidden">` (`targetId`, `activo`), sin input de texto. Botón hoy: ternario color (`bg-red-600` desactivar / `bg-green-600` reactivar) + texto ternario. Nuevo: `<Button type="button" variant={activo ? 'danger-solid' : 'primary'} pending={pending} pendingLabel="Aplicando…" onClick={activo ? () => setConfirmOpen(true) : () => formRef.current?.requestSubmit()}>{activo ? 'Desactivar usuario' : 'Reactivar usuario'}</Button>` — **desactivar abre diálogo, reactivar hace submit directo**. `ConfirmDialog`: `title="¿Desactivar este usuario?"`, `description="No podrá iniciar sesión hasta que se le reactive. Sus sesiones activas seguirán hasta su próxima acción — usa «Cerrar todas las sesiones» si necesitas cortarlas ahora."`, `confirmLabel="Desactivar usuario"`.
  - `RevokeSessionsForm`: botón (`border border-slate-300`) → `<Button type="submit" variant="secondary" pending={pending} pendingLabel="Cerrando…">Cerrar todas las sesiones</Button>`.
  - `ResetPasswordForm`: botón (`bg-slate-900`) → `<Button type="submit" variant="primary" pending={pending} pendingLabel="Restableciendo…">Restablecer contraseña</Button>`.

- [ ] **Step 6:** Run `npm run typecheck && npm run lint && npm run build && npm run test:e2e -- user-lifecycle`. Expected: 0 errores; **todos** los tests de `user-lifecycle.spec.ts` en verde. Si algún test desactiva un usuario y esperaba el efecto tras un clic, añade el clic en `getByRole('dialog').getByRole('button', { name: 'Desactivar usuario' })` en el mismo commit. El helper `crearUsuarioViaUI` usa `getByRole('button', { name: 'Crear', exact: true })` y `getByRole('button', { name: 'Entendido' })` — esos textos NO cambian.

- [ ] **Step 7:** Commit:
```bash
git add "src/app/(app)/admin/usuarios/page.tsx" "src/app/(app)/admin/usuarios/[id]/page.tsx" "src/app/(app)/admin/usuarios/UserRow.tsx" "src/app/(app)/admin/usuarios/UserFormDialog.tsx" "src/app/(app)/admin/usuarios/UserAdminActions.tsx" e2e/user-lifecycle.spec.ts
git commit -m "feat(diseno): Admin/Usuarios — Badge/Card/Button y ConfirmDialog al desactivar

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01EnFJHWm8zVoqgkmfwwcRHi"
```
(Si el E2E no necesitó cambios, omítelo.)

---

## Task 18: Admin — Roles (`page` + `[id]` + `RoleForm` + `PermissionChecklist`)

**Files:** Modify: `src/app/(app)/admin/roles/page.tsx`, `admin/roles/[id]/page.tsx`, `admin/roles/RoleForm.tsx`, `admin/roles/PermissionChecklist.tsx`

- [ ] **Step 1: `admin/roles/page.tsx`**
  - `function SistemaBadge` (`inline-flex ... rounded-full bg-slate-200 px-2.5 py-0.5 text-xs font-medium text-slate-700`) → elimina la rama badge, usa `<Badge tone="neutral">Sistema</Badge>` (la rama `—` se queda). `import { Badge } from '@/components/ui/Badge';`.
  - `<Link>` "Nuevo rol" (`bg-slate-900`) → **Recipe L1**.

- [ ] **Step 2: `admin/roles/[id]/page.tsx`** — solo layout (breadcrumb + h1 + p + `<RoleForm>`). Sin cambios salvo `bg-slate-900` si aparece (no lo hace).

- [ ] **Step 3: `RoleForm.tsx`**
  - `import { Button } from '@/components/ui/Button';`. Elimina `const inputClass` local; importa de `@/app/(app)/ventas/types` (la del repo tiene `disabled:bg-slate-100 disabled:text-slate-500` extra — si los inputs de RoleForm dependen de esos estados `disabled:`, mantén una `const inputClass` local pero cámbiale el foco a índigo; si no, usa la compartida).
  - Botón "Guardar" (`bg-slate-900`) → `<Button type="submit" variant="primary" pending={pending} pendingLabel="Guardando…">Guardar</Button>`.
  - "Cancelar" (`<Link href="/admin/roles">` con clases secundarias) → aplícale **Recipe L2** (es `<Link>`, no `<button>`).
  - **`window.confirm()` de "Eliminar rol"** (`onSubmit` del `<form action={delAction}>`) → **Recipe C1**. Form con 1 `<input type="hidden" name="id">`, sin input de texto → sin guard de Enter. Botón hoy outline-rojo (`border border-red-300 text-red-700 hover:bg-red-50`) → `<Button type="button" variant="danger" pending={delPending} pendingLabel="Eliminando…" onClick={() => setConfirmOpen(true)}>Eliminar rol</Button>`. `ConfirmDialog`: `title="¿Eliminar este rol?"`, `description="Esta acción no se puede deshacer. Solo se pueden eliminar roles sin usuarios asignados."`, `confirmLabel="Eliminar rol"`. `formRef` sobre el `<form action={delAction}>`.
  - Las alertas `bg-green-50 text-green-800`/`bg-red-50`/`bg-amber-50` se quedan.

- [ ] **Step 4: `PermissionChecklist.tsx`** — las tarjetas `<div className="rounded-lg border border-slate-200 bg-white p-4">` → `<Card className="...">` (si necesitan clases extra) o `<Card>` (`p-4`→`p-5`). `import { Card } from '@/components/ui/Card';`. Checkboxes `h-4 w-4 rounded border-slate-300` — cambia a `h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500` (acento en el check). Tag "(obligatorio)" `text-xs text-slate-400` → `text-slate-500` (AA).

- [ ] **Step 5:** Run `npm run typecheck && npm run lint && npm run build && npm run test:e2e`. Expected: 0 errores; 38/38 E2E. Si hay un test que borra un rol esperando el efecto tras un clic, adapta con el clic del `ConfirmDialog`.

- [ ] **Step 6:** Commit (añade al `git add` solo el `.spec.ts` concreto que hayas tenido que tocar, si alguno):
```bash
git add "src/app/(app)/admin/roles/page.tsx" "src/app/(app)/admin/roles/[id]/page.tsx" "src/app/(app)/admin/roles/RoleForm.tsx" "src/app/(app)/admin/roles/PermissionChecklist.tsx"
git commit -m "feat(diseno): Admin/Roles — Badge/Card/Button y ConfirmDialog al eliminar rol

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01EnFJHWm8zVoqgkmfwwcRHi"
```

---

## Task 19: Admin — Auditoría + Configuración

**Files:** Modify: `src/app/(app)/admin/auditoria/page.tsx`, `admin/auditoria/AuditFilters.tsx`, `admin/auditoria/AuditRow.tsx`, `admin/configuracion/page.tsx`, `admin/configuracion/InactivityForm.tsx`

- [ ] **Step 1: `admin/auditoria/page.tsx`**
  - `<a download>` "Exportar CSV" (hoy `bg-slate-900` primario) → **Recipe L2** (secundario), homogeneizando con Ventas/Reportes/Inventario donde "Exportar CSV" es acción secundaria.
  - El `<div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">` que envuelve la tabla HTML manual → **déjalo como está** (una tabla a sangre completa necesita `p-0`, que `Card` no permite anular de forma fiable; no encaja en `Card`).
  - El empty state `<td colSpan={6} className="px-6 py-8 text-center text-sm text-slate-500">` se queda (va dentro de `<td>`, `EmptyState` no encaja ahí).

- [ ] **Step 2: `AuditFilters.tsx`**
  - Botón "Filtrar" (`bg-slate-900`, submit de `<form method="get">`) → `<Button type="submit" variant="primary">Filtrar`. `import { Button } from '@/components/ui/Button';`.
  - Los 4 `inputClass` inline → `import { inputClass } from '@/app/(app)/ventas/types'` y úsalo en los 4.
  - El `<div className="... rounded-lg border border-slate-200 bg-white p-4">` que envuelve el `<form method="get">` — es un `<div>` que contiene el form, o el form mismo tiene esas clases. Si es `<form className="...rounded-lg border...p-4">`, déjalo (form conserva wrapper). Si es un `<div>` envolviendo el form, → `<Card>`.

- [ ] **Step 3: `AuditRow.tsx`** — `<summary className="text-blue-600 hover:underline">Ver</summary>` → `text-indigo-600 hover:underline` (único `text-blue-600` del sistema). `<tr className="... hover:bg-slate-50">` se queda. El `<pre className="bg-slate-100 p-2 text-xs">` se queda.

- [ ] **Step 4: `admin/configuracion/page.tsx`** — la pantalla más divergente:
  - `<h1 className="text-3xl font-bold">` → `text-2xl font-bold` (consistencia con las otras páginas admin).
  - `<p className="text-sm text-gray-500">` → `text-sm text-slate-500`.
  - `<div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">` → `<Card>`. `import { Card } from '@/components/ui/Card';`. El `<h2 className="text-lg font-semibold mb-4">` interno se queda dentro del `Card`.

- [ ] **Step 5: `InactivityForm.tsx`**
  - `import { Button } from '@/components/ui/Button';`. Elimina `const inputClass` local; importa de `@/app/(app)/ventas/types`.
  - Botón "Guardar" (`bg-slate-900 shadow-sm transition-colors`) → `<Button type="submit" variant="primary" pending={pending} pendingLabel="Guardando…">Guardar</Button>`.
  - Alerta éxito `bg-green-50 text-green-700` → `text-green-800` (consistencia con el resto).

- [ ] **Step 6:** Run `npm run typecheck && npm run lint && npm run build && npm run test:e2e`. Expected: 0 errores; 38/38 E2E.

- [ ] **Step 7:** Commit:
```bash
git add "src/app/(app)/admin/auditoria/page.tsx" "src/app/(app)/admin/auditoria/AuditFilters.tsx" "src/app/(app)/admin/auditoria/AuditRow.tsx" "src/app/(app)/admin/configuracion/page.tsx" "src/app/(app)/admin/configuracion/InactivityForm.tsx"
git commit -m "feat(diseno): Admin/Auditoría y Configuración alineados con el sistema de diseño

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01EnFJHWm8zVoqgkmfwwcRHi"
```

---

## Task 20: Auth — Login + Setup + Cambiar-contraseña + layout

**Files:** Modify: `src/app/(auth)/layout.tsx`, `src/app/(auth)/login/LoginForm.tsx`, `src/app/(auth)/login/page.tsx`, `src/app/(auth)/setup/SetupForm.tsx`, `src/app/(auth)/cambiar-password/ChangePasswordForm.tsx`

- [ ] **Step 1: `(auth)/layout.tsx`** — envuelve el contenido en un `Card` común para las 3 pantallas de auth:
```tsx
import type { ReactNode } from 'react';
import { Card } from '@/components/ui/Card';

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="mx-auto mt-16 w-full max-w-sm px-4">
      <p className="mb-6 text-center text-2xl font-bold tracking-tight text-slate-900">POS</p>
      <Card>{children}</Card>
    </main>
  );
}
```
(Esto envuelve `LoginForm`/`SetupForm`/`ChangePasswordForm` y los avisos de `page.tsx` en una tarjeta. Verifica que ninguno de los 3 `page.tsx` ya tenga su propio `Card`/borde — si `login/page.tsx` mete su aviso `bg-amber-50` y el `<p>` de contacto DENTRO del mismo `<div className="space-y-4">`, todo eso entra al `Card`, correcto.)

- [ ] **Step 2:** Los 3 forms (`LoginForm`, `SetupForm`, `ChangePasswordForm`) — en cada uno:
  - `import { Button } from '@/components/ui/Button';`. Elimina `const inputClass` local; importa de `@/app/(app)/ventas/types`.
  - Botón submit (`w-full bg-slate-900 shadow-sm transition-colors`, `pending ? 'Xndo…' : 'X'`) → `<Button type="submit" variant="primary" className="w-full" pending={pending} pendingLabel="Xndo…">X</Button>`. Textos: Login `pendingLabel="Entrando…"` children `Entrar`; Setup `pendingLabel="Creando…"` children `Crear administrador`; ChangePassword `pendingLabel="Guardando…"` children `Cambiar contraseña`.
  - En `ChangePasswordForm`, la rama `state.ok`: el `<Link href="/dashboard" className="block w-full rounded-md bg-slate-900 ... text-center ...">Ir al inicio</Link>` → aplícale **Recipe L1** + `w-full text-center` añadidos a la cadena. La alerta `bg-green-50 text-green-700` → `text-green-800`.
  - El bloque de encabezado `<h1 className="text-lg font-semibold text-slate-900">` + `<p className="mt-1 text-sm text-slate-500">` se queda en cada form (no lo muevas al layout — el texto es distinto por pantalla).

- [ ] **Step 3: `login/page.tsx`** — el aviso condicional `<p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">` y el `<p className="text-center text-sm text-slate-500">` de contacto se quedan (ahora dentro del `Card` del layout).

- [ ] **Step 4:** Run `npm run typecheck && npm run lint && npm run build && npm run test:e2e -- setup-login`. Expected: 0 errores; `setup-login.spec.ts` en verde. El texto de los botones ("Entrar", "Crear administrador", "Cambiar contraseña") NO cambia. Verifica que el `Card` del layout no rompa selectores (los tests usan `getByRole('button', ...)` y `getByLabel(...)`, insensibles al wrapper).

- [ ] **Step 5:** Commit:
```bash
git add "src/app/(auth)/layout.tsx" "src/app/(auth)/login/LoginForm.tsx" "src/app/(auth)/login/page.tsx" "src/app/(auth)/setup/SetupForm.tsx" "src/app/(auth)/cambiar-password/ChangePasswordForm.tsx"
git commit -m "feat(diseno): pantallas de Auth en Card común, Button compartido, foco índigo

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01EnFJHWm8zVoqgkmfwwcRHi"
```

---

## Task 21: Verificación final del plan

**Files:** Ninguno nuevo — verificación pura (puede tocar un `.spec.ts` si Tasks 12/14/16/17/18 dejaron algo pendiente).

- [ ] **Step 1:** Run `npm run typecheck && npm run lint && npm run test:unit && npm run test:integration && npm run build && npm run test:e2e`. Expected: typecheck/lint 0/0; unit 233/233; integración 334/334; build OK; e2e ≥38/38 (más cualquier caso nuevo que hayan añadido las tareas con `ConfirmDialog`). Reporta los conteos EXACTOS.

- [ ] **Step 2: Revisión manual de invariantes** — confirma cada uno con el comando usado:
  - (a) `grep -rn "window.confirm" src/` → **0 resultados** (los 5 migrados + los 2 de Plan 2 = 0 restantes; el único hit permitido es el COMENTARIO en `ventas/CancelSaleForm.tsx`).
  - (b) `git diff <MERGE_BASE>..HEAD -- "src/app/(app)/**/actions.ts" "src/lib/"` → **vacío** (ninguna server action ni lógica de dominio tocada).
  - (c) `git diff <MERGE_BASE>..HEAD -- "src/components/DataTable.tsx" "src/components/Pagination.tsx" "src/components/forms/Field.tsx" "src/components/PermissionGate.tsx" "src/components/PasswordStrengthMeter.tsx"` → **vacío**.
  - (d) `grep -rn "esperadoEfectivo\|efectivoContado\|\.diferencia" src/app/\(app\)/caja/SesionAbiertaResumen.tsx` → solo el comentario JSDoc (arqueo a ciegas intacto tras Task 2).
  - (e) `grep -rn "bg-slate-900" src/app src/components --include="*.tsx"` → idealmente 0; si queda alguno, justifica en el reporte por qué (ej. un overlay `bg-slate-900/40` de `ConfirmDialog`/`VariantPicker`, que es correcto).

- [ ] **Step 3:** Commit solo si el Step 1 obligó a tocar un `.spec.ts` no commiteado antes:
```bash
git add -A
git commit -m "test(diseno): ajustes finales de E2E tras la verificación completa de Plan 3

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01EnFJHWm8zVoqgkmfwwcRHi"
```

---

## Global Self-Review (autor del plan)

**Cobertura del spec:** §5.5 (Inventario/Productos/Clientes: tablas con `DataTable`, `Badge` de estado, acciones de fila, formularios con esenciales primero + opcional separado) → Tasks 8-16. Los formularios de Productos (`ProductForm` sección opcional en `bg-slate-50`) y Clientes (`CustomerForm` acordeón CFDI) YA tenían la estructura esencial/opcional — se conserva y se re-tematiza. §5.6 (Reportes: re-tema índigo/gris, primitivos, gráficas) → Tasks 5-7. §5.7 (Admin + Login/Setup/Cambiar-contraseña: mismos primitivos, `ConfirmDialog` en acciones irreversibles) → Tasks 17-20. §5.1 (`<title>`/metadata) → ya hecho en Plan 1. §7 (foco índigo, `ConfirmDialog` en destructivas) → Task 4 (`inputClass`), Recipe C1 (5 `confirm()` + 1 nueva), Tasks con `focus-visible` en filas. §6 (40px táctil) → Task 1. §8 (qué no cambia) → Global Constraints + Task 21 Step 2. §9 (pruebas acopladas) → cada Task con `ConfirmDialog`/`<select>` cambiado corre su E2E y ajusta selectores en el mismo commit.

**Deuda que este plan NO cierra (documentada para un follow-up de pulido, no bloqueante):**
- `CategoryForm.tsx` y `UserFormDialog.tsx` conservan su overlay `<div fixed inset-0>` manual — sin cierre por Escape/backdrop ni trampa de foco (spec §7). Migrarlos a `<dialog>` nativo o a un primitivo `Modal` es un cambio con riesgo E2E alto (ambos muy ejercitados) y excede "retematizar" — queda para después.
- Consolidación TOTAL de `inputClass`: este plan importa el compartido en los archivos que ya toca; los `page.tsx` de listado que solo tienen `inputClass` inline y no se retocan por otra razón quedan con su copia (foco slate) — barrido completo pendiente.
- Banners de alerta (`bg-red-50`/`bg-green-50`/`bg-amber-50 px-3 py-2`): repetidos en ~20 archivos, sin primitivo. La spec fija 6 primitivos; un `Alert`/`Callout` sería el 7º — decisión de producto pendiente. Se dejan como están (ya cumplen la paleta semántica de spec §3.1).
- Inconsistencia `text-green-700` vs `text-green-800` en banners de éxito: este plan la homogeniza a `-800` solo en los archivos que toca (Tasks 19, 20); barrido completo pendiente.

**Consistencia de tipos:** las recetas (B1-B4, L1/L2, D1, S1, C1, K1) definen transformaciones nombradas; cada tarea las referencia por nombre y añade los detalles concretos (textos exactos de `title`/`description`/`confirmLabel`, condición de la rama sin-confirm). Ningún primitivo se modifica salvo `Button` (Task 1, solo `SIZE_CLASSES.md`) e `inputClass` (Task 4, solo el color de foco) — ambos cambios de 1 línea, retrocompatibles con todo Plan 1/2.

**Sin placeholders:** las recetas traen el código exacto del "antes" y el "después"; cada tarea enumera archivo + snippet concreto + valores literales. No hay "similar a la Task N" — hay "aplica Recipe X con estos valores", que es DRY, no vago.

**Riesgo señalado:** 5 tareas migran `window.confirm()` (Tasks 12, 14, 16, 17, 18) y 1 cambia un `<select>` por botones (Task 3). Cada una corre su E2E de módulo y ajusta selectores en el mismo commit. El patrón `requestSubmit()` ya está probado 2× en Plan 2 (cancelar venta, cerrar caja) sin incidencias. El único riesgo residual es que un test E2E aún no identificado dependa del `window.confirm` nativo vía `page.on('dialog')` — Task 21 lo caza con la corrida completa.
