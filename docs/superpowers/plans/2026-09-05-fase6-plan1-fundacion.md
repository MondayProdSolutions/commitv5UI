# FASE 6 Plan 1 — Fundación del sistema de diseño (Implementation Plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establecer la base del sistema de diseño — tipografía real, metadata del `<head>`, primitivos compartidos (`Button`, `Badge`, `Card`, `EmptyState`, `KpiCard`, `ConfirmDialog`), refresco de `Sidebar`/`Topbar` con el acento índigo, y un Dashboard con KPIs reales — sin tocar ninguna pantalla de negocio todavía (eso es Plan 2 y Plan 3).

**Architecture:** Componentes de presentación pura en `src/components/ui/` (nueva carpeta), consumidos primero por `Sidebar`/`Topbar`/`Dashboard` en este plan. `DataTable`/`Pagination`/`Field` (ya existentes) no se tocan en este plan. Sin dependencia nueva — `ConfirmDialog` usa el elemento nativo `<dialog>` del navegador (modal, backdrop y foco gratis, sin JS de terceros).

**Tech Stack:** Next.js 16.3.4 App Router, React 19.2, TypeScript strict, Tailwind v4 (paleta estándar, sin `@theme` custom).

**Spec:** `docs/superpowers/specs/2026-09-05-fase6-diseno-ui-ux-design.md`

## Global Constraints

- **Sin funcionalidad nueva ni reglas de negocio nuevas**, salvo la única excepción ya aprobada en la spec §8: el Dashboard muestra datos reales usando funciones de servicio **ya existentes** (`getSalesReport`, `stockAlertsCount`, `getOpenCashSession`) — no se escribe ninguna consulta ni regla nueva para ello.
- **Colores:** paleta estándar de Tailwind v4 (`slate` neutro, `indigo` acento único, `green`/`amber`/`red` semánticos moderados, `slate` para "información" — no un quinto color). Sin `@theme` custom, sin valores hexadecimales a mano.
- **Tipografía:** Geist Sans debe aplicarse de verdad (hoy `globals.css` la pisa con Arial/Helvetica pese a estar cargada en `layout.tsx`).
- **Sin dependencia nueva.** `ConfirmDialog` usa `<dialog>` nativo.
- **`aria-label="Navegación principal"`** en el `<nav>` de `Sidebar` es un selector usado por E2E existentes (`e2e/reportes.spec.ts`, entre otros) — **no se toca ese string**, bajo ninguna circunstancia.
- **Convención de tests de este repo (verificada, sin excepción en 6 bloques):** los componentes de presentación pura (`Field.tsx`, `DataTable.tsx`, `Pagination.tsx`, las gráficas del Bloque 6) **no llevan test unitario propio** — se verifican con `typecheck`+`lint`+`build`. Este plan sigue la misma convención para `Button`/`Badge`/`Card`/`EmptyState`/`KpiCard`. `ConfirmDialog` es la única excepción de comportamiento interactivo sin cobertura automatizada en este plan — se deja documentado como deuda deliberada (Task 5), verificado en el smoke E2E de Task 8 y, con más profundidad, cuando Plan 2 lo integre en flujos reales (cancelar venta, cerrar caja).
- **TypeScript strict:** sin `any`, sin `console.*`.
- **Commits:** Conventional Commits en español, terminando EXACTAMENTE con:
  ```
  Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01EnFJHWm8zVoqgkmfwwcRHi
  ```
- **Sin push, sin remoto, sin deploy.** Todo local.

---

## Estructura de archivos

- `src/app/globals.css` — corrige `font-family` del `body`.
- `src/app/layout.tsx` — metadata real.
- `src/components/ui/Button.tsx` — nuevo.
- `src/components/ui/Badge.tsx` — nuevo.
- `src/components/ui/Card.tsx` — nuevo.
- `src/components/ui/EmptyState.tsx` — nuevo.
- `src/components/ui/KpiCard.tsx` — nuevo.
- `src/components/ui/ConfirmDialog.tsx` — nuevo.
- `src/components/Sidebar.tsx` — modificado (nav activa con acento índigo).
- `src/components/Topbar.tsx` — modificado (foco consistente).
- `src/app/(app)/dashboard/page.tsx` — reescrito (KPIs reales).
- `e2e/dashboard.spec.ts` — nuevo (smoke).

