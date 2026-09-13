# POS Bloque 6 (Reportes) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cuatro reportes gerenciales de solo lectura — Ventas, Inventario, Utilidad/Margen, Clientes — cada uno con selector de período, tarjetas resumen, gráficas SVG propias, una tabla detalle y exportación a CSV, sobre los datos ya existentes de los Bloques 2-5.

**Architecture:** Sin migración de esquema — todo el bloque son funciones de lectura (`Prisma.groupBy`/`aggregate`/`findMany`) en `src/lib/reports/`, consumidas por páginas server (`src/app/(app)/reportes/**`) y rutas de export CSV, con dos componentes de gráfica SVG reutilizables (`src/components/charts/`) y un selector de período compartido. Gate `src/proxy.ts` (Next 16).

**Tech Stack:** Next.js 16.3.4, React 19.2, TypeScript strict, PostgreSQL + Prisma 7 + `@prisma/adapter-pg`, Tailwind v4, Vitest 4 (`*.test.ts` unit / `*.itest.ts` integración con Postgres efímero), Playwright.

**Spec:** `docs/superpowers/specs/2026-09-04-pos-block6-reportes-design.md`

## Global Constraints

- **Base ya construida (Bloques 1-5, en `master`):** reutiliza sin reescribir — `requirePermission`/`getCurrentUser` (`@/lib/auth/context`), `PERMISSIONS`/`can`/`ALL_PERMISSION_KEYS`/`PermissionKey` (`@/lib/auth/rbac`), `ROLE_PERMISSIONS` (`@/lib/auth/role-permissions`), `db` (`@/lib/db`), `ForbiddenError` (`@/lib/errors`), `fmtFechaMX`/`money`/`inputClass` (`@/app/(app)/ventas/types`), `listStock` (`@/lib/inventory/query`), `conCajaAbierta`/`seedCajero`/`seedVariant`/`cleanupSales` (`@/lib/sales/__testutil`), `createSale`/`cancelSale` (`@/lib/sales/sales`), `createReturn` (`@/lib/sales/returns`), `visibleNav`/`NAV_ITEMS` (`@/lib/nav`), `DataTable`/`Pagination`/`Field` (`@/components/*`).
- **Prisma:** un solo cliente, `import { db } from '@/lib/db'` — NUNCA `new PrismaClient()`. **Sin migración en este bloque** — no se crea ni modifica ninguna tabla/columna/enum.
- **Excepción deliberada a "reutiliza sin reescribir":** `@/lib/activity/query.ts` (dueño de `parseDateParam`) importa `@/lib/db` en su primera línea; importar `parseDateParam` desde ahí arrastraría `@/lib/db` a `src/lib/reports/period.ts`, obligando a que `period.test.ts` sea `.itest.ts` (BD efímera) para probar lógica de fechas 100% pura. Para que `period.test.ts` sea un unit test real y rápido, `period.ts` define su **propia** copia local de 4 líneas (`parseFechaParam`, ver Task 2) en vez de importar la de `activity/query.ts`. Es la única duplicación deliberada del bloque; documentada aquí y en el propio archivo.
- **Dinero:** `Decimal @db.Decimal(12,2)` en BD; los servicios reciben/devuelven `number`; `round2 = (x) => Math.round(x * 100) / 100` (idioma del repo, un `const` local por archivo — nunca `toFixed` para redondear, solo para formatear en pantalla/CSV).
- **Devoluciones netas:** Ingreso y Utilidad de Ventas/Margen se calculan netos de devoluciones del período (ventas − devoluciones), mismo criterio que ya usa el arqueo de Caja.
- **`CANCELADA` excluida:** ninguna cifra de Ventas/Margen/Clientes cuenta una venta con `estado = 'CANCELADA'`; se reporta su conteo aparte, informativo.
- **Costeo de Margen:** usa `ProductVariant.precioCompra` **actual** — es una aproximación (no hay costo histórico por línea de venta en el esquema). La pantalla de Margen muestra esa advertencia en texto fijo.
- **Cliente genérico:** `Customer.esGenerico = true` ("Público en general") se excluye del ranking de Top/Detalle de clientes; se reporta aparte (`genericoResumen`).
- **Período:** `ReportPeriod = { desde: Date; hasta: Date; etiqueta: string }`, resuelto por `resolvePeriod` (Task 2) a partir de `searchParams` — atajos `'hoy'|'semana'|'mes'|'30dias'` o rango personalizado (`desde`/`hasta`), default `'mes'` sin parámetros. `hasta` es inclusivo hasta las `23:59:59.999` de `America/Mexico_City` de ese día. México no observa horario de verano (abolido desde 2022) — el offset fijo `-06:00` es correcto para todo el sistema.
- **Permisos** (grupo `reportes` en `PERMISSIONS`): `reportes.ver` (Ventas/Inventario/Clientes) y `reportes.margen` (Utilidad — expone costos). Reparto en `ROLE_PERMISSIONS`: Gerente += ambas; Cajero += `reportes.ver`; Empleado sin cambios; Administrador vía `ALL_PERMISSION_KEYS`.
- **Autorización:** toda página server empieza con `await requirePermission('reportes.ver')` (o `'reportes.margen'` en `margen/page.tsx`) ANTES de leer `searchParams` o tocar la BD; `export const dynamic = 'force-dynamic'`. Cada `export/route.ts` hace `try { await requirePermission(...) } catch (e) { if (e instanceof ForbiddenError) return NextResponse.json({ error: e.message }, { status: 403 }); throw e }`.
- **Sin auditoría nueva:** Reportes es de solo lectura; no se añaden acciones a `AuditAction`/`KNOWN_ACTIONS` ni llamadas a `logActivity` (confirmado: los exports de Ventas/Caja tampoco auditan).
- **UI:** español; `redirect()`/`notFound()` fuera de try/catch; Tailwind v4; sin `any`; sin `console.*`. Gráficas SVG propias en `src/components/charts/` — **sin librería nueva** (decisión explícita de la sesión de diseño).
- **TDD:** test primero. `*.test.ts` unit (sin BD): solo `period.test.ts` en este bloque. `*.itest.ts` integración (Postgres efímero `localhost:54330` db `pos_test`): toda función de `src/lib/reports/*.ts` (importan `@/lib/db`) y todo `export/route.itest.ts`. Ejecutar por tarea: `npm run typecheck && npm run lint && npm run test:unit && npm run test:integration && npm run build`, pegar las colas en el reporte.
- **Testing de período en itests:** para probar que un registro FUERA del período se excluye, cada itest usa un `ReportPeriod` amplio para las aserciones de inclusión (`desde: new Date('2000-01-01')`, `hasta: new Date('2100-01-01')`) y solo el/los registro(s) que deben excluirse se sacan de ese rango con un `db.<modelo>.update({ where: { id }, data: { createdAt: <fecha fuera de rango> } })` directo tras crearlos vía el servicio real — nunca se inventa un `createdAt` al crear (los servicios de Bloques 4-5 no aceptan esa fecha como parámetro).
- **Aislamiento FK en itests:** mismo orden que Bloque 5 (`activityLog` → `payment` → `returnLine` → `return` → `saleLine` → `sale` → `cashMovement` → `cashSession` → `inventoryMovement` → `productVariant` → `product` → usuarios de prueba). Reportes no crea filas propias que limpiar — solo lee. **Nunca** borrar el cliente `esGenerico`, roles de sistema, `taxRate`, ni otros clientes/productos sembrados por otras suites.
- **Commits:** Conventional Commits en español, terminando EXACTAMENTE con:
  ```
  Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01EnFJHWm8zVoqgkmfwwcRHi
  ```
- **Sin push, sin remoto, sin deploy.** Todo local.

---

## Estructura de archivos

**Librería**
- `src/lib/auth/rbac.ts` — + grupo `reportes`.
- `src/lib/auth/role-permissions.ts` — + `reportes.ver`/`reportes.margen` en Gerente y Cajero.
- `src/lib/nav.ts` — + ítem "Reportes".
- `src/lib/reports/period.ts` — `ReportPeriod`, `resolvePeriod`, `diaKeyMX`.
- `src/lib/reports/ventas.ts` — `getSalesReport`.
- `src/lib/reports/inventario.ts` — `getInventoryReport`.
- `src/lib/reports/margen.ts` — `getMarginReport`.
- `src/lib/reports/clientes.ts` — `getCustomersReport`.

**Componentes**
- `src/components/charts/BarChart.tsx`, `LineChart.tsx`.

**App**
- `src/app/(app)/reportes/page.tsx`, `PeriodFilterForm.tsx`.
- `src/app/(app)/reportes/ventas/{page.tsx, export/route.ts}`.
- `src/app/(app)/reportes/inventario/{page.tsx, export/route.ts}`.
- `src/app/(app)/reportes/margen/{page.tsx, export/route.ts}`.
- `src/app/(app)/reportes/clientes/{page.tsx, export/route.ts}`.

**E2E**
- `e2e/reportes.spec.ts`.

---

## Task 1: RBAC y navegación (`reportes.ver`, `reportes.margen`)

**Files:**
- Modify: `src/lib/auth/rbac.ts`, `src/lib/auth/role-permissions.ts`, `src/lib/nav.ts`
- Create: `src/lib/auth/rbac-reportes.test.ts`

**Interfaces:**
- Produces: claves `reportes.ver`/`reportes.margen` (parte de `PermissionKey`/`ALL_PERMISSION_KEYS`). `ROLE_PERMISSIONS.Gerente` += ambas; `.Cajero` += `reportes.ver`.

- [ ] **Step 1: `src/lib/auth/rbac-reportes.test.ts` (falla)**

```ts
import { describe, it, expect } from 'vitest';
import { PERMISSIONS, ALL_PERMISSION_KEYS } from './rbac';

describe('grupo de permisos reportes', () => {
  it('existe el módulo reportes con 2 claves', () => {
    const g = PERMISSIONS.find((x) => x.modulo === 'reportes');
    expect(g?.permisos.map((p) => p.key)).toEqual(['reportes.ver', 'reportes.margen']);
  });
  it('ambas claves están en ALL_PERMISSION_KEYS', () => {
    expect(ALL_PERMISSION_KEYS).toContain('reportes.ver');
    expect(ALL_PERMISSION_KEYS).toContain('reportes.margen');
  });
});
```

- [ ] **Step 2: Ejecutar (FAIL), añadir el grupo en `rbac.ts`** — como último elemento de `PERMISSIONS` (tras `caja`, antes de `] as const;`):

```ts
  {
    modulo: 'reportes', label: 'Reportes',
    permisos: [
      { key: 'reportes.ver', label: 'Ver reportes de ventas, inventario y clientes' },
      { key: 'reportes.margen', label: 'Ver el reporte de utilidad y margen (costos)' },
    ],
  },
```

Run: `npm run test:unit -- src/lib/auth/rbac-reportes.test.ts` → PASS.

- [ ] **Step 3: `role-permissions.ts` — reparto**

En `ROLE_PERMISSIONS.Gerente` (tras el bloque `// Bloque 5: Caja`, añade un comentario `// Bloque 6: Reportes`):
```ts
    // Bloque 6: Reportes
    'reportes.ver', 'reportes.margen',
```
En `ROLE_PERMISSIONS.Cajero` (añade a la lista existente):
```ts
    'reportes.ver',
```
`Empleado` no cambia.

- [ ] **Step 4: `nav.ts` — 1 ítem** — entre el ítem `/caja` y `/perfil`: `{ href: '/reportes', label: 'Reportes', permiso: 'reportes.ver' }`.

- [ ] **Step 5: Suite completa + commit**

Run: `npm run typecheck && npm run lint && npm run test:unit && npm run test:integration`
Expected: 0 errores; `src/lib/roles/admin.itest.ts` sigue verde (consume `ROLE_PERMISSIONS`).

