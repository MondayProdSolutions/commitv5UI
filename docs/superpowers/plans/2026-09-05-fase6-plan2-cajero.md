# FASE 6 Plan 2 — Pantallas críticas del cajero (Ventas/POS + Caja) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Retematizar Ventas/POS y Caja (todas sus pantallas) con los primitivos de Plan 1 (`Button`/`Badge`/`Card`/`EmptyState`/`ConfirmDialog`), aplicar el layout de 2 columnas de Ventas/POS con el TOTAL en tipografía crítica, y añadir confirmación real (`ConfirmDialog`) a cancelar venta y cerrar caja — sin cambiar ninguna regla de negocio, cálculo, permiso ni validación.

**Architecture:** Cada archivo conserva exactamente su estado/lógica/server actions actuales; solo cambia el JSX de presentación (clases Tailwind, envoltura en primitivos) y, en 2 archivos (`CancelSaleForm.tsx`, `CerrarCajaForm.tsx`), se añade un `useState` de apertura/cierre de diálogo que gatilla la MISMA server action de siempre vía `formRef.current?.requestSubmit()`. `CashierScreen.tsx` reordena su JSX de layout (dos columnas → franja superior + dos columnas) sin tocar ningún handler ni estado.

**Tech Stack:** Next.js 16.3.4 App Router, React 19.2, TypeScript strict, Tailwind v4.

**Spec:** `docs/superpowers/specs/2026-09-05-fase6-diseno-ui-ux-design.md` (§5.2 Ventas/POS, §5.3 Caja, §9 riesgo de pruebas acopladas).

## Global Constraints

- **Sin funcionalidad nueva, sin cambio de regla de negocio, cálculo, permiso o validación en ningún archivo.** Cada task preserva el `formAction`/server action exacto, sus parámetros y su nombre.
- **Excepción explícita ya aprobada:** `CerrarCajaForm.tsx` hoy NO tiene ningún paso de confirmación (nativo ni custom) — Task 12 AÑADE un `ConfirmDialog` antes del submit real. Es un gate de UI puro: la server action `cerrarCajaAction` no cambia.
- **Arqueo a ciegas:** ningún archivo de sesión abierta (`PanelCajaAbierta.tsx`, la rama `ABIERTA` de `sesiones/[id]/page.tsx`) debe leer o renderizar `esperadoEfectivo`/`diferencia`/`efectivoContado` de `CashSessionDetail`. Verificado hoy: no lo hacen. Ningún task de este plan cambia esto.
- **NO TOCAR:** `TicketView.tsx`, `CorteView.tsx` (salvo el `DiferenciaBadge` en Task 13, ver abajo), `PrintOnMount.tsx`, `VariantPicker.tsx` — tienen su propio sistema visual (impresión térmica / overlay funcional) fuera del alcance de este plan.
- **`Button` (`src/components/ui/Button.tsx`) es un `<button>` HTML — nunca se usa para envolver un `<Link>`.** Donde hoy un `<Link>` está estilizado como botón primario (`bg-slate-900 ...`), se actualiza manualmente su `className` a la clase equivalente de `Button` variant="primary" (ver Task 11), sin importar el componente `Button`.
- **`Card` (`rounded-lg border border-slate-200 bg-white p-5`) reemplaza contenedores manuales `rounded-lg border border-slate-200 bg-white p-4` — el padding pasa de `p-4` a `p-5` (ambos permitidos por la spec §3.3); es un cambio deliberado, no un descuido.** `Card` solo renderiza `<div>`; los formularios de filtro (`<form method="get">`) NO se envuelven en `Card` — conservan su `className` manual actual sin cambios (solo su botón "Filtrar" se actualiza a `Button`).
- **Mapeo de tonos al consolidar `Badge` locales → `Badge` compartido:** `green→success`, `amber→warning`, `red→danger`, `slate→neutral`.
- **602+ pruebas previas deben seguir en verde.** Ningún texto/rol accesible usado como selector E2E cambia de contenido — solo cambia el elemento/clases que lo envuelven. Si una tarea necesitara renombrar un texto/rol usado por un test, el mismo commit actualiza ese selector (spec §9) — no se espera que ninguna tarea de este plan lo necesite.
- **TypeScript strict:** sin `any`, sin `console.*`. **Commits:** Conventional Commits en español, terminando EXACTAMENTE con:
  ```
  Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01EnFJHWm8zVoqgkmfwwcRHi
  ```
- **Sin push, sin remoto, sin deploy.** Todo local.

---

## Estructura de archivos

**Ventas** — modifica: `TotalsPanel.tsx`, `CashierScreen.tsx`, `CartTable.tsx`, `PaymentPanel.tsx`, `ProductSearchInput.tsx`, `CategoryGrid.tsx`, `CustomerPicker.tsx`, `DiscountPopover.tsx`, `CancelSaleForm.tsx`, `[id]/page.tsx`, `historial/page.tsx`, `devoluciones/page.tsx`, `ReturnForm.tsx`.
**Caja** — modifica: `AbrirCajaForm.tsx`, `CashMovementForm.tsx`, `PanelCajaAbierta.tsx`, `sesiones/[id]/page.tsx`, `cerrar/CerrarCajaForm.tsx`, `CorteView.tsx`, `historial/page.tsx`.
**Nuevo:** `src/app/(app)/caja/SesionAbiertaResumen.tsx` (extraído de la duplicación entre `PanelCajaAbierta.tsx` y `sesiones/[id]/page.tsx`).

---

## Task 1: `TotalsPanel` — cifra crítica 34px/800

**Files:** Modify: `src/app/(app)/ventas/TotalsPanel.tsx`

**Interfaces:** Sin cambios de props (`{ quote: SaleComputeResult | null }`). Consumido sin cambios por `CashierScreen.tsx` (Task 2).

- [ ] **Step 1: Reemplazar el archivo completo**

```tsx
'use client';

import { money, type SaleComputeResult } from './types';

function Row({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div
      className={
        strong
          ? 'flex items-baseline justify-between border-t border-slate-200 pt-2'
          : 'flex items-center justify-between text-slate-600'
      }
    >
      <dt className={strong ? 'text-sm font-semibold text-slate-700' : undefined}>{label}</dt>
      <dd
        className={
          'tabular-nums ' +
          (strong ? 'text-[34px] font-extrabold leading-none text-slate-900' : '')
        }
      >
        {value}
      </dd>
    </div>
  );
}

const round2 = (x: number): number => Math.round(x * 100) / 100;

export function TotalsPanel({ quote }: { quote: SaleComputeResult | null }) {
  const dash = '—';
  const descuentos = quote ? quote.descuentoLineas + quote.descuentoTicket : 0;
  // "Subtotal" mostrado = base BRUTA (previa a descuentos), de modo que en
  // pantalla `Subtotal − Descuentos + IVA == Total`. `quote.subtotal` ya es la
  // base NETA (post-descuento); la identidad de reconstrucción es exacta.
  const baseBruta = quote
    ? round2(quote.subtotal + quote.descuentoLineas + quote.descuentoTicket)
    : 0;

  return (
    <dl className="space-y-1.5 rounded-lg border border-slate-200 bg-white p-4 text-sm">
      <Row label="Subtotal" value={quote ? money(baseBruta) : dash} />
      {descuentos > 0 ? <Row label="Descuentos" value={`− ${money(descuentos)}`} /> : null}
      <Row label="IVA" value={quote ? money(quote.impuestos) : dash} />
      <Row label="Total" value={quote ? money(quote.total) : dash} strong />
    </dl>
  );
}
```

(Único cambio real: dentro de `Row`, cuando `strong`, el `dt` se queda en `text-sm font-semibold text-slate-700` — legible pero discreto — y el `dd` (el número) sube a `text-[34px] font-extrabold leading-none text-slate-900`, cumpliendo la spec §3.2 "Total de venta / cifra crítica: 34–36px, 800". El contenedor `<dl>` no cambia.)