---

## Task 1: Tipografía real + metadata del `<head>`

**Files:**
- Modify: `src/app/globals.css`, `src/app/layout.tsx`

**Interfaces:**
- Sin interfaces nuevas — cambio de configuración puro.

- [ ] **Step 1: Corregir `src/app/globals.css`**

Reemplaza el archivo completo por:

```css
@import "tailwindcss";

:root {
  --background: #ffffff;
  --foreground: #171717;
}

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --font-sans: var(--font-geist-sans);
  --font-mono: var(--font-geist-mono);
}

@media (prefers-color-scheme: dark) {
  :root {
    --background: #0a0a0a;
    --foreground: #ededed;
  }
}

body {
  background: var(--background);
  color: var(--foreground);
  font-family: var(--font-sans), ui-sans-serif, system-ui, sans-serif;
}
```

(Único cambio real: la línea `font-family` del `body` ahora usa `var(--font-sans)` — que `@theme inline` ya resuelve a `var(--font-geist-sans)` — en vez de `Arial, Helvetica, sans-serif`.)

- [ ] **Step 2: Corregir metadata en `src/app/layout.tsx`**

Cambia únicamente el bloque `metadata`:

```ts
export const metadata: Metadata = {
  title: "POS",
  description: "Sistema de punto de venta",
};
```

(El resto del archivo — imports, `RootLayout`, fuentes — no cambia.)

- [ ] **Step 3: Verificar**

Run: `npm run typecheck && npm run lint && npm run build`
Expected: 0 errores. Build exitoso (cambio puramente visual/metadata, no afecta rutas).

- [ ] **Step 4: Commit**

```bash
git add src/app/globals.css src/app/layout.tsx
git commit -m "fix(diseno): aplica Geist Sans de verdad y corrige metadata del head

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01EnFJHWm8zVoqgkmfwwcRHi"
```

---

## Task 2: Primitivo `Button`

**Files:**
- Create: `src/components/ui/Button.tsx`

**Interfaces:**
- Produces: `Button` — componente, props `ButtonProps` (extiende `ButtonHTMLAttributes<HTMLButtonElement>` + `variant?: 'primary'|'secondary'|'danger'|'danger-solid'`, `size?: 'sm'|'md'`, `pending?: boolean`, `pendingLabel?: ReactNode`). Consumido por Tasks 5, 6, 7 de este plan, y por todas las pantallas de Plan 2/3.

- [ ] **Step 1: Escribir `src/components/ui/Button.tsx`**

```tsx
import type { ButtonHTMLAttributes, ReactNode } from 'react';

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'danger-solid';
type ButtonSize = 'sm' | 'md';

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: 'bg-indigo-600 text-white shadow-sm hover:bg-indigo-700 disabled:opacity-60',
  secondary: 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 disabled:opacity-60',
  danger: 'bg-white border border-red-300 text-red-700 hover:bg-red-50 disabled:opacity-60',
  'danger-solid': 'bg-red-600 text-white shadow-sm hover:bg-red-700 disabled:opacity-60',
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: 'px-2.5 py-1.5 text-xs',
  md: 'px-4 py-2 text-sm',
};

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  pending?: boolean;
  pendingLabel?: ReactNode;
  children: ReactNode;
};

/**
 * Botón compartido — 4 variantes, nada más. Una pantalla tiene, como máximo,
 * un `primary` visible a la vez (la acción principal). Reemplaza las 16
 * variantes de "botón primario" que existían sueltas por el código antes de
 * este primitivo.
 *
 * `pending`/`pendingLabel` consolidan el patrón `SubmitBtn` local que varios
 * formularios duplicaban (ej. `CustomerPicker.tsx`, `InactivityForm.tsx`):
 * el llamador sigue leyendo `useFormStatus()`/`useActionState()` como hoy y
 * pasa el resultado a estas dos props.
 */
export function Button({
  variant = 'secondary',
  size = 'md',
  pending = false,
  pendingLabel,
  disabled,
  className = '',
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      disabled={disabled || pending}
      className={
        'inline-flex items-center justify-center gap-1.5 rounded-md font-medium transition-colors ' +
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-1 ' +
        VARIANT_CLASSES[variant] +
        ' ' +
        SIZE_CLASSES[size] +
        ' ' +
        className
      }
    >
      {pending && pendingLabel ? pendingLabel : children}
    </button>
  );
}
```