```bash
git add src/lib/auth/rbac.ts src/lib/auth/rbac-reportes.test.ts src/lib/auth/role-permissions.ts src/lib/nav.ts
git commit -m "feat(reportes): permisos reportes.ver/reportes.margen y navegación

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01EnFJHWm8zVoqgkmfwwcRHi"
```

---

## Task 2: Resolución de período (`src/lib/reports/period.ts`)

**Files:**
- Create: `src/lib/reports/period.ts`, `src/lib/reports/period.test.ts`

**Interfaces:**
- Produces: `type ReportPeriod = { desde: Date; hasta: Date; etiqueta: string }`; `resolvePeriod(params: { atajo?: string; desde?: string; hasta?: string }): ReportPeriod`; `diaKeyMX(d: Date): string`.

- [ ] **Step 1: `src/lib/reports/period.test.ts` (falla)** — unit, sin BD.

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { resolvePeriod, diaKeyMX } from './period';

describe('diaKeyMX', () => {
  it('usa el día natural de America/Mexico_City, no UTC', () => {
    // 2026-09-04T04:30:00Z = 2026-09-03 22:30 en MX (UTC-6) — mismo caso que fecha.test.ts.
    expect(diaKeyMX(new Date('2026-09-04T04:30:00Z'))).toBe('2026-09-03');
  });
});

describe('resolvePeriod', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // 2026-09-04T15:00:00Z = 2026-09-04 09:00 en MX.
    vi.setSystemTime(new Date('2026-09-04T15:00:00Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('sin parámetros usa el atajo "mes" (default) — desde el día 1 del mes MX en curso', () => {
    const p = resolvePeriod({});
    expect(p.etiqueta).toBe('Este mes');
    expect(diaKeyMX(p.desde)).toBe('2026-09-01');
    expect(p.hasta.toISOString()).toBe('2026-09-05T05:59:59.999Z'); // fin del día MX de hoy
  });

  it('atajo "hoy" — medianoche a medianoche del día MX en curso', () => {
    const p = resolvePeriod({ atajo: 'hoy' });
    expect(p.desde.toISOString()).toBe('2026-09-04T06:00:00.000Z'); // medianoche MX = 06:00 UTC
    expect(p.hasta.toISOString()).toBe('2026-09-05T05:59:59.999Z');
  });

  it('atajo "semana" — desde el lunes de la semana MX en curso', () => {
    const p = resolvePeriod({ atajo: 'semana' });
    const nombreDia = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Mexico_City',
      weekday: 'long',
    }).format(p.desde);
    expect(nombreDia).toBe('Monday');
    expect(diaKeyMX(p.hasta)).toBe('2026-09-04');
  });

  it('atajo "30dias" — últimos 30 días naturales incluyendo hoy', () => {
    const p = resolvePeriod({ atajo: '30dias' });
    expect(diaKeyMX(p.desde)).toBe('2026-08-06');
    expect(diaKeyMX(p.hasta)).toBe('2026-09-04');
  });

  it('rango personalizado (desde/hasta) ignora el atajo', () => {
    const p = resolvePeriod({ atajo: 'hoy', desde: '2026-09-01', hasta: '2026-09-15' });
    expect(diaKeyMX(p.desde)).toBe('2026-09-01');
    expect(diaKeyMX(p.hasta)).toBe('2026-09-15');
    expect(p.etiqueta).toBe('Rango personalizado');
  });

  it('atajo desconocido cae al default "mes"', () => {
    const p = resolvePeriod({ atajo: 'x' });
    expect(p.etiqueta).toBe('Este mes');
  });
});
```

- [ ] **Step 2: Ejecutar (FAIL), escribir `src/lib/reports/period.ts`**

```ts
export type ReportPeriod = { desde: Date; hasta: Date; etiqueta: string };

const MX_OFFSET = '-06:00'; // America/Mexico_City no observa horario de verano (abolido desde 2022).

/**
 * Copia local de `parseDateParam` (`@/lib/activity/query`) — NO se importa de
 * ahí porque ese módulo importa `@/lib/db` en su primera línea, lo que
 * arrastraría una dependencia de BD a este archivo y obligaría a que
 * `period.test.ts` fuera `.itest.ts` para probar lógica de fechas 100% pura.
 * Ver Global Constraints del plan.
 */