- [ ] **Step 2: Verificar**

Run: `npm run typecheck && npm run lint && npm run build`
Expected: 0 errores.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(app)/ventas/TotalsPanel.tsx"
git commit -m "feat(diseno): TotalsPanel muestra el Total en tipografía crítica (34px/800)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01EnFJHWm8zVoqgkmfwwcRHi"
```

---

## Task 2: `CashierScreen` — layout de 2 columnas + `Button`

**Files:** Modify: `src/app/(app)/ventas/CashierScreen.tsx`

**Interfaces:** Consumes: `Button` (`@/components/ui/Button`, variant/size/className/disabled/onClick — igual API que Plan 1). No cambia ningún prop de `ProductSearchInput`/`CategoryGrid`/`CartTable`/`DiscountPopover`/`CustomerPicker`/`TotalsPanel`/`PaymentPanel`.

- [ ] **Step 1: Añadir el import de `Button`**

Al inicio del archivo, junto a los demás imports:

```tsx
import { Button } from '@/components/ui/Button';
```

- [ ] **Step 2: Reemplazar el bloque de `return` completo**

El `return` actual de `CashierScreen` es (para ubicarlo — no se repite todo el archivo, solo el bloque de layout final):

```tsx
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* Columna izquierda: entrada de productos */}
      <div className="space-y-4">
        <ProductSearchInput onAdd={addToCart} />
        <CategoryGrid tree={tree} onAdd={addToCart} />
      </div>

      {/* Columna derecha: carrito y cobro */}
      <div className="space-y-4">
        <CartTable
          lines={cart}
          quote={activeQuote}
          canDescuento={canDescuento}
          onQty={setQty}
          onRemove={removeLine}
          onDescuento={setLineDescuento}
        />

        {canDescuento ? (
          <div className="relative flex items-center justify-between rounded-lg border border-slate-200 bg-white p-4">
            <span className="text-sm font-medium text-slate-700">Descuento al ticket</span>
            <button
              type="button"
              onClick={() => setTicketDescOpen((v) => !v)}
              className="rounded-md border border-slate-300 px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-50"
            >
              {ticketBtnLabel}
            </button>
            {ticketDescOpen ? (
              <DiscountPopover
                value={descuentoTicket}
                onApply={(d) => setDescuentoTicket(d)}
                onClear={() => setDescuentoTicket(null)}
                onClose={() => setTicketDescOpen(false)}
              />
            ) : null}
          </div>
        ) : null}

        <CustomerPicker
          customer={customer}
          genericCustomer={genericCustomer}
          requiereFactura={requiereFactura}
          canCrearCliente={canCrearCliente}
          onSelect={handleSelectCustomer}
          onRequiereFacturaChange={handleRequiereFactura}
        />

        {activeQuoteError ? (
          <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{activeQuoteError}</p>
        ) : null}

        <TotalsPanel quote={activeQuote} />

        {!payingOpen ? (
          <button
            type="button"
            onClick={() => setPayingOpen(true)}
            disabled={!activeQuote}
            className="w-full rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-slate-700 disabled:opacity-50"
          >
            Cobrar {activeQuote ? `· ${money(total)}` : ''}
          </button>
        ) : (
          <form action={createAction} className="space-y-3">
            <input type="hidden" name="payload" value={payload} />
            <PaymentPanel
              total={total}
              pagos={pagos}
              onChange={setPagos}
              formError={createState.formError}
              fieldErrors={createState.fieldErrors}
            />
            <button
              type="button"
              onClick={() => setPayingOpen(false)}
              className="w-full rounded-md border border-slate-300 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50"
            >
              Volver al carrito
            </button>
          </form>
        )}
      </div>
    </div>
  );