- [ ] **Step 2: Verificar**

Run: `npm run typecheck && npm run lint && npm run build`
Expected: 0 errores. Sin test dedicado (convención del repo — ver Global Constraints).

- [ ] **Step 3: Commit**

```bash
git add src/components/ui/Button.tsx
git commit -m "feat(diseno): primitivo Button compartido (4 variantes)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01EnFJHWm8zVoqgkmfwwcRHi"
```

---

## Task 3: Primitivos `Badge`, `Card`, `EmptyState`

**Files:**
- Create: `src/components/ui/Badge.tsx`, `src/components/ui/Card.tsx`, `src/components/ui/EmptyState.tsx`

**Interfaces:**
- Produces: `Badge` (`tone?: 'success'|'warning'|'danger'|'neutral'`, default `'neutral'`); `Card` (`className?: string`, envoltura simple); `EmptyState` (`message: string`, `action?: {label: string; href: string}`).

- [ ] **Step 1: `src/components/ui/Badge.tsx`**

```tsx
import type { ReactNode } from 'react';

type BadgeTone = 'success' | 'warning' | 'danger' | 'neutral';

const TONE_CLASSES: Record<BadgeTone, string> = {
  success: 'bg-green-100 text-green-800',
  warning: 'bg-amber-100 text-amber-800',
  danger: 'bg-red-100 text-red-800',
  neutral: 'bg-slate-200 text-slate-600',
};

/** Un tono = un significado, igual en todo el sistema (ej. `warning` siempre es "atención", nunca otra cosa en otra pantalla). */
export function Badge({ tone = 'neutral', children }: { tone?: BadgeTone; children: ReactNode }) {
  return (
    <span
      className={
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ' + TONE_CLASSES[tone]
      }
    >
      {children}
    </span>
  );
}
```

- [ ] **Step 2: `src/components/ui/Card.tsx`**

```tsx
import type { ReactNode } from 'react';

/** Reemplaza el `<div className="rounded-lg border border-slate-200 bg-white p-...">` repetido a mano en cada pantalla. */
export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={'rounded-lg border border-slate-200 bg-white p-5 ' + className}>{children}</div>;
}
```

- [ ] **Step 3: `src/components/ui/EmptyState.tsx`**

```tsx
import Link from 'next/link';

/** Reemplaza los textos sueltos "Sin resultados." de cada tabla, con una acción opcional para salir del estado vacío. */
export function EmptyState({
  message,
  action,
}: {
  message: string;
  action?: { label: string; href: string };
}) {
  return (
    <div className="py-8 text-center text-sm text-slate-500">
      <p>{message}</p>
      {action ? (
        <Link href={action.href} className="mt-1 inline-block font-medium text-indigo-600 hover:text-indigo-700">
          {action.label}
        </Link>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 4: Verificar**

Run: `npm run typecheck && npm run lint && npm run build`
Expected: 0 errores. Sin test dedicado.

- [ ] **Step 5: Commit**

```bash
git add src/components/ui/Badge.tsx src/components/ui/Card.tsx src/components/ui/EmptyState.tsx
git commit -m "feat(diseno): primitivos Badge, Card y EmptyState

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01EnFJHWm8zVoqgkmfwwcRHi"
```

---

## Task 4: Primitivo `KpiCard`

**Files:**
- Create: `src/components/ui/KpiCard.tsx`

**Interfaces:**
- Produces: `KpiCard({ label, value, hint?, tone?, href? })` — `label: string`, `value: ReactNode`, `hint?: string`, `tone?: 'default'|'warning'` (default `'default'`), `href?: string`. Consumido por Task 7 (Dashboard) de este plan, y por Reportes en Plan 3.

- [ ] **Step 1: Escribir `src/components/ui/KpiCard.tsx`**

```tsx
import Link from 'next/link';
import type { ReactNode } from 'react';