function parseFechaParam(s: string | undefined): Date | undefined {
  if (!s) return undefined;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

/** Clave de día natural en America/Mexico_City, formato YYYY-MM-DD (orden lexicográfico = orden cronológico). */
export function diaKeyMX(d: Date): string {
  return d.toLocaleDateString('en-CA', { timeZone: 'America/Mexico_City' });
}

function inicioDiaMX(d: Date): Date {
  return new Date(`${diaKeyMX(d)}T00:00:00${MX_OFFSET}`);
}

function finDiaMX(d: Date): Date {
  return new Date(`${diaKeyMX(d)}T23:59:59.999${MX_OFFSET}`);
}

function sumarDias(d: Date, n: number): Date {
  return new Date(d.getTime() + n * 24 * 60 * 60 * 1000);
}

type Atajo = 'hoy' | 'semana' | 'mes' | '30dias';

function esAtajo(v: string | undefined): v is Atajo {
  return v === 'hoy' || v === 'semana' || v === 'mes' || v === '30dias';
}

/**
 * Resuelve el período de un reporte a partir de los `searchParams` de la URL.
 * Prioridad: `desde`/`hasta` (rango personalizado) > `atajo` > default `'mes'`.
 * `hasta` es inclusivo hasta el final del día MX.
 */
export function resolvePeriod(params: {
  atajo?: string;
  desde?: string;
  hasta?: string;
}): ReportPeriod {
  const desdeParam = parseFechaParam(params.desde);
  const hastaParam = parseFechaParam(params.hasta);
  const ahora = new Date();

  if (desdeParam || hastaParam) {
    const desde = desdeParam ? inicioDiaMX(desdeParam) : inicioDiaMX(ahora);
    const hasta = hastaParam ? finDiaMX(hastaParam) : finDiaMX(ahora);
    return { desde, hasta, etiqueta: 'Rango personalizado' };
  }

  const atajo: Atajo = esAtajo(params.atajo) ? params.atajo : 'mes';
  const hoyKey = diaKeyMX(ahora);

  switch (atajo) {
    case 'hoy':
      return { desde: inicioDiaMX(ahora), hasta: finDiaMX(ahora), etiqueta: 'Hoy' };
    case 'semana': {
      const [y, m, dd] = hoyKey.split('-').map(Number);
      const refUTC = new Date(Date.UTC(y, m - 1, dd));
      const diaIso = refUTC.getUTCDay() === 0 ? 7 : refUTC.getUTCDay(); // 1=lunes .. 7=domingo
      const lunes = sumarDias(inicioDiaMX(ahora), -(diaIso - 1));
      return { desde: lunes, hasta: finDiaMX(ahora), etiqueta: 'Esta semana' };
    }
    case '30dias':
      return {
        desde: sumarDias(inicioDiaMX(ahora), -29),
        hasta: finDiaMX(ahora),
        etiqueta: 'Últimos 30 días',
      };
    case 'mes':
    default: {
      const [y, m] = hoyKey.split('-').map(Number);
      const primerDia = new Date(`${y}-${String(m).padStart(2, '0')}-01T00:00:00${MX_OFFSET}`);
      return { desde: primerDia, hasta: finDiaMX(ahora), etiqueta: 'Este mes' };
    }
  }
}
```

- [ ] **Step 3: Ejecutar y verificar que pasa** — `npm run test:unit -- src/lib/reports/period.test.ts` → PASS.

- [ ] **Step 4: typecheck + lint + commit**

```bash
git add src/lib/reports/period.ts src/lib/reports/period.test.ts
git commit -m "feat(reportes): resolución de período (atajos y rango personalizado)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01EnFJHWm8zVoqgkmfwwcRHi"
```

---

## Task 3: Componentes de gráficas (`src/components/charts/`)

**Files:**
- Create: `src/components/charts/BarChart.tsx`, `src/components/charts/LineChart.tsx`

**Interfaces:**
- Produces: `type ChartDatum = { label: string; value: number }`; `BarChart({ data: ChartDatum[]; orientacion?: 'vertical' | 'horizontal'; formatValue?: (n: number) => string })`; `LineChart({ data: ChartDatum[]; formatValue?: (n: number) => string })`. Ambos componentes de render puro (sin `'use client'`, sin fetch, sin estado) — reciben datos ya calculados por el servidor.
- Sin test dedicado (convención del repo: los componentes de presentación pura como `Field.tsx`/`DataTable.tsx`/`Pagination.tsx` no llevan unit test propio) — se verifican por `typecheck`+`lint`+`build` y, en pantalla, por los itests de las páginas de reporte (Tasks 5-8) y E2E (Task 9).

- [ ] **Step 1: `src/components/charts/BarChart.tsx`**

```tsx
export type ChartDatum = { label: string; value: number };

/**
 * Gráfica de barras SVG, sin dependencias externas. `orientacion='horizontal'`
 * usa barras CSS (mejor para etiquetas largas, p. ej. nombres de producto);
 * `'vertical'` (default) usa un `<svg>` con barras + etiquetas de eje X.
 */
export function BarChart({
  data,
  orientacion = 'vertical',
  formatValue = (n) => String(n),
}: {
  data: ChartDatum[];
  orientacion?: 'vertical' | 'horizontal';
  formatValue?: (n: number) => string;
}) {
  if (data.length === 0) {
    return <p className="text-sm text-slate-500">Sin datos en este período.</p>;
  }
  const max = Math.max(...data.map((d) => d.value), 0) || 1;

  if (orientacion === 'horizontal') {
    return (
      <div className="space-y-2">
        {data.map((d) => (
          <div key={d.label} className="space-y-0.5">
            <div className="flex items-center justify-between gap-2 text-xs text-slate-600">
              <span className="truncate">{d.label}</span>
              <span className="shrink-0 font-medium text-slate-900">{formatValue(d.value)}</span>
            </div>
            <div className="h-3 w-full rounded bg-slate-100">
              <div
                className="h-3 rounded bg-slate-700"
                style={{ width: `${d.value > 0 ? Math.max((d.value / max) * 100, 2) : 0}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    );
  }

  const width = 480;
  const height = 220;
  const padding = 28;
  const barGap = 8;
  const barWidth = (width - padding * 2 - barGap * (data.length - 1)) / data.length;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full" role="img" aria-label="Gráfica de barras">
      {data.map((d, i) => {
        const barHeight = d.value > 0 ? Math.max((d.value / max) * (height - padding * 2), 2) : 0;
        const x = padding + i * (barWidth + barGap);
        const y = height - padding - barHeight;
        return (
          <g key={d.label}>
            <rect x={x} y={y} width={barWidth} height={barHeight} className="fill-slate-700" />
            <text
              x={x + barWidth / 2}
              y={height - padding + 14}
              textAnchor="middle"
              className="fill-slate-600 text-[9px]"
            >
              {d.label.length > 10 ? `${d.label.slice(0, 9)}…` : d.label}
            </text>
            <text
              x={x + barWidth / 2}
              y={Math.max(y - 4, 10)}
              textAnchor="middle"
              className="fill-slate-900 text-[9px] font-medium"
            >
              {formatValue(d.value)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
```

- [ ] **Step 2: `src/components/charts/LineChart.tsx`**

```tsx
import type { ChartDatum } from './BarChart';

/** Gráfica de línea/área SVG para tendencias, sin dependencias externas. */
export function LineChart({
  data,
  formatValue = (n) => String(n),
}: {
  data: ChartDatum[];
  formatValue?: (n: number) => string;
}) {
  if (data.length === 0) {
    return <p className="text-sm text-slate-500">Sin datos en este período.</p>;
  }
  if (data.length === 1) {
    return (
      <p className="text-sm text-slate-600">
        {data[0].label}: <span className="font-medium text-slate-900">{formatValue(data[0].value)}</span>
      </p>
    );
  }

  const width = 480;
  const height = 220;
  const padding = 28;
  const values = data.map((d) => d.value);
  const max = Math.max(...values, 0);
  const min = Math.min(...values, 0);
  const range = max - min || 1;
  const stepX = (width - padding * 2) / (data.length - 1);

  const points = data.map((d, i) => ({
    x: padding + i * stepX,
    y: height - padding - ((d.value - min) / range) * (height - padding * 2),
  }));

  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  const areaPath = `${linePath} L ${points[points.length - 1].x} ${height - padding} L ${points[0].x} ${height - padding} Z`;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full" role="img" aria-label="Gráfica de tendencia">
      <path d={areaPath} className="fill-slate-200" />
      <path d={linePath} className="fill-none stroke-slate-700" strokeWidth={2} />
      {points.map((p, i) => (
        <circle key={data[i].label} cx={p.x} cy={p.y} r={2.5} className="fill-slate-700" />
      ))}
      {data.map((d, i) => (
        <text
          key={d.label}
          x={points[i].x}
          y={height - padding + 14}
          textAnchor="middle"
          className="fill-slate-600 text-[8px]"
        >
          {d.label.length > 5 ? d.label.slice(5) : d.label}
        </text>
      ))}
    </svg>
  );
}
```

- [ ] **Step 3: typecheck + lint + build + commit**

Run: `npm run typecheck && npm run lint && npm run build`

```bash
git add src/components/charts/BarChart.tsx src/components/charts/LineChart.tsx
git commit -m "feat(reportes): componentes de gráficas SVG (barras y línea), sin dependencia nueva

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01EnFJHWm8zVoqgkmfwwcRHi"
```

---

## Task 4: Selector de período compartido y página de aterrizaje

**Files:**
- Create: `src/app/(app)/reportes/PeriodFilterForm.tsx`, `src/app/(app)/reportes/page.tsx`

**Interfaces:**
- Consumes: `inputClass` (`@/app/(app)/ventas/types`), `requirePermission`/`can` (`@/lib/auth/context`, `@/lib/auth/rbac`).
- Produces: `PeriodFilterForm({ base, atajo, desde, hasta }: { base: string; atajo?: string; desde?: string; hasta?: string })` — reutilizado por las Tasks 5-8. Ruta `/reportes`.

- [ ] **Step 1: `src/app/(app)/reportes/PeriodFilterForm.tsx`**

```tsx
import Link from 'next/link';
import { inputClass } from '@/app/(app)/ventas/types';

const ATAJOS: { value: string; label: string }[] = [
  { value: 'hoy', label: 'Hoy' },
  { value: 'semana', label: 'Esta semana' },
  { value: 'mes', label: 'Este mes' },
  { value: '30dias', label: 'Últimos 30 días' },
];

/**
 * Selector de período compartido por los 4 reportes: atajos (links GET) +
 * rango personalizado (`<form method="get">`). `base` es la ruta del
 * reporte, p. ej. `/reportes/ventas`.
 */
export function PeriodFilterForm({
  base,
  atajo,
  desde,
  hasta,
}: {
  base: string;
  atajo?: string;
  desde?: string;
  hasta?: string;
}) {
  const rangoActivo = Boolean(desde || hasta);
  const activo = rangoActivo ? null : (atajo ?? 'mes');

  return (
    <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap gap-2">
        {ATAJOS.map((a) => (
          <Link
            key={a.value}
            href={`${base}?atajo=${a.value}`}
            className={
              'rounded-full px-3 py-1 text-xs font-medium ' +
              (activo === a.value
                ? 'bg-slate-900 text-white'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200')
            }
          >
            {a.label}
          </Link>
        ))}
      </div>
      <form method="get" action={base} className="flex flex-wrap items-end gap-3">
        <label className="block space-y-1">
          <span className="text-sm font-medium text-slate-700">Desde</span>
          <input type="date" name="desde" defaultValue={desde ?? ''} className={inputClass} />
        </label>
        <label className="block space-y-1">
          <span className="text-sm font-medium text-slate-700">Hasta</span>
          <input type="date" name="hasta" defaultValue={hasta ?? ''} className={inputClass} />
        </label>
        <button
          type="submit"
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-slate-700"
        >
          Aplicar rango
        </button>
        {rangoActivo ? (
          <Link href={base} className="px-2 py-2 text-sm text-slate-500 hover:text-slate-700">
            Limpiar
          </Link>
        ) : null}
      </form>
    </div>
  );
}
```

- [ ] **Step 2: `src/app/(app)/reportes/page.tsx`**

```tsx
import Link from 'next/link';
import { requirePermission } from '@/lib/auth/context';
import { can } from '@/lib/auth/rbac';

export const dynamic = 'force-dynamic';

const REPORTES = [
  {
    href: '/reportes/ventas',
    titulo: 'Ventas',
    descripcion: 'Ingresos, tendencia diaria, cobros por método, top productos y por cajero.',
  },
  {
    href: '/reportes/inventario',
    titulo: 'Inventario',
    descripcion: 'Valorización de stock, movimientos del período y rotación.',
  },
  {
    href: '/reportes/clientes',
    titulo: 'Clientes',
    descripcion: 'Clientes activos, nuevos y top compradores del período.',
  },
] as const;

export default async function ReportesPage() {
  const actor = await requirePermission('reportes.ver');
  const verMargen = can(actor, 'reportes.margen');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Reportes</h1>
        <p className="text-slate-600">Elige un reporte para consultarlo.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {REPORTES.map((r) => (
          <Link
            key={r.href}
            href={r.href}
            className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm hover:border-slate-300"
          >
            <h2 className="text-lg font-semibold text-slate-900">{r.titulo}</h2>
            <p className="mt-1 text-sm text-slate-600">{r.descripcion}</p>
          </Link>
        ))}
        {verMargen ? (
          <Link
            href="/reportes/margen"
            className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm hover:border-slate-300"
          >
            <h2 className="text-lg font-semibold text-slate-900">Utilidad / margen</h2>
            <p className="mt-1 text-sm text-slate-600">
              Ganancia bruta por producto, usando el costo actual.
            </p>
          </Link>
        ) : null}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: typecheck + lint + build + commit**

Run: `npm run typecheck && npm run lint && npm run build`

```bash
git add "src/app/(app)/reportes/PeriodFilterForm.tsx" "src/app/(app)/reportes/page.tsx"
git commit -m "feat(reportes): selector de período compartido y página de aterrizaje

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01EnFJHWm8zVoqgkmfwwcRHi"
```

---

## Task 5: Reporte de Ventas (servicio, pantalla y export)

**Files:**
- Create: `src/lib/reports/ventas.ts`, `src/lib/reports/ventas.itest.ts`
- Create: `src/app/(app)/reportes/ventas/page.tsx`
- Create: `src/app/(app)/reportes/ventas/export/route.ts`, `route.itest.ts`

**Interfaces:**
- Consumes: `ReportPeriod`/`diaKeyMX` (Task 2), `BarChart`/`LineChart` (Task 3), `PeriodFilterForm` (Task 4), `money`/`fmtFechaMX` (`@/app/(app)/ventas/types`), `requirePermission` (`@/lib/auth/context`), `resolvePeriod` (Task 2), `conCajaAbierta`/`seedCajero`/`seedVariant`/`cleanupSales` (`@/lib/sales/__testutil`), `createSale`/`cancelSale` (`@/lib/sales/sales`), `createReturn` (`@/lib/sales/returns`).
- Produces: `getSalesReport(periodo: ReportPeriod): Promise<SalesReport>`.

### Step 1: `src/lib/reports/ventas.itest.ts` (falla)

`.itest.ts` — importa `@/lib/db` vía `getSalesReport`. Aislamiento FK-seguro (mismo orden que Bloque 5). `beforeEach`: `cleanupSales([...emails])`, siembra `CAJERO_A`/`CAJERO_B` (`seedCajero`), `conCajaAbierta(CAJERO_A)` (Ventas/Caja exigen sesión abierta para crear ventas/devoluciones).

```ts
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { db } from '@/lib/db';
import { createSale, cancelSale } from '@/lib/sales/sales';
import { createReturn } from '@/lib/sales/returns';
import { seedCajero, seedVariant, cleanupSales, conCajaAbierta } from '@/lib/sales/__testutil';
import { getSalesReport } from './ventas';
import type { ReportPeriod } from './period';

const CAJERO_A_EMAIL = 't6-reportes-ventas-a@pos.com';
const CAJERO_B_EMAIL = 't6-reportes-ventas-b@pos.com';
const EMAILS = [CAJERO_A_EMAIL, CAJERO_B_EMAIL];

const PERIODO_AMPLIO: ReportPeriod = {
  desde: new Date('2000-01-01T00:00:00Z'),
  hasta: new Date('2100-01-01T00:00:00Z'),
  etiqueta: 'test',
};

let CAJERO_A: string;
let CAJERO_B: string;

beforeEach(async () => {
  await cleanupSales(EMAILS);
  CAJERO_A = await seedCajero(CAJERO_A_EMAIL);
  CAJERO_B = await seedCajero(CAJERO_B_EMAIL);
  await conCajaAbierta(CAJERO_A);
});

afterAll(async () => {
  await cleanupSales(EMAILS);
});

describe('getSalesReport', () => {
  it('escenario compuesto: KPIs, cobros por método, top productos, por cajero — canceladas y devoluciones excluidas/netas', async () => {
    const { variantId } = await seedVariant({ precioVenta: 100, stock: 50 }); // IVA 16% → 1 ud = 116.00

    // 2 ventas EFECTIVO exacto de CAJERO_A: 2 uds (232.00) + 1 ud (116.00).
    await createSale(
      CAJERO_A,
      { customerId: null, lineas: [{ variantId, cantidad: 2 }], descuentoTicket: null, pagos: [{ metodo: 'EFECTIVO', monto: 232 }], requiereFactura: false },
      null,
    );
    await createSale(
      CAJERO_A,
      { customerId: null, lineas: [{ variantId, cantidad: 1 }], descuentoTicket: null, pagos: [{ metodo: 'EFECTIVO', monto: 116 }], requiereFactura: false },
      null,
    );
    // 1 venta TARJETA de CAJERO_B: 1 ud (116.00).
    const ventaTarjeta = await createSale(
      CAJERO_B,
      { customerId: null, lineas: [{ variantId, cantidad: 1 }], descuentoTicket: null, pagos: [{ metodo: 'TARJETA', monto: 116 }], requiereFactura: false },
      null,
    );
    // Devolución total de la venta con tarjeta: 1 ud, reembolso EFECTIVO 116.00 (aunque se cobró con tarjeta, el reembolso puede ser en otro método).
    await createReturn(
      CAJERO_A,
      { saleId: ventaTarjeta.id, lineas: [{ saleLineId: (await db.sale.findUniqueOrThrow({ where: { id: ventaTarjeta.id }, include: { lines: true } })).lines[0].id, cantidad: 1 }], metodoReembolso: 'EFECTIVO', motivo: 'Producto defectuoso' },
      null,
    );
    // 1 venta cancelada de CAJERO_A: 1 ud (116.00) — NO debe contar en nada.
    const ventaCancelada = await createSale(
      CAJERO_A,
      { customerId: null, lineas: [{ variantId, cantidad: 1 }], descuentoTicket: null, pagos: [{ metodo: 'EFECTIVO', monto: 116 }], requiereFactura: false },
      null,
    );
    await cancelSale(CAJERO_A, ventaCancelada.id, 'Prueba de reporte', null);

    const r = await getSalesReport(PERIODO_AMPLIO);

    // KPIs: 3 ventas completadas (232+116+116=464 bruto), 1 cancelada,
    // devoluciones 116, neto 348, ticket promedio 464/3=154.67,
    // IVA bruto 32+16+16=64, IVA devuelto 16, neto 48. Descuentos 0.
    expect(r.kpis.ventasCompletadas).toBe(3);
    expect(r.kpis.ventasCanceladas).toBe(1);
    expect(r.kpis.ingresoNeto).toBe(348);
    expect(r.kpis.ticketPromedio).toBe(154.67);
    expect(r.kpis.ivaTotal).toBe(48);
    expect(r.kpis.descuentosTotal).toBe(0);

    // Cobros por método: EFECTIVO 232+116=348 (las 2 ventas en efectivo, el
    // reembolso NO se resta aquí — es un flujo aparte); TARJETA 116.
    const efectivo = r.cobrosPorMetodo.find((c) => c.metodo === 'EFECTIVO');
    const tarjeta = r.cobrosPorMetodo.find((c) => c.metodo === 'TARJETA');
    expect(efectivo?.monto).toBe(348);
    expect(tarjeta?.monto).toBe(116);

    // Top productos: única variante, cantidad neta 2+1+1−1=3, ingreso neto 232+116+116−116=348.
    expect(r.topProductos).toHaveLength(1);
    expect(r.topProductos[0]).toMatchObject({ variantId, cantidad: 3, ingreso: 348 });

    // Por cajero: A vendió 2 ventas (232+116=348, bruto sin netear), B vendió 1 (116).
    const porA = r.porCajero.find((c) => c.cajeroId === CAJERO_A);
    const porB = r.porCajero.find((c) => c.cajeroId === CAJERO_B);
    expect(porA).toMatchObject({ ventas: 2, ingreso: 348 });
    expect(porB).toMatchObject({ ventas: 1, ingreso: 116 });

    // Tendencia diaria: todo ocurrió "hoy" (mismo día MX) → 1 solo renglón.
    expect(r.tendenciaDiaria).toHaveLength(1);
    expect(r.tendenciaDiaria[0]).toMatchObject({ ventas: 3, ingresoBruto: 464, devoluciones: 116, ingresoNeto: 348, iva: 48 });
  });

  it('agrupa la tendencia diaria en 2 renglones cuando hay ventas de días MX distintos', async () => {
    const { variantId } = await seedVariant({ precioVenta: 100, stock: 10 });
    const venta = await createSale(
      CAJERO_A,
      { customerId: null, lineas: [{ variantId, cantidad: 1 }], descuentoTicket: null, pagos: [{ metodo: 'EFECTIVO', monto: 116 }], requiereFactura: false },
      null,
    );
    // Fuerza esta venta a un día MX distinto (ayer) para probar el bucketing.
    await db.sale.update({ where: { id: venta.id }, data: { createdAt: new Date('2020-01-01T18:00:00Z') } });
    await createSale(
      CAJERO_A,
      { customerId: null, lineas: [{ variantId, cantidad: 1 }], descuentoTicket: null, pagos: [{ metodo: 'EFECTIVO', monto: 116 }], requiereFactura: false },
      null,
    );

    const r = await getSalesReport(PERIODO_AMPLIO);
    expect(r.tendenciaDiaria).toHaveLength(2);
    expect(r.tendenciaDiaria[0].fecha < r.tendenciaDiaria[1].fecha).toBe(true); // orden cronológico
  });

  it('período sin actividad devuelve ceros y arrays vacíos, sin error', async () => {
    const periodoVacio: ReportPeriod = {
      desde: new Date('1990-01-01T00:00:00Z'),
      hasta: new Date('1990-01-02T00:00:00Z'),
      etiqueta: 'test',
    };
    const r = await getSalesReport(periodoVacio);
    expect(r.kpis).toMatchObject({ ventasCompletadas: 0, ventasCanceladas: 0, ingresoNeto: 0, ticketPromedio: 0, ivaTotal: 0, descuentosTotal: 0 });
    expect(r.tendenciaDiaria).toEqual([]);
    expect(r.topProductos).toEqual([]);
    expect(r.porCajero).toEqual([]);
  });

  it('un registro fuera del período no se cuenta', async () => {
    const { variantId } = await seedVariant({ precioVenta: 100, stock: 10 });
    const venta = await createSale(
      CAJERO_A,
      { customerId: null, lineas: [{ variantId, cantidad: 1 }], descuentoTicket: null, pagos: [{ metodo: 'EFECTIVO', monto: 116 }], requiereFactura: false },
      null,
    );
    await db.sale.update({ where: { id: venta.id }, data: { createdAt: new Date('1990-01-01T00:00:00Z') } });

    const periodoActual: ReportPeriod = { desde: new Date(Date.now() - 3600_000), hasta: new Date(Date.now() + 3600_000), etiqueta: 'test' };
    const r = await getSalesReport(periodoActual);
    expect(r.kpis.ventasCompletadas).toBe(0);
  });
});
```

Firma verificada al escribir este plan (`src/lib/sales/returns.ts:15-19`, `src/lib/validation/return.ts:3-11`): `createReturn(actorId: string, input: { saleId: string; lineas: { saleLineId: string; cantidad: number }[]; metodoReembolso: 'EFECTIVO'|'TARJETA'|'TRANSFERENCIA'; motivo: string }, ip: string | null): Promise<{ id: string; folio: string }>` — coincide exactamente con el snippet de arriba, úsalo tal cual.

### Step 2: Ejecutar (FAIL), escribir `src/lib/reports/ventas.ts`

```ts
import { db } from '@/lib/db';
import { diaKeyMX } from './period';
import type { ReportPeriod } from './period';

const round2 = (x: number): number => Math.round(x * 100) / 100;

export type SalesReport = {
  periodo: ReportPeriod;
  kpis: {
    ventasCompletadas: number;
    ventasCanceladas: number;
    ingresoNeto: number;
    ticketPromedio: number;
    ivaTotal: number;
    descuentosTotal: number;
  };
  tendenciaDiaria: {
    fecha: string;
    ventas: number;
    ingresoBruto: number;
    devoluciones: number;
    ingresoNeto: number;
    iva: number;
  }[];
  cobrosPorMetodo: { metodo: 'EFECTIVO' | 'TARJETA' | 'TRANSFERENCIA'; monto: number }[];
  topProductos: { variantId: string; nombre: string; cantidad: number; ingreso: number }[];
  porCajero: { cajeroId: string; nombre: string; ventas: number; ingreso: number }[];
};

export async function getSalesReport(periodo: ReportPeriod): Promise<SalesReport> {
  const rango = { gte: periodo.desde, lte: periodo.hasta };

  const [ventas, ventasCanceladas, devoluciones, pagosPorMetodo] = await Promise.all([
    db.sale.findMany({
      where: { estado: 'COMPLETADA', createdAt: rango },
      select: {
        id: true,
        total: true,
        impuestos: true,
        descuentoLineas: true,
        descuentoTicket: true,
        createdAt: true,
        cajeroId: true,
        cajero: { select: { nombre: true } },
        lines: {
          select: { id: true, variantId: true, productoNombre: true, varianteNombre: true, cantidad: true, total: true },
        },
      },
    }),
    db.sale.count({ where: { estado: 'CANCELADA', createdAt: rango } }),
    db.return.findMany({
      where: { createdAt: rango },
      select: {
        total: true,
        impuestos: true,
        createdAt: true,
        lines: { select: { saleLineId: true, cantidad: true, total: true } },
      },
    }),
    db.payment.groupBy({
      by: ['metodo'],
      where: { sale: { estado: 'COMPLETADA', createdAt: rango } },
      _sum: { monto: true },
    }),
  ]);

  const ingresoBruto = round2(ventas.reduce((s, v) => s + Number(v.total), 0));
  const devolucionesTotal = round2(devoluciones.reduce((s, r) => s + Number(r.total), 0));
  const ingresoNeto = round2(ingresoBruto - devolucionesTotal);
  const ticketPromedio = ventas.length > 0 ? round2(ingresoBruto / ventas.length) : 0;
  const ivaBruto = ventas.reduce((s, v) => s + Number(v.impuestos), 0);
  const ivaDevuelto = devoluciones.reduce((s, r) => s + Number(r.impuestos), 0);
  const ivaTotal = round2(ivaBruto - ivaDevuelto);
  const descuentosTotal = round2(
    ventas.reduce((s, v) => s + Number(v.descuentoLineas) + Number(v.descuentoTicket), 0),
  );

  // Tendencia diaria: agrupa ventas y devoluciones por día natural MX.
  const porDia = new Map<string, { ventas: number; ingresoBruto: number; devoluciones: number; iva: number }>();
  for (const v of ventas) {
    const key = diaKeyMX(v.createdAt);
    const acc = porDia.get(key) ?? { ventas: 0, ingresoBruto: 0, devoluciones: 0, iva: 0 };
    acc.ventas += 1;
    acc.ingresoBruto += Number(v.total);
    acc.iva += Number(v.impuestos);
    porDia.set(key, acc);
  }
  for (const r of devoluciones) {
    const key = diaKeyMX(r.createdAt);
    const acc = porDia.get(key) ?? { ventas: 0, ingresoBruto: 0, devoluciones: 0, iva: 0 };
    acc.devoluciones += Number(r.total);
    acc.iva -= Number(r.impuestos);
    porDia.set(key, acc);
  }
  const tendenciaDiaria = [...porDia.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([fecha, v]) => ({
      fecha,
      ventas: v.ventas,
      ingresoBruto: round2(v.ingresoBruto),
      devoluciones: round2(v.devoluciones),
      ingresoNeto: round2(v.ingresoBruto - v.devoluciones),
      iva: round2(v.iva),
    }));

  const cobrosPorMetodo = pagosPorMetodo.map((p) => ({
    metodo: p.metodo,
    monto: round2(Number(p._sum.monto ?? 0)),
  }));

  // Top productos: cantidad e ingreso netos de devolución, solo de líneas de
  // ventas del período (si la venta original de una devolución cae fuera del
  // período, esa línea no aparece en `saleLineToVariant` y no se resta —
  // netear un producto solo tiene sentido si su venta también está en rango).
  const porProducto = new Map<string, { nombre: string; cantidad: number; ingreso: number }>();
  const saleLineToVariant = new Map<string, string>();
  for (const v of ventas) {
    for (const l of v.lines) {
      saleLineToVariant.set(l.id, l.variantId);
      const acc = porProducto.get(l.variantId) ?? {
        nombre: l.varianteNombre ? `${l.productoNombre} (${l.varianteNombre})` : l.productoNombre,
        cantidad: 0,
        ingreso: 0,
      };
      acc.cantidad += l.cantidad;
      acc.ingreso += Number(l.total);
      porProducto.set(l.variantId, acc);
    }
  }
  for (const r of devoluciones) {
    for (const rl of r.lines) {
      const variantId = saleLineToVariant.get(rl.saleLineId);
      if (!variantId) continue;
      const acc = porProducto.get(variantId);
      if (!acc) continue;
      acc.cantidad -= rl.cantidad;
      acc.ingreso -= Number(rl.total);
    }
  }
  const topProductos = [...porProducto.entries()]
    .map(([variantId, v]) => ({ variantId, nombre: v.nombre, cantidad: v.cantidad, ingreso: round2(v.ingreso) }))
    .sort((a, b) => b.ingreso - a.ingreso)
    .slice(0, 20);

  // Por cajero: ingreso BRUTO (sin netear devolución — quien procesa un
  // reembolso puede no ser quien hizo la venta original).
  const porCajeroMap = new Map<string, { nombre: string; ventas: number; ingreso: number }>();
  for (const v of ventas) {
    const acc = porCajeroMap.get(v.cajeroId) ?? { nombre: v.cajero.nombre, ventas: 0, ingreso: 0 };
    acc.ventas += 1;
    acc.ingreso += Number(v.total);
    porCajeroMap.set(v.cajeroId, acc);
  }
  const porCajero = [...porCajeroMap.entries()]
    .map(([cajeroId, v]) => ({ cajeroId, nombre: v.nombre, ventas: v.ventas, ingreso: round2(v.ingreso) }))
    .sort((a, b) => b.ingreso - a.ingreso);

  return {
    periodo,
    kpis: {
      ventasCompletadas: ventas.length,
      ventasCanceladas,
      ingresoNeto,
      ticketPromedio,
      ivaTotal,
      descuentosTotal,
    },
    tendenciaDiaria,
    cobrosPorMetodo,
    topProductos,
    porCajero,
  };
}
```

- [ ] **Step 3: Ejecutar y verificar que pasa** — `npm run test:integration -- src/lib/reports/ventas.itest.ts` → PASS.

### Step 4: `src/app/(app)/reportes/ventas/page.tsx`

Server page. `requirePermission('reportes.ver')` primera sentencia; `export const dynamic = 'force-dynamic'`; `searchParams: Promise<{ atajo?: string; desde?: string; hasta?: string }>`; `const sp = await props.searchParams; const periodo = resolvePeriod(sp); const r = await getSalesReport(periodo);`.

Contenido (español, Tailwind, sigue el estilo de `PanelCajaAbierta`/`CorteView` del Bloque 5 — tarjetas `rounded-lg border border-slate-200 bg-white p-5`):
- Encabezado: "Reporte de ventas" + `periodo.etiqueta`.
- `<PeriodFilterForm base="/reportes/ventas" atajo={sp.atajo} desde={sp.desde} hasta={sp.hasta} />`.
- Fila de 6 tarjetas con `r.kpis`: "Ventas completadas" (`ventasCompletadas`), "Canceladas" (`ventasCanceladas`, informativo), "Ingreso neto" (`money(ingresoNeto)`), "Ticket promedio" (`money(ticketPromedio)`), "IVA" (`money(ivaTotal)`), "Descuentos" (`money(descuentosTotal)`).
- Gráfica 1: `<LineChart data={r.tendenciaDiaria.map(d => ({ label: d.fecha, value: d.ingresoNeto }))} formatValue={money} />` bajo un `<h2>Tendencia de ingreso neto</h2>`.
- Gráfica 2: `<BarChart data={r.cobrosPorMetodo.map(c => ({ label: METODO_LABEL[c.metodo], value: c.monto }))} formatValue={money} />` bajo `<h2>Cobros por método de pago</h2>` (importa `METODO_LABEL` de `@/app/(app)/ventas/types`).
- Tabla "Top productos" (`r.topProductos`, cols Producto/Cantidad/Ingreso) — usa `<table>` simple o `<DataTable>` sin `rowHref` (no hay detalle al que navegar).
- Tabla "Por cajero" (`r.porCajero`, cols Cajero/Ventas/Ingreso).
- Tabla detalle "Por día" (`r.tendenciaDiaria`, cols Fecha (`fmtFechaMX` no aplica — es solo fecha, formatea `fecha` como está o con un helper simple `new Date(fecha + 'T12:00:00-06:00').toLocaleDateString('es-MX', {timeZone:'America/Mexico_City', day:'2-digit', month:'short', year:'numeric'})`)/Ventas/Ingreso bruto/Devoluciones/Ingreso neto/IVA).
- Link "Exportar CSV" → `/reportes/ventas/export?${new URLSearchParams(sp con solo las claves presentes)}`.

### Step 5: `src/app/(app)/reportes/ventas/export/route.ts` (+ `route.itest.ts`)

```ts
import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/context';
import { ForbiddenError } from '@/lib/errors';
import { resolvePeriod } from '@/lib/reports/period';
import { getSalesReport } from '@/lib/reports/ventas';

export const runtime = 'nodejs';

const esc = (v: string): string => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
const money = (n: number): string => n.toFixed(2);

const HEADER = 'Fecha,Ventas,Ingreso bruto,Devoluciones,Ingreso neto,IVA';

export async function GET(req: Request): Promise<NextResponse> {
  try {
    await requirePermission('reportes.ver');
  } catch (e) {
    if (e instanceof ForbiddenError) return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }

  const url = new URL(req.url);
  const periodo = resolvePeriod({
    atajo: url.searchParams.get('atajo') ?? undefined,
    desde: url.searchParams.get('desde') ?? undefined,
    hasta: url.searchParams.get('hasta') ?? undefined,
  });
  const r = await getSalesReport(periodo);

  const lines = r.tendenciaDiaria.map((d) =>
    [d.fecha, String(d.ventas), money(d.ingresoBruto), money(d.devoluciones), money(d.ingresoNeto), money(d.iva)]
      .map(esc)
      .join(','),
  );
  const csv = '﻿' + [HEADER, ...lines].join('\n') + '\n';
  const fecha = new Date().toISOString().slice(0, 10);
  return new NextResponse(csv, {
    status: 200,
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="reporte-ventas-${fecha}.csv"`,
    },
  });
}
```

`route.itest.ts` (`.itest.ts`, mock `next/headers` como `ventas/historial/export/route.itest.ts`): (a) sesión Empleado → 403; (b) sesión Cajero (tiene `reportes.ver`) + una venta sembrada vía `createSale` (con `conCajaAbierta` primero) → 200, `content-type` contiene `text/csv`, el cuerpo contiene la cabecera exacta y el monto esperado.

- [ ] **Step 6: Suite completa + commit**

Run: `npm run typecheck && npm run lint && npm run test:unit && npm run test:integration && npm run build`

```bash
git add src/lib/reports/ventas.ts src/lib/reports/ventas.itest.ts "src/app/(app)/reportes/ventas/"
git commit -m "feat(reportes): reporte de Ventas — servicio, pantalla y export CSV

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01EnFJHWm8zVoqgkmfwwcRHi"
```

---

## Task 6: Reporte de Inventario (servicio, pantalla y export)

**Files:**
- Create: `src/lib/reports/inventario.ts`, `src/lib/reports/inventario.itest.ts`
- Create: `src/app/(app)/reportes/inventario/page.tsx`
- Create: `src/app/(app)/reportes/inventario/export/route.ts`, `route.itest.ts`

**Interfaces:**
- Consumes: `ReportPeriod` (Task 2), `listStock` (`@/lib/inventory/query`), `recordMovement` (`@/lib/inventory/movements`, para sembrar en el itest — confirma el nombre exacto del export y su firma leyendo ese archivo), `BarChart` (Task 3), `PeriodFilterForm` (Task 4).
- Produces: `getInventoryReport(periodo: ReportPeriod): Promise<InventoryReport>`.

### Step 1: `src/lib/reports/inventario.itest.ts` (falla)

```ts
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { db } from '@/lib/db';
import { seedVariant } from '@/lib/sales/__testutil';
import { getInventoryReport } from './inventario';
import type { ReportPeriod } from './period';

const PERIODO_AMPLIO: ReportPeriod = {
  desde: new Date('2000-01-01T00:00:00Z'),
  hasta: new Date('2100-01-01T00:00:00Z'),
  etiqueta: 'test',
};

async function limpiar() {
  await db.inventoryMovement.deleteMany({ where: { motivo: { startsWith: 't6-reportes-inv' } } });
  await db.productVariant.deleteMany({ where: { producto: { nombre: { startsWith: 'T6ReportesInv' } } } });
}

beforeEach(limpiar);
afterAll(limpiar);

describe('getInventoryReport', () => {
  it('escenario compuesto: valorización, stock bajo, movimientos por tipo, top rotación', async () => {
    const { variantId } = await seedVariant({
      precioVenta: 100,
      stock: 5,
      nombreProducto: 'T6ReportesInv Uno',
      stock: 5,
    });
    // Ajusta stockMinimo para que quede en "bajo" tras el AJUSTE de abajo, y
    // registra movimientos ENTRADA/SALIDA/AJUSTE dentro del período.
    await db.productVariant.update({ where: { id: variantId }, data: { stockMinimo: 10, precioCompra: 60 } });
    await db.inventoryMovement.create({
      data: { variantId, tipo: 'ENTRADA', cantidad: 5, stockPrevio: 5, stockNuevo: 10, motivo: 't6-reportes-inv entrada' },
    });
    await db.productVariant.update({ where: { id: variantId }, data: { stock: 10 } });
    await db.inventoryMovement.create({
      data: { variantId, tipo: 'VENTA', cantidad: -3, stockPrevio: 10, stockNuevo: 7, motivo: 't6-reportes-inv venta' },
    });
    await db.productVariant.update({ where: { id: variantId }, data: { stock: 7 } });

    const r = await getInventoryReport(PERIODO_AMPLIO);

    expect(r.kpis.valorCosto).toBeGreaterThanOrEqual(round2(7 * 60));
    expect(r.kpis.movimientosPeriodo).toBeGreaterThanOrEqual(2);
    const entradaTipo = r.movimientosPorTipo.find((m) => m.tipo === 'ENTRADA');
    const ventaTipo = r.movimientosPorTipo.find((m) => m.tipo === 'VENTA');
    expect(entradaTipo?.cantidad).toBeGreaterThanOrEqual(1);
    expect(ventaTipo?.cantidad).toBeGreaterThanOrEqual(1);
    const rotVariante = r.topRotacion.find((t) => t.variantId === variantId);
    expect(rotVariante?.unidadesVendidas).toBeGreaterThanOrEqual(3);
  });

  it('período sin actividad devuelve ceros y arrays vacíos', async () => {
    const periodoVacio: ReportPeriod = {
      desde: new Date('1990-01-01T00:00:00Z'),
      hasta: new Date('1990-01-02T00:00:00Z'),
      etiqueta: 'test',
    };
    const r = await getInventoryReport(periodoVacio);
    expect(r.kpis.movimientosPeriodo).toBe(0);
    expect(r.movimientosPorTipo).toEqual([]);
    expect(r.topRotacion).toEqual([]);
    expect(r.detalle).toEqual([]);
  });
});

function round2(x: number): number {
  return Math.round(x * 100) / 100;
}
```

**Nota para el implementador:** el snippet de arriba escribe filas de `InventoryMovement` directamente con `db.inventoryMovement.create` en vez de pasar por `recordMovement` (Bloque 2) para evitar depender de su firma exacta y mantener el escenario simple y aislado — es una excepción deliberada solo para este itest de lectura. `valorCosto`/`stockBajo` usan `toBeGreaterThanOrEqual` en vez de igualdad exacta porque la tabla `ProductVariant` puede tener otras filas sembradas por suites paralelas (el itest NO controla el universo completo de variantes activas, solo garantiza que SU variante contribuye lo esperado); si al ejecutar la suite completa (`npm run test:integration`, sin aislar este archivo) esas aserciones de KPI agregado resultan demasiado flakeys por datos de otras suites, ajusta a comparar solo la contribución de `variantId` (ej. filtra `r.detalle` por `producto` en vez del KPI agregado) y dilo en el reporte.

### Step 2: Ejecutar (FAIL), escribir `src/lib/reports/inventario.ts`

```ts
import { db } from '@/lib/db';
import { listStock } from '@/lib/inventory/query';
import type { ReportPeriod } from './period';

const round2 = (x: number): number => Math.round(x * 100) / 100;

export type InventoryReport = {
  periodo: ReportPeriod;
  kpis: { valorCosto: number; valorVenta: number; stockBajo: number; movimientosPeriodo: number };
  movimientosPorTipo: { tipo: string; cantidad: number }[];
  topRotacion: { variantId: string; nombre: string; unidadesVendidas: number }[];
  detalle: { fecha: Date; producto: string; tipo: string; cantidad: number; usuario: string }[];
};

export async function getInventoryReport(periodo: ReportPeriod): Promise<InventoryReport> {
  const rango = { gte: periodo.desde, lte: periodo.hasta };

  const [variantes, bajo, agotado, movimientosPorTipoRaw, movimientos] = await Promise.all([
    db.productVariant.findMany({
      where: { archivada: false, product: { archivado: false } },
      select: { stock: true, precioCompra: true, precioVenta: true },
    }),
    listStock({ soloStockBajo: true, page: 1, pageSize: 1 }),
    listStock({ soloAgotados: true, page: 1, pageSize: 1 }),
    db.inventoryMovement.groupBy({ by: ['tipo'], where: { createdAt: rango }, _count: true }),
    db.inventoryMovement.findMany({
      where: { createdAt: rango },
      select: {
        variantId: true,
        createdAt: true,
        tipo: true,
        cantidad: true,
        variant: { select: { nombre: true, product: { select: { nombre: true } } } },
        actor: { select: { nombre: true } },
      },
      orderBy: { createdAt: 'desc' },
    }),
  ]);

  const valorCosto = round2(variantes.reduce((s, v) => s + v.stock * Number(v.precioCompra), 0));
  const valorVenta = round2(variantes.reduce((s, v) => s + v.stock * Number(v.precioVenta), 0));
  const stockBajo = bajo.total + agotado.total;

  const movimientosPorTipo = movimientosPorTipoRaw.map((m) => ({ tipo: m.tipo, cantidad: m._count }));

  const rotacion = new Map<string, { nombre: string; unidadesVendidas: number }>();
  for (const m of movimientos) {
    if (m.tipo !== 'VENTA') continue;
    const nombre = m.variant.nombre ? `${m.variant.product.nombre} (${m.variant.nombre})` : m.variant.product.nombre;
    const acc = rotacion.get(m.variantId) ?? { nombre, unidadesVendidas: 0 };
    acc.unidadesVendidas += Math.abs(m.cantidad);
    rotacion.set(m.variantId, acc);
  }
  const topRotacion = [...rotacion.entries()]
    .map(([variantId, v]) => ({ variantId, nombre: v.nombre, unidadesVendidas: v.unidadesVendidas }))
    .sort((a, b) => b.unidadesVendidas - a.unidadesVendidas)
    .slice(0, 10);

  const detalle = movimientos.map((m) => ({
    fecha: m.createdAt,
    producto: m.variant.nombre ? `${m.variant.product.nombre} (${m.variant.nombre})` : m.variant.product.nombre,
    tipo: m.tipo,
    cantidad: m.cantidad,
    usuario: m.actor?.nombre ?? 'Sistema',
  }));

  return {
    periodo,
    kpis: { valorCosto, valorVenta, stockBajo, movimientosPeriodo: movimientos.length },
    movimientosPorTipo,
    topRotacion,
    detalle,
  };
}
```

- [ ] **Step 3: Ejecutar y verificar que pasa** — `npm run test:integration -- src/lib/reports/inventario.itest.ts` → PASS.

### Step 4: `src/app/(app)/reportes/inventario/page.tsx`

Mismo esqueleto que `reportes/ventas/page.tsx` (Task 5 Step 4), permiso `reportes.ver`, `getInventoryReport`:
- Tarjetas: "Valor a costo" (`money(valorCosto)`), "Valor a venta" (`money(valorVenta)`), "Stock bajo/agotado" (`stockBajo`, con `<Link href="/inventario/stock-bajo">Ver detalle</Link>`), "Movimientos del período" (`movimientosPeriodo`).
- Gráfica 1: `<BarChart data={r.movimientosPorTipo.map(m => ({ label: m.tipo, value: m.cantidad }))} />` bajo `<h2>Movimientos por tipo</h2>`.
- Gráfica 2: `<BarChart orientacion="horizontal" data={r.topRotacion.map(t => ({ label: t.nombre, value: t.unidadesVendidas }))} />` bajo `<h2>Top rotación (unidades vendidas)</h2>`.
- Tabla detalle: `r.detalle` (cols Fecha (`fmtFechaMX`)/Producto/Tipo/Cantidad/Usuario).
- Link "Exportar CSV" → `/reportes/inventario/export?...`.

### Step 5: `src/app/(app)/reportes/inventario/export/route.ts` (+ `route.itest.ts`)

Mismo idioma que Task 5 Step 5. Cabecera CSV: `Fecha,Producto,Tipo,Cantidad,Usuario`. Una fila por elemento de `r.detalle` (fecha vía `fmtFechaMX` — importa de `@/app/(app)/ventas/types`). `route.itest.ts`: 403 sin `reportes.ver`; 200 con un movimiento sembrado (vía `db.inventoryMovement.create` como en el itest de servicio) → cuerpo contiene la cabecera y el producto.

- [ ] **Step 6: Suite completa + commit**

Run: `npm run typecheck && npm run lint && npm run test:unit && npm run test:integration && npm run build`

```bash
git add src/lib/reports/inventario.ts src/lib/reports/inventario.itest.ts "src/app/(app)/reportes/inventario/"
git commit -m "feat(reportes): reporte de Inventario — servicio, pantalla y export CSV

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01EnFJHWm8zVoqgkmfwwcRHi"
```

---

## Task 7: Reporte de Utilidad/Margen (servicio, pantalla y export)

**Files:**
- Create: `src/lib/reports/margen.ts`, `src/lib/reports/margen.itest.ts`
- Create: `src/app/(app)/reportes/margen/page.tsx`
- Create: `src/app/(app)/reportes/margen/export/route.ts`, `route.itest.ts`

**Interfaces:**
- Consumes: `ReportPeriod` (Task 2), `BarChart` (Task 3), `PeriodFilterForm` (Task 4), `conCajaAbierta`/`seedCajero`/`seedVariant`/`cleanupSales` (`@/lib/sales/__testutil`), `createSale` (`@/lib/sales/sales`), `createReturn` (`@/lib/sales/returns`).
- Produces: `getMarginReport(periodo: ReportPeriod): Promise<MarginReport>`.

### Step 1: `src/lib/reports/margen.itest.ts` (falla)

```ts
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { db } from '@/lib/db';
import { createSale } from '@/lib/sales/sales';
import { createReturn } from '@/lib/sales/returns';
import { seedCajero, seedVariant, cleanupSales, conCajaAbierta } from '@/lib/sales/__testutil';
import { getMarginReport } from './margen';
import type { ReportPeriod } from './period';

const CAJERO_EMAIL = 't7-reportes-margen@pos.com';
const EMAILS = [CAJERO_EMAIL];

const PERIODO_AMPLIO: ReportPeriod = {
  desde: new Date('2000-01-01T00:00:00Z'),
  hasta: new Date('2100-01-01T00:00:00Z'),
  etiqueta: 'test',
};

let CAJERO: string;

beforeEach(async () => {
  await cleanupSales(EMAILS);
  CAJERO = await seedCajero(CAJERO_EMAIL);
  await conCajaAbierta(CAJERO);
});

afterAll(async () => {
  await cleanupSales(EMAILS);
});

describe('getMarginReport', () => {
  it('escenario compuesto: utilidad neta de devolución, costo actual, % margen', async () => {
    // precioVenta 100 (neto), precioCompra 60 → margen unitario neto 40 (100−60), IVA no entra en el costo.
    const { variantId } = await seedVariant({ precioVenta: 100, stock: 20, tasa: 'default' });
    await db.productVariant.update({ where: { id: variantId }, data: { precioCompra: 60 } });

    // Venta de 3 uds: ingreso neto de línea = 3×100=300 (base, sin IVA); costo = 3×60=180; utilidad bruta 120.
    const venta = await createSale(
      CAJERO,
      { customerId: null, lineas: [{ variantId, cantidad: 3 }], descuentoTicket: null, pagos: [{ metodo: 'EFECTIVO', monto: 348 }], requiereFactura: false },
      null,
    );
    const saleLineId = (await db.sale.findUniqueOrThrow({ where: { id: venta.id }, include: { lines: true } })).lines[0].id;
    // Devuelve 1 de las 3 uds: resta 1×100=100 de ingreso y 1×60=60 de costo (unidadesNetas=2, ingresoNeto=200, costo=120, utilidad=80).
    await createReturn(
      CAJERO,
      { saleId: venta.id, lineas: [{ saleLineId, cantidad: 1 }], metodoReembolso: 'EFECTIVO', motivo: 'Prueba de reporte' },
      null,
    );

    const r = await getMarginReport(PERIODO_AMPLIO);

    const linea = r.detalle.find((d) => d.variantId === variantId);
    expect(linea).toMatchObject({ unidades: 2, ingreso: 200, costo: 120, utilidad: 80, margenPct: 40 });
    expect(r.kpis.utilidadTotal).toBeGreaterThanOrEqual(80);
    expect(r.kpis.productoMasRentable).toBe(linea?.nombre);
  });

  it('período sin actividad devuelve ceros y arrays vacíos', async () => {
    const periodoVacio: ReportPeriod = {
      desde: new Date('1990-01-01T00:00:00Z'),
      hasta: new Date('1990-01-02T00:00:00Z'),
      etiqueta: 'test',
    };
    const r = await getMarginReport(periodoVacio);
    expect(r.kpis).toMatchObject({ utilidadTotal: 0, margenPromedio: 0, productoMasRentable: null });
    expect(r.detalle).toEqual([]);
    expect(r.topUtilidad).toEqual([]);
  });
});
```

**Nota:** el "ingreso" de este reporte usa `SaleLine.baseNeta`/`ReturnLine.baseNeta` (la base SIN IVA), no `.total` (que sí incluye IVA — verificado en `src/lib/sales/compute.ts:125`: `total = baseNeta + impuesto`). El costo (`unidades × precioCompra`) tampoco lleva IVA, así que restar `costo` de un `ingreso` que incluyera IVA infería una utilidad artificialmente mayor (contaría el IVA cobrado, que no es ganancia, como si lo fuera). Ver el servicio del Step 2, que ya usa `baseNeta` en todo el cálculo — las aserciones de arriba (`ingreso: 200`, `utilidad: 80`, `margenPct: 40`) son correctas con esa base: 3 uds × 100 base = 300, devuelta 1 ud (100 base) → 200 neto; costo 2×60=120; utilidad 80; margen 80/200×100=40%.

### Step 2: Ejecutar (FAIL), escribir `src/lib/reports/margen.ts`

```ts
import { db } from '@/lib/db';
import type { ReportPeriod } from './period';

const round2 = (x: number): number => Math.round(x * 100) / 100;

export type MarginRow = {
  variantId: string;
  nombre: string;
  unidades: number;
  ingreso: number;
  costo: number;
  utilidad: number;
  margenPct: number;
};

export type MarginReport = {
  periodo: ReportPeriod;
  kpis: { utilidadTotal: number; margenPromedio: number; productoMasRentable: string | null };
  topUtilidad: { variantId: string; nombre: string; utilidad: number }[];
  detalle: MarginRow[];
};

export async function getMarginReport(periodo: ReportPeriod): Promise<MarginReport> {
  const rango = { gte: periodo.desde, lte: periodo.hasta };

  const ventas = await db.sale.findMany({
    where: { estado: 'COMPLETADA', createdAt: rango },
    select: {
      lines: {
        select: {
          id: true,
          variantId: true,
          productoNombre: true,
          varianteNombre: true,
          cantidad: true,
          baseNeta: true, // SIN IVA — nunca `total` (que sí incluye IVA); el costo tampoco lo lleva.
          variant: { select: { precioCompra: true } },
        },
      },
    },
  });
  const saleLineIds = ventas.flatMap((v) => v.lines.map((l) => l.id));

  const returnLines =
    saleLineIds.length > 0
      ? await db.returnLine.findMany({
          where: { saleLineId: { in: saleLineIds }, return: { createdAt: rango } },
          select: { saleLineId: true, cantidad: true, baseNeta: true },
        })
      : [];
  const devueltoPorLinea = new Map<string, { cantidad: number; baseNeta: number }>();
  for (const rl of returnLines) {
    const acc = devueltoPorLinea.get(rl.saleLineId) ?? { cantidad: 0, baseNeta: 0 };
    acc.cantidad += rl.cantidad;
    acc.baseNeta += Number(rl.baseNeta);
    devueltoPorLinea.set(rl.saleLineId, acc);
  }

  const porVariante = new Map<string, { nombre: string; unidades: number; ingreso: number; precioCompra: number }>();
  for (const v of ventas) {
    for (const l of v.lines) {
      const dev = devueltoPorLinea.get(l.id) ?? { cantidad: 0, baseNeta: 0 };
      const unidadesNetas = l.cantidad - dev.cantidad;
      const ingresoNeto = Number(l.baseNeta) - dev.baseNeta;
      const acc = porVariante.get(l.variantId) ?? {
        nombre: l.varianteNombre ? `${l.productoNombre} (${l.varianteNombre})` : l.productoNombre,
        unidades: 0,
        ingreso: 0,
        precioCompra: Number(l.variant.precioCompra),
      };
      acc.unidades += unidadesNetas;
      acc.ingreso += ingresoNeto;
      porVariante.set(l.variantId, acc);
    }
  }

  const detalle: MarginRow[] = [...porVariante.entries()]
    .map(([variantId, v]) => {
      const ingreso = round2(v.ingreso);
      const costo = round2(v.unidades * v.precioCompra);
      const utilidad = round2(ingreso - costo);
      const margenPct = ingreso > 0 ? round2((utilidad / ingreso) * 100) : 0;
      return { variantId, nombre: v.nombre, unidades: v.unidades, ingreso, costo, utilidad, margenPct };
    })
    .sort((a, b) => b.utilidad - a.utilidad);

  const utilidadTotal = round2(detalle.reduce((s, d) => s + d.utilidad, 0));
  const ingresoNetoTotal = round2(detalle.reduce((s, d) => s + d.ingreso, 0));
  const margenPromedio = ingresoNetoTotal > 0 ? round2((utilidadTotal / ingresoNetoTotal) * 100) : 0;
  const topUtilidad = detalle
    .slice(0, 10)
    .map((d) => ({ variantId: d.variantId, nombre: d.nombre, utilidad: d.utilidad }));
  const productoMasRentable = topUtilidad[0]?.nombre ?? null;

  return {
    periodo,
    kpis: { utilidadTotal, margenPromedio, productoMasRentable },
    topUtilidad,
    detalle,
  };
}
```

- [ ] **Step 3: Ejecutar y verificar que pasa** — `npm run test:integration -- src/lib/reports/margen.itest.ts` → PASS.

### Step 4: `src/app/(app)/reportes/margen/page.tsx`

`requirePermission('reportes.margen')` (NO `'reportes.ver'` — este reporte usa la clave restringida) primera sentencia. Resto igual al esqueleto de Task 5:
- Nota fija visible: *"El margen usa el costo actual de cada producto (precioCompra); si el costo cambió después de la venta, el margen histórico es una aproximación."* Añade una segunda línea: *"El ingreso mostrado aquí no incluye IVA (a diferencia del reporte de Ventas), para poder compararlo directamente con el costo."*
- Tarjetas: "Utilidad total" (`money(utilidadTotal)`), "Margen promedio" (`margenPromedio`%), "Producto más rentable" (`productoMasRentable ?? '—'`).
- Gráfica: `<BarChart orientacion="horizontal" data={r.topUtilidad.map(t => ({ label: t.nombre, value: t.utilidad }))} formatValue={money} />` bajo `<h2>Top utilidad por producto</h2>`.
- Tabla detalle: `r.detalle` (cols Producto/Unidades/Ingreso/Costo/Utilidad/% Margen), ordenable por utilidad (ya viene ordenada desc del servicio).
- Link "Exportar CSV" → `/reportes/margen/export?...`.

### Step 5: `src/app/(app)/reportes/margen/export/route.ts` (+ `route.itest.ts`)

Gate con `requirePermission('reportes.margen')`. Mismo idioma que Task 5 Step 5. Cabecera CSV: `Producto,Unidades,Ingreso,Costo,Utilidad,% Margen`. Una fila por elemento de `r.detalle`. `route.itest.ts`: 403 con una sesión que tiene `reportes.ver` pero NO `reportes.margen` (Cajero) — confirma que el 403 dispara incluso con permiso parcial de Reportes; 200 con Gerente y una venta+costo sembrados → cuerpo contiene la cabecera y la utilidad esperada.

- [ ] **Step 6: Suite completa + commit**

Run: `npm run typecheck && npm run lint && npm run test:unit && npm run test:integration && npm run build`

```bash
git add src/lib/reports/margen.ts src/lib/reports/margen.itest.ts "src/app/(app)/reportes/margen/"
git commit -m "feat(reportes): reporte de Utilidad/Margen — servicio, pantalla y export CSV

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01EnFJHWm8zVoqgkmfwwcRHi"
```

---

## Task 8: Reporte de Clientes (servicio, pantalla y export)

**Files:**
- Create: `src/lib/reports/clientes.ts`, `src/lib/reports/clientes.itest.ts`
- Create: `src/app/(app)/reportes/clientes/page.tsx`
- Create: `src/app/(app)/reportes/clientes/export/route.ts`, `route.itest.ts`

**Interfaces:**
- Consumes: `ReportPeriod` (Task 2), `BarChart` (Task 3), `PeriodFilterForm` (Task 4), `conCajaAbierta`/`seedCajero`/`seedVariant`/`cleanupSales` (`@/lib/sales/__testutil`), `createSale` (`@/lib/sales/sales`), `createReturn` (`@/lib/sales/returns`).
- Produces: `getCustomersReport(periodo: ReportPeriod): Promise<CustomersReport>`.

### Step 1: `src/lib/reports/clientes.itest.ts` (falla)

```ts
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { db } from '@/lib/db';
import { createSale } from '@/lib/sales/sales';
import { createReturn } from '@/lib/sales/returns';
import { seedCajero, seedVariant, cleanupSales, conCajaAbierta } from '@/lib/sales/__testutil';
import { getCustomersReport } from './clientes';
import type { ReportPeriod } from './period';

const CAJERO_EMAIL = 't8-reportes-clientes@pos.com';
const EMAILS = [CAJERO_EMAIL];

const PERIODO_AMPLIO: ReportPeriod = {
  desde: new Date('2000-01-01T00:00:00Z'),
  hasta: new Date('2100-01-01T00:00:00Z'),
  etiqueta: 'test',
};

let CAJERO: string;

async function limpiarClientes() {
  await db.customer.deleteMany({ where: { nombre: { startsWith: 'T8ReportesCliente' } } });
}

beforeEach(async () => {
  await cleanupSales(EMAILS);
  await limpiarClientes();
  CAJERO = await seedCajero(CAJERO_EMAIL);
  await conCajaAbierta(CAJERO);
});

afterAll(async () => {
  await cleanupSales(EMAILS);
  await limpiarClientes();
});

describe('getCustomersReport', () => {
  it('escenario compuesto: monto neto por cliente, genérico excluido y reportado aparte, cliente nuevo', async () => {
    const cliente = await db.customer.create({ data: { nombre: 'T8ReportesCliente Ana' } });
    const generico = await db.customer.findFirstOrThrow({ where: { esGenerico: true } });
    const { variantId } = await seedVariant({ precioVenta: 100, stock: 20 });

    // Ana compra 2 uds (232.00), luego devuelve la venta completa (232.00) → montoNeto 0, sigue contando como "activa" (tuvo una compra).
    const ventaAna = await createSale(
      CAJERO,
      { customerId: cliente.id, lineas: [{ variantId, cantidad: 2 }], descuentoTicket: null, pagos: [{ metodo: 'EFECTIVO', monto: 232 }], requiereFactura: false },
      null,
    );
    const lineaAna = (await db.sale.findUniqueOrThrow({ where: { id: ventaAna.id }, include: { lines: true } })).lines[0];
    await createReturn(
      CAJERO,
      { saleId: ventaAna.id, lineas: [{ saleLineId: lineaAna.id, cantidad: 2 }], metodoReembolso: 'EFECTIVO', motivo: 'Prueba de reporte' },
      null,
    );
    // Ana compra de nuevo, 1 ud (116.00) sin devolver.
    await createSale(
      CAJERO,
      { customerId: cliente.id, lineas: [{ variantId, cantidad: 1 }], descuentoTicket: null, pagos: [{ metodo: 'EFECTIVO', monto: 116 }], requiereFactura: false },
      null,
    );
    // Venta al cliente genérico (Público en general): 1 ud (116.00).
    await createSale(
      CAJERO,
      { customerId: generico.id, lineas: [{ variantId, cantidad: 1 }], descuentoTicket: null, pagos: [{ metodo: 'EFECTIVO', monto: 116 }], requiereFactura: false },
      null,
    );

    const r = await getCustomersReport(PERIODO_AMPLIO);

    const filaAna = r.detalle.find((c) => c.customerId === cliente.id);
    // montoNeto: (232−232) + 116 = 116; compras: 2; ticketPromedio 116/2=58.
    // ticketPromedio de la fila es BRUTO (spec §8): (232+116)/2 = 174 — no confundir con montoNeto.
    expect(filaAna).toMatchObject({ compras: 2, montoNeto: 116, ticketPromedio: 174 });
    expect(r.detalle.some((c) => c.customerId === generico.id)).toBe(false); // genérico excluido
    expect(r.genericoResumen).toMatchObject({ ventas: 1, monto: 116 });
    expect(r.kpis.clientesActivos).toBeGreaterThanOrEqual(1);
    expect(r.kpis.clientesNuevos).toBeGreaterThanOrEqual(1); // Ana se creó "ahora", cae en el período amplio
  });

  it('un cliente nuevo fuera del período no cuenta en clientesNuevos', async () => {
    const cliente = await db.customer.create({ data: { nombre: 'T8ReportesCliente Vieja' } });
    await db.customer.update({ where: { id: cliente.id }, data: { createdAt: new Date('1990-01-01T00:00:00Z') } });

    const periodoActual: ReportPeriod = { desde: new Date(Date.now() - 3600_000), hasta: new Date(Date.now() + 3600_000), etiqueta: 'test' };
    const r = await getCustomersReport(periodoActual);
    expect(r.kpis.clientesNuevos).toBe(0);
  });

  it('período sin actividad devuelve ceros y arrays vacíos', async () => {
    const periodoVacio: ReportPeriod = {
      desde: new Date('1990-01-01T00:00:00Z'),
      hasta: new Date('1990-01-02T00:00:00Z'),
      etiqueta: 'test',
    };
    const r = await getCustomersReport(periodoVacio);
    expect(r.kpis).toMatchObject({ clientesActivos: 0, clientesNuevos: 0, ticketPromedio: 0 });
    expect(r.detalle).toEqual([]);
    expect(r.topClientes).toEqual([]);
    expect(r.genericoResumen).toMatchObject({ ventas: 0, monto: 0 });
  });
});
```

### Step 2: Ejecutar (FAIL), escribir `src/lib/reports/clientes.ts`

```ts
import { db } from '@/lib/db';
import type { ReportPeriod } from './period';

const round2 = (x: number): number => Math.round(x * 100) / 100;

export type CustomerRow = {
  customerId: string;
  nombre: string;
  compras: number;
  montoNeto: number;
  ticketPromedio: number;
  ultimaCompra: Date;
};

export type CustomersReport = {
  periodo: ReportPeriod;
  kpis: { clientesActivos: number; clientesNuevos: number; ticketPromedio: number };
  genericoResumen: { ventas: number; monto: number };
  topClientes: CustomerRow[];
  detalle: CustomerRow[];
};

export async function getCustomersReport(periodo: ReportPeriod): Promise<CustomersReport> {
  const rango = { gte: periodo.desde, lte: periodo.hasta };

  const [ventas, devolucionesPorVenta, clientesNuevos] = await Promise.all([
    db.sale.findMany({
      where: { estado: 'COMPLETADA', createdAt: rango },
      select: {
        id: true,
        total: true,
        createdAt: true,
        customerId: true,
        customer: { select: { nombre: true, esGenerico: true } },
      },
    }),
    db.return.groupBy({ by: ['saleId'], where: { createdAt: rango }, _sum: { total: true } }),
    db.customer.count({ where: { esGenerico: false, createdAt: rango } }),
  ]);

  const devueltoPorVenta = new Map(devolucionesPorVenta.map((d) => [d.saleId, Number(d._sum.total ?? 0)]));

  const porCliente = new Map<string, { nombre: string; compras: number; montoNeto: number; montoBruto: number; ultimaCompra: Date }>();
  let ventasGenerico = 0;
  let montoGenerico = 0;
  for (const v of ventas) {
    const neto = Number(v.total) - (devueltoPorVenta.get(v.id) ?? 0);
    if (v.customer.esGenerico) {
      ventasGenerico += 1;
      montoGenerico += Number(v.total);
      continue;
    }
    const acc = porCliente.get(v.customerId) ?? {
      nombre: v.customer.nombre,
      compras: 0,
      montoNeto: 0,
      montoBruto: 0,
      ultimaCompra: v.createdAt,
    };
    acc.compras += 1;
    acc.montoNeto += neto;
    acc.montoBruto += Number(v.total); // ticketPromedio de esta fila es BRUTO (spec §8) — no netear aquí.
    if (v.createdAt > acc.ultimaCompra) acc.ultimaCompra = v.createdAt;
    porCliente.set(v.customerId, acc);
  }

  const detalle: CustomerRow[] = [...porCliente.entries()]
    .map(([customerId, c]) => ({
      customerId,
      nombre: c.nombre,
      compras: c.compras,
      montoNeto: round2(c.montoNeto),
      ticketPromedio: c.compras > 0 ? round2(c.montoBruto / c.compras) : 0,
      ultimaCompra: c.ultimaCompra,
    }))
    .sort((a, b) => b.montoNeto - a.montoNeto);

  const topClientes = detalle.slice(0, 10);
  const clientesActivos = detalle.length;
  const ticketPromedio =
    clientesActivos > 0 ? round2(detalle.reduce((s, c) => s + c.montoNeto, 0) / clientesActivos) : 0;

  return {
    periodo,
    kpis: { clientesActivos, clientesNuevos, ticketPromedio },
    genericoResumen: { ventas: ventasGenerico, monto: round2(montoGenerico) },
    topClientes,
    detalle,
  };
}
```

- [ ] **Step 3: Ejecutar y verificar que pasa** — `npm run test:integration -- src/lib/reports/clientes.itest.ts` → PASS.

### Step 4: `src/app/(app)/reportes/clientes/page.tsx`

Mismo esqueleto que Task 5 Step 4, permiso `reportes.ver`, `getCustomersReport`:
- Tarjetas: "Clientes activos" (`clientesActivos`), "Clientes nuevos" (`clientesNuevos`), "Ticket promedio" (`money(ticketPromedio)`).
- Aviso informativo: "Ventas sin cliente identificado: {genericoResumen.ventas} ({money(genericoResumen.monto)})".
- Gráfica: `<BarChart orientacion="horizontal" data={r.topClientes.map(c => ({ label: c.nombre, value: c.montoNeto }))} formatValue={money} />` bajo `<h2>Top clientes</h2>`.
- Tabla detalle: `r.detalle` (cols Cliente/Compras/Monto neto/Ticket promedio/Última compra (`fmtFechaMX`)).
- Link "Exportar CSV" → `/reportes/clientes/export?...`.

### Step 5: `src/app/(app)/reportes/clientes/export/route.ts` (+ `route.itest.ts`)

Mismo idioma que Task 5 Step 5. Cabecera CSV: `Cliente,Compras,Monto neto,Ticket promedio,Última compra`. Una fila por elemento de `r.detalle` (fecha vía `fmtFechaMX`). `route.itest.ts`: 403 sin `reportes.ver`; 200 con un cliente+venta sembrados → cuerpo contiene la cabecera y el nombre del cliente, NO contiene "Público en general".

- [ ] **Step 6: Suite completa + commit**

Run: `npm run typecheck && npm run lint && npm run test:unit && npm run test:integration && npm run build`

```bash
git add src/lib/reports/clientes.ts src/lib/reports/clientes.itest.ts "src/app/(app)/reportes/clientes/"
git commit -m "feat(reportes): reporte de Clientes — servicio, pantalla y export CSV

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01EnFJHWm8zVoqgkmfwwcRHi"
```

---

## Task 9: E2E (`e2e/reportes.spec.ts`)

**Files:**
- Create: `e2e/reportes.spec.ts`

**Interfaces:**
- Consumes: helpers de `e2e/helpers.ts` (`doSetup`, `login`, `abrirCaja`); referencia `e2e/ventas.spec.ts`/`e2e/caja.spec.ts` (login por rol, alta de productos por UI, helpers locales `sufijo`/`codigoBarras`/`crearProductoSimple`/`crearUsuario`/`entrarComo`).

- [ ] **Step 1: `e2e/reportes.spec.ts`** — duplica localmente los helpers pequeños que necesite (mismo patrón ya usado en `e2e/caja.spec.ts`, que ya duplica los suyos en vez de exportarlos de `helpers.ts`). Cada `test()` autónomo, `test.setTimeout(180_000)`, `try { ... } finally { await ctx.close(); }`, datos únicos por corrida.

Escenarios (aserciones reales, no solo "no truena"):

1. **Ventas/Inventario/Clientes visibles para Cajero, Margen no:** login Cajero → `/reportes` → aparecen las tarjetas "Ventas", "Inventario", "Clientes"; NO aparece "Utilidad / margen". Ir a `/reportes/margen` directo por URL → la página no muestra el contenido del reporte (gate de `requirePermission('reportes.margen')` — verificar que no aparece el encabezado "Reporte de utilidad", no que haya un mensaje de error específico, ya que `requirePermission` puede redirigir o lanzar según cómo el layout capture `ForbiddenError`; confirma el comportamiento real del layout de `(app)` para errores de permiso antes de escribir la aserción exacta).
2. **Empleado no ve "Reportes" en la navegación:** login con un usuario Empleado (créalo desde Administrador con `crearUsuario`) → el link "Reportes" no aparece en la barra lateral.
3. **Reporte de Ventas con datos reales:** login Administrador (o Gerente) → abrir caja → vender 2 unidades de un producto sembrado por UI → ir a `/reportes/ventas` con atajo "Hoy" → la tarjeta "Ventas completadas" muestra al menos 1, la tabla "Por día" contiene el ingreso esperado.
4. **Exportar CSV de Ventas:** desde `/reportes/ventas`, el link "Exportar CSV" apunta a `/reportes/ventas/export` con los parámetros de período actuales (verifica el `href`, no descargues el archivo — Playwright headless puede verificar la respuesta del link con una petición HTTP directa usando `request.get(url, { headers: cookies })` si se prefiere una aserción más fuerte que solo el `href`).
5. **Reporte de Margen para Gerente:** login Gerente → `/reportes/margen` → aparece la nota de aproximación de costo y la tabla detalle (puede estar vacía si no hay ventas en el período por defecto — sembrar una venta primero, como en el escenario 3, para que haya al menos una fila).

- [ ] **Step 2: Ejecutar** — `npm run test:e2e -- reportes` → todos verdes.

- [ ] **Step 3: Commit**

```bash
git add e2e/reportes.spec.ts
git commit -m "test(reportes): E2E de permisos, navegación y contenido de los 4 reportes

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01EnFJHWm8zVoqgkmfwwcRHi"
```

---

## Verificación final del bloque (tras la revisión de rama completa)

- [ ] `npm run typecheck` → 0 · `npm run lint` → 0 · `npm run test:unit` → verde · `npm run test:integration` → verde y **estable en 3 corridas** · `npm run build` → OK · `npm run test` → verde · `npm run test:e2e` → verde.
- [ ] Revisión de seguridad e integridad: (a) toda página de Reportes empieza con `requirePermission('reportes.ver')` o `'reportes.margen'` según corresponda, y `margen/page.tsx`/`margen/export/route.ts` usan específicamente `'reportes.margen'` (no `'reportes.ver'`); (b) ninguna venta `CANCELADA` aparece en las cifras de Ventas/Margen/Clientes (grep de `estado: 'CANCELADA'` en los 4 servicios — debe aparecer solo en `ventas.ts` para el conteo informativo); (c) el cliente genérico (`esGenerico: true`) nunca aparece en `topClientes`/`detalle` de Clientes; (d) sin `console.*`, sin `any`, sin `new PrismaClient()`; (e) sin migración (`git diff master -- prisma/` vacío o solo el `seed.ts` si Task 1 tocó algo ahí — no debería); (f) `period.test.ts` corre en el proyecto `unit` (sin BD) — confirma que no se coló un import transitivo de `@/lib/db`.
- [ ] `docs/superpowers/decisions-bloque6.md` si el bloque tomó decisiones no evidentes (opcional).

---

## Global Self-Review (autor del plan)

**Cobertura del spec:** Permisos/nav (§3) → Task 1. Período (§4) → Task 2. Gráficas (§4) → Task 3. Selector compartido + aterrizaje (§4) → Task 4. Ventas (§5) → Task 5. Inventario (§6) → Task 6. Margen (§7) → Task 7. Clientes (§8) → Task 8. Testing (§9) → repartido en cada task + Task 9 (E2E). Sin migración (fuera de alcance §10 no aplica aquí, es la ausencia esperada).

**Consistencia de tipos:** `ReportPeriod` (Task 2) es el mismo tipo consumido literalmente por las 4 funciones de reporte (Tasks 5-8) y por los 4 `export/route.ts` vía `resolvePeriod`. `ChartDatum` (Task 3) es el tipo que las 4 páginas construyen inline al pasar `data` a `BarChart`/`LineChart` — no se declara un tipo compartido más allá de ese, evitando un import cruzado innecesario entre páginas. `CustomerRow` se declara una sola vez en `clientes.ts` (Task 8) y la usan tanto `topClientes` como `detalle`.

**Excepción de reutilización documentada:** `period.ts` NO importa `parseDateParam` de `@/lib/activity/query` (arrastraría `@/lib/db`); ver Global Constraints. Es la única duplicación deliberada del plan.

**Riesgo señalado:** las Tasks 5-8 son las más densas (agregaciones con neteo de devoluciones, bucketing por día MX, JOIN en memoria entre `SaleLine`/`ReturnLine`) — cada una da el código casi completo del servicio para minimizar ambigüedad, siguiendo el mismo nivel de detalle que `computeExpectedCash`/`closeCashSession` del Bloque 5.

**Verificaciones hechas al escribir este plan (no quedan pendientes para el implementador):** (1) se releyó `src/lib/sales/compute.ts:125` — `SaleLine.total`/`ReturnLine.total` SÍ incluyen IVA (`total = baseNeta + impuesto`); el reporte de Margen usa `baseNeta` (sin IVA) para poder restar el costo (que tampoco lleva IVA) sin inflar la utilidad con el impuesto cobrado — el servicio del Task 7 ya está escrito con `baseNeta`, no `total`. El reporte de Ventas sí usa `Sale.total`/`Payment.monto` (con IVA), a propósito: ahí "ingreso" representa el efectivo/cobro real, mismo criterio que ya usa el arqueo de Caja del Bloque 5. (2) se releyó `src/lib/sales/returns.ts:15-19` y `src/lib/validation/return.ts:3-11` — la firma de `createReturn` usada en los itests de las Tasks 5, 7 y 8 es exacta.