```

Reemplázalo por (misma lógica, nuevo layout: franja superior a todo lo ancho con buscador+categorías, luego 2 columnas — carrito a la izquierda, totales+cobro fijos a la derecha):

```tsx
  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <ProductSearchInput onAdd={addToCart} />
        <CategoryGrid tree={tree} onAdd={addToCart} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="space-y-4">
          <CartTable
            lines={cart}
            quote={activeQuote}
            canDescuento={canDescuento}
            onQty={setQty}
            onRemove={removeLine}
            onDescuento={setLineDescuento}
          />

          {canDescuento ? (
            <div className="relative flex items-center justify-between rounded-lg border border-slate-200 bg-white p-4">
              <span className="text-sm font-medium text-slate-700">Descuento al ticket</span>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setTicketDescOpen((v) => !v)}
              >
                {ticketBtnLabel}
              </Button>
              {ticketDescOpen ? (
                <DiscountPopover
                  value={descuentoTicket}
                  onApply={(d) => setDescuentoTicket(d)}
                  onClear={() => setDescuentoTicket(null)}
                  onClose={() => setTicketDescOpen(false)}
                />
              ) : null}
            </div>
          ) : null}

          <CustomerPicker
            customer={customer}
            genericCustomer={genericCustomer}
            requiereFactura={requiereFactura}
            canCrearCliente={canCrearCliente}
            onSelect={handleSelectCustomer}
            onRequiereFacturaChange={handleRequiereFactura}
          />

          {activeQuoteError ? (
            <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
              {activeQuoteError}
            </p>
          ) : null}
        </div>

        <div className="space-y-4 lg:sticky lg:top-6 lg:self-start">
          <TotalsPanel quote={activeQuote} />

          {!payingOpen ? (
            <Button
              type="button"
              variant="primary"
              className="w-full"
              onClick={() => setPayingOpen(true)}
              disabled={!activeQuote}
            >
              Cobrar {activeQuote ? `· ${money(total)}` : ''}
            </Button>
          ) : (
            <form action={createAction} className="space-y-3">
              <input type="hidden" name="payload" value={payload} />
              <PaymentPanel
                total={total}
                pagos={pagos}
                onChange={setPagos}
                formError={createState.formError}
                fieldErrors={createState.fieldErrors}
              />
              <Button
                type="button"
                variant="secondary"
                className="w-full"
                onClick={() => setPayingOpen(false)}
              >
                Volver al carrito
              </Button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
```

**Puntos a verificar tú mismo antes de continuar:** el texto del botón "Cobrar {activeQuote ? \`· ${money(total)}\` : ''}" es EXACTAMENTE igual al de antes (mismo template literal) — no se toca ese contenido, solo el elemento que lo envuelve (`<button>` manual → `<Button>`). `lg:sticky lg:top-6 lg:self-start` en la columna derecha es lo que garantiza que el botón de cobro/panel de pago quede visible sin scroll en carritos largos (spec §5.2). Ningún handler (`addToCart`, `setQty`, `removeLine`, `setLineDescuento`, `handleSelectCustomer`, `handleRequiereFactura`, `setTicketDescOpen`, `setDescuentoTicket`, `setPayingOpen`, `createAction`) cambia de nombre ni de firma.

- [ ] **Step 3: Verificar**

Run: `npm run typecheck && npm run lint && npm run build`
Expected: 0 errores.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/ventas/CashierScreen.tsx"
git commit -m "feat(diseno): CashierScreen — layout de 2 columnas con panel de cobro fijo

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01EnFJHWm8zVoqgkmfwwcRHi"
```

---

## Task 3: `CartTable` — `EmptyState` + `Button` en descuento de línea

**Files:** Modify: `src/app/(app)/ventas/CartTable.tsx`

**Interfaces:** Consumes: `EmptyState` (`@/components/ui/EmptyState`, prop `message`), `Button` (`@/components/ui/Button`). Props del componente sin cambios.

- [ ] **Step 1: Añadir imports**

```tsx
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
```

- [ ] **Step 2: Reemplazar el bloque de carrito vacío**

Bloque actual:
```tsx
  if (lines.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500">
        El carrito está vacío. Busca un producto o elige una categoría.
      </div>
    );
  }
```

Reemplázalo por:
```tsx
  if (lines.length === 0) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white">
        <EmptyState message="El carrito está vacío. Busca un producto o elige una categoría." />
      </div>
    );
  }
```

- [ ] **Step 3: Reemplazar el botón de descuento por línea**

Bloque actual (dentro del `<td>` condicional a `canDescuento`):
```tsx
                    <button
                      type="button"
                      onClick={() => setOpenKey((k) => (k === l.key ? null : l.key))}
                      className="rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50"
                    >
                      {l.descuento ? descuentoLabel(l.descuento) : 'Añadir'}
                    </button>
```

Reemplázalo por:
```tsx
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => setOpenKey((k) => (k === l.key ? null : l.key))}
                    >
                      {l.descuento ? descuentoLabel(l.descuento) : 'Añadir'}
                    </Button>
```

El resto del archivo (encabezados de tabla, botones `+`/`−` de cantidad, "Quitar" de línea) no cambia — son controles compactos dentro de celdas de tabla, fuera del alcance de `Button`/`Card`.

- [ ] **Step 4: Verificar**

Run: `npm run typecheck && npm run lint && npm run build`
Expected: 0 errores.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)/ventas/CartTable.tsx"
git commit -m "feat(diseno): CartTable usa EmptyState y Button para el descuento de línea

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01EnFJHWm8zVoqgkmfwwcRHi"
```

---

## Task 4: `PaymentPanel` — `Button` en Confirmar venta y Efectivo exacto

**Files:** Modify: `src/app/(app)/ventas/PaymentPanel.tsx`

**Interfaces:** Consumes: `Button`. Props del componente sin cambios.

- [ ] **Step 1: Añadir import y reemplazar `ConfirmBtn`**

Añade junto a los imports existentes:
```tsx
import { Button } from '@/components/ui/Button';
```

Reemplaza la función `ConfirmBtn` actual:
```tsx
function ConfirmBtn({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={disabled || pending}
      className="w-full rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-slate-700 disabled:opacity-50"
    >
      {pending ? 'Confirmando…' : 'Confirmar venta'}
    </button>
  );
}
```

por:
```tsx
function ConfirmBtn({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      variant="primary"
      className="w-full"
      disabled={disabled}
      pending={pending}
      pendingLabel="Confirmando…"
    >
      Confirmar venta
    </Button>
  );
}
```

(`Button` ya combina `disabled || pending` internamente — no hace falta repetirlo aquí.)

- [ ] **Step 2: Reemplazar el botón "Efectivo exacto"**

Bloque actual:
```tsx
        <button
          type="button"
          onClick={efectivoExacto}
          className="rounded-md border border-slate-300 px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-50"
        >
          Efectivo exacto
        </button>
```

Reemplázalo por:
```tsx
        <Button type="button" variant="secondary" size="sm" onClick={efectivoExacto}>
          Efectivo exacto
        </Button>
```

El resto del archivo ("Quitar" de fila de pago, "+ Añadir pago", el `<select>` de método, el `<dl>` de Total/Pagado/Falta/Cambio) no cambia.

- [ ] **Step 3: Verificar**

Run: `npm run typecheck && npm run lint && npm run build`
Expected: 0 errores.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/ventas/PaymentPanel.tsx"
git commit -m "feat(diseno): PaymentPanel usa Button en Confirmar venta y Efectivo exacto

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01EnFJHWm8zVoqgkmfwwcRHi"
```

---

## Task 5: `ProductSearchInput` + `CategoryGrid` — `Card`, `Button`, acento índigo

**Files:** Modify: `src/app/(app)/ventas/ProductSearchInput.tsx`, `src/app/(app)/ventas/CategoryGrid.tsx`

**Interfaces:** Consumes: `Card` (`@/components/ui/Card`), `Button`. Props sin cambios en ambos.

- [ ] **Step 1: `ProductSearchInput.tsx` — envolver en `Card` y usar `Button`**

Añade los imports:
```tsx
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
```

Reemplaza el `<div className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">` que envuelve todo el componente por `<Card className="space-y-3">` (cierre correspondiente `</Card>`).

Reemplaza el botón de submit:
```tsx
        <button
          type="submit"
          disabled={loading}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-slate-700 disabled:opacity-50"
        >
          {loading ? 'Buscando…' : 'Buscar'}
        </button>
```
por:
```tsx
        <Button type="submit" variant="primary" pending={loading} pendingLabel="Buscando…">
          Buscar
        </Button>
```

El resto (input, lista de resultados) no cambia.

- [ ] **Step 2: `CategoryGrid.tsx` — envolver en `Card`, acento índigo en chips activos**

Añade el import:
```tsx
import { Card } from '@/components/ui/Card';
```

Reemplaza el `<div className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">` que envuelve todo el componente por `<Card className="space-y-3">` (cierre `</Card>`).

Reemplaza las clases del chip de categoría raíz — bloque actual:
```tsx
              className={
                'rounded-full px-3 py-1 text-sm ' +
                (rootId === node.id
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200')
              }
```
por:
```tsx
              className={
                'rounded-full px-3 py-1 text-sm ' +
                (rootId === node.id
                  ? 'bg-indigo-600 text-white'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200')
              }
```

Reemplaza las clases del chip de subcategoría (dos apariciones, "Todo {root.nombre}" y `h.nombre`) — bloque actual:
```tsx
            className={
              'rounded-full px-3 py-1 text-xs ' +
              (catId === root.id
                ? 'bg-slate-700 text-white'
                : 'bg-slate-50 text-slate-600 hover:bg-slate-100')
            }
```
y
```tsx
              className={
                'rounded-full px-3 py-1 text-xs ' +
                (catId === h.id
                  ? 'bg-slate-700 text-white'
                  : 'bg-slate-50 text-slate-600 hover:bg-slate-100')
              }
```
por (en ambos casos, mismo condicional, solo cambia el color activo):
```tsx
            className={
              'rounded-full px-3 py-1 text-xs ' +
              (catId === root.id
                ? 'bg-indigo-100 text-indigo-700'
                : 'bg-slate-50 text-slate-600 hover:bg-slate-100')
            }
```
```tsx
              className={
                'rounded-full px-3 py-1 text-xs ' +
                (catId === h.id
                  ? 'bg-indigo-100 text-indigo-700'
                  : 'bg-slate-50 text-slate-600 hover:bg-slate-100')
              }
```

No se cambian los chips de producto (tiles de la grilla de productos) ni `VariantPicker` (fuera de alcance, ver Global Constraints).

- [ ] **Step 3: Verificar**

Run: `npm run typecheck && npm run lint && npm run build`
Expected: 0 errores.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/ventas/ProductSearchInput.tsx" "src/app/(app)/ventas/CategoryGrid.tsx"
git commit -m "feat(diseno): ProductSearchInput/CategoryGrid usan Card, Button y acento índigo

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01EnFJHWm8zVoqgkmfwwcRHi"
```

---

## Task 6: `CustomerPicker` + `DiscountPopover` — `Button`, `Badge`

**Files:** Modify: `src/app/(app)/ventas/CustomerPicker.tsx`, `src/app/(app)/ventas/DiscountPopover.tsx`

**Interfaces:** Consumes: `Button`, `Badge` (tone="success").

- [ ] **Step 1: `CustomerPicker.tsx` — reemplazar `SubmitBtn` local, botones y badge**

Añade los imports:
```tsx
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
```

Reemplaza la función `SubmitBtn`:
```tsx
function SubmitBtn({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
    >
      {pending ? pendingLabel : label}
    </button>
  );
}
```
por:
```tsx
function SubmitBtn({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="primary" size="sm" pending={pending} pendingLabel={pendingLabel}>
      {label}
    </Button>
  );
}
```

Reemplaza el botón "Cambiar cliente"/"Cerrar":
```tsx
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
        >
          {open ? 'Cerrar' : 'Cambiar cliente'}
        </button>
```
por:
```tsx
        <Button type="button" variant="secondary" size="sm" onClick={() => setOpen((v) => !v)}>
          {open ? 'Cerrar' : 'Cambiar cliente'}
        </Button>
```

Reemplaza el badge "Facturable" en resultados de búsqueda:
```tsx
                    {c.facturable ? (
                      <span className="shrink-0 rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-800">
                        Facturable
                      </span>
                    ) : null}
```
por:
```tsx
                    {c.facturable ? (
                      <span className="shrink-0">
                        <Badge tone="success">Facturable</Badge>
                      </span>
                    ) : null}
```

Reemplaza el botón submit del form de creación inline:
```tsx
                    <button
                      type="submit"
                      disabled={createBusy}
                      className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
                    >
                      {createBusy ? 'Creando…' : 'Crear cliente'}
                    </button>
```
por:
```tsx
                    <Button
                      type="submit"
                      variant="primary"
                      size="sm"
                      pending={createBusy}
                      pendingLabel="Creando…"
                    >
                      Crear cliente
                    </Button>
```

Los demás controles de texto plano (`Usar {genericCustomer.nombre}`, `Cancelar`, `+ Nuevo cliente`) no cambian.

- [ ] **Step 2: `DiscountPopover.tsx` — `Button` en Aplicar/Cancelar**

Añade el import:
```tsx
import { Button } from '@/components/ui/Button';
```

Reemplaza:
```tsx
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={apply}
              disabled={!valido}
              className="rounded-md bg-slate-900 px-2.5 py-1 text-xs font-medium text-white hover:bg-slate-700 disabled:opacity-50"
            >
              Aplicar
            </button>
          </div>
```
por:
```tsx
          <div className="flex gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="button" variant="primary" size="sm" onClick={apply} disabled={!valido}>
              Aplicar
            </Button>
          </div>
```

El botón "Quitar" (texto plano) no cambia.

- [ ] **Step 3: Verificar**

Run: `npm run typecheck && npm run lint && npm run build`
Expected: 0 errores.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/ventas/CustomerPicker.tsx" "src/app/(app)/ventas/DiscountPopover.tsx"
git commit -m "feat(diseno): CustomerPicker/DiscountPopover usan Button y Badge

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01EnFJHWm8zVoqgkmfwwcRHi"
```

---

## Task 7: `CancelSaleForm` — `ConfirmDialog` reemplaza `window.confirm`

**Files:** Modify: `src/app/(app)/ventas/CancelSaleForm.tsx`

**Interfaces:** Consumes: `Button`, `ConfirmDialog` (`@/components/ui/ConfirmDialog`, props `open/onOpenChange/title/description/confirmLabel/onConfirm/pending`). El server action `cancelarVentaAction` no cambia de firma ni de invocación (`formAction`).

- [ ] **Step 1: Reemplazar el archivo completo**

```tsx
'use client';

import { useActionState, useRef, useState } from 'react';
import type { FormState } from '@/app/(auth)/setup/actions';
import { cancelarVentaAction } from './actions';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';

const INITIAL: FormState = { ok: false };

export function CancelSaleForm({ saleId }: { saleId: string }) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    cancelarVentaAction,
    INITIAL,
  );
  const [confirmOpen, setConfirmOpen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  function handleTriggerClick() {
    // Valida el formulario (el `motivo` es obligatorio) ANTES de abrir el
    // diálogo, igual que el submit nativo validaba antes de disparar el
    // confirm() — así el usuario no ve el diálogo de confirmación si aún
    // le falta escribir el motivo.
    if (formRef.current?.reportValidity()) {
      setConfirmOpen(true);
    }
  }

  return (
    <form ref={formRef} action={formAction} className="space-y-3">
      <input type="hidden" name="saleId" value={saleId} />
      <label className="block space-y-1">
        <span className="text-sm font-medium text-slate-700">Motivo de la cancelación</span>
        <textarea
          name="motivo"
          required
          rows={3}
          className="block w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm outline-none focus:border-slate-500 focus:ring-1 focus:ring-slate-500"
          placeholder="Explica por qué se cancela esta venta"
        />
      </label>
      {state.formError ? (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{state.formError}</p>
      ) : null}
      {state.ok ? (
        <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">
          Venta cancelada. El stock fue reintegrado.
        </p>
      ) : null}
      <Button
        type="button"
        variant="danger-solid"
        disabled={pending || state.ok}
        pending={pending}
        pendingLabel="Cancelando…"
        onClick={handleTriggerClick}
      >
        Cancelar venta
      </Button>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="¿Cancelar esta venta?"
        description="Se reintegrará el stock de todos los productos de esta venta. Esta acción no se puede deshacer."
        confirmLabel="Cancelar venta"
        pending={pending}
        onConfirm={() => {
          setConfirmOpen(false);
          formRef.current?.requestSubmit();
        }}
      />
    </form>
  );
}
```

**Verifica tú mismo:** el texto visible del botón sigue siendo "Cancelar venta" (antes con `{pending ? 'Cancelando…' : 'Cancelar venta'}` manual, ahora vía `pending`/`pendingLabel` de `Button` — mismo resultado visible). El `saleId` sigue viajando como `<input type="hidden">` dentro del mismo `<form>`. `formRef.current?.requestSubmit()` dispara la MISMA `action={formAction}` que antes disparaba el `<button type="submit">` — no cambia qué server action se ejecuta ni con qué datos.

- [ ] **Step 2: Verificar**

Run: `npm run typecheck && npm run lint && npm run build`
Expected: 0 errores.

- [ ] **Step 3: Actualizar `e2e/ventas.spec.ts` — el test `cancelación el mismo día` usa hoy un listener de `window.confirm` que dejará de dispararse**

Confirmado (grep ya hecho al escribir este plan): `e2e/ventas.spec.ts` alrededor de la línea 440 tiene:

```tsx
    await abrirCaja(ger, 1000);
    ger.on('dialog', (d) => {
      void d.accept();
    });

    const saleId = await armarYCobrar(ger, { barcode, unidades: 2 });

    // Stock tras la venta: 30 → 28.
    await ger.goto(`/productos/${productId}`);
    await expect(ger.getByLabel('Stock (ajústalo en Inventario)')).toHaveValue('28');

    await ger.goto(`/ventas/${saleId}`);
    await ger.getByLabel('Motivo de la cancelación').fill('Cobro duplicado por error');
    await ger.getByRole('button', { name: 'Cancelar venta' }).click();
```

Reemplázalo por (quita el listener, ya no hay `window.confirm` que aceptar; añade el clic dentro del `ConfirmDialog`, con `getByRole('dialog')` para no ambigüar con el botón disparador que sigue visible detrás):

```tsx
    await abrirCaja(ger, 1000);

    const saleId = await armarYCobrar(ger, { barcode, unidades: 2 });

    // Stock tras la venta: 30 → 28.
    await ger.goto(`/productos/${productId}`);
    await expect(ger.getByLabel('Stock (ajústalo en Inventario)')).toHaveValue('28');

    await ger.goto(`/ventas/${saleId}`);
    await ger.getByLabel('Motivo de la cancelación').fill('Cobro duplicado por error');
    await ger.getByRole('button', { name: 'Cancelar venta' }).click();
    await ger.getByRole('dialog').getByRole('button', { name: 'Cancelar venta' }).click();
```

(`getByRole('dialog')` ya es un patrón usado en este mismo archivo, línea ~274, para otro modal — confirma que Playwright lo resuelve bien contra el `<dialog>` nativo de `ConfirmDialog`.)

- [ ] **Step 4: Run: `npm run test:e2e -- ventas`**

Expected: PASS (7 tests, incluido `cancelación el mismo día`).

- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)/ventas/CancelSaleForm.tsx" e2e/ventas.spec.ts
git commit -m "feat(diseno): CancelSaleForm usa ConfirmDialog en vez de window.confirm

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01EnFJHWm8zVoqgkmfwwcRHi"
```

---

## Task 8: Ventas — `[id]/page.tsx`, `historial/page.tsx`, `devoluciones/page.tsx` — `Card`, `Badge`, `Button`

**Files:** Modify: `src/app/(app)/ventas/[id]/page.tsx`, `src/app/(app)/ventas/historial/page.tsx`, `src/app/(app)/ventas/devoluciones/page.tsx`

**Interfaces:** Consumes: `Card`, `Badge`, `Button`.

- [ ] **Step 1: `[id]/page.tsx` — `Section` usa `Card`, `Badge` local → `Badge` compartido, Link primario a índigo**

Añade los imports:
```tsx
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
```

Reemplaza la función local `Section`:
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
por:
```tsx
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">{title}</h2>
      {children}
    </Card>
  );
}
```

Elimina por completo la función local `Badge` (ya no hace falta, se usa la compartida):
```tsx
function Badge({
  tone,
  children,
}: {
  tone: 'green' | 'slate' | 'amber';
  children: React.ReactNode;
}) {
  const style =
    tone === 'green'
      ? 'bg-green-100 text-green-800'
      : tone === 'amber'
        ? 'bg-amber-100 text-amber-800'
        : 'bg-slate-200 text-slate-600';
  return <span className={'rounded-full px-3 py-1 text-xs font-medium ' + style}>{children}</span>;
}
```

Actualiza los 3 usos de `Badge` (mapeo de tono: `green→success`, `amber→warning`, `slate→neutral`):
```tsx
          {sale.estado === 'CANCELADA' ? <Badge tone="slate">Cancelada</Badge> : (
            <Badge tone="green">Completada</Badge>
          )}
          {sale.requiereFactura ? <Badge tone="amber">Requiere factura</Badge> : null}