/**
 * Tarjeta de una cifra que responde una pregunta concreta ("¿Cuánto vendí
 * hoy?"). Si se pasa `href`, la tarjeta completa enlaza a la pantalla que
 * explica esa cifra a fondo — el KPI no reemplaza esa pantalla, solo
 * responde la pregunta rápida.
 */
export function KpiCard({
  label,
  value,
  hint,
  tone = 'default',
  href,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  tone?: 'default' | 'warning';
  href?: string;
}) {
  const content = (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <p className="text-xs text-slate-500">{label}</p>
      <p
        className={
          'mt-1.5 text-2xl font-bold tracking-tight ' +
          (tone === 'warning' ? 'text-amber-700' : 'text-slate-900')
        }
      >
        {value}
      </p>
      {hint ? <p className="mt-1 text-xs text-slate-400">{hint}</p> : null}
    </div>
  );

  if (href) {
    return (
      <Link href={href} className="block rounded-lg transition-shadow hover:shadow-sm">
        {content}
      </Link>
    );
  }
  return content;
}
```

- [ ] **Step 2: Verificar**

Run: `npm run typecheck && npm run lint && npm run build`
Expected: 0 errores. Sin test dedicado.

- [ ] **Step 3: Commit**

```bash
git add src/components/ui/KpiCard.tsx
git commit -m "feat(diseno): primitivo KpiCard (tarjeta de una cifra + enlace)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01EnFJHWm8zVoqgkmfwwcRHi"
```

---

## Task 5: Primitivo `ConfirmDialog`

**Files:**
- Create: `src/components/ui/ConfirmDialog.tsx`

**Interfaces:**
- Consumes: `Button` (Task 2) — `import { Button } from './Button'`.
- Produces: `ConfirmDialog({ open, onOpenChange, title, description, confirmLabel, onConfirm, pending? })`. Reemplaza los `confirm()` nativos del navegador. **No se integra a ninguna pantalla real en este plan** — eso ocurre en Plan 2 (cancelar venta, cerrar caja) y Plan 3 (archivar, ajustar inventario, desactivar usuario, borrar rol). Verificación de comportamiento real diferida a esos planes (ver Global Constraints).

- [ ] **Step 1: Escribir `src/components/ui/ConfirmDialog.tsx`**

```tsx
'use client';

import { useEffect, useRef } from 'react';
import type { MouseEvent } from 'react';
import { Button } from './Button';