```
por:
```tsx
          {sale.estado === 'CANCELADA' ? <Badge tone="neutral">Cancelada</Badge> : (
            <Badge tone="success">Completada</Badge>
          )}
          {sale.requiereFactura ? <Badge tone="warning">Requiere factura</Badge> : null}
```

Reemplaza el Link "Registrar devolución" (estilizado como botón primario — sigue siendo `<Link>`, no `Button`, porque `Button` no puede ser un enlace de navegación; se copian manualmente las clases equivalentes a `Button variant="primary"`):
```tsx
              <Link
                href={`/ventas/${sale.id}/devolucion`}
                className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
              >
                Registrar devolución
              </Link>
```
por:
```tsx
              <Link
                href={`/ventas/${sale.id}/devolucion`}
                className="inline-flex items-center justify-center gap-1.5 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-1"
              >
                Registrar devolución
              </Link>
```

El Link "Imprimir ticket" ya usa `border-slate-300 bg-white ... text-slate-700 hover:bg-slate-50`, visualmente idéntico a `Button variant="secondary"` — no requiere cambio.

- [ ] **Step 2: `historial/page.tsx` — `Badge` local → compartido, `Button` en Filtrar**

Añade los imports:
```tsx
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
```

Elimina la función local `Badge`:
```tsx
function Badge({ tone, children }: { tone: 'green' | 'slate'; children: React.ReactNode }) {
  const style = tone === 'green' ? 'bg-green-100 text-green-800' : 'bg-slate-200 text-slate-600';
  return (
    <span
      className={'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ' + style}
    >
      {children}
    </span>
  );
}
```

Actualiza `EstadoBadge` para usar la compartida (mapeo `green→success`, `slate→neutral`):
```tsx
function EstadoBadge({ estado }: { estado: SaleListRow['estado'] }) {
  return estado === 'COMPLETADA' ? (
    <Badge tone="green">Completada</Badge>
  ) : (
    <Badge tone="slate">Cancelada</Badge>
  );
}
```
por:
```tsx
function EstadoBadge({ estado }: { estado: SaleListRow['estado'] }) {
  return estado === 'COMPLETADA' ? (
    <Badge tone="success">Completada</Badge>
  ) : (
    <Badge tone="neutral">Cancelada</Badge>
  );
}
```

Reemplaza el botón "Filtrar":
```tsx
        <button
          type="submit"
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-slate-700"
        >
          Filtrar
        </button>
```
por:
```tsx
        <Button type="submit" variant="primary">
          Filtrar
        </Button>
```

El `<form method="get">` que envuelve el filtro NO se toca (conserva su `className` actual — `Card` solo renderiza `<div>`, no `<form>`, ver Global Constraints). "Limpiar"/"Exportar CSV" (texto plano) no cambian.

- [ ] **Step 3: `devoluciones/page.tsx` — `Button` en Filtrar**

Añade el import:
```tsx
import { Button } from '@/components/ui/Button';
```

Reemplaza el botón "Filtrar" (mismo bloque que en `historial/page.tsx`) por el mismo `<Button type="submit" variant="primary">Filtrar</Button>`. El resto del archivo no cambia (no tiene `Badge` local — las devoluciones no tienen estado variable).

- [ ] **Step 4: Verificar**

Run: `npm run typecheck && npm run lint && npm run build`
Expected: 0 errores.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)/ventas/[id]/page.tsx" "src/app/(app)/ventas/historial/page.tsx" "src/app/(app)/ventas/devoluciones/page.tsx"
git commit -m "feat(diseno): detalle/historial/devoluciones de ventas usan Card, Badge y Button

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01EnFJHWm8zVoqgkmfwwcRHi"
```

---

## Task 9: `ReturnForm` — `Button` en Confirmar devolución

**Files:** Modify: `src/app/(app)/ventas/ReturnForm.tsx`

**Interfaces:** Consumes: `Button`. Sin `ConfirmDialog` — la devolución no está en la lista de acciones de la spec §4 que requieren confirmación (a diferencia de cancelar venta/cerrar caja).

- [ ] **Step 1: Añadir import y reemplazar el botón submit**

Añade:
```tsx
import { Button } from '@/components/ui/Button';
```

Reemplaza:
```tsx
      <button
        type="submit"
        disabled={pending || nadaSeleccionado}
        className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-60"
      >
        {pending ? 'Procesando…' : 'Confirmar devolución'}
      </button>
```
por:
```tsx
      <Button
        type="submit"
        variant="primary"
        disabled={nadaSeleccionado}
        pending={pending}
        pendingLabel="Procesando…"
      >
        Confirmar devolución
      </Button>
```

El resto del archivo (tabla de líneas a devolver, cálculo de `estimadoLinea`, selects, textarea) no cambia.

- [ ] **Step 2: Verificar**

Run: `npm run typecheck && npm run lint && npm run build`
Expected: 0 errores.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(app)/ventas/ReturnForm.tsx"
git commit -m "feat(diseno): ReturnForm usa Button en Confirmar devolución

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01EnFJHWm8zVoqgkmfwwcRHi"
```

---

## Task 10: Caja — `AbrirCajaForm` + `CashMovementForm` — `Button`, `Card`

**Files:** Modify: `src/app/(app)/caja/AbrirCajaForm.tsx`, `src/app/(app)/caja/CashMovementForm.tsx`

**Interfaces:** Consumes: `Button`, `Card`.

- [ ] **Step 1: `AbrirCajaForm.tsx` — reemplazar el botón submit**

Añade:
```tsx
import { Button } from '@/components/ui/Button';
```

Reemplaza:
```tsx
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-slate-700 disabled:opacity-60"
      >
        {pending ? 'Abriendo…' : 'Abrir caja'}
      </button>
```
por:
```tsx
      <Button type="submit" variant="primary" pending={pending} pendingLabel="Abriendo…">
        Abrir caja
      </Button>
```

- [ ] **Step 2: `CashMovementForm.tsx` — `Card` + `Button`**

Añade:
```tsx
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
```

Reemplaza el `<form ref={formRef} action={formAction} className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">` por `<Card asChild>` — **no**: `Card` solo renderiza `<div>`, y este contenedor debe seguir siendo `<form>` (necesita `action`/`ref`). Deja el `<form>` con su `className` actual sin cambios (`"space-y-3 rounded-lg border border-slate-200 bg-white p-4"` — igual razón que los formularios de filtro en Task 8: `Card` no puede envolver un `<form>`).