/**
 * Confirmación de una acción destructiva/crítica (cancelar venta, cerrar
 * caja, archivar, ajustar inventario, desactivar usuario, borrar rol).
 * Usa el elemento `<dialog>` nativo — modal, backdrop y manejo de foco
 * vienen gratis del navegador, sin dependencia nueva. Cierra con Escape
 * (evento `cancel` nativo) o clic en el fondo; ambos casos notifican
 * `onOpenChange(false)` igual que el botón "Volver".
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  onConfirm,
  pending = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel: string;
  onConfirm: () => void;
  pending?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  function handleBackdropClick(e: MouseEvent<HTMLDialogElement>) {
    if (e.target === ref.current) onOpenChange(false);
  }

  return (
    <dialog
      ref={ref}
      onClose={() => onOpenChange(false)}
      onCancel={() => onOpenChange(false)}
      onClick={handleBackdropClick}
      className="w-full max-w-sm rounded-lg border border-red-200 bg-white p-5 shadow-lg backdrop:bg-slate-900/40"
    >
      <p className="text-sm font-semibold text-slate-900">{title}</p>
      <p className="mt-1.5 text-sm text-slate-600">{description}</p>
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="secondary" size="sm" type="button" onClick={() => onOpenChange(false)}>
          Volver
        </Button>
        <Button
          variant="danger-solid"
          size="sm"
          type="button"
          pending={pending}
          pendingLabel="Procesando…"
          onClick={onConfirm}
        >
          {confirmLabel}
        </Button>
      </div>
    </dialog>
  );
}
```

- [ ] **Step 2: Verificar**

Run: `npm run typecheck && npm run lint && npm run build`
Expected: 0 errores.

- [ ] **Step 3: Commit**

```bash
git add src/components/ui/ConfirmDialog.tsx
git commit -m "feat(diseno): primitivo ConfirmDialog (dialog nativo, reemplaza confirm())

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01EnFJHWm8zVoqgkmfwwcRHi"
```

---

## Task 6: `Sidebar` y `Topbar` — acento índigo y foco consistente

**Files:**
- Modify: `src/components/Sidebar.tsx`, `src/components/Topbar.tsx`

**Interfaces:**
- Consumes: `Badge` (Task 3) — `import { Badge } from './ui/Badge'`.
- No produce interfaces nuevas.

**⚠️ NO CAMBIAR:** el string `aria-label="Navegación principal"` en `Sidebar.tsx` — lo usan E2E existentes (`e2e/reportes.spec.ts` y otros) como selector exacto.

- [ ] **Step 1: Modificar `src/components/Sidebar.tsx`**

Archivo actual (para ubicar el cambio): la función `Sidebar` renderiza `<aside>` → `<nav aria-label="Navegación principal">` → `<ul>` de `<li><Link>`. Los dos bloques que cambian:

Reemplaza el bloque de clases del `<Link>` (el que hoy es `'flex items-center justify-between rounded-md px-3 py-2 text-sm font-medium ' + (active ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-200')`) por:

```tsx
                <Link
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  className={
                    'flex items-center justify-between rounded-md border-l-2 px-3 py-2 text-sm font-medium ' +
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ' +
                    (active
                      ? 'border-indigo-600 bg-indigo-50 text-indigo-700'
                      : 'border-transparent text-slate-700 hover:bg-slate-100')
                  }
                >
                  <span>{item.label}</span>
                  {showBadge && <Badge tone="danger">{stockAlerts}</Badge>}
                </Link>
```

(El `Badge tone="danger"` reemplaza el `<span>` de conteo manual — con el nuevo fondo claro de la fila activa ya no hace falta una variante "invertida" para cuando la fila está seleccionada, a diferencia de antes con el fondo sólido oscuro.)

Añade el import al inicio del archivo:

```tsx
import { Badge } from './ui/Badge';
```

El resto del archivo (imports existentes, `isActive`, `stockAlerts`, el `<div>` con "POS", `aria-label="Navegación principal"`) **no cambia**.

- [ ] **Step 2: Modificar `src/components/Topbar.tsx`**

Añade `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500` a las clases del `<summary>` y del `<button type="submit">` de "Cerrar sesión" (los dos únicos elementos interactivos del archivo). Ejemplo del `<summary>`:

```tsx
        <summary className="flex cursor-pointer list-none items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 [&::-webkit-details-marker]:hidden">
```

Y el botón de cerrar sesión:

```tsx
            <button
              type="submit"
              className="block w-full px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
            >
```

El resto del archivo no cambia.

- [ ] **Step 3: Verificar**

Run: `npm run typecheck && npm run lint && npm run build && npm run test:unit && npm run test:integration`
Expected: 0 errores; toda la suite existente sigue en verde (ningún test depende de las clases CSS que cambian; sí depende de `aria-label="Navegación principal"`, que no se tocó).

- [ ] **Step 4: Commit**

```bash
git add src/components/Sidebar.tsx src/components/Topbar.tsx
git commit -m "feat(diseno): Sidebar con acento índigo en nav activa; foco consistente en Topbar

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01EnFJHWm8zVoqgkmfwwcRHi"
```

---

## Task 7: Dashboard con KPIs reales

**Files:**
- Modify: `src/app/(app)/dashboard/page.tsx`

**Interfaces:**
- Consumes: `KpiCard` (Task 4); `requireUser` (`@/lib/auth/context`); `can` (`@/lib/auth/rbac`); `getSalesReport` (`@/lib/reports/ventas`) + `resolvePeriod` (`@/lib/reports/period`); `stockAlertsCount` (`@/lib/inventory/stock`); `getOpenCashSession` (`@/lib/cash/sessions`); `money`/`fmtFechaMX` (`@/app/(app)/ventas/types`). Ninguna de estas funciones se modifica — son las mismas ya probadas en Bloques 2/5/6.
- Cada tarjeta se muestra solo si el actor tiene el permiso que ya protege esa información en su pantalla completa: "Cuánto vendí"/"Cuántas ventas" → `reportes.ver`; "Stock bajo" → `inventario.ver`; "Caja abierta" → `caja.gestionar`.

- [ ] **Step 1: Reescribir `src/app/(app)/dashboard/page.tsx`**

```tsx
import { requireUser } from '@/lib/auth/context';
import { can } from '@/lib/auth/rbac';
import { getSalesReport } from '@/lib/reports/ventas';
import { resolvePeriod } from '@/lib/reports/period';
import { stockAlertsCount } from '@/lib/inventory/stock';
import { getOpenCashSession } from '@/lib/cash/sessions';
import { money, fmtFechaMX } from '@/app/(app)/ventas/types';
import { KpiCard } from '@/components/ui/KpiCard';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const actor = await requireUser();

  const verVentas = can(actor, 'reportes.ver');
  const verInventario = can(actor, 'inventario.ver');
  const verCaja = can(actor, 'caja.gestionar');

  const [ventasHoy, stockBajo, cajaAbierta] = await Promise.all([
    verVentas ? getSalesReport(resolvePeriod({ atajo: 'hoy' })) : Promise.resolve(null),
    verInventario ? stockAlertsCount() : Promise.resolve(null),
    verCaja ? getOpenCashSession() : Promise.resolve(null),
  ]);

  const sinKpis = !verVentas && !verInventario && !verCaja;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Hola, {actor.nombre}</h1>
        <p className="text-slate-600">Esto es lo que está pasando hoy.</p>
      </div>

      {sinKpis ? (
        <p className="text-sm text-slate-500">No hay información para mostrar con tu rol.</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {verVentas && ventasHoy ? (
            <KpiCard
              label="¿Cuánto vendí hoy?"
              value={money(ventasHoy.kpis.ingresoNeto)}
              hint="neto de devoluciones"
              href="/reportes/ventas?atajo=hoy"
            />
          ) : null}
          {verVentas && ventasHoy ? (
            <KpiCard
              label="¿Cuántas ventas hice hoy?"
              value={String(ventasHoy.kpis.ventasCompletadas)}
              hint={`ticket promedio ${money(ventasHoy.kpis.ticketPromedio)}`}
              href="/reportes/ventas?atajo=hoy"
            />
          ) : null}
          {verInventario && stockBajo !== null ? (
            <KpiCard
              label="¿Hay productos con poco stock?"
              value={String(stockBajo)}
              hint="productos en stock bajo/agotado"
              tone={stockBajo > 0 ? 'warning' : 'default'}
              href="/inventario/stock-bajo"
            />
          ) : null}
          {verCaja ? (
            <KpiCard
              label="¿Caja abierta?"
              value={cajaAbierta ? `Sí — ${cajaAbierta.folio}` : 'No'}
              hint={
                cajaAbierta
                  ? `abierta por ${cajaAbierta.abiertaPorNombre} · ${fmtFechaMX(cajaAbierta.abiertaEn)}`
                  : undefined
              }
              href="/caja"
            />
          ) : null}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verificar**

Run: `npm run typecheck && npm run lint && npm run build`
Expected: 0 errores.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(app)/dashboard/page.tsx"
git commit -m "feat(diseno): Dashboard con KPIs reales (ventas, inventario, caja) por permiso

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01EnFJHWm8zVoqgkmfwwcRHi"
```

---

## Task 8: E2E del Dashboard + verificación final del plan

**Files:**
- Create: `e2e/dashboard.spec.ts`

**Interfaces:**
- Consumes: helpers de `e2e/helpers.ts` (`doSetup`, `login`); patrón de `e2e/caja.spec.ts` para abrir caja y sembrar una venta (duplica localmente los helpers pequeños que necesite, mismo criterio ya usado en `e2e/reportes.spec.ts`/`e2e/caja.spec.ts`).

- [ ] **Step 1: `e2e/dashboard.spec.ts`**

```ts
import { test, expect, type Page } from '@playwright/test';
import { doSetup, login } from './helpers';

/**
 * Smoke E2E del Dashboard (FASE 6 Plan 1): confirma que un Administrador ve
 * las 4 tarjetas KPI con datos reales, y que un rol sin ningún permiso
 * relevante ve el mensaje neutro en vez de tarjetas vacías.
 */