Reemplaza únicamente el botón submit:
```tsx
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-slate-700 disabled:opacity-60"
      >
        {pending ? 'Registrando…' : `Registrar ${TIPO_LABEL[tipo].toLowerCase()}`}
      </button>
```
por:
```tsx
      <Button
        type="submit"
        variant="primary"
        pending={pending}
        pendingLabel="Registrando…"
      >
        {`Registrar ${TIPO_LABEL[tipo].toLowerCase()}`}
      </Button>
```

(El import de `Card` que añadiste en este Step no se usa en este archivo — elimínalo del import si no lo necesitas en ningún otro punto de este componente.)

- [ ] **Step 3: Verificar**

Run: `npm run typecheck && npm run lint && npm run build`
Expected: 0 errores.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/caja/AbrirCajaForm.tsx" "src/app/(app)/caja/CashMovementForm.tsx"
git commit -m "feat(diseno): AbrirCajaForm/CashMovementForm usan Button

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01EnFJHWm8zVoqgkmfwwcRHi"
```

---

## Task 11: Caja — extraer `SesionAbiertaResumen`, usar en `PanelCajaAbierta` y `sesiones/[id]/page.tsx`

**Files:**
- Create: `src/app/(app)/caja/SesionAbiertaResumen.tsx`
- Modify: `src/app/(app)/caja/PanelCajaAbierta.tsx`, `src/app/(app)/caja/sesiones/[id]/page.tsx`

**Interfaces:**
- Produces: `SesionAbiertaResumen({ session }: { session: CashSessionDetail })` — JSX puro, sin estado. Consumido por ambos archivos modificados.
- Consumes: `Badge`, `Card`.

- [ ] **Step 1: Crear `src/app/(app)/caja/SesionAbiertaResumen.tsx`**

Extrae el bloque "Fondo + Movimientos" que hoy está duplicado entre `PanelCajaAbierta.tsx` y la rama `ABIERTA` de `sesiones/[id]/page.tsx` (mismo JSX, mismo `MovementBadge` local redefinido en ambos):

```tsx
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { money, fmtFechaMX } from '@/app/(app)/ventas/types';
import type { CashSessionDetail } from '@/lib/cash/sessions';

/**
 * Resumen de una sesión de caja ABIERTA: fondo + lista de movimientos.
 * Extraído de la duplicación entre `PanelCajaAbierta` (pantalla `/caja`) y
 * `sesiones/[id]/page.tsx` (pantalla `/caja/sesiones/[id]` para la sesión que
 * sigue abierta). Arqueo a ciegas: NUNCA lee `esperadoEfectivo`/`diferencia`/
 * `efectivoContado` de `session` — solo `folio`, `abiertaPorNombre`,
 * `abiertaEn`, `fondoApertura` y `movements`.
 */
export function SesionAbiertaResumen({ session }: { session: CashSessionDetail }) {
  return (
    <>
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

      <Card>
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
          Movimientos
        </h3>
        {session.movements.length === 0 ? (
          <p className="text-sm text-slate-500">Sin movimientos</p>
        ) : (
          <ul className="space-y-2">
            {session.movements.map((m) => (
              <li
                key={m.id}
                className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2 text-sm last:border-0 last:pb-0"
              >
                <div className="flex items-center gap-2">
                  <Badge tone={m.tipo === 'RETIRO' ? 'warning' : 'success'}>
                    {m.tipo === 'RETIRO' ? 'Retiro' : 'Ingreso'}
                  </Badge>
                  <span className="font-medium text-slate-900">{money(m.monto)}</span>
                  <span className="text-slate-600">{m.motivo}</span>
                </div>
                <span className="text-slate-500">
                  {m.actorNombre} · {fmtFechaMX(m.createdAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
```

- [ ] **Step 2: Reescribir `PanelCajaAbierta.tsx` para usar `SesionAbiertaResumen`**

```tsx
import Link from 'next/link';
import type { CashSessionDetail } from '@/lib/cash/sessions';
import { CashMovementForm } from './CashMovementForm';
import { SesionAbiertaResumen } from './SesionAbiertaResumen';

export function PanelCajaAbierta({ session }: { session: CashSessionDetail }) {
  return (
    <div className="space-y-6">
      <SesionAbiertaResumen session={session} />

      <div className="grid gap-4 sm:grid-cols-2">
        <CashMovementForm tipo="RETIRO" />
        <CashMovementForm tipo="INGRESO" />
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <Link
          href="/caja/cerrar"
          className="inline-flex items-center justify-center gap-1.5 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-1"
        >
          Cerrar caja (arqueo)
        </Link>
        <Link
          href={`/ventas/historial?cashSessionId=${session.id}`}
          className="text-sm font-medium text-slate-600 underline-offset-2 hover:underline"
        >
          Ver ventas de esta caja
        </Link>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Reescribir la rama `ABIERTA` de `sesiones/[id]/page.tsx`**

El archivo completo actual empieza con imports y una función local `MovementBadge` que ya no hacen falta. Reemplaza el archivo completo:

```tsx
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requirePermission } from '@/lib/auth/context';
import { getCashSession } from '@/lib/cash/sessions';
import { getSetting } from '@/lib/settings';
import { fmtFechaMX } from '@/app/(app)/ventas/types';
import { CorteView } from '../../CorteView';
import { SesionAbiertaResumen } from '../../SesionAbiertaResumen';

export const dynamic = 'force-dynamic';

export default async function CajaSessionDetailPage(props: { params: Promise<{ id: string }> }) {
  await requirePermission('caja.gestionar');
  const { id } = await props.params;

  const session = await getCashSession(id);
  if (!session) notFound();

  if (session.estado === 'ABIERTA') {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Caja {session.folio}</h1>
          <p className="text-slate-600">
            Abierta por {session.abiertaPorNombre} · {fmtFechaMX(session.abiertaEn)}
          </p>
        </div>

        <SesionAbiertaResumen session={session} />

        <p className="rounded-md bg-slate-50 px-4 py-3 text-sm text-slate-700">
          Caja abierta; el arqueo se verá al cerrar.
        </p>
      </div>
    );
  }

  const negocio = await getSetting<string>('negocio.nombre', 'Punto de venta');

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Caja {session.folio}</h1>
          <p className="text-slate-600">Corte de caja cerrada.</p>
        </div>
        <Link
          href={`/caja-corte/${session.id}`}
          className="inline-flex items-center justify-center gap-1.5 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-1"
        >
          Imprimir corte
        </Link>
      </div>

      <div className="max-w-[420px] rounded-lg border border-slate-200 bg-white p-5">
        <CorteView session={session} negocio={negocio} />
      </div>
    </div>
  );
}
```

**Nota:** el aviso "Caja abierta; el arqueo se verá al cerrar." pasa de `bg-blue-50 text-blue-800` a `bg-slate-50 text-slate-700` — la spec §3.1 dice explícitamente que los avisos informativos usan el neutro `slate`, no un color aparte ("azul" no es una de las 5 familias del sistema). No se toca `CorteView` (fuera de alcance de este task, ver Task 13) ni el contenedor `max-w-[420px] rounded-lg border ...` que lo envuelve — ese wrapper deliberadamente NO usa `Card` porque necesita el `max-w-[420px]` para simular el ancho de una tira térmica; añadir `Card` (que no acepta anular su padding de forma fiable, ver Global Constraints) cambiaría el aspecto del recibo impreso-en-pantalla.

- [ ] **Step 4: Verificar**

Run: `npm run typecheck && npm run lint && npm run build`
Expected: 0 errores.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)/caja/SesionAbiertaResumen.tsx" "src/app/(app)/caja/PanelCajaAbierta.tsx" "src/app/(app)/caja/sesiones/[id]/page.tsx"
git commit -m "feat(diseno): extrae SesionAbiertaResumen, usa Badge/Card en Caja

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01EnFJHWm8zVoqgkmfwwcRHi"
```

---

## Task 12: `CerrarCajaForm` — añade `ConfirmDialog` (no existe confirmación hoy)

**Files:** Modify: `src/app/(app)/caja/cerrar/CerrarCajaForm.tsx`

**Interfaces:** Consumes: `Button`, `ConfirmDialog`. El server action `cerrarCajaAction` no cambia de firma ni de invocación.

⚠️ **A diferencia de `CancelSaleForm` (Task 7), aquí NO se reemplaza ningún `confirm()` — hoy `CerrarCajaForm` no pide ninguna confirmación antes de cerrar la caja.** Este task AÑADE un paso de confirmación que hoy no existe, como corresponde a una acción crítica (spec §7: "Acciones destructivas siempre distinguibles por color y siempre con `ConfirmDialog`"). No es un cambio de regla de negocio — la validación/cálculo de cierre sigue exactamente igual en `cerrarCajaAction`/`closeCashSession`; solo se añade una confirmación de UI antes de invocarla.

- [ ] **Step 1: Reemplazar el archivo completo**

```tsx
'use client';

import { useActionState, useRef, useState } from 'react';
import { Field } from '@/components/forms/Field';
import { money, fmtFechaMX, inputClass } from '@/app/(app)/ventas/types';
import type { CashSessionLite } from '@/lib/cash/sessions';
import { cerrarCajaAction } from '../actions';
import type { FormState } from '@/app/(auth)/setup/actions';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';

const INITIAL: FormState = { ok: false };

export function CerrarCajaForm({ session }: { session: CashSessionLite }) {
  const [state, formAction, pending] = useActionState(cerrarCajaAction, INITIAL);
  const errors = state.fieldErrors ?? {};
  const [confirmOpen, setConfirmOpen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  function handleTriggerClick() {
    // El "efectivo contado" es obligatorio — se valida antes de abrir el
    // diálogo para no confirmar un cierre que el navegador rechazaría de
    // todos modos por campos incompletos.
    if (formRef.current?.reportValidity()) {
      setConfirmOpen(true);
    }
  }

  return (
    <form ref={formRef} action={formAction} className="max-w-sm space-y-4">
      <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-600">
        <p>Fondo de apertura: {money(session.fondoApertura)}</p>
        <p>Apertura: {fmtFechaMX(session.abiertaEn)}</p>
      </div>

      {state.formError ? (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{state.formError}</p>
      ) : null}

      <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
        Cuenta el efectivo antes de confirmar; verás la diferencia después.
      </p>

      <Field label="Efectivo contado en el cajón" error={errors.efectivoContado}>
        <input
          name="efectivoContado"
          type="number"
          min={0}
          step="0.01"
          required
          className={inputClass}
        />
      </Field>

      <Field label="Nota de cierre (opcional)" error={errors.notaCierre}>
        <textarea name="notaCierre" rows={3} className={inputClass} />
      </Field>

      <Button
        type="button"
        variant="primary"
        pending={pending}
        pendingLabel="Confirmando…"
        onClick={handleTriggerClick}
      >
        Confirmar cierre
      </Button>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="¿Cerrar la caja?"
        description="Se calculará el arqueo con el efectivo contado que capturaste. Esta acción no se puede deshacer."
        confirmLabel="Cerrar caja"
        pending={pending}
        onConfirm={() => {
          setConfirmOpen(false);
          formRef.current?.requestSubmit();
        }}
      />
    </form>
  );
}
```

- [ ] **Step 2: Verificar**

Run: `npm run typecheck && npm run lint && npm run build`
Expected: 0 errores.

- [ ] **Step 3: Actualizar `e2e/caja.spec.ts` — el helper `cerrarCaja` espera el cierre inmediato tras "Confirmar cierre"**

Confirmado (ya leído al escribir este plan), el helper es hoy:

```tsx
async function cerrarCaja(page: Page, efectivoContado: number): Promise<string> {
  await page.goto('/caja/cerrar');
  await page.getByLabel('Efectivo contado en el cajón').fill(String(efectivoContado));
  await page.getByRole('button', { name: 'Confirmar cierre' }).click();
  await expect(page).toHaveURL(/\/caja\/sesiones\/[^/]+$/);
  return page.url().split('/').pop() as string;
}
```

Tras este task, "Confirmar cierre" solo ABRE el `ConfirmDialog` — el submit real ocurre al hacer clic en su botón "Cerrar caja" (el `confirmLabel` que le pasaste). Reemplaza el helper por:

```tsx
async function cerrarCaja(page: Page, efectivoContado: number): Promise<string> {
  await page.goto('/caja/cerrar');
  await page.getByLabel('Efectivo contado en el cajón').fill(String(efectivoContado));
  await page.getByRole('button', { name: 'Confirmar cierre' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Cerrar caja' }).click();
  await expect(page).toHaveURL(/\/caja\/sesiones\/[^/]+$/);
  return page.url().split('/').pop() as string;
}
```

Este helper se usa desde varios tests de `caja.spec.ts` (todo lo que llama `cerrarCaja(...)`) — el cambio, al estar centralizado aquí, los cubre a todos sin tocarlos uno por uno.

- [ ] **Step 4: Run: `npm run test:e2e -- caja`**

Expected: PASS (todos los tests de este archivo, incluidos los que usan `cerrarCaja`).

- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)/caja/cerrar/CerrarCajaForm.tsx" e2e/caja.spec.ts
git commit -m "feat(diseno): CerrarCajaForm añade confirmación (ConfirmDialog) antes de cerrar

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01EnFJHWm8zVoqgkmfwwcRHi"
```

---

## Task 13: `CorteView` (solo `DiferenciaBadge`) + Caja `historial/page.tsx` — `Badge`, `Button`

**Files:** Modify: `src/app/(app)/caja/CorteView.tsx`, `src/app/(app)/caja/historial/page.tsx`

**Interfaces:** Consumes: `Badge`, `Button`.

⚠️ Este task NO toca el resto de `CorteView.tsx` (el layout de tira térmica, `CORTE_CSS`, la estructura `.corte`/`.row`/`.mov` es la vista imprimible y está fuera de alcance — ver Global Constraints). Solo se reemplaza `DiferenciaBadge`, que hoy usa `<span>` con clases Tailwind sueltas (no CSS de la tira, sino clases normales `text-green-700`/`text-amber-700`/`text-red-700`) por el `Badge` compartido, consolidando la duplicación con la de `historial/page.tsx`.

- [ ] **Step 1: `CorteView.tsx` — `DiferenciaBadge` usa `Badge` compartido**

Añade el import (junto a los existentes, antes del bloque `CORTE_CSS`):
```tsx
import { Badge } from '@/components/ui/Badge';
```

Reemplaza:
```tsx
function DiferenciaBadge({ diferencia }: { diferencia: number }) {
  if (diferencia === 0) {
    return <span className="font-semibold text-green-700">Cuadra</span>;
  }
  if (diferencia > 0) {
    return <span className="font-semibold text-amber-700">Sobrante +{money(diferencia)}</span>;
  }
  return <span className="font-semibold text-red-700">Faltante −{money(Math.abs(diferencia))}</span>;
}
```
por:
```tsx
function DiferenciaBadge({ diferencia }: { diferencia: number }) {
  if (diferencia === 0) return <Badge tone="success">Cuadra</Badge>;
  if (diferencia > 0) return <Badge tone="warning">Sobrante +{money(diferencia)}</Badge>;
  return <Badge tone="danger">Faltante −{money(Math.abs(diferencia))}</Badge>;
}
```

El resto del archivo (`CORTE_CSS`, todo el JSX de `.corte`/`.row`/`.mov`) no cambia.

- [ ] **Step 2: `historial/page.tsx` (caja) — `Badge` local → compartido, `Button` en Filtrar**

Añade los imports:
```tsx
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
```

Elimina la función local `Badge`:
```tsx
function Badge({
  tone,
  children,
}: {
  tone: 'green' | 'slate' | 'amber' | 'red';
  children: React.ReactNode;
}) {
  const style = {
    green: 'bg-green-100 text-green-800',
    slate: 'bg-slate-200 text-slate-600',
    amber: 'bg-amber-100 text-amber-800',
    red: 'bg-red-100 text-red-800',
  }[tone];
  return (
    <span
      className={'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ' + style}
    >
      {children}
    </span>
  );
}
```

Actualiza `EstadoBadge` y `DiferenciaBadge` (mapeo `green→success`, `slate→neutral`, `amber→warning`, `red→danger`):
```tsx
function EstadoBadge({ estado }: { estado: CashSessionListRow['estado'] }) {
  return estado === 'ABIERTA' ? (
    <Badge tone="green">Abierta</Badge>
  ) : (
    <Badge tone="slate">Cerrada</Badge>
  );
}

function DiferenciaBadge({ diferencia }: { diferencia: number | null }) {
  if (diferencia === null) return <span className="text-slate-400">—</span>;
  if (diferencia === 0) return <Badge tone="green">Cuadra</Badge>;
  if (diferencia > 0) return <Badge tone="amber">Sobrante +{money(diferencia)}</Badge>;
  return <Badge tone="red">Faltante −{money(Math.abs(diferencia))}</Badge>;
}
```
por:
```tsx
function EstadoBadge({ estado }: { estado: CashSessionListRow['estado'] }) {
  return estado === 'ABIERTA' ? (
    <Badge tone="success">Abierta</Badge>
  ) : (
    <Badge tone="neutral">Cerrada</Badge>
  );
}

function DiferenciaBadge({ diferencia }: { diferencia: number | null }) {
  if (diferencia === null) return <span className="text-slate-400">—</span>;
  if (diferencia === 0) return <Badge tone="success">Cuadra</Badge>;
  if (diferencia > 0) return <Badge tone="warning">Sobrante +{money(diferencia)}</Badge>;
  return <Badge tone="danger">Faltante −{money(Math.abs(diferencia))}</Badge>;
}
```

Reemplaza el botón "Filtrar":
```tsx
        <button
          type="submit"
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-slate-700"
        >
          Filtrar
        </button>
```
por:
```tsx
        <Button type="submit" variant="primary">
          Filtrar
        </Button>
```

- [ ] **Step 3: Verificar**

Run: `npm run typecheck && npm run lint && npm run build`
Expected: 0 errores.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/caja/CorteView.tsx" "src/app/(app)/caja/historial/page.tsx"
git commit -m "feat(diseno): DiferenciaBadge/EstadoBadge de Caja usan el Badge compartido

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01EnFJHWm8zVoqgkmfwwcRHi"
```

---

## Task 14: Verificación final del plan — suite completa + revisión de selectores E2E

**Files:** Ninguno nuevo — task de verificación pura. Puede tocar `e2e/ventas.spec.ts`/`e2e/caja.spec.ts` si Tasks 7/12 dejaron ajustes pendientes de confirmar.

- [ ] **Step 1: Suite completa**

Run: `npm run typecheck && npm run lint && npm run test:unit && npm run test:integration && npm run build && npm run test:e2e`

Expected: 0 errores; las 602 pruebas previas (233 unit + 334 integración + 37 E2E, ya incluye los 2 nuevos de Plan 1) siguen en verde. Presta atención especial a `e2e/ventas.spec.ts` (incluye `Cobrar $...`/`Confirmar venta`/`cancelación el mismo día`) y `e2e/caja.spec.ts` (apertura/movimientos/cierre) — son los específicamente tocados por el layout nuevo (Task 2) y los `ConfirmDialog` nuevos (Tasks 7, 12).

- [ ] **Step 2: Revisión manual de invariantes del plan**

Confirma explícitamente en tu reporte: (a) ningún archivo de sesión abierta (`PanelCajaAbierta.tsx`, `SesionAbiertaResumen.tsx`, la rama `ABIERTA` de `sesiones/[id]/page.tsx`) lee `esperadoEfectivo`/`diferencia`/`efectivoContado` — grep `esperadoEfectivo\|efectivoContado\|\.diferencia` sobre esos 3 archivos debe devolver vacío; (b) `TicketView.tsx`, `PrintOnMount.tsx` y `VariantPicker.tsx` no fueron tocados por ningún task (`git diff b270069..HEAD --stat -- src/app/\(app\)/ventas/TicketView.tsx src/app/\(app\)/ventas/PrintOnMount.tsx src/app/\(app\)/ventas/VariantPicker.tsx` vacío — ajusta el commit base al primer commit de este plan); (c) ninguna server action (`crearVentaAction`, `cancelarVentaAction`, `crearDevolucionAction`, `abrirCajaAction`, `registrarMovimientoCajaAction`, `cerrarCajaAction`) cambió de firma — `git diff` sobre `actions.ts` de ambos módulos debe estar vacío.

- [ ] **Step 3: Commit (solo si esta verificación final encontró y corrigió algo que Tasks 1-13 no hayan commiteado ya — el ajuste de `ventas.spec.ts`/`caja.spec.ts` por los `ConfirmDialog` ya quedó commiteado en Tasks 7 y 12 respectivamente, así que este step normalmente no produce ningún cambio nuevo)**

```bash
git add -A
git commit -m "test(diseno): ajustes finales tras la verificación completa de Plan 2

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01EnFJHWm8zVoqgkmfwwcRHi"
```

---

## Global Self-Review (autor del plan)

**Cobertura del spec:** §5.2 Ventas/POS (layout 2 columnas, TOTAL 34px, panel de pago fijo sin scroll) → Tasks 1-2. §5.3 Caja (fondo destacado, `Badge` en movimientos, botón único de cierre, arqueo a ciegas preservado, `ConfirmDialog` en cierre) → Tasks 10-12. §4 Primitivos (`Button`/`Badge`/`Card`/`EmptyState`/`ConfirmDialog` aplicados) → todas las tasks. §7 Accesibilidad (foco visible vía `Button`, acciones destructivas con `ConfirmDialog`) → Tasks 7, 12 y heredado de `Button` en el resto. §8 Qué NO cambia (ninguna regla de negocio) → verificado explícitamente en Task 14 Step 2. §9 Riesgo de pruebas acopladas → Tasks 7, 12, 14 incluyen paso explícito de ajuste/verificación de E2E.

**No cubierto deliberadamente en este plan (documentado, no un olvido):** `VariantPicker.tsx` (modal de selección de variante, spec no lo menciona explícitamente; queda para una eventual Plan 3 si se decide dar un primitivo `Modal` genérico — no se fuerza aquí para no inventar alcance). Altura táctil ≥40px (spec §6) — `Button` md hoy mide 36px (deuda ya señalada en el ledger de Plan 1); este plan no la resuelve porque tocar la altura del primitivo compartido es una decisión de Plan 1/transversal, no de Ventas/Caja específicamente — se deja como nota para retomar si el usuario lo pide, no se resuelve de forma unilateral aquí para no exceder el task actual.

**Consistencia de tipos:** `SesionAbiertaResumen` (Task 11) se define una sola vez y sus props (`{ session: CashSessionDetail }`) son las que consumen tanto `PanelCajaAbierta.tsx` como `sesiones/[id]/page.tsx` — mismo nombre, mismo tipo, verificado en ambos sitios de consumo dentro del propio task.

**Sin placeholders:** cada task da el bloque exacto de código actual y el bloque exacto de reemplazo (o el archivo completo cuando el cambio toca la mayoría del archivo) — ninguna tarea dice "similar a Task N" ni "ajustar según el patrón".

**Riesgo señalado:** Tasks 7 y 12 son las únicas que pueden requerir tocar un `.spec.ts` existente — ambas lo declaran explícitamente como parte de su Step de verificación, con la regla exacta de qué comprobar y cómo ajustar si hace falta, en línea con la spec §9 ("el mismo commit actualiza ese selector").