function sufijo(): string {
  return `${Date.now().toString(36)}${Math.floor(Math.random() * 1_000_000).toString(36)}`;
}

async function crearProductoSimple(
  page: Page,
  opts: { nombre: string; precio: number; stock: number; barcode: string },
): Promise<void> {
  await page.goto('/productos/nuevo');
  await page.getByLabel('Nombre', { exact: true }).fill(opts.nombre);
  await page.getByLabel('Código de barras (opcional)').fill(opts.barcode);
  await page.getByLabel('Precio de venta (sin impuesto)').fill(String(opts.precio));
  await page.getByLabel('Stock inicial').fill(String(opts.stock));
  await page.getByRole('button', { name: 'Crear producto' }).click();
  await expect(page).toHaveURL(/\/productos\/(?!nuevo)[^/]+$/);
}

test('Administrador ve las 4 tarjetas del Dashboard con datos reales', async ({ page }) => {
  test.setTimeout(180_000);
  await doSetup(page);

  const suf = sufijo();
  const barcode = `9${Date.now()}`;
  await crearProductoSimple(page, { nombre: `TFase6 Refresco ${suf}`, precio: 100, stock: 10, barcode });

  // Abrir caja como Administrador (tiene caja.gestionar vía ALL_PERMISSION_KEYS).
  await page.goto('/caja');
  await page.getByLabel('Fondo de apertura').fill('500');
  await page.getByRole('button', { name: 'Abrir caja' }).click();
  await expect(page.getByRole('link', { name: 'Cerrar caja (arqueo)' })).toBeVisible();

  // Vender 1 ud (116.00) para que el KPI de ventas no sea cero.
  await page.goto('/ventas');
  const buscar = page.getByLabel('Buscar producto');
  await buscar.fill(barcode);
  await buscar.press('Enter');
  await expect(page.getByRole('table').getByRole('spinbutton')).toHaveValue('1');
  await page.getByRole('button', { name: /^Cobrar/ }).click();
  await page.getByRole('button', { name: 'Efectivo exacto' }).click();
  await page.getByRole('button', { name: 'Confirmar venta' }).click();
  await expect(page).toHaveURL(/\/ventas\/(?!historial|devoluciones)[^/]+$/);

  await page.goto('/dashboard');
  await expect(page.getByText('¿Cuánto vendí hoy?')).toBeVisible();
  await expect(page.getByText('¿Cuántas ventas hice hoy?')).toBeVisible();
  await expect(page.getByText('¿Hay productos con poco stock?')).toBeVisible();
  await expect(page.getByText('¿Caja abierta?')).toBeVisible();
  await expect(page.getByText('Sí —')).toBeVisible();
});

test('Empleado (sin reportes.ver ni caja.gestionar) solo ve la tarjeta de inventario', async ({
  page,
  browser,
}) => {
  test.setTimeout(180_000);
  await doSetup(page);

  const email = `tfase6-empleado-${Date.now()}@pos.com`;
  await page.goto('/admin/usuarios');
  await page.getByRole('button', { name: 'Crear usuario' }).click();
  const dialog = page.locator('form').filter({ has: page.getByRole('button', { name: 'Crear', exact: true }) });
  await dialog.getByLabel('Nombre').fill('Empleado Dashboard');
  await dialog.getByLabel('Correo electrónico').fill(email);
  await dialog.getByLabel('Rol').selectOption({ label: 'Empleado' });
  await dialog.getByRole('button', { name: 'Crear', exact: true }).click();
  await expect(page.getByText('Usuario creado correctamente.')).toBeVisible();
  const temp = (await page.getByTestId('temp-password').innerText()).trim();
  await page.getByRole('button', { name: 'Entendido' }).click();

  const ctx = await browser.newContext();
  const empleado = await ctx.newPage();
  try {
    await login(empleado, email, temp);
    await expect(empleado).toHaveURL(/\/cambiar-password/);
    await empleado.getByLabel('Contraseña nueva', { exact: true }).fill('empleadoDash99');
    await empleado.getByLabel('Confirmar contraseña nueva', { exact: true }).fill('empleadoDash99');
    await empleado.getByRole('button', { name: 'Cambiar contraseña' }).click();
    await expect(empleado.getByText('Contraseña actualizada')).toBeVisible();

    await empleado.goto('/dashboard');
    await expect(empleado.getByText('¿Hay productos con poco stock?')).toBeVisible();
    await expect(empleado.getByText('¿Cuánto vendí hoy?')).toHaveCount(0);
    await expect(empleado.getByText('¿Caja abierta?')).toHaveCount(0);
  } finally {
    await ctx.close();
  }
});
```

- [ ] **Step 2: Ejecutar** — `npm run test:e2e -- dashboard` → ambos casos verdes.

- [ ] **Step 3: Verificación final del plan — suite completa**

Run: `npm run typecheck && npm run lint && npm run test:unit && npm run test:integration && npm run build && npm run test:e2e`
Expected: 0 errores; las 602 pruebas previas (233 unit + 334 integración + 35 E2E) siguen en verde, más las 2 nuevas de este task.

- [ ] **Step 4: Commit**

```bash
git add e2e/dashboard.spec.ts
git commit -m "test(diseno): E2E del Dashboard — KPIs reales por permiso

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01EnFJHWm8zVoqgkmfwwcRHi"
```

---

## Verificación final del plan (tras la revisión de rama completa)

- [ ] `npm run typecheck` → 0 · `npm run lint` → 0 · `npm run test:unit` → verde · `npm run test:integration` → verde y estable en 3 corridas · `npm run build` → OK · `npm run test:e2e` → verde (37 tests: 35 previos + 2 nuevos).
- [ ] Revisión visual/UX: (a) `aria-label="Navegación principal"` intacto; (b) ninguna aserción de negocio (montos, permisos, folios) fue debilitada para que un test pase; (c) el Dashboard no introduce ninguna consulta o regla de negocio nueva — solo reutiliza `getSalesReport`/`stockAlertsCount`/`getOpenCashSession` ya probados; (d) `ConfirmDialog` queda construido pero sin integrar a ninguna pantalla real todavía (deuda deliberada, documentada, para Plan 2/3); (e) sin `console.*`, sin `any`, sin dependencia nueva en `package.json`.
- [ ] `docs/superpowers/decisions-fase6-plan1.md` si el plan tomó decisiones no evidentes (opcional).

---

## Global Self-Review (autor del plan)

**Cobertura del spec:** §3.1/3.2 (color/tipografía) → Task 1. §3.3 (espaciado/radios/sombras) → ya encapsulado dentro de los primitivos de Tasks 2-5, sin task propia porque no hay archivo de configuración central que tocar (Tailwind v4 sin `@theme` custom). §4 (primitivos) → Tasks 2-5. §5.1 (Sidebar/Topbar) → Task 6. §5.4 (Dashboard) → Task 7. §6/§7 (responsive/accesibilidad) → el foco visible se resuelve en Task 6 para la navegación; el resto (tamaño táctil, contraste en tablas/formularios) se aplica pantalla por pantalla en Plan 2/3, donde existen las tablas/formularios reales que tocar. §8 (qué no cambia) → respetado explícitamente en cada task. §9 (riesgo de tests acoplados) → ninguna Task de este plan renombra un texto/rol que un test existente use como selector (confirmado al escribir cada task); Task 6 señala expresamente el único string que no se puede tocar.

**Consistencia de tipos:** `ButtonProps`/`BadgeTone` se definen una sola vez (Tasks 2-3) y ningún task posterior redefine un tipo con otro nombre. `KpiCard` (Task 4) es exactamente lo que Task 7 importa y usa — mismo nombre de props (`label`/`value`/`hint`/`tone`/`href`).

**Sin placeholders:** cada task trae el código completo del archivo o del fragmento exacto a insertar; ninguna tarea dice "implementar según convenga".

**Riesgo señalado:** Task 5 (`ConfirmDialog`) es la única pieza de este plan que queda sin integrar a un flujo real y sin cobertura automatizada de su comportamiento interactivo (abrir/cerrar/confirmar) — es una decisión deliberada (no tiene dónde integrarse todavía, esas pantallas son Plan 2/3) y queda documentada en el ledger de ejecución para que Plan 2 la retome explícitamente al integrarla por primera vez.
