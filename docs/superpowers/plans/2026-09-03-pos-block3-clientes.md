# POS Bloque 3 (Clientes) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Núcleo de Clientes sobre los Bloques 1 y 2: entidad `Customer` con datos fiscales CFDI 4.0 anulables, CRUD con archivado lógico, búsqueda reutilizable, cliente sembrado "Público en General", permisos granulares, auditoría con RFC enmascarado y export CSV.

**Architecture:** Mismo proyecto Next.js (App Router, gate `src/proxy.ts`). `Customer` es una tabla nueva con columnas fiscales anulables (Opción A del spec); `facturable` es **derivado**, nunca almacenado. Los catálogos SAT (`c_RegimenFiscal`, `c_UsoCFDI`) son constantes tipadas en `src/lib/sat/`, no tablas. `src/lib/customers/customers.ts` concentra el CRUD; `src/lib/customers/search.ts` la búsqueda que el Bloque 4 reutilizará; `src/lib/customers/fiscal.ts` helpers puros de RFC. Los servicios se consumen desde Server Actions con `requirePermission` como primera sentencia y auditoría dentro de la misma transacción que la mutación. El RFC se enmascara en `activity_log` y se exporta completo solo en el CSV bajo `clientes.ver`.

**Tech Stack:** Next.js 16.3.4, React 19.2, TypeScript strict, PostgreSQL + Prisma 7 + `@prisma/adapter-pg`, Zod 4, Tailwind v4, Vitest 4 (`*.test.ts` unit / `*.itest.ts` integración con Postgres efímero), Playwright.

**Spec:** `docs/superpowers/specs/2026-09-03-pos-block3-clientes-design.md`

## Global Constraints

- **Base ya construida (Bloques 1 y 2, en `master`):** reutiliza sin reescribir — `requirePermission`/`requireUser`/`getCurrentUser` (`@/lib/auth/context`), `PERMISSIONS`/`can`/`ALL_PERMISSION_KEYS`/`PermissionKey` (`@/lib/auth/rbac`), `logActivity`/`actionLabel`/`KNOWN_ACTIONS`/`AuditAction` (`@/lib/audit`), `parseDateParam` (`@/lib/activity/query`), `type FormState` (`@/app/(auth)/setup/actions`), `AppError`/`ValidationError`/`ForbiddenError` (`@/lib/errors`), `db` (`@/lib/db`), `getClientIp` (`@/lib/http`), `DataTable`/`Column`/`Pagination`/`PermissionGate`/`forms/Field` (`@/components/*`), `visibleNav`/`NAV_ITEMS` (`@/lib/nav`).
- **Prisma:** un solo cliente, `import { db } from '@/lib/db'` — NUNCA `new PrismaClient()` (excepción: `prisma/seed.ts`, que ya lo instancia). `Prisma.PrismaClientKnownRequestError` con `.code === 'P2002'` para únicos; el campo se deduce de `e.meta.target`. `Prisma.TransactionClient` para funciones que aceptan `tx`.
- **Migración:** puramente ADITIVA. **Una** tabla nueva (`Customer`). Cero enums nuevos. Ninguna columna/tabla/relación existente se altera ni se borra. Nombre: `npx prisma migrate dev --name bloque3_clientes`. Requiere la BD de desarrollo levantada: `npm run db:start` (foreground, arráncalo con `run_in_background`; PG en `localhost:54329`, db `pos_dev`).
- **`facturable` es derivado, no una columna.** Regla: los 5 campos fiscales núcleo (`rfc`, `razonSocial`, `regimenFiscalCode`, `usoCfdiCode`, `cpFiscal`) presentes ⇒ `true`. `correoFacturacion` NO cuenta para `facturable`.
- **Bloque fiscal "todo o nada":** si CUALQUIER campo núcleo trae valor, TODOS los núcleo son obligatorios y válidos; si todos vacíos ⇒ cliente no facturable, válido.
- **RFC:** normalizado a mayúsculas sin espacios ni guiones antes de validar/guardar. Formato: persona moral `^[A-ZÑ&]{3}\d{6}[A-Z0-9]{3}$` (12 chars), persona física `^[A-ZÑ&]{4}\d{6}[A-Z0-9]{3}$` (13 chars). RFC genérico (`XAXX010101000` / `XEXX010101000`) **rechazado** en alta/edición manual. `regimenFiscalCode` debe ser compatible con el tipo derivado del RFC (12→moral, 13→física).
- **Cliente genérico ("Público en General"):** `esGenerico: true`, RFC `XAXX010101000`, `archivado: false`. NO archivable. Solo `notas`/`direccion`/`correo`/`telefono` editables; `nombre` y todo el bloque fiscal fijos (servicio + UI).
- **Ciclo de vida:** sin borrado físico. `Customer.archivado` (soft-delete), restaurable.
- **Permisos nuevos** (grupo `clientes` en `PERMISSIONS`): `clientes.ver`, `clientes.crear`, `clientes.editar`, `clientes.archivar`. Seed: Administrador ← todas (vía `ALL_PERMISSION_KEYS`); Gerente ← las 4; Cajero ← `clientes.ver` + `clientes.crear`; Empleado ← `clientes.ver`.
- **Autorización:** toda Server Action mutante empieza con `await requirePermission('<clave>')` ANTES de leer `formData` o tocar la BD. El route handler de export hace `try { await requirePermission('clientes.ver') } catch (e) { if (e instanceof ForbiddenError) return 403; throw e }`.
- **Auditoría:** dentro de la misma `db.$transaction` que la mutación. Acciones nuevas (a `AuditAction`, `LABELS` de `@/lib/audit`): `clientes.crear`, `clientes.editar`, `clientes.archivar`, `clientes.restaurar`, `clientes.datos_fiscales`. **El RFC se enmascara** (`enmascararRfc`) en todo `metadata` de `activity_log` — nunca el RFC completo.
- **UI:** español; server pages con `requirePermission(...)` como primera sentencia y `export const dynamic = 'force-dynamic'`; `redirect()` fuera de try/catch; React 19 `useActionState`; Zod 4 (`z.email()`, `.superRefine()` — igual que `@/lib/validation/product.ts`); Tailwind v4; sin `any`; sin `console.*`.
- **TDD:** test primero. `*.test.ts` unit (sin BD, project `unit`), `*.itest.ts` integración (project `integration`, globalSetup levanta Postgres efímero en `localhost:54330` db `pos_test`, aplica migraciones + seed). Ejecutar por tarea, en este orden, y pegar las colas en el reporte: `npm run typecheck && npm run lint && npm run test:unit && npm run test:integration && npm run build`.
- **Aislamiento FK en itests:** `InventoryMovement.variantId` es `ON DELETE RESTRICT`. `Customer` NO tiene FKs entrantes ni salientes en este bloque, así que su limpieza es independiente: `await db.customer.deleteMany({ where: { esGenerico: false } })` en `beforeEach`/`afterAll`. **Nunca** borres el cliente `esGenerico` ni las `taxRate`/roles de sistema.
- **Commits:** Conventional Commits en español, terminando exactamente con:
  ```
  Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01EnFJHWm8zVoqgkmfwwcRHi
  ```
- **Sin push, sin remoto, sin deploy.** Todo local.

---

## Estructura de archivos

**Librería (núcleo puro, sin BD)**
- `src/lib/sat/regimenes-fiscales.ts` — `REGIMENES_FISCALES`, `REGIMEN_CODES` (Set), `getRegimenLabel(code)`.
- `src/lib/sat/usos-cfdi.ts` — `USOS_CFDI`, `USO_CFDI_CODES` (Set), `getUsoCfdiLabel(code)`.
- `src/lib/customers/fiscal.ts` — `normalizarRfc`, `rfcEsValido`, `esFisica`, `esRfcGenerico`, `bloqueFiscalCompleto`, `bloqueFiscalVacio`, `enmascararRfc`, `regimenCompatibleConRfc`.
- `src/lib/validation/customer.ts` — `customerSchema`, `editCustomerSchema`, tipos `CustomerInput` / `EditCustomerInput`.

**Librería (servicios con BD)**
- `src/lib/customers/search.ts` — `searchCustomers(q, opts?)` → `CustomerHit[]`.
- `src/lib/customers/customers.ts` — `createCustomer`, `getCustomer`, `updateCustomer`, `archiveCustomer`, `restoreCustomer`, `listCustomers` + tipos `CustomerDetail` / `CustomerRow` / `ListCustomersFilter`.

**RBAC / auditoría / navegación (aditivo)**
- `src/lib/auth/rbac.ts` — + grupo `clientes` en `PERMISSIONS`.
- `src/lib/audit.ts` — + 5 acciones en `AuditAction` y `LABELS`.
- `src/lib/nav.ts` — + ítem Clientes.

**Prisma**
- `prisma/schema.prisma` — + `model Customer` (aditivo).
- `prisma/seed.ts` — + `clientes.*` en `ROLE_PERMISSIONS`; + upsert de "Público en General".
- `prisma/migrations/<ts>_bloque3_clientes/` — generada.
- `src/lib/roles/admin.itest.ts` — sincronizar el espejo `SEED_ROLE_PERMISSIONS`.

**App**
- `src/app/(app)/clientes/page.tsx` — listado + filtros + export.
- `src/app/(app)/clientes/actions.ts` — `crearClienteAction`, `editarClienteAction`, `archivarClienteAction`, `restaurarClienteAction`.
- `src/app/(app)/clientes/nuevo/page.tsx` — alta.
- `src/app/(app)/clientes/[id]/page.tsx` — detalle + edición + placeholder "Compras".
- `src/app/(app)/clientes/CustomerForm.tsx` — `'use client'`, contacto + bloque CFDI plegable.
- `src/app/(app)/clientes/CustomerRow.tsx` — fila con badges.
- `src/app/(app)/clientes/ClienteAdminActions.tsx` — `'use client'`, botones archivar/restaurar.
- `src/app/(app)/clientes/export/route.ts` (+ `route.itest.ts`) — CSV.

**Tests**
- `*.test.ts` junto a cada módulo puro; `*.itest.ts` junto a cada servicio con BD.
- `src/lib/__tests__/seed-bloque3.itest.ts`.
- `e2e/clientes.spec.ts`.

---

## Task 1: Catálogos SAT (regímenes fiscales y usos de CFDI)

**Files:**
- Create: `src/lib/sat/regimenes-fiscales.ts`
- Create: `src/lib/sat/regimenes-fiscales.test.ts`
- Create: `src/lib/sat/usos-cfdi.ts`
- Create: `src/lib/sat/usos-cfdi.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces:
  - `REGIMENES_FISCALES: readonly { code: string; label: string; aplicaFisica: boolean; aplicaMoral: boolean }[]`
  - `REGIMEN_CODES: ReadonlySet<string>`
  - `getRegimenLabel(code: string): string` (fallback al `code`)
  - `USOS_CFDI: readonly { code: string; label: string }[]`
  - `USO_CFDI_CODES: ReadonlySet<string>`
  - `getUsoCfdiLabel(code: string): string` (fallback al `code`)

- [ ] **Step 1: Escribir `src/lib/sat/regimenes-fiscales.test.ts` (falla)**

```ts
import { describe, it, expect } from 'vitest';
import { REGIMENES_FISCALES, REGIMEN_CODES, getRegimenLabel } from './regimenes-fiscales';

describe('REGIMENES_FISCALES', () => {
  it('no tiene códigos duplicados', () => {
    const codes = REGIMENES_FISCALES.map((r) => r.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('incluye los regímenes SAT esperados', () => {
    for (const c of ['601', '605', '612', '626']) {
      expect(REGIMEN_CODES.has(c)).toBe(true);
    }
  });

  it('601 aplica a personas morales y no a físicas', () => {
    const r = REGIMENES_FISCALES.find((x) => x.code === '601');
    expect(r?.aplicaMoral).toBe(true);
    expect(r?.aplicaFisica).toBe(false);
  });

  it('605 aplica a personas físicas y no a morales', () => {
    const r = REGIMENES_FISCALES.find((x) => x.code === '605');
    expect(r?.aplicaFisica).toBe(true);
    expect(r?.aplicaMoral).toBe(false);
  });

  it('626 (RESICO) aplica a ambos', () => {
    const r = REGIMENES_FISCALES.find((x) => x.code === '626');
    expect(r?.aplicaFisica).toBe(true);
    expect(r?.aplicaMoral).toBe(true);
  });

  it('REGIMEN_CODES coincide con el array', () => {
    expect(REGIMEN_CODES.size).toBe(REGIMENES_FISCALES.length);
  });

  it('getRegimenLabel devuelve la etiqueta o el code como fallback', () => {
    expect(getRegimenLabel('601')).toContain('Personas Morales');
    expect(getRegimenLabel('999')).toBe('999');
  });
});
```

- [ ] **Step 2: Ejecutar y verificar que falla**

Run: `npm run test:unit -- src/lib/sat/regimenes-fiscales.test.ts`
Expected: FAIL — módulo inexistente.

- [ ] **Step 3: Escribir `src/lib/sat/regimenes-fiscales.ts`**

```ts
export type RegimenFiscal = {
  code: string;
  label: string;
  aplicaFisica: boolean;
  aplicaMoral: boolean;
};

// Catálogo SAT c_RegimenFiscal (CFDI 4.0). Solo se almacena el código; sin
// integración con el SAT.
export const REGIMENES_FISCALES: readonly RegimenFiscal[] = [
  { code: '601', label: 'General de Ley Personas Morales', aplicaFisica: false, aplicaMoral: true },
  { code: '603', label: 'Personas Morales con Fines no Lucrativos', aplicaFisica: false, aplicaMoral: true },
  { code: '605', label: 'Sueldos y Salarios e Ingresos Asimilados a Salarios', aplicaFisica: true, aplicaMoral: false },
  { code: '606', label: 'Arrendamiento', aplicaFisica: true, aplicaMoral: false },
  { code: '607', label: 'Régimen de Enajenación o Adquisición de Bienes', aplicaFisica: true, aplicaMoral: false },
  { code: '608', label: 'Demás ingresos', aplicaFisica: true, aplicaMoral: false },
  { code: '610', label: 'Residentes en el Extranjero sin Establecimiento Permanente en México', aplicaFisica: true, aplicaMoral: true },
  { code: '611', label: 'Ingresos por Dividendos (socios y accionistas)', aplicaFisica: true, aplicaMoral: false },
  { code: '612', label: 'Personas Físicas con Actividades Empresariales y Profesionales', aplicaFisica: true, aplicaMoral: false },
  { code: '614', label: 'Ingresos por intereses', aplicaFisica: true, aplicaMoral: false },
  { code: '615', label: 'Régimen de los ingresos por obtención de premios', aplicaFisica: true, aplicaMoral: false },
  { code: '616', label: 'Sin obligaciones fiscales', aplicaFisica: true, aplicaMoral: false },
  { code: '620', label: 'Sociedades Cooperativas de Producción que optan por diferir sus ingresos', aplicaFisica: false, aplicaMoral: true },
  { code: '621', label: 'Incorporación Fiscal', aplicaFisica: true, aplicaMoral: false },
  { code: '622', label: 'Actividades Agrícolas, Ganaderas, Silvícolas y Pesqueras', aplicaFisica: true, aplicaMoral: true },
  { code: '623', label: 'Opcional para Grupos de Sociedades', aplicaFisica: false, aplicaMoral: true },
  { code: '624', label: 'Coordinados', aplicaFisica: false, aplicaMoral: true },
  { code: '625', label: 'Régimen de las Actividades Empresariales con ingresos a través de Plataformas Tecnológicas', aplicaFisica: true, aplicaMoral: false },
  { code: '626', label: 'Régimen Simplificado de Confianza', aplicaFisica: true, aplicaMoral: true },
] as const;

export const REGIMEN_CODES: ReadonlySet<string> = new Set(REGIMENES_FISCALES.map((r) => r.code));

const BY_CODE = new Map(REGIMENES_FISCALES.map((r) => [r.code, r] as const));

export function getRegimenLabel(code: string): string {
  return BY_CODE.get(code)?.label ?? code;
}
```

- [ ] **Step 4: Ejecutar y verificar que pasa**

Run: `npm run test:unit -- src/lib/sat/regimenes-fiscales.test.ts`
Expected: PASS.

- [ ] **Step 5: Escribir `src/lib/sat/usos-cfdi.test.ts` (falla)**

```ts
import { describe, it, expect } from 'vitest';
import { USOS_CFDI, USO_CFDI_CODES, getUsoCfdiLabel } from './usos-cfdi';

describe('USOS_CFDI', () => {
  it('no tiene códigos duplicados', () => {
    const codes = USOS_CFDI.map((u) => u.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('incluye los usos SAT esperados', () => {
    for (const c of ['G01', 'G03', 'S01', 'CP01', 'CN01', 'I01', 'D01']) {
      expect(USO_CFDI_CODES.has(c)).toBe(true);
    }
  });

  it('USO_CFDI_CODES coincide con el array', () => {
    expect(USO_CFDI_CODES.size).toBe(USOS_CFDI.length);
  });

  it('getUsoCfdiLabel devuelve la etiqueta o el code como fallback', () => {
    expect(getUsoCfdiLabel('G03')).toContain('Gastos en general');
    expect(getUsoCfdiLabel('ZZZ')).toBe('ZZZ');
  });
});
```

- [ ] **Step 6: Ejecutar y verificar que falla**

Run: `npm run test:unit -- src/lib/sat/usos-cfdi.test.ts`
Expected: FAIL — módulo inexistente.

- [ ] **Step 7: Escribir `src/lib/sat/usos-cfdi.ts`**

```ts
export type UsoCfdi = { code: string; label: string };

// Catálogo SAT c_UsoCFDI (CFDI 4.0). Solo se almacena el código.
export const USOS_CFDI: readonly UsoCfdi[] = [
  { code: 'G01', label: 'Adquisición de mercancías' },
  { code: 'G02', label: 'Devoluciones, descuentos o bonificaciones' },
  { code: 'G03', label: 'Gastos en general' },
  { code: 'I01', label: 'Construcciones' },
  { code: 'I02', label: 'Mobiliario y equipo de oficina por inversiones' },
  { code: 'I03', label: 'Equipo de transporte' },
  { code: 'I04', label: 'Equipo de cómputo y accesorios' },
  { code: 'I05', label: 'Dados, troqueles, moldes, matrices y herramental' },
  { code: 'I06', label: 'Comunicaciones telefónicas' },
  { code: 'I07', label: 'Comunicaciones satelitales' },
  { code: 'I08', label: 'Otra maquinaria y equipo' },
  { code: 'D01', label: 'Honorarios médicos, dentales y gastos hospitalarios' },
  { code: 'D02', label: 'Gastos médicos por incapacidad o discapacidad' },
  { code: 'D03', label: 'Gastos funerales' },
  { code: 'D04', label: 'Donativos' },
  { code: 'D05', label: 'Intereses reales efectivamente pagados por créditos hipotecarios (casa habitación)' },
  { code: 'D06', label: 'Aportaciones voluntarias al SAR' },
  { code: 'D07', label: 'Primas por seguros de gastos médicos' },
  { code: 'D08', label: 'Gastos de transportación escolar obligatoria' },
  { code: 'D09', label: 'Depósitos en cuentas para el ahorro, primas que tengan como base planes de pensiones' },
  { code: 'D10', label: 'Pagos por servicios educativos (colegiaturas)' },
  { code: 'S01', label: 'Sin efectos fiscales' },
  { code: 'CP01', label: 'Pagos' },
  { code: 'CN01', label: 'Nómina' },
] as const;

export const USO_CFDI_CODES: ReadonlySet<string> = new Set(USOS_CFDI.map((u) => u.code));

const BY_CODE = new Map(USOS_CFDI.map((u) => [u.code, u] as const));

export function getUsoCfdiLabel(code: string): string {
  return BY_CODE.get(code)?.label ?? code;
}
```

- [ ] **Step 8: Ejecutar la suite unit completa**

Run: `npm run test:unit -- src/lib/sat/`
Expected: PASS (ambos archivos).

- [ ] **Step 9: typecheck + lint**

Run: `npm run typecheck && npm run lint`
Expected: 0 errores.

- [ ] **Step 10: Commit**

```bash
git add src/lib/sat/
git commit -m "feat(clientes): catálogos SAT de régimen fiscal y uso de CFDI

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01EnFJHWm8zVoqgkmfwwcRHi"
```

---

## Task 2: Helpers fiscales puros (`fiscal.ts`)

**Files:**
- Create: `src/lib/customers/fiscal.ts`
- Create: `src/lib/customers/fiscal.test.ts`

**Interfaces:**
- Consumes: `REGIMENES_FISCALES` de `@/lib/sat/regimenes-fiscales` (Task 1).
- Produces:
  - `normalizarRfc(rfc: string): string`
  - `rfcEsValido(rfc: string): boolean`
  - `esFisica(rfc: string): boolean`
  - `esRfcGenerico(rfc: string): boolean`
  - `type BloqueFiscalInput = { rfc?: string | null; razonSocial?: string | null; regimenFiscalCode?: string | null; usoCfdiCode?: string | null; cpFiscal?: string | null }`
  - `bloqueFiscalCompleto(x: BloqueFiscalInput): boolean`
  - `bloqueFiscalVacio(x: BloqueFiscalInput): boolean`
  - `enmascararRfc(rfc: string): string`
  - `regimenCompatibleConRfc(regimenCode: string, rfc: string): boolean`

- [ ] **Step 1: Escribir `src/lib/customers/fiscal.test.ts` (falla)**

```ts
import { describe, it, expect } from 'vitest';
import {
  normalizarRfc,
  rfcEsValido,
  esFisica,
  esRfcGenerico,
  bloqueFiscalCompleto,
  bloqueFiscalVacio,
  enmascararRfc,
  regimenCompatibleConRfc,
} from './fiscal';

describe('normalizarRfc', () => {
  it('mayúsculas y sin espacios ni guiones', () => {
    expect(normalizarRfc(' loam-800101-1x3 ')).toBe('LOAM8001011X3');
    expect(normalizarRfc('abc010101xyz')).toBe('ABC010101XYZ');
  });
});

describe('rfcEsValido', () => {
  it('acepta persona moral (12)', () => {
    expect(rfcEsValido('ABC010101XYZ')).toBe(true);
  });
  it('acepta persona física (13)', () => {
    expect(rfcEsValido('LOAM8001011X3')).toBe(true);
  });
  it('normaliza antes de validar', () => {
    expect(rfcEsValido(' loam-800101-1x3 ')).toBe(true);
  });
  it('rechaza longitud 11 y 14', () => {
    expect(rfcEsValido('ABC010101XY')).toBe(false);
    expect(rfcEsValido('ABCD010101XYZ4')).toBe(false);
  });
  it('rechaza caracteres inválidos', () => {
    expect(rfcEsValido('AB!010101XYZ')).toBe(false);
  });
});

describe('esFisica', () => {
  it('true para 13, false para 12', () => {
    expect(esFisica('LOAM8001011X3')).toBe(true);
    expect(esFisica('ABC010101XYZ')).toBe(false);
  });
});

describe('esRfcGenerico', () => {
  it('reconoce XAXX y XEXX en cualquier caja', () => {
    expect(esRfcGenerico('XAXX010101000')).toBe(true);
    expect(esRfcGenerico('xexx010101000')).toBe(true);
    expect(esRfcGenerico('LOAM8001011X3')).toBe(false);
  });
});

describe('bloqueFiscal*', () => {
  const full = {
    rfc: 'ABC010101XYZ',
    razonSocial: 'ACME',
    regimenFiscalCode: '601',
    usoCfdiCode: 'G03',
    cpFiscal: '06000',
  };
  it('completo cuando están los 5 núcleo', () => {
    expect(bloqueFiscalCompleto(full)).toBe(true);
    expect(bloqueFiscalVacio(full)).toBe(false);
  });
  it('vacío cuando no hay ninguno', () => {
    expect(bloqueFiscalVacio({})).toBe(true);
    expect(bloqueFiscalCompleto({})).toBe(false);
  });
  it('parcial no es completo ni vacío', () => {
    const parcial = { rfc: 'ABC010101XYZ' };
    expect(bloqueFiscalCompleto(parcial)).toBe(false);
    expect(bloqueFiscalVacio(parcial)).toBe(false);
  });
  it('trata cadena vacía y espacios como ausente', () => {
    expect(bloqueFiscalVacio({ rfc: '   ', razonSocial: '' })).toBe(true);
  });
});

describe('enmascararRfc', () => {
  it('deja 3 al inicio y 3 al final', () => {
    expect(enmascararRfc('ABC010101XYZ')).toBe('ABC******XYZ');
    expect(enmascararRfc('LOAM8001011X3')).toBe('LOA*******1X3');
  });
  it('normaliza primero', () => {
    expect(enmascararRfc(' abc-010101-xyz ')).toBe('ABC******XYZ');
  });
});

describe('regimenCompatibleConRfc', () => {
  it('601 con RFC moral: compatible', () => {
    expect(regimenCompatibleConRfc('601', 'ABC010101XYZ')).toBe(true);
  });
  it('601 con RFC física: incompatible', () => {
    expect(regimenCompatibleConRfc('601', 'LOAM8001011X3')).toBe(false);
  });
  it('605 con RFC física: compatible', () => {
    expect(regimenCompatibleConRfc('605', 'LOAM8001011X3')).toBe(true);
  });
  it('626 (ambos) con cualquiera: compatible', () => {
    expect(regimenCompatibleConRfc('626', 'ABC010101XYZ')).toBe(true);
    expect(regimenCompatibleConRfc('626', 'LOAM8001011X3')).toBe(true);
  });
  it('código fuera del catálogo: incompatible', () => {
    expect(regimenCompatibleConRfc('999', 'ABC010101XYZ')).toBe(false);
  });
});
```

- [ ] **Step 2: Ejecutar y verificar que falla**

Run: `npm run test:unit -- src/lib/customers/fiscal.test.ts`
Expected: FAIL — módulo inexistente.

- [ ] **Step 3: Escribir `src/lib/customers/fiscal.ts`**

```ts
import { REGIMENES_FISCALES } from '@/lib/sat/regimenes-fiscales';

const RFC_MORAL = /^[A-ZÑ&]{3}\d{6}[A-Z0-9]{3}$/;
const RFC_FISICA = /^[A-ZÑ&]{4}\d{6}[A-Z0-9]{3}$/;
const RFC_GENERICOS = new Set(['XAXX010101000', 'XEXX010101000']);

export function normalizarRfc(rfc: string): string {
  return rfc.toUpperCase().replace(/[\s-]/g, '');
}

export function rfcEsValido(rfc: string): boolean {
  const n = normalizarRfc(rfc);
  if (n.length === 12) return RFC_MORAL.test(n);
  if (n.length === 13) return RFC_FISICA.test(n);
  return false;
}

export function esFisica(rfc: string): boolean {
  return normalizarRfc(rfc).length === 13;
}

export function esRfcGenerico(rfc: string): boolean {
  return RFC_GENERICOS.has(normalizarRfc(rfc));
}

export type BloqueFiscalInput = {
  rfc?: string | null;
  razonSocial?: string | null;
  regimenFiscalCode?: string | null;
  usoCfdiCode?: string | null;
  cpFiscal?: string | null;
};

const CAMPOS_NUCLEO: (keyof BloqueFiscalInput)[] = [
  'rfc', 'razonSocial', 'regimenFiscalCode', 'usoCfdiCode', 'cpFiscal',
];

function tieneValor(v: string | null | undefined): boolean {
  return typeof v === 'string' && v.trim() !== '';
}

export function bloqueFiscalCompleto(x: BloqueFiscalInput): boolean {
  return CAMPOS_NUCLEO.every((k) => tieneValor(x[k]));
}

export function bloqueFiscalVacio(x: BloqueFiscalInput): boolean {
  return CAMPOS_NUCLEO.every((k) => !tieneValor(x[k]));
}

export function enmascararRfc(rfc: string): string {
  const n = normalizarRfc(rfc);
  if (n.length <= 6) return '*'.repeat(n.length);
  return `${n.slice(0, 3)}${'*'.repeat(n.length - 6)}${n.slice(-3)}`;
}

export function regimenCompatibleConRfc(regimenCode: string, rfc: string): boolean {
  const r = REGIMENES_FISCALES.find((x) => x.code === regimenCode);
  if (!r) return false;
  return esFisica(rfc) ? r.aplicaFisica : r.aplicaMoral;
}
```

- [ ] **Step 4: Ejecutar y verificar que pasa**

Run: `npm run test:unit -- src/lib/customers/fiscal.test.ts`
Expected: PASS.

- [ ] **Step 5: typecheck + lint**

Run: `npm run typecheck && npm run lint`
Expected: 0 errores.

- [ ] **Step 6: Commit**

```bash
git add src/lib/customers/fiscal.ts src/lib/customers/fiscal.test.ts
git commit -m "feat(clientes): helpers puros de RFC y bloque fiscal

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01EnFJHWm8zVoqgkmfwwcRHi"
```

---

## Task 3: RBAC, auditoría y navegación (aditivo)

**Files:**
- Modify: `src/lib/auth/rbac.ts` (añadir grupo `clientes` al final del array `PERMISSIONS`)
- Modify: `src/lib/audit.ts` (añadir 5 acciones a `AuditAction` y a `LABELS`)
- Modify: `src/lib/nav.ts` (añadir ítem Clientes antes de "Mi perfil")
- Create: `src/lib/auth/rbac-clientes.test.ts`
- Create: `src/lib/audit-clientes.test.ts`

**Interfaces:**
- Consumes: nada nuevo.
- Produces: claves de permiso `clientes.ver` / `clientes.crear` / `clientes.editar` / `clientes.archivar` (ahora parte de `PermissionKey` y `ALL_PERMISSION_KEYS`, ambos derivados). Acciones de auditoría `clientes.crear` / `clientes.editar` / `clientes.archivar` / `clientes.restaurar` / `clientes.datos_fiscales` (ahora parte de `AuditAction` y `KNOWN_ACTIONS`).

- [ ] **Step 1: Escribir `src/lib/auth/rbac-clientes.test.ts` (falla)**

```ts
import { describe, it, expect } from 'vitest';
import { PERMISSIONS, ALL_PERMISSION_KEYS } from './rbac';

describe('grupo de permisos clientes', () => {
  it('existe el módulo clientes con 4 claves', () => {
    const grupo = PERMISSIONS.find((g) => g.modulo === 'clientes');
    expect(grupo).toBeDefined();
    expect(grupo!.permisos.map((p) => p.key)).toEqual([
      'clientes.ver', 'clientes.crear', 'clientes.editar', 'clientes.archivar',
    ]);
  });

  it('las claves están en ALL_PERMISSION_KEYS', () => {
    for (const k of ['clientes.ver', 'clientes.crear', 'clientes.editar', 'clientes.archivar']) {
      expect(ALL_PERMISSION_KEYS).toContain(k);
    }
  });
});
```

- [ ] **Step 2: Ejecutar y verificar que falla**

Run: `npm run test:unit -- src/lib/auth/rbac-clientes.test.ts`
Expected: FAIL — grupo inexistente.

- [ ] **Step 3: Añadir el grupo `clientes` en `src/lib/auth/rbac.ts`**

Insertar como último elemento del array `PERMISSIONS` (después del grupo `inventario`, antes del `] as const;`):

```ts
  {
    modulo: 'clientes', label: 'Clientes',
    permisos: [
      { key: 'clientes.ver', label: 'Ver clientes y su detalle' },
      { key: 'clientes.crear', label: 'Alta de clientes' },
      { key: 'clientes.editar', label: 'Editar datos de contacto y facturación' },
      { key: 'clientes.archivar', label: 'Archivar / restaurar clientes' },
    ],
  },
```

- [ ] **Step 4: Ejecutar y verificar que pasa**

Run: `npm run test:unit -- src/lib/auth/rbac-clientes.test.ts`
Expected: PASS.

- [ ] **Step 5: Escribir `src/lib/audit-clientes.test.ts` (falla)**

```ts
import { describe, it, expect } from 'vitest';
import { KNOWN_ACTIONS, actionLabel } from './audit';

describe('acciones de auditoría de clientes', () => {
  const acciones = [
    'clientes.crear', 'clientes.editar', 'clientes.archivar',
    'clientes.restaurar', 'clientes.datos_fiscales',
  ];

  it('están en KNOWN_ACTIONS', () => {
    for (const a of acciones) expect(KNOWN_ACTIONS).toContain(a);
  });

  it('tienen etiqueta en español (no el código crudo)', () => {
    for (const a of acciones) expect(actionLabel(a)).not.toBe(a);
  });
});
```

- [ ] **Step 6: Ejecutar y verificar que falla**

Run: `npm run test:unit -- src/lib/audit-clientes.test.ts`
Expected: FAIL.

- [ ] **Step 7: Ampliar `src/lib/audit.ts`**

En la unión `AuditAction`, añadir al final (antes del `;`):

```ts
  | 'clientes.crear' | 'clientes.editar' | 'clientes.archivar'
  | 'clientes.restaurar' | 'clientes.datos_fiscales'
```

En el objeto `LABELS`, añadir tras las entradas de `inventario.movimiento`:

```ts
  'clientes.crear': 'Alta de cliente',
  'clientes.editar': 'Edición de cliente',
  'clientes.archivar': 'Archivado de cliente',
  'clientes.restaurar': 'Restauración de cliente',
  'clientes.datos_fiscales': 'Cambio de datos de facturación',
```

- [ ] **Step 8: Ejecutar y verificar que pasa**

Run: `npm run test:unit -- src/lib/audit-clientes.test.ts`
Expected: PASS.

- [ ] **Step 9: Añadir el ítem de navegación en `src/lib/nav.ts`**

Insertar entre el ítem `/inventario` y el ítem `/perfil`:

```ts
  { href: '/clientes', label: 'Clientes', permiso: 'clientes.ver' },
```

- [ ] **Step 10: typecheck + lint + suite unit**

Run: `npm run typecheck && npm run lint && npm run test:unit`
Expected: 0 errores; toda la suite unit en verde (incluye los tests existentes de rbac/audit/nav, que siguen pasando).

- [ ] **Step 11: Commit**

```bash
git add src/lib/auth/rbac.ts src/lib/auth/rbac-clientes.test.ts src/lib/audit.ts src/lib/audit-clientes.test.ts src/lib/nav.ts
git commit -m "feat(clientes): permisos, acciones de auditoría y navegación

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01EnFJHWm8zVoqgkmfwwcRHi"
```

---

## Task 4: Esquema Prisma, migración y seed

**Files:**
- Modify: `prisma/schema.prisma` (añadir `model Customer`)
- Modify: `prisma/seed.ts` (claves `clientes.*` en `ROLE_PERMISSIONS`; upsert "Público en General")
- Modify: `src/lib/roles/admin.itest.ts` (sincronizar el espejo `SEED_ROLE_PERMISSIONS`)
- Create: `prisma/migrations/<ts>_bloque3_clientes/migration.sql` (generada por Prisma)
- Create: `src/lib/__tests__/seed-bloque3.itest.ts`

**Interfaces:**
- Consumes: claves de permiso de Task 3.
- Produces: tabla `Customer` con los campos del spec; seed con el cliente `esGenerico` ("Público en General", `rfc = 'XAXX010101000'`, `archivado = false`) y las claves `clientes.*` repartidas entre Gerente (4), Cajero (`clientes.ver`, `clientes.crear`) y Empleado (`clientes.ver`).

- [ ] **Step 1: Añadir `model Customer` al final de `prisma/schema.prisma`**

```prisma
model Customer {
  id                String   @id @default(cuid())
  nombre            String
  telefono          String?  @unique
  correo            String?  @unique
  direccion         String?
  notas             String?

  rfc               String?  @unique
  razonSocial       String?
  regimenFiscalCode String?
  usoCfdiCode       String?
  cpFiscal          String?
  correoFacturacion String?

  esGenerico        Boolean  @default(false)
  archivado         Boolean  @default(false)
  createdById       String?
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt

  @@index([archivado])
  @@index([nombre])
}
```

- [ ] **Step 2: Levantar la BD de desarrollo (background)**

Run (con `run_in_background`): `npm run db:start`
Espera a que reporte listo en `localhost:54329`. Comprueba con `npm run db:status` si hace falta.

- [ ] **Step 3: Generar la migración**

Run: `npx prisma migrate dev --name bloque3_clientes`
Expected: crea `prisma/migrations/<ts>_bloque3_clientes/migration.sql` con **solo** `CREATE TABLE "Customer"` y sus índices (`Customer_telefono_key`, `Customer_correo_key`, `Customer_rfc_key`, `Customer_archivado_idx`, `Customer_nombre_idx`). Revisa el SQL: no debe alterar ni borrar ninguna tabla/columna existente. Regenera el cliente Prisma si el comando no lo hace: `npx prisma generate`.

- [ ] **Step 4: Escribir `src/lib/__tests__/seed-bloque3.itest.ts` (falla)**

```ts
import { describe, it, expect } from 'vitest';
import { db } from '@/lib/db';

describe('seed bloque 3', () => {
  it('siembra el cliente Público en General', async () => {
    const generico = await db.customer.findFirst({ where: { esGenerico: true } });
    expect(generico).not.toBeNull();
    expect(generico!.nombre).toBe('Público en General');
    expect(generico!.rfc).toBe('XAXX010101000');
    expect(generico!.archivado).toBe(false);
  });

  it('solo hay un cliente genérico', async () => {
    const count = await db.customer.count({ where: { esGenerico: true } });
    expect(count).toBe(1);
  });

  it('Gerente tiene las 4 claves de clientes', async () => {
    const rol = await db.role.findUniqueOrThrow({
      where: { nombre: 'Gerente' },
      include: { permissions: true },
    });
    const keys = rol.permissions.map((p) => p.permiso);
    for (const k of ['clientes.ver', 'clientes.crear', 'clientes.editar', 'clientes.archivar']) {
      expect(keys).toContain(k);
    }
  });

  it('Cajero ve y crea; Empleado solo ve', async () => {
    const cajero = await db.role.findUniqueOrThrow({
      where: { nombre: 'Cajero' }, include: { permissions: true },
    });
    const ck = cajero.permissions.map((p) => p.permiso);
    expect(ck).toContain('clientes.ver');
    expect(ck).toContain('clientes.crear');
    expect(ck).not.toContain('clientes.editar');
    expect(ck).not.toContain('clientes.archivar');

    const empleado = await db.role.findUniqueOrThrow({
      where: { nombre: 'Empleado' }, include: { permissions: true },
    });
    const ek = empleado.permissions.map((p) => p.permiso);
    expect(ek).toContain('clientes.ver');
    expect(ek).not.toContain('clientes.crear');
  });
});
```

- [ ] **Step 5: Ejecutar y verificar que falla**

Run: `npm run test:integration -- src/lib/__tests__/seed-bloque3.itest.ts`
Expected: FAIL — no hay cliente genérico ni permisos `clientes.*`.

- [ ] **Step 6: Ampliar `prisma/seed.ts`**

En el mapa `ROLE_PERMISSIONS`, añadir a la lista de `Gerente` (tras los permisos de bloque 2):

```ts
    // Bloque 3: Clientes
    'clientes.ver', 'clientes.crear', 'clientes.editar', 'clientes.archivar',
```

Cambiar `Cajero` y `Empleado`:

```ts
  Cajero: ['productos.ver', 'inventario.ver', 'clientes.ver', 'clientes.crear'],
  Empleado: ['productos.ver', 'inventario.ver', 'clientes.ver'],
```

Tras el bloque de `taxRates` (antes del `console.log` final), añadir:

```ts
  // --- Bloque 3: cliente genérico ---
  const generico = await db.customer.findFirst({ where: { esGenerico: true } });
  if (generico) {
    await db.customer.update({
      where: { id: generico.id },
      data: { nombre: 'Público en General', rfc: 'XAXX010101000', archivado: false },
    });
  } else {
    await db.customer.create({
      data: { nombre: 'Público en General', rfc: 'XAXX010101000', esGenerico: true },
    });
  }
```

- [ ] **Step 7: Sincronizar el espejo en `src/lib/roles/admin.itest.ts`**

En el objeto `SEED_ROLE_PERMISSIONS` (comentario: "Restauramos el estado canónico del seed"), reflejar EXACTAMENTE los cambios de `prisma/seed.ts`:

```ts
  Gerente: [
    'usuarios.ver', 'usuarios.crear', 'usuarios.editar', 'usuarios.reset_password', 'roles.ver', 'auditoria.ver',
    'productos.ver', 'productos.crear', 'productos.editar', 'productos.archivar',
    'categorias.gestionar', 'inventario.ver', 'inventario.entrada', 'inventario.salida', 'inventario.ajustar',
    'clientes.ver', 'clientes.crear', 'clientes.editar', 'clientes.archivar',
  ],
  Cajero: ['productos.ver', 'inventario.ver', 'clientes.ver', 'clientes.crear'],
  Empleado: ['productos.ver', 'inventario.ver', 'clientes.ver'],
```

- [ ] **Step 8: Aplicar migración + seed al entorno de test y ejecutar**

La `globalSetup` de integración aplica migraciones y seed sobre la BD efímera automáticamente. Ejecutar:

Run: `npm run test:integration -- src/lib/__tests__/seed-bloque3.itest.ts src/lib/roles/admin.itest.ts`
Expected: PASS ambos (el segundo confirma que el espejo no rompe la restauración del seed).

- [ ] **Step 9: Suite completa de verificación**

Run: `npm run typecheck && npm run lint && npm run test:unit && npm run test:integration && npm run build`
Expected: 0 errores; toda la suite en verde.

- [ ] **Step 10: Commit**

```bash
git add prisma/schema.prisma prisma/seed.ts prisma/migrations/ src/lib/roles/admin.itest.ts src/lib/__tests__/seed-bloque3.itest.ts
git commit -m "feat(clientes): modelo Customer, migración aditiva y seed del cliente genérico

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01EnFJHWm8zVoqgkmfwwcRHi"
```

---

## Task 5: Esquema de validación Zod (`validation/customer.ts`)

**Files:**
- Create: `src/lib/validation/customer.ts`
- Create: `src/lib/validation/customer.test.ts`

**Interfaces:**
- Consumes: `REGIMEN_CODES` de `@/lib/sat/regimenes-fiscales`, `USO_CFDI_CODES` de `@/lib/sat/usos-cfdi` (Task 1); `normalizarRfc`, `rfcEsValido`, `esRfcGenerico`, `bloqueFiscalVacio`, `bloqueFiscalCompleto`, `regimenCompatibleConRfc` de `@/lib/customers/fiscal` (Task 2).
- Produces:
  - `customerSchema` (Zod) — parsea contacto + bloque fiscal condicional; el `rfc` de salida ya viene normalizado (mayúsculas sin espacios) o `null`.
  - `editCustomerSchema` = `customerSchema` extendido con `id: z.string().min(1)`.
  - `type CustomerInput = z.infer<typeof customerSchema>`
  - `type EditCustomerInput = z.infer<typeof editCustomerSchema>`
  - Campos de salida: `nombre: string`; `telefono/correo/direccion/notas: string | null`; `rfc/razonSocial/regimenFiscalCode/usoCfdiCode/cpFiscal/correoFacturacion: string | null`.

- [ ] **Step 1: Escribir `src/lib/validation/customer.test.ts` (falla)**

```ts
import { describe, it, expect } from 'vitest';
import { customerSchema } from './customer';

const base = { nombre: 'María López' };

function errs(input: unknown): Record<string, string> {
  const r = customerSchema.safeParse(input);
  if (r.success) return {};
  const out: Record<string, string> = {};
  for (const i of r.error.issues) {
    const k = i.path.map(String).join('.');
    if (k && !(k in out)) out[k] = i.message;
  }
  return out;
}

describe('customerSchema — contacto', () => {
  it('acepta solo nombre', () => {
    const r = customerSchema.safeParse(base);
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.telefono).toBeNull();
      expect(r.data.rfc).toBeNull();
    }
  });
  it('nombre < 2 falla', () => {
    expect(errs({ nombre: 'A' })).toHaveProperty('nombre');
  });
  it('correo inválido falla', () => {
    expect(errs({ ...base, correo: 'no-es-correo' })).toHaveProperty('correo');
  });
  it('correo válido se normaliza a minúsculas', () => {
    const r = customerSchema.safeParse({ ...base, correo: 'MARIA@ACME.MX' });
    expect(r.success && r.data.correo).toBe('maria@acme.mx');
  });
});

describe('customerSchema — bloque fiscal condicional', () => {
  const full = {
    ...base,
    rfc: 'loam800101 1x3',
    razonSocial: 'María López',
    regimenFiscalCode: '612',
    usoCfdiCode: 'G03',
    cpFiscal: '06000',
  };

  it('bloque vacío: ok', () => {
    expect(customerSchema.safeParse(base).success).toBe(true);
  });

  it('bloque completo y válido: ok, rfc normalizado', () => {
    const r = customerSchema.safeParse(full);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.rfc).toBe('LOAM8001011X3');
  });

  it('solo rfc (parcial): exige los otros 4 núcleo', () => {
    const e = errs({ ...base, rfc: 'LOAM8001011X3' });
    expect(e).toHaveProperty('razonSocial');
    expect(e).toHaveProperty('regimenFiscalCode');
    expect(e).toHaveProperty('usoCfdiCode');
    expect(e).toHaveProperty('cpFiscal');
  });

  it('rfc mal formado con bloque completo: error en rfc', () => {
    expect(errs({ ...full, rfc: 'MALO123' })).toHaveProperty('rfc');
  });

  it('rfc genérico manual: rechazado en rfc', () => {
    expect(errs({ ...full, rfc: 'XAXX010101000' })).toHaveProperty('rfc');
  });

  it('regimenFiscalCode fuera del catálogo: error', () => {
    expect(errs({ ...full, regimenFiscalCode: '999' })).toHaveProperty('regimenFiscalCode');
  });

  it('usoCfdiCode fuera del catálogo: error', () => {
    expect(errs({ ...full, usoCfdiCode: 'ZZZ' })).toHaveProperty('usoCfdiCode');
  });

  it('cpFiscal no numérico de 5: error', () => {
    expect(errs({ ...full, cpFiscal: '6000' })).toHaveProperty('cpFiscal');
  });

  it('régimen moral (601) con RFC física: error en regimenFiscalCode', () => {
    expect(errs({ ...full, regimenFiscalCode: '601' })).toHaveProperty('regimenFiscalCode');
  });
});
```

- [ ] **Step 2: Ejecutar y verificar que falla**

Run: `npm run test:unit -- src/lib/validation/customer.test.ts`
Expected: FAIL — módulo inexistente.

- [ ] **Step 3: Escribir `src/lib/validation/customer.ts`**

```ts
import { z } from 'zod';
import { REGIMEN_CODES } from '@/lib/sat/regimenes-fiscales';
import { USO_CFDI_CODES } from '@/lib/sat/usos-cfdi';
import {
  normalizarRfc,
  rfcEsValido,
  esRfcGenerico,
  bloqueFiscalVacio,
  bloqueFiscalCompleto,
  regimenCompatibleConRfc,
} from '@/lib/customers/fiscal';

const optStr = z
  .string()
  .trim()
  .optional()
  .or(z.literal(''))
  .transform((v) => (v ? v : null));

const optStrMax = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Máximo ${max} caracteres`)
    .optional()
    .or(z.literal(''))
    .transform((v) => (v ? v : null));

const optCorreo = z
  .string()
  .trim()
  .toLowerCase()
  .optional()
  .or(z.literal(''))
  .transform((v) => (v ? v : null))
  .refine((v) => v === null || z.email().safeParse(v).success, {
    message: 'Correo no válido',
  });

const NUCLEO = ['rfc', 'razonSocial', 'regimenFiscalCode', 'usoCfdiCode', 'cpFiscal'] as const;

const shape = {
  nombre: z.string().trim().min(2, 'Mínimo 2 caracteres'),
  telefono: optStrMax(30),
  correo: optCorreo,
  direccion: optStrMax(500),
  notas: optStrMax(500),
  rfc: optStr.transform((v) => (v ? normalizarRfc(v) : null)),
  razonSocial: optStrMax(200),
  regimenFiscalCode: optStr,
  usoCfdiCode: optStr,
  cpFiscal: optStr,
  correoFacturacion: optCorreo,
};

function refineFiscal(data: Record<string, unknown>, ctx: z.RefinementCtx): void {
  const bloque = {
    rfc: data.rfc as string | null,
    razonSocial: data.razonSocial as string | null,
    regimenFiscalCode: data.regimenFiscalCode as string | null,
    usoCfdiCode: data.usoCfdiCode as string | null,
    cpFiscal: data.cpFiscal as string | null,
  };

  if (bloqueFiscalVacio(bloque)) return;

  if (!bloqueFiscalCompleto(bloque)) {
    for (const k of NUCLEO) {
      if (!bloque[k]) {
        ctx.addIssue({
          code: 'custom',
          path: [k],
          message: 'Completa todos los datos de facturación o déjalos vacíos.',
        });
      }
    }
    return;
  }

  const rfc = bloque.rfc as string;
  if (!rfcEsValido(rfc)) {
    ctx.addIssue({ code: 'custom', path: ['rfc'], message: 'RFC con formato no válido.' });
  } else if (esRfcGenerico(rfc)) {
    ctx.addIssue({
      code: 'custom',
      path: ['rfc'],
      message: 'RFC reservado; usa el cliente Público en General.',
    });
  }

  if (!REGIMEN_CODES.has(bloque.regimenFiscalCode as string)) {
    ctx.addIssue({ code: 'custom', path: ['regimenFiscalCode'], message: 'Régimen fiscal no válido.' });
  } else if (rfcEsValido(rfc) && !regimenCompatibleConRfc(bloque.regimenFiscalCode as string, rfc)) {
    ctx.addIssue({
      code: 'custom',
      path: ['regimenFiscalCode'],
      message: 'El régimen no corresponde al tipo de RFC.',
    });
  }

  if (!USO_CFDI_CODES.has(bloque.usoCfdiCode as string)) {
    ctx.addIssue({ code: 'custom', path: ['usoCfdiCode'], message: 'Uso de CFDI no válido.' });
  }

  if (!/^\d{5}$/.test(bloque.cpFiscal as string)) {
    ctx.addIssue({ code: 'custom', path: ['cpFiscal'], message: 'El código postal debe tener 5 dígitos.' });
  }
}

export const customerSchema = z.object(shape).superRefine(refineFiscal);
export type CustomerInput = z.infer<typeof customerSchema>;

export const editCustomerSchema = z
  .object({ id: z.string().min(1, 'ID requerido'), ...shape })
  .superRefine(refineFiscal);
export type EditCustomerInput = z.infer<typeof editCustomerSchema>;
```

- [ ] **Step 4: Ejecutar y verificar que pasa**

Run: `npm run test:unit -- src/lib/validation/customer.test.ts`
Expected: PASS.

- [ ] **Step 5: typecheck + lint**

Run: `npm run typecheck && npm run lint`
Expected: 0 errores. Si `z.RefinementCtx` da problemas de tipo con Zod 4, usa el tipo del segundo parámetro de `superRefine` inline (`Parameters<Parameters<typeof z.object<typeof shape>['superRefine']>[0]>[1]`) o `Parameters<z.core.CheckFn<...>>`; sigue el idioma de `@/lib/validation/product.ts`.

- [ ] **Step 6: Commit**

```bash
git add src/lib/validation/customer.ts src/lib/validation/customer.test.ts
git commit -m "feat(clientes): esquema Zod con bloque fiscal condicional

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01EnFJHWm8zVoqgkmfwwcRHi"
```

---

## Task 6: Búsqueda de clientes (`customers/search.ts`)

**Files:**
- Create: `src/lib/customers/search.ts`
- Create: `src/lib/customers/search.itest.ts`

**Interfaces:**
- Consumes: `db` (`@/lib/db`), `normalizarRfc`, `bloqueFiscalCompleto` (`@/lib/customers/fiscal`).
- Produces:
  - `type CustomerHit = { id: string; nombre: string; telefono: string | null; correo: string | null; rfc: string | null; facturable: boolean; esGenerico: boolean }`
  - `searchCustomers(q: string, opts?: { incluirArchivados?: boolean; limit?: number }): Promise<CustomerHit[]>` — `q` vacío ⇒ `[]`; busca por nombre (contains insensitive), teléfono (contains), correo (contains insensitive), RFC (startsWith normalizado); excluye archivados salvo `incluirArchivados`; orden: genérico primero → coincidencia exacta de RFC/teléfono → nombre asc; `limit` por defecto 20, sobre-lectura `Math.min(Math.max(limit * 3, limit), 500)`.

- [ ] **Step 1: Escribir `src/lib/customers/search.itest.ts` (falla)**

```ts
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { db } from '@/lib/db';
import { searchCustomers } from './search';

async function mk(data: Partial<Parameters<typeof db.customer.create>[0]['data']> & { nombre: string }) {
  return db.customer.create({ data: data as never });
}

beforeEach(async () => {
  await db.customer.deleteMany({ where: { esGenerico: false } });
});
afterAll(async () => {
  await db.customer.deleteMany({ where: { esGenerico: false } });
});

describe('searchCustomers', () => {
  it('q vacío devuelve []', async () => {
    expect(await searchCustomers('  ')).toEqual([]);
  });

  it('encuentra por nombre parcial', async () => {
    await mk({ nombre: 'Ferretería Los Pinos' });
    const hits = await searchCustomers('pinos');
    expect(hits.map((h) => h.nombre)).toContain('Ferretería Los Pinos');
  });

  it('encuentra por teléfono', async () => {
    await mk({ nombre: 'Juan', telefono: '5544332211' });
    const hits = await searchCustomers('554433');
    expect(hits.some((h) => h.telefono === '5544332211')).toBe(true);
  });

  it('encuentra por correo (insensitive)', async () => {
    await mk({ nombre: 'Ana', correo: 'ana@acme.mx' });
    const hits = await searchCustomers('ANA@ACME');
    expect(hits.some((h) => h.correo === 'ana@acme.mx')).toBe(true);
  });

  it('encuentra por prefijo de RFC normalizando el término', async () => {
    await mk({ nombre: 'Moral SA', rfc: 'ABC010101XYZ' });
    const hits = await searchCustomers('abc0101');
    expect(hits.some((h) => h.rfc === 'ABC010101XYZ')).toBe(true);
  });

  it('el cliente genérico aparece primero', async () => {
    await mk({ nombre: 'aaa primero alfabético' });
    const hits = await searchCustomers('a');
    expect(hits[0]?.esGenerico).toBe(true);
  });

  it('excluye archivados salvo incluirArchivados', async () => {
    await mk({ nombre: 'Cliente Viejo', archivado: true });
    expect((await searchCustomers('viejo')).length).toBe(0);
    expect((await searchCustomers('viejo', { incluirArchivados: true })).length).toBe(1);
  });

  it('deriva facturable', async () => {
    await mk({
      nombre: 'Facturable SA',
      rfc: 'ABC010101XYZ',
      razonSocial: 'Facturable SA',
      regimenFiscalCode: '601',
      usoCfdiCode: 'G03',
      cpFiscal: '06000',
    });
    const hit = (await searchCustomers('facturable')).find((h) => h.nombre === 'Facturable SA');
    expect(hit?.facturable).toBe(true);
  });
});
```

- [ ] **Step 2: Ejecutar y verificar que falla**

Run: `npm run test:integration -- src/lib/customers/search.itest.ts`
Expected: FAIL — módulo inexistente.

- [ ] **Step 3: Escribir `src/lib/customers/search.ts`**

```ts
import { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { normalizarRfc, bloqueFiscalCompleto } from '@/lib/customers/fiscal';

export type CustomerHit = {
  id: string;
  nombre: string;
  telefono: string | null;
  correo: string | null;
  rfc: string | null;
  facturable: boolean;
  esGenerico: boolean;
};

/**
 * Busca clientes por nombre (contains, insensitive), teléfono (contains),
 * correo (contains, insensitive) o prefijo de RFC (normalizado). Excluye
 * archivados salvo `incluirArchivados`. `limit` (por defecto 20) es el número
 * de resultados devueltos; internamente se sobre-lee `min(max(limit*3, limit),
 * 500)` para que el orden en memoria (genérico primero, luego coincidencia
 * exacta de RFC/teléfono, luego nombre) tenga material suficiente. Un `limit`
 * explícito grande (p. ej. el de `listCustomers`) se respeta.
 *
 * Reutilizable por la pantalla de cajero del Bloque 4.
 */
export async function searchCustomers(
  q: string,
  opts?: { incluirArchivados?: boolean; limit?: number },
): Promise<CustomerHit[]> {
  const term = q.trim();
  if (term === '') return [];

  const limit = opts?.limit ?? 20;
  const overFetch = Math.min(Math.max(limit * 3, limit), 500);
  const rfcNorm = normalizarRfc(term);

  const where: Prisma.CustomerWhereInput = {
    OR: [
      { nombre: { contains: term, mode: 'insensitive' } },
      { telefono: { contains: term } },
      { correo: { contains: term, mode: 'insensitive' } },
      { rfc: { startsWith: rfcNorm } },
    ],
  };
  if (!opts?.incluirArchivados) where.archivado = false;

  const rows = await db.customer.findMany({ where, take: overFetch });

  const hits = rows.map((c): CustomerHit => ({
    id: c.id,
    nombre: c.nombre,
    telefono: c.telefono,
    correo: c.correo,
    rfc: c.rfc,
    facturable: bloqueFiscalCompleto(c),
    esGenerico: c.esGenerico,
  }));

  hits.sort((a, b) => {
    if (a.esGenerico !== b.esGenerico) return a.esGenerico ? -1 : 1;
    const aExact = a.rfc === rfcNorm || a.telefono === term;
    const bExact = b.rfc === rfcNorm || b.telefono === term;
    if (aExact !== bExact) return aExact ? -1 : 1;
    return a.nombre.localeCompare(b.nombre);
  });

  return hits.slice(0, limit);
}
```

- [ ] **Step 4: Ejecutar y verificar que pasa**

Run: `npm run test:integration -- src/lib/customers/search.itest.ts`
Expected: PASS.

- [ ] **Step 5: typecheck + lint**

Run: `npm run typecheck && npm run lint`
Expected: 0 errores.

- [ ] **Step 6: Commit**

```bash
git add src/lib/customers/search.ts src/lib/customers/search.itest.ts
git commit -m "feat(clientes): búsqueda reutilizable por nombre, teléfono, correo y RFC

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01EnFJHWm8zVoqgkmfwwcRHi"
```

---

## Task 7: Servicio de clientes — `createCustomer` y `getCustomer`

**Files:**
- Create: `src/lib/customers/customers.ts`
- Create: `src/lib/customers/customers.itest.ts`

**Interfaces:**
- Consumes: `db`, `logActivity` (`@/lib/audit`), `ValidationError` (`@/lib/errors`), `CustomerInput` (`@/lib/validation/customer`), `bloqueFiscalCompleto`/`enmascararRfc` (`@/lib/customers/fiscal`), `getRegimenLabel` (`@/lib/sat/regimenes-fiscales`), `getUsoCfdiLabel` (`@/lib/sat/usos-cfdi`).
- Produces:
  - `type CustomerDetail` — todos los campos de `Customer` + `facturable: boolean` + `regimenLabel: string | null` + `usoCfdiLabel: string | null`.
  - `createCustomer(actorId: string, input: CustomerInput, ip: string | null): Promise<{ id: string }>`
  - `getCustomer(id: string): Promise<CustomerDetail | null>`
  - Helper interno `isP2002` / `uniqueField(e): 'telefono' | 'correo' | 'rfc'`.

- [ ] **Step 1: Escribir `src/lib/customers/customers.itest.ts` (falla) — cobertura de create + get**

```ts
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { db } from '@/lib/db';
import { ValidationError } from '@/lib/errors';
import { createCustomer, getCustomer } from './customers';
import type { CustomerInput } from '@/lib/validation/customer';

const ACTOR = 'seed-actor';

function input(over: Partial<CustomerInput> = {}): CustomerInput {
  return {
    nombre: 'Cliente Prueba',
    telefono: null, correo: null, direccion: null, notas: null,
    rfc: null, razonSocial: null, regimenFiscalCode: null,
    usoCfdiCode: null, cpFiscal: null, correoFacturacion: null,
    ...over,
  } as CustomerInput;
}

const fiscalFull: Partial<CustomerInput> = {
  rfc: 'ABC010101XYZ',
  razonSocial: 'ACME SA',
  regimenFiscalCode: '601',
  usoCfdiCode: 'G03',
  cpFiscal: '06000',
};

beforeEach(async () => {
  await db.activityLog.deleteMany();
  await db.customer.deleteMany({ where: { esGenerico: false } });
});
afterAll(async () => {
  await db.activityLog.deleteMany();
  await db.customer.deleteMany({ where: { esGenerico: false } });
});

describe('createCustomer', () => {
  it('crea sin datos fiscales: facturable = false, sin auditoría fiscal', async () => {
    const { id } = await createCustomer(ACTOR, input(), null);
    const detail = await getCustomer(id);
    expect(detail?.facturable).toBe(false);

    const logs = await db.activityLog.findMany({ where: { entidadId: id } });
    const acciones = logs.map((l) => l.accion);
    expect(acciones).toContain('clientes.crear');
    expect(acciones).not.toContain('clientes.datos_fiscales');
    const crear = logs.find((l) => l.accion === 'clientes.crear');
    expect((crear?.metadata as { facturable: boolean }).facturable).toBe(false);
  });

  it('crea con bloque fiscal completo: facturable = true, auditoría fiscal con RFC enmascarado', async () => {
    const { id } = await createCustomer(ACTOR, input(fiscalFull), null);
    const detail = await getCustomer(id);
    expect(detail?.facturable).toBe(true);
    expect(detail?.regimenLabel).toContain('Personas Morales');

    const logs = await db.activityLog.findMany({ where: { entidadId: id } });
    const fiscal = logs.find((l) => l.accion === 'clientes.datos_fiscales');
    expect(fiscal).toBeDefined();
    const meta = JSON.stringify(fiscal?.metadata);
    expect(meta).not.toContain('ABC010101XYZ');
    expect(meta).toContain('ABC******XYZ');
  });

  it('teléfono duplicado: ValidationError en telefono, nada creado', async () => {
    await createCustomer(ACTOR, input({ telefono: '5544332211' }), null);
    await expect(
      createCustomer(ACTOR, input({ nombre: 'Otro', telefono: '5544332211' }), null),
    ).rejects.toMatchObject({ fields: { telefono: expect.any(String) } });
    expect(await db.customer.count({ where: { telefono: '5544332211' } })).toBe(1);
  });

  it('correo duplicado: ValidationError en correo', async () => {
    await createCustomer(ACTOR, input({ correo: 'dup@acme.mx' }), null);
    await expect(
      createCustomer(ACTOR, input({ nombre: 'X', correo: 'dup@acme.mx' }), null),
    ).rejects.toMatchObject({ fields: { correo: expect.any(String) } });
  });

  it('RFC duplicado: ValidationError en rfc', async () => {
    await createCustomer(ACTOR, input(fiscalFull), null);
    await expect(
      createCustomer(ACTOR, input({ ...fiscalFull, nombre: 'Otra' }), null),
    ).rejects.toMatchObject({ fields: { rfc: expect.any(String) } });
  });
});

describe('getCustomer', () => {
  it('devuelve null si no existe', async () => {
    expect(await getCustomer('no-existe')).toBeNull();
  });
});
```

- [ ] **Step 2: Ejecutar y verificar que falla**

Run: `npm run test:integration -- src/lib/customers/customers.itest.ts`
Expected: FAIL — módulo inexistente.

- [ ] **Step 3: Escribir `src/lib/customers/customers.ts` (solo create + get de momento)**

```ts
import { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { logActivity } from '@/lib/audit';
import { ValidationError } from '@/lib/errors';
import type { CustomerInput } from '@/lib/validation/customer';
import { bloqueFiscalCompleto, enmascararRfc } from '@/lib/customers/fiscal';
import { getRegimenLabel } from '@/lib/sat/regimenes-fiscales';
import { getUsoCfdiLabel } from '@/lib/sat/usos-cfdi';

export type CustomerDetail = {
  id: string;
  nombre: string;
  telefono: string | null;
  correo: string | null;
  direccion: string | null;
  notas: string | null;
  rfc: string | null;
  razonSocial: string | null;
  regimenFiscalCode: string | null;
  usoCfdiCode: string | null;
  cpFiscal: string | null;
  correoFacturacion: string | null;
  esGenerico: boolean;
  archivado: boolean;
  createdAt: Date;
  facturable: boolean;
  regimenLabel: string | null;
  usoCfdiLabel: string | null;
};

function isP2002(e: unknown): e is Prisma.PrismaClientKnownRequestError {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';
}

function uniqueField(e: Prisma.PrismaClientKnownRequestError): 'telefono' | 'correo' | 'rfc' {
  const target = e.meta?.target;
  const parts = Array.isArray(target) ? target.map(String) : [String(target ?? '')];
  if (parts.some((t) => t.includes('correo'))) return 'correo';
  if (parts.some((t) => t.includes('rfc'))) return 'rfc';
  return 'telefono';
}

const FISCAL_KEYS = [
  'rfc', 'razonSocial', 'regimenFiscalCode', 'usoCfdiCode', 'cpFiscal', 'correoFacturacion',
] as const;

function fiscalMetadata(src: {
  rfc: string | null;
  razonSocial: string | null;
  regimenFiscalCode: string | null;
  usoCfdiCode: string | null;
  cpFiscal: string | null;
  correoFacturacion: string | null;
}): Record<string, unknown> {
  return {
    rfc: src.rfc ? enmascararRfc(src.rfc) : null,
    razonSocial: src.razonSocial,
    regimenFiscalCode: src.regimenFiscalCode,
    usoCfdiCode: src.usoCfdiCode,
    cpFiscal: src.cpFiscal,
    correoFacturacion: src.correoFacturacion,
  };
}

export async function createCustomer(
  actorId: string,
  input: CustomerInput,
  ip: string | null,
): Promise<{ id: string }> {
  const facturable = bloqueFiscalCompleto(input);

  return db.$transaction(async (tx) => {
    let customer;
    try {
      customer = await tx.customer.create({
        data: {
          nombre: input.nombre,
          telefono: input.telefono,
          correo: input.correo,
          direccion: input.direccion,
          notas: input.notas,
          rfc: input.rfc,
          razonSocial: input.razonSocial,
          regimenFiscalCode: input.regimenFiscalCode,
          usoCfdiCode: input.usoCfdiCode,
          cpFiscal: input.cpFiscal,
          correoFacturacion: input.correoFacturacion,
          createdById: actorId,
        },
      });
    } catch (e) {
      if (isP2002(e)) throw new ValidationError({ [uniqueField(e)]: 'Ya está en uso.' });
      throw e;
    }

    await logActivity(
      {
        actorId,
        accion: 'clientes.crear',
        entidad: 'Customer',
        entidadId: customer.id,
        metadata: { nombre: input.nombre, facturable },
        ip,
      },
      tx,
    );

    if (facturable) {
      await logActivity(
        {
          actorId,
          accion: 'clientes.datos_fiscales',
          entidad: 'Customer',
          entidadId: customer.id,
          metadata: { despues: fiscalMetadata(input) },
          ip,
        },
        tx,
      );
    }

    return { id: customer.id };
  });
}

export async function getCustomer(id: string): Promise<CustomerDetail | null> {
  const c = await db.customer.findUnique({ where: { id } });
  if (!c) return null;
  return {
    id: c.id,
    nombre: c.nombre,
    telefono: c.telefono,
    correo: c.correo,
    direccion: c.direccion,
    notas: c.notas,
    rfc: c.rfc,
    razonSocial: c.razonSocial,
    regimenFiscalCode: c.regimenFiscalCode,
    usoCfdiCode: c.usoCfdiCode,
    cpFiscal: c.cpFiscal,
    correoFacturacion: c.correoFacturacion,
    esGenerico: c.esGenerico,
    archivado: c.archivado,
    createdAt: c.createdAt,
    facturable: bloqueFiscalCompleto(c),
    regimenLabel: c.regimenFiscalCode ? getRegimenLabel(c.regimenFiscalCode) : null,
    usoCfdiLabel: c.usoCfdiCode ? getUsoCfdiLabel(c.usoCfdiCode) : null,
  };
}

// Reservado para Task 8: export const FISCAL_KEYS ya declarado arriba para updateCustomer.
export { FISCAL_KEYS };
```

> Nota para el implementador: `FISCAL_KEYS` se usa en la Task 8. Si el linter marca "declarado pero no usado" en esta tarea, deja el `export { FISCAL_KEYS }` como arriba (queda usado por el re-export) o muévelo a Task 8. No lo borres.

- [ ] **Step 4: Ejecutar y verificar que pasa**

Run: `npm run test:integration -- src/lib/customers/customers.itest.ts`
Expected: PASS.

- [ ] **Step 5: typecheck + lint**

Run: `npm run typecheck && npm run lint`
Expected: 0 errores.

- [ ] **Step 6: Commit**

```bash
git add src/lib/customers/customers.ts src/lib/customers/customers.itest.ts
git commit -m "feat(clientes): createCustomer y getCustomer con auditoría fiscal enmascarada

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01EnFJHWm8zVoqgkmfwwcRHi"
```

---

## Task 8: Servicio de clientes — `updateCustomer`, `archiveCustomer`, `restoreCustomer`

**Files:**
- Modify: `src/lib/customers/customers.ts` (añadir las 3 funciones)
- Modify: `src/lib/customers/customers.itest.ts` (añadir describe blocks)

**Interfaces:**
- Consumes: lo de Task 7 + `EditCustomerInput` (`@/lib/validation/customer`).
- Produces:
  - `updateCustomer(actorId: string, id: string, input: EditCustomerInput, ip: string | null): Promise<void>`
  - `archiveCustomer(actorId: string, id: string, ip: string | null): Promise<void>`
  - `restoreCustomer(actorId: string, id: string, ip: string | null): Promise<void>`
  - Reglas: cliente `esGenerico` → `updateCustomer` solo permite cambiar `telefono`/`correo`/`direccion`/`notas` (cualquier otro cambio ⇒ `ValidationError({ _form })`); `archiveCustomer` sobre `esGenerico` ⇒ `ValidationError({ _form })`. `updateCustomer` audita `clientes.editar` con `{ antes, despues }` de los campos de contacto que cambiaron, y `clientes.datos_fiscales` con `{ antes, despues }` (RFC enmascarado en ambos lados) si cambió cualquier campo fiscal. `archiveCustomer`/`restoreCustomer` son idempotentes y auditan `clientes.archivar`/`clientes.restaurar`.

- [ ] **Step 1: Añadir tests a `src/lib/customers/customers.itest.ts` (fallan)**

```ts
// ... imports adicionales:
import { updateCustomer, archiveCustomer, restoreCustomer } from './customers';
import type { EditCustomerInput } from '@/lib/validation/customer';

function editInput(id: string, over: Partial<EditCustomerInput> = {}): EditCustomerInput {
  return { id, ...input(over) } as EditCustomerInput;
}

describe('updateCustomer', () => {
  it('cambia solo teléfono: audita clientes.editar con antes/despues, sin auditoría fiscal', async () => {
    const { id } = await createCustomer(ACTOR, input({ telefono: '5500000000' }), null);
    await db.activityLog.deleteMany();
    await updateCustomer(ACTOR, id, editInput(id, { telefono: '5511111111' }), null);

    const logs = await db.activityLog.findMany({ where: { entidadId: id } });
    const editar = logs.find((l) => l.accion === 'clientes.editar');
    expect(editar).toBeDefined();
    const meta = editar!.metadata as { antes: Record<string, unknown>; despues: Record<string, unknown> };
    expect(meta.antes.telefono).toBe('5500000000');
    expect(meta.despues.telefono).toBe('5511111111');
    expect(logs.some((l) => l.accion === 'clientes.datos_fiscales')).toBe(false);
  });

  it('completar el bloque fiscal marca facturable y audita datos_fiscales con RFC enmascarado', async () => {
    const { id } = await createCustomer(ACTOR, input(), null);
    await db.activityLog.deleteMany();
    await updateCustomer(ACTOR, id, editInput(id, {
      rfc: 'ABC010101XYZ', razonSocial: 'ACME', regimenFiscalCode: '601',
      usoCfdiCode: 'G03', cpFiscal: '06000',
    }), null);

    expect((await getCustomer(id))?.facturable).toBe(true);
    const fiscal = await db.activityLog.findFirst({ where: { entidadId: id, accion: 'clientes.datos_fiscales' } });
    const meta = JSON.stringify(fiscal?.metadata);
    expect(meta).toContain('ABC******XYZ');
    expect(meta).not.toContain('ABC010101XYZ');
  });

  it('cliente genérico: cambiar notas OK', async () => {
    const generico = await db.customer.findFirstOrThrow({ where: { esGenerico: true } });
    await updateCustomer(ACTOR, generico.id, editInput(generico.id, {
      nombre: 'Público en General', notas: 'nota nueva',
    }), null);
    const after = await db.customer.findUniqueOrThrow({ where: { id: generico.id } });
    expect(after.notas).toBe('nota nueva');
  });

  it('cliente genérico: cambiar nombre o RFC lanza ValidationError y no muta', async () => {
    const generico = await db.customer.findFirstOrThrow({ where: { esGenerico: true } });
    await expect(
      updateCustomer(ACTOR, generico.id, editInput(generico.id, { nombre: 'Otro Nombre' }), null),
    ).rejects.toBeInstanceOf(ValidationError);
    const after = await db.customer.findUniqueOrThrow({ where: { id: generico.id } });
    expect(after.nombre).toBe('Público en General');
    expect(after.rfc).toBe('XAXX010101000');
  });
});

describe('archiveCustomer / restoreCustomer', () => {
  it('archiva y restaura un cliente normal con auditoría', async () => {
    const { id } = await createCustomer(ACTOR, input(), null);
    await archiveCustomer(ACTOR, id, null);
    expect((await getCustomer(id))?.archivado).toBe(true);
    await restoreCustomer(ACTOR, id, null);
    expect((await getCustomer(id))?.archivado).toBe(false);

    const acciones = (await db.activityLog.findMany({ where: { entidadId: id } })).map((l) => l.accion);
    expect(acciones).toContain('clientes.archivar');
    expect(acciones).toContain('clientes.restaurar');
  });

  it('no archiva el cliente genérico', async () => {
    const generico = await db.customer.findFirstOrThrow({ where: { esGenerico: true } });
    await expect(archiveCustomer(ACTOR, generico.id, null)).rejects.toBeInstanceOf(ValidationError);
    expect((await db.customer.findUniqueOrThrow({ where: { id: generico.id } })).archivado).toBe(false);
  });

  it('archivar es idempotente', async () => {
    const { id } = await createCustomer(ACTOR, input(), null);
    await archiveCustomer(ACTOR, id, null);
    await expect(archiveCustomer(ACTOR, id, null)).resolves.not.toThrow();
    expect((await getCustomer(id))?.archivado).toBe(true);
  });
});
```

- [ ] **Step 2: Ejecutar y verificar que fallan**

Run: `npm run test:integration -- src/lib/customers/customers.itest.ts`
Expected: FAIL — funciones inexistentes.

- [ ] **Step 3: Añadir a `src/lib/customers/customers.ts`**

```ts
import type { EditCustomerInput } from '@/lib/validation/customer';

const CONTACTO_KEYS = ['nombre', 'telefono', 'correo', 'direccion', 'notas'] as const;
const GENERICO_EDITABLE = new Set(['telefono', 'correo', 'direccion', 'notas']);

export async function updateCustomer(
  actorId: string,
  id: string,
  input: EditCustomerInput,
  ip: string | null,
): Promise<void> {
  await db.$transaction(async (tx) => {
    const current = await tx.customer.findUnique({ where: { id } });
    if (!current) throw new ValidationError({ _form: 'El cliente no existe.' });

    const next = {
      nombre: input.nombre,
      telefono: input.telefono,
      correo: input.correo,
      direccion: input.direccion,
      notas: input.notas,
      rfc: input.rfc,
      razonSocial: input.razonSocial,
      regimenFiscalCode: input.regimenFiscalCode,
      usoCfdiCode: input.usoCfdiCode,
      cpFiscal: input.cpFiscal,
      correoFacturacion: input.correoFacturacion,
    };

    if (current.esGenerico) {
      const changedKeys = Object.keys(next).filter(
        (k) => (current as Record<string, unknown>)[k] !== (next as Record<string, unknown>)[k],
      );
      if (changedKeys.some((k) => !GENERICO_EDITABLE.has(k))) {
        throw new ValidationError({
          _form: 'El cliente Público en General tiene campos fijos; solo puedes editar contacto y notas.',
        });
      }
    }

    try {
      await tx.customer.update({ where: { id }, data: next });
    } catch (e) {
      if (isP2002(e)) throw new ValidationError({ [uniqueField(e)]: 'Ya está en uso.' });
      throw e;
    }

    // Auditoría de contacto
    const antesC: Record<string, unknown> = {};
    const despuesC: Record<string, unknown> = {};
    for (const k of CONTACTO_KEYS) {
      if ((current as Record<string, unknown>)[k] !== next[k]) {
        antesC[k] = (current as Record<string, unknown>)[k];
        despuesC[k] = next[k];
      }
    }
    if (Object.keys(despuesC).length > 0) {
      await logActivity(
        {
          actorId, accion: 'clientes.editar', entidad: 'Customer', entidadId: id,
          metadata: { antes: antesC, despues: despuesC }, ip,
        },
        tx,
      );
    }

    // Auditoría fiscal (RFC enmascarado en ambos lados)
    const fiscalCambio = FISCAL_KEYS.some(
      (k) => (current as Record<string, unknown>)[k] !== next[k],
    );
    if (fiscalCambio) {
      await logActivity(
        {
          actorId, accion: 'clientes.datos_fiscales', entidad: 'Customer', entidadId: id,
          metadata: { antes: fiscalMetadata(current), despues: fiscalMetadata(next) }, ip,
        },
        tx,
      );
    }
  });
}

async function setArchived(
  actorId: string,
  id: string,
  archivado: boolean,
  accion: 'clientes.archivar' | 'clientes.restaurar',
  ip: string | null,
): Promise<void> {
  await db.$transaction(async (tx) => {
    const current = await tx.customer.findUnique({ where: { id } });
    if (!current) throw new ValidationError({ _form: 'El cliente no existe.' });
    if (archivado && current.esGenerico) {
      throw new ValidationError({ _form: 'No se puede archivar el cliente Público en General.' });
    }
    if (current.archivado === archivado) return; // idempotente
    await tx.customer.update({ where: { id }, data: { archivado } });
    await logActivity(
      { actorId, accion, entidad: 'Customer', entidadId: id, metadata: { customerId: id }, ip },
      tx,
    );
  });
}

export function archiveCustomer(actorId: string, id: string, ip: string | null): Promise<void> {
  return setArchived(actorId, id, true, 'clientes.archivar', ip);
}

export function restoreCustomer(actorId: string, id: string, ip: string | null): Promise<void> {
  return setArchived(actorId, id, false, 'clientes.restaurar', ip);
}
```

> `fiscalMetadata` (de Task 7) acepta el shape de `current` (modelo Prisma) y de `next`; ambos tienen los 6 campos fiscales. Ajusta la firma de `fiscalMetadata` a `Pick<Customer, typeof FISCAL_KEYS[number]>` o a un tipo estructural que ambos cumplan.

- [ ] **Step 4: Ejecutar y verificar que pasa**

Run: `npm run test:integration -- src/lib/customers/customers.itest.ts`
Expected: PASS (todos los describe).

- [ ] **Step 5: typecheck + lint**

Run: `npm run typecheck && npm run lint`
Expected: 0 errores. Elimina el re-export temporal `export { FISCAL_KEYS }` de Task 7 si ahora `FISCAL_KEYS` ya se usa dentro del módulo.

- [ ] **Step 6: Commit**

```bash
git add src/lib/customers/customers.ts src/lib/customers/customers.itest.ts
git commit -m "feat(clientes): updateCustomer/archive/restore con protección del cliente genérico

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01EnFJHWm8zVoqgkmfwwcRHi"
```

---

## Task 9: Servicio de clientes — `listCustomers`

**Files:**
- Modify: `src/lib/customers/customers.ts` (añadir `listCustomers` + tipos `CustomerRow`, `ListCustomersFilter`)
- Modify: `src/lib/customers/customers.itest.ts` (añadir describe block)

**Interfaces:**
- Consumes: lo anterior + `searchCustomers` (`@/lib/customers/search`).
- Produces:
  - `type CustomerRow = { id: string; nombre: string; telefono: string | null; correo: string | null; rfc: string | null; facturable: boolean; esGenerico: boolean; estado: 'activo' | 'archivado' }`
  - `type ListCustomersFilter = { q?: string; estado?: 'activos' | 'archivados' | 'todos'; soloFacturables?: boolean; page: number; pageSize: number }`
  - `listCustomers(filtro: ListCustomersFilter): Promise<{ rows: CustomerRow[]; total: number }>` — `estado` por defecto `activos` (`archivado: false`); `soloFacturables` ⇒ `where` con los 5 campos núcleo `{ not: null }`; `q` ⇒ ids vía `searchCustomers(q, { incluirArchivados: true, limit: 200 })` → `where.id.in` (ids vacío ⇒ `{ rows: [], total: 0 }`); orden `[{ esGenerico: 'desc' }, { nombre: 'asc' }]`; `total` = `count({ where })`; paginación `skip`/`take`.

- [ ] **Step 1: Añadir tests a `src/lib/customers/customers.itest.ts` (fallan)**

```ts
import { listCustomers } from './customers';

describe('listCustomers', () => {
  it('filtro estado: activos por defecto, archivados y todos', async () => {
    const { id: activoId } = await createCustomer(ACTOR, input({ nombre: 'Activo Uno' }), null);
    const { id: archId } = await createCustomer(ACTOR, input({ nombre: 'Archivado Uno' }), null);
    await archiveCustomer(ACTOR, archId, null);

    const activos = await listCustomers({ estado: 'activos', page: 1, pageSize: 50 });
    expect(activos.rows.some((r) => r.id === activoId)).toBe(true);
    expect(activos.rows.some((r) => r.id === archId)).toBe(false);

    const archivados = await listCustomers({ estado: 'archivados', page: 1, pageSize: 50 });
    expect(archivados.rows.every((r) => r.estado === 'archivado')).toBe(true);
    expect(archivados.rows.some((r) => r.id === archId)).toBe(true);

    const todos = await listCustomers({ estado: 'todos', page: 1, pageSize: 50 });
    expect(todos.rows.some((r) => r.id === activoId)).toBe(true);
    expect(todos.rows.some((r) => r.id === archId)).toBe(true);
  });

  it('soloFacturables devuelve únicamente clientes con bloque fiscal completo', async () => {
    await createCustomer(ACTOR, input({ nombre: 'Sin Fiscal' }), null);
    const { id: facId } = await createCustomer(ACTOR, input({
      nombre: 'Con Fiscal', rfc: 'ABC010101XYZ', razonSocial: 'ACME',
      regimenFiscalCode: '601', usoCfdiCode: 'G03', cpFiscal: '06000',
    }), null);
    const { rows } = await listCustomers({ soloFacturables: true, estado: 'todos', page: 1, pageSize: 50 });
    expect(rows.every((r) => r.facturable)).toBe(true);
    expect(rows.some((r) => r.id === facId)).toBe(true);
  });

  it('q filtra por nombre', async () => {
    await createCustomer(ACTOR, input({ nombre: 'Distribuidora Zeta' }), null);
    const { rows } = await listCustomers({ q: 'zeta', estado: 'todos', page: 1, pageSize: 50 });
    expect(rows.some((r) => r.nombre === 'Distribuidora Zeta')).toBe(true);
  });

  it('q sin coincidencias devuelve vacío', async () => {
    const res = await listCustomers({ q: 'no-existe-xyz-999', page: 1, pageSize: 50 });
    expect(res).toEqual({ rows: [], total: 0 });
  });

  it('el cliente genérico aparece primero', async () => {
    await createCustomer(ACTOR, input({ nombre: 'aaa alfabéticamente primero' }), null);
    const { rows } = await listCustomers({ estado: 'todos', page: 1, pageSize: 50 });
    expect(rows[0]?.esGenerico).toBe(true);
  });
});
```

- [ ] **Step 2: Ejecutar y verificar que fallan**

Run: `npm run test:integration -- src/lib/customers/customers.itest.ts`
Expected: FAIL — `listCustomers` inexistente.

- [ ] **Step 3: Añadir a `src/lib/customers/customers.ts`**

```ts
import { Prisma } from '@prisma/client'; // ya importado
import { searchCustomers } from '@/lib/customers/search';

export type CustomerRow = {
  id: string;
  nombre: string;
  telefono: string | null;
  correo: string | null;
  rfc: string | null;
  facturable: boolean;
  esGenerico: boolean;
  estado: 'activo' | 'archivado';
};

export type ListCustomersFilter = {
  q?: string;
  estado?: 'activos' | 'archivados' | 'todos';
  soloFacturables?: boolean;
  page: number;
  pageSize: number;
};

export async function listCustomers(
  filtro: ListCustomersFilter,
): Promise<{ rows: CustomerRow[]; total: number }> {
  const { q, estado = 'activos', soloFacturables, page, pageSize } = filtro;

  const where: Prisma.CustomerWhereInput = {};
  if (estado === 'activos') where.archivado = false;
  else if (estado === 'archivados') where.archivado = true;

  if (soloFacturables) {
    where.rfc = { not: null };
    where.razonSocial = { not: null };
    where.regimenFiscalCode = { not: null };
    where.usoCfdiCode = { not: null };
    where.cpFiscal = { not: null };
  }

  if (q !== undefined && q.trim() !== '') {
    const hits = await searchCustomers(q, { incluirArchivados: true, limit: 200 });
    const ids = hits.map((h) => h.id);
    if (ids.length === 0) return { rows: [], total: 0 };
    where.id = { in: ids };
  }

  const skip = (page - 1) * pageSize;
  const [total, rows] = await Promise.all([
    db.customer.count({ where }),
    db.customer.findMany({
      where,
      orderBy: [{ esGenerico: 'desc' }, { nombre: 'asc' }],
      skip,
      take: pageSize,
    }),
  ]);

  return {
    rows: rows.map((c): CustomerRow => ({
      id: c.id,
      nombre: c.nombre,
      telefono: c.telefono,
      correo: c.correo,
      rfc: c.rfc,
      facturable: bloqueFiscalCompleto(c),
      esGenerico: c.esGenerico,
      estado: c.archivado ? 'archivado' : 'activo',
    })),
    total,
  };
}
```

- [ ] **Step 4: Ejecutar y verificar que pasa**

Run: `npm run test:integration -- src/lib/customers/customers.itest.ts`
Expected: PASS.

- [ ] **Step 5: Suite completa**

Run: `npm run typecheck && npm run lint && npm run test:unit && npm run test:integration && npm run build`
Expected: 0 errores; todo verde.

- [ ] **Step 6: Commit**

```bash
git add src/lib/customers/customers.ts src/lib/customers/customers.itest.ts
git commit -m "feat(clientes): listCustomers con filtros de estado, facturables y búsqueda

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01EnFJHWm8zVoqgkmfwwcRHi"
```

---

## Task 10: Server Actions (`clientes/actions.ts`)

**Files:**
- Create: `src/app/(app)/clientes/actions.ts`
- Create: `src/app/(app)/clientes/actions.itest.ts`

**Interfaces:**
- Consumes: `requirePermission` (`@/lib/auth/context`), `getClientIp` (`@/lib/http`), `ValidationError` (`@/lib/errors`), `customerSchema`/`editCustomerSchema` (`@/lib/validation/customer`), `createCustomer`/`updateCustomer`/`archiveCustomer`/`restoreCustomer` (`@/lib/customers/customers`), `type FormState` (`@/app/(auth)/setup/actions`).
- Produces (todas `(_prev: FormState, formData: FormData) => Promise<FormState>`):
  - `crearClienteAction` — `requirePermission('clientes.crear')`; parsea con `customerSchema`; `redirect('/clientes/<id>')` fuera de try/catch.
  - `editarClienteAction` — `requirePermission('clientes.editar')`; `editCustomerSchema`; `revalidatePath`; devuelve `{ ok: true }`.
  - `archivarClienteAction` / `restaurarClienteAction` — `requirePermission('clientes.archivar')`; leen `id`; `revalidatePath`.
  - Helpers locales `fieldErrorsFrom(ZodError)` y `fromValidationError(ValidationError)` (copiar el idioma de `@/app/(app)/productos/actions.ts`).

- [ ] **Step 1: Escribir `src/app/(app)/clientes/actions.itest.ts` (falla) — foco RBAC**

```ts
import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import { db } from '@/lib/db';
import { hashPassword } from '@/lib/auth/password';
import { createSession } from '@/lib/auth/session';

const cookieStore = { value: undefined as string | undefined };
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: () => (cookieStore.value ? { value: cookieStore.value } : undefined) }),
  headers: async () => new Headers(),
}));
vi.mock('next/cache', () => ({ revalidatePath: () => {} }));
const redirectMock = vi.fn((url: string) => { throw new Error(`REDIRECT:${url}`); });
vi.mock('next/navigation', () => ({ redirect: (u: string) => redirectMock(u) }));

import { crearClienteAction, editarClienteAction, archivarClienteAction } from './actions';

async function userConRol(nombre: string, email: string) {
  const role = await db.role.findFirstOrThrow({ where: { nombre } });
  const u = await db.user.create({
    data: { nombre: email, email, passwordHash: await hashPassword('xxxxxxxxxx'), roleId: role.id },
  });
  cookieStore.value = (await createSession(u.id, {})).token;
  return u;
}

function fd(obj: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(obj)) f.set(k, v);
  return f;
}

beforeEach(async () => {
  await db.activityLog.deleteMany();
  await db.customer.deleteMany({ where: { esGenerico: false } });
  await db.session.deleteMany();
  await db.user.deleteMany();
  redirectMock.mockClear();
});
afterAll(async () => {
  await db.customer.deleteMany({ where: { esGenerico: false } });
  await db.user.deleteMany();
});

describe('RBAC de las acciones de clientes', () => {
  it('Empleado no puede crear (ForbiddenError)', async () => {
    await userConRol('Empleado', 'empleado@pos.com');
    await expect(crearClienteAction({ ok: false }, fd({ nombre: 'Nuevo Cliente' }))).rejects.toMatchObject({
      name: 'ForbiddenError',
    });
    expect(await db.customer.count({ where: { esGenerico: false } })).toBe(0);
  });

  it('Cajero puede crear pero no editar ni archivar', async () => {
    await userConRol('Cajero', 'cajero@pos.com');
    await expect(
      crearClienteAction({ ok: false }, fd({ nombre: 'Cliente del Cajero' })),
    ).rejects.toThrow(/REDIRECT:\/clientes\//);
    const creado = await db.customer.findFirstOrThrow({ where: { nombre: 'Cliente del Cajero' } });

    await expect(
      editarClienteAction({ ok: false }, fd({ id: creado.id, nombre: 'Cambiado' })),
    ).rejects.toMatchObject({ name: 'ForbiddenError' });
    await expect(
      archivarClienteAction({ ok: false }, fd({ id: creado.id })),
    ).rejects.toMatchObject({ name: 'ForbiddenError' });
  });

  it('Gerente puede crear, editar y archivar', async () => {
    await userConRol('Gerente', 'gerente@pos.com');
    await expect(
      crearClienteAction({ ok: false }, fd({ nombre: 'Cliente Gerente' })),
    ).rejects.toThrow(/REDIRECT:/);
    const creado = await db.customer.findFirstOrThrow({ where: { nombre: 'Cliente Gerente' } });

    const edit = await editarClienteAction({ ok: false }, fd({ id: creado.id, nombre: 'Cliente Gerente 2' }));
    expect(edit.ok).toBe(true);

    const arch = await archivarClienteAction({ ok: false }, fd({ id: creado.id }));
    expect(arch.ok).toBe(true);
    expect((await db.customer.findUniqueOrThrow({ where: { id: creado.id } })).archivado).toBe(true);
  });

  it('validación: nombre corto devuelve fieldErrors, sin redirect', async () => {
    await userConRol('Gerente', 'g2@pos.com');
    const res = await crearClienteAction({ ok: false }, fd({ nombre: 'A' }));
    expect(res.ok).toBe(false);
    expect(res.fieldErrors?.nombre).toBeTruthy();
    expect(redirectMock).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Ejecutar y verificar que falla**

Run: `npm run test:integration -- src/app/(app)/clientes/actions.itest.ts`
Expected: FAIL — módulo inexistente.

- [ ] **Step 3: Escribir `src/app/(app)/clientes/actions.ts`**

```ts
'use server';

import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import type { z } from 'zod';
import { requirePermission } from '@/lib/auth/context';
import { getClientIp } from '@/lib/http';
import { ValidationError } from '@/lib/errors';
import { customerSchema, editCustomerSchema } from '@/lib/validation/customer';
import {
  createCustomer,
  updateCustomer,
  archiveCustomer,
  restoreCustomer,
} from '@/lib/customers/customers';
import type { FormState } from '@/app/(auth)/setup/actions';

const CLIENTES_PATH = '/clientes';
const idPath = (id: string) => `/clientes/${id}`;

function fieldErrorsFrom(error: z.ZodError): Record<string, string> {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.map(String).join('.');
    if (key && !(key in fieldErrors)) fieldErrors[key] = issue.message;
  }
  return fieldErrors;
}

function fromValidationError(e: ValidationError): FormState {
  const { _form, ...fieldErrors } = e.fields;
  return { ok: false, formError: _form || undefined, fieldErrors };
}

async function ip(): Promise<string | null> {
  return getClientIp(await headers());
}

function readCustomerFields(formData: FormData) {
  return {
    nombre: formData.get('nombre'),
    telefono: formData.get('telefono') ?? undefined,
    correo: formData.get('correo') ?? undefined,
    direccion: formData.get('direccion') ?? undefined,
    notas: formData.get('notas') ?? undefined,
    rfc: formData.get('rfc') ?? undefined,
    razonSocial: formData.get('razonSocial') ?? undefined,
    regimenFiscalCode: formData.get('regimenFiscalCode') ?? undefined,
    usoCfdiCode: formData.get('usoCfdiCode') ?? undefined,
    cpFiscal: formData.get('cpFiscal') ?? undefined,
    correoFacturacion: formData.get('correoFacturacion') ?? undefined,
  };
}

export async function crearClienteAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const actor = await requirePermission('clientes.crear');

  const parsed = customerSchema.safeParse(readCustomerFields(formData));
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsFrom(parsed.error) };

  let newId: string;
  try {
    const { id } = await createCustomer(actor.id, parsed.data, await ip());
    newId = id;
  } catch (e) {
    if (e instanceof ValidationError) return fromValidationError(e);
    throw e;
  }

  revalidatePath(CLIENTES_PATH);
  redirect(idPath(newId));
}

export async function editarClienteAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const actor = await requirePermission('clientes.editar');

  const parsed = editCustomerSchema.safeParse({
    id: formData.get('id'),
    ...readCustomerFields(formData),
  });
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsFrom(parsed.error) };

  try {
    await updateCustomer(actor.id, parsed.data.id, parsed.data, await ip());
    revalidatePath(CLIENTES_PATH);
    revalidatePath(idPath(parsed.data.id));
    return { ok: true };
  } catch (e) {
    if (e instanceof ValidationError) return fromValidationError(e);
    throw e;
  }
}

export async function archivarClienteAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const actor = await requirePermission('clientes.archivar');
  const id = String(formData.get('id') ?? '');
  if (!id) return { ok: false, formError: 'Cliente no válido.' };

  try {
    await archiveCustomer(actor.id, id, await ip());
    revalidatePath(CLIENTES_PATH);
    revalidatePath(idPath(id));
    return { ok: true };
  } catch (e) {
    if (e instanceof ValidationError) return fromValidationError(e);
    throw e;
  }
}

export async function restaurarClienteAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const actor = await requirePermission('clientes.archivar');
  const id = String(formData.get('id') ?? '');
  if (!id) return { ok: false, formError: 'Cliente no válido.' };

  try {
    await restoreCustomer(actor.id, id, await ip());
    revalidatePath(CLIENTES_PATH);
    revalidatePath(idPath(id));
    return { ok: true };
  } catch (e) {
    if (e instanceof ValidationError) return fromValidationError(e);
    throw e;
  }
}
```

- [ ] **Step 4: Ejecutar y verificar que pasa**

Run: `npm run test:integration -- src/app/(app)/clientes/actions.itest.ts`
Expected: PASS.

- [ ] **Step 5: typecheck + lint**

Run: `npm run typecheck && npm run lint`
Expected: 0 errores.

- [ ] **Step 6: Commit**

```bash
git add "src/app/(app)/clientes/actions.ts" "src/app/(app)/clientes/actions.itest.ts"
git commit -m "feat(clientes): server actions de alta, edición y archivado con RBAC

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01EnFJHWm8zVoqgkmfwwcRHi"
```

---

## Task 11: Pantallas de clientes (listado, alta, detalle, formulario)

**Files:**
- Create: `src/app/(app)/clientes/CustomerRow.tsx`
- Create: `src/app/(app)/clientes/CustomerForm.tsx`
- Create: `src/app/(app)/clientes/ClienteAdminActions.tsx`
- Create: `src/app/(app)/clientes/page.tsx`
- Create: `src/app/(app)/clientes/nuevo/page.tsx`
- Create: `src/app/(app)/clientes/[id]/page.tsx`

**Interfaces:**
- Consumes: `requirePermission`/`getCurrentUser` (`@/lib/auth/context`), `can` (`@/lib/auth/rbac`), `listCustomers`/`getCustomer` (`@/lib/customers/customers`), `REGIMENES_FISCALES` (`@/lib/sat/regimenes-fiscales`), `USOS_CFDI` (`@/lib/sat/usos-cfdi`), `DataTable`/`Column`/`Pagination`/`PermissionGate` (`@/components/*`), las 4 acciones de Task 10.
- Produces: rutas `/clientes`, `/clientes/nuevo`, `/clientes/[id]`. No exporta símbolos consumidos por tareas posteriores.
- Patrón: seguir `src/app/(app)/productos/{page.tsx,[id]/page.tsx,ProductForm.tsx,ProductAdminActions.tsx}` (leídos como referencia). `export const dynamic = 'force-dynamic'`; `requirePermission(...)` primera sentencia; `redirect()`/`notFound()` fuera de try/catch.

- [ ] **Step 1: `CustomerRow.tsx` (client component de fila para `DataTable`)**

Réplica del idioma de `src/app/(app)/productos/ProductRow.tsx`. Renderiza `<tr>` con celdas: nombre, teléfono (`— ` si null), correo (`—`), rfc (`—`), badge Facturable (verde "Sí" / gris "No"), badge Estado (verde "Activo" / gris "Archivado"). `props: { row: CustomerRow; href: string }`. Usa `rowComponent` en `DataTable`.

- [ ] **Step 2: `CustomerForm.tsx` (`'use client'`)**

```tsx
'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { REGIMENES_FISCALES } from '@/lib/sat/regimenes-fiscales';
import { USOS_CFDI } from '@/lib/sat/usos-cfdi';
import { crearClienteAction, editarClienteAction } from './actions';
import type { FormState } from '@/app/(auth)/setup/actions';

type Initial = {
  id: string;
  nombre: string;
  telefono: string | null;
  correo: string | null;
  direccion: string | null;
  notas: string | null;
  rfc: string | null;
  razonSocial: string | null;
  regimenFiscalCode: string | null;
  usoCfdiCode: string | null;
  cpFiscal: string | null;
  correoFacturacion: string | null;
};

const inputClass =
  'block w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm outline-none focus:border-slate-500 focus:ring-1 focus:ring-slate-500';

function Err({ msg }: { msg?: string }) {
  return msg ? <p className="mt-1 text-xs text-red-600">{msg}</p> : null;
}

function SubmitBtn({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-slate-700 disabled:opacity-60"
    >
      {pending ? 'Guardando…' : label}
    </button>
  );
}

export function CustomerForm({
  mode,
  initial,
  readOnly = false,
}: {
  mode: 'crear' | 'editar';
  initial?: Initial;
  readOnly?: boolean;
}) {
  const action = mode === 'crear' ? crearClienteAction : editarClienteAction;
  const [state, formAction] = useActionState<FormState, FormData>(action, { ok: false });
  const fe = state.fieldErrors ?? {};

  const fiscalConDatos = Boolean(
    initial?.rfc || initial?.razonSocial || initial?.regimenFiscalCode ||
    initial?.usoCfdiCode || initial?.cpFiscal,
  );
  const [fiscalOpen, setFiscalOpen] = useState(fiscalConDatos);

  return (
    <form action={formAction} className="space-y-6">
      {mode === 'editar' && initial ? <input type="hidden" name="id" value={initial.id} /> : null}
      {state.formError ? (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{state.formError}</p>
      ) : null}
      {state.ok ? (
        <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">Cambios guardados.</p>
      ) : null}

      <fieldset className="space-y-4" disabled={readOnly}>
        <legend className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Datos de contacto
        </legend>
        <label className="block space-y-1">
          <span className="text-sm font-medium text-slate-700">Nombre *</span>
          <input name="nombre" defaultValue={initial?.nombre ?? ''} className={inputClass} required />
          <Err msg={fe.nombre} />
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block space-y-1">
            <span className="text-sm font-medium text-slate-700">Teléfono</span>
            <input name="telefono" defaultValue={initial?.telefono ?? ''} className={inputClass} />
            <Err msg={fe.telefono} />
          </label>
          <label className="block space-y-1">
            <span className="text-sm font-medium text-slate-700">Correo</span>
            <input name="correo" type="email" defaultValue={initial?.correo ?? ''} className={inputClass} />
            <Err msg={fe.correo} />
          </label>
        </div>
        <label className="block space-y-1">
          <span className="text-sm font-medium text-slate-700">Dirección</span>
          <input name="direccion" defaultValue={initial?.direccion ?? ''} className={inputClass} />
          <Err msg={fe.direccion} />
        </label>
        <label className="block space-y-1">
          <span className="text-sm font-medium text-slate-700">Notas</span>
          <textarea name="notas" defaultValue={initial?.notas ?? ''} rows={3} className={inputClass} />
          <Err msg={fe.notas} />
        </label>
      </fieldset>

      <div className="rounded-lg border border-slate-200">
        <button
          type="button"
          onClick={() => setFiscalOpen((v) => !v)}
          className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-semibold text-slate-700"
        >
          Datos de facturación (CFDI)
          <span className="text-slate-400">{fiscalOpen ? '▲' : '▼'}</span>
        </button>
        <fieldset
          className={`space-y-4 px-4 pb-4 ${fiscalOpen ? '' : 'hidden'}`}
          disabled={readOnly}
        >
          <p className="text-xs text-slate-500">
            Deja esta sección vacía si el cliente no requiere factura. Si capturas un dato, se
            piden todos.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block space-y-1">
              <span className="text-sm font-medium text-slate-700">RFC</span>
              <input name="rfc" defaultValue={initial?.rfc ?? ''} className={inputClass} />
              <Err msg={fe.rfc} />
            </label>
            <label className="block space-y-1">
              <span className="text-sm font-medium text-slate-700">Razón social</span>
              <input name="razonSocial" defaultValue={initial?.razonSocial ?? ''} className={inputClass} />
              <Err msg={fe.razonSocial} />
            </label>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block space-y-1">
              <span className="text-sm font-medium text-slate-700">Régimen fiscal</span>
              <select name="regimenFiscalCode" defaultValue={initial?.regimenFiscalCode ?? ''} className={inputClass}>
                <option value="">— Selecciona —</option>
                {REGIMENES_FISCALES.map((r) => (
                  <option key={r.code} value={r.code}>{r.code} — {r.label}</option>
                ))}
              </select>
              <Err msg={fe.regimenFiscalCode} />
            </label>
            <label className="block space-y-1">
              <span className="text-sm font-medium text-slate-700">Uso de CFDI</span>
              <select name="usoCfdiCode" defaultValue={initial?.usoCfdiCode ?? ''} className={inputClass}>
                <option value="">— Selecciona —</option>
                {USOS_CFDI.map((u) => (
                  <option key={u.code} value={u.code}>{u.code} — {u.label}</option>
                ))}
              </select>
              <Err msg={fe.usoCfdiCode} />
            </label>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block space-y-1">
              <span className="text-sm font-medium text-slate-700">Código postal fiscal</span>
              <input name="cpFiscal" defaultValue={initial?.cpFiscal ?? ''} className={inputClass} inputMode="numeric" />
              <Err msg={fe.cpFiscal} />
            </label>
            <label className="block space-y-1">
              <span className="text-sm font-medium text-slate-700">Correo de facturación</span>
              <input name="correoFacturacion" type="email" defaultValue={initial?.correoFacturacion ?? ''} className={inputClass} />
              <Err msg={fe.correoFacturacion} />
            </label>
          </div>
        </fieldset>
      </div>

      {!readOnly ? <SubmitBtn label={mode === 'crear' ? 'Crear cliente' : 'Guardar cambios'} /> : null}
    </form>
  );
}
```

- [ ] **Step 3: `ClienteAdminActions.tsx` (`'use client'`)**

Réplica del idioma de `src/app/(app)/productos/ProductAdminActions.tsx`: un `<form action={...}>` con `useActionState` sobre `archivarClienteAction`/`restaurarClienteAction`, `<input type="hidden" name="id">`, botón con `confirm()` en `onClick` (o `useFormStatus`). Props: `{ id: string; archivado: boolean }`.

- [ ] **Step 4: `page.tsx` (listado)**

Seguir `src/app/(app)/productos/page.tsx`:
- `const actor = await requirePermission('clientes.ver');`
- `searchParams`: `q`, `estado` (`activos`/`archivados`/`todos`, default `activos`), `soloFacturables` (`'1'`), `page`.
- `listCustomers({ q, estado, soloFacturables, page, pageSize: 20 })`.
- `<form method="get">` con input `q` (placeholder "Nombre, teléfono, correo o RFC"), `<select name="estado">`, checkbox `soloFacturables`, botón "Filtrar", link "Limpiar".
- `<PermissionGate permiso="clientes.crear" user={actor}>` → `<Link href="/clientes/nuevo">Nuevo cliente</Link>`.
- `<DataTable columns={...} rows={rows} getKey={r=>r.id} rowHref={r=>`/clientes/${r.id}`} rowComponent={CustomerRow} emptyMessage="No hay clientes que coincidan con el filtro." />`.
- `<Pagination page={page} pageSize={20} total={total} baseHref="/clientes" baseSearchParams={baseParams} />`.
- Link `Exportar CSV` → `/clientes/export?<mismos filtros>`.

- [ ] **Step 5: `nuevo/page.tsx`**

```tsx
import Link from 'next/link';
import { requirePermission } from '@/lib/auth/context';
import { CustomerForm } from '../CustomerForm';

export const dynamic = 'force-dynamic';

export default async function NuevoClientePage() {
  await requirePermission('clientes.crear');
  return (
    <div className="space-y-6">
      <div>
        <Link href="/clientes" className="text-sm text-slate-500 hover:text-slate-700">← Clientes</Link>
        <h1 className="text-2xl font-bold">Nuevo cliente</h1>
      </div>
      <div className="rounded-lg border border-slate-200 bg-white p-5">
        <CustomerForm mode="crear" />
      </div>
    </div>
  );
}
```

- [ ] **Step 6: `[id]/page.tsx`**

Seguir `src/app/(app)/productos/[id]/page.tsx`:
- `await requirePermission('clientes.ver');` → `const { id } = await props.params;`
- `const cliente = await getCustomer(id); if (!cliente) notFound();`
- `const actor = await getCurrentUser(); const canEditar = can(actor, 'clientes.editar'); const canArchivar = can(actor, 'clientes.archivar');`
- Cabecera: nombre, badges (Genérico si `esGenerico`, Archivado si `archivado`, Facturable si `facturable`).
- Sección "Datos del cliente": `<CustomerForm mode="editar" initial={{...cliente}} readOnly={!canEditar || cliente.esGenerico ? /* ver nota */ }} />`.
  - Nota: para el cliente genérico, el form debe permitir contacto+notas pero bloquear nombre y bloque fiscal. Implementación simple aceptada: si `cliente.esGenerico`, pasar una prop extra `genericoLock` al `CustomerForm` que ponga `readOnly` en el input `nombre` y en el `<fieldset>` fiscal, dejando el resto editable. Añadir esa prop al componente de Step 2 (`genericoLock?: boolean`) — cuando es true: `<input name="nombre" ... readOnly />` y `<fieldset ... disabled={readOnly || genericoLock}>` en la sección fiscal únicamente.
- Sección "Compras": recuadro con el texto exacto *"El historial de compras estará disponible cuando se active el módulo de Ventas."*
- `{canArchivar && !cliente.esGenerico ? <ClienteAdminActions id={cliente.id} archivado={cliente.archivado} /> : null}` dentro de `<PermissionGate permiso="clientes.archivar" user={actor}>`.

- [ ] **Step 7: typecheck + lint + build**

Run: `npm run typecheck && npm run lint && npm run build`
Expected: 0 errores; build OK. (Las páginas RSC no llevan test unitario, igual que en el Bloque 2; su cobertura viene del E2E de Task 13.)

- [ ] **Step 8: Suite completa de regresión**

Run: `npm run test:unit && npm run test:integration`
Expected: todo verde (sin regresiones).

- [ ] **Step 9: Commit**

```bash
git add "src/app/(app)/clientes/"
git commit -m "feat(clientes): pantallas de listado, alta y detalle con formulario CFDI plegable

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01EnFJHWm8zVoqgkmfwwcRHi"
```

---

## Task 12: Export CSV (`clientes/export/route.ts`)

**Files:**
- Create: `src/app/(app)/clientes/export/route.ts`
- Create: `src/app/(app)/clientes/export/route.itest.ts`

**Interfaces:**
- Consumes: `requirePermission` (`@/lib/auth/context`), `ForbiddenError` (`@/lib/errors`), `listCustomers` (`@/lib/customers/customers`), `getRegimenLabel`/`getUsoCfdiLabel` (`@/lib/sat/*`).
- Produces: `GET(req: Request)` — `export const runtime = 'nodejs'`. Gate: `try { await requirePermission('clientes.ver') } catch (e) { if (e instanceof ForbiddenError) return NextResponse.json({ error: e.message }, { status: 403 }); throw e }`. Lee `q`/`estado`/`soloFacturables` de la query; `listCustomers({ ..., page: 1, pageSize: 5000 })`. CSV con BOM `'﻿'`, cabecera `Nombre,Teléfono,Correo,RFC,Razón social,Régimen,Uso CFDI,CP fiscal,Facturable,Estado`. **El RFC va completo** (export administrativo bajo permiso). `content-type: text/csv; charset=utf-8`, `content-disposition: attachment; filename="clientes-<YYYY-MM-DD>.csv"`.

- [ ] **Step 1: Escribir `src/app/(app)/clientes/export/route.itest.ts` (falla)**

```ts
import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import { db } from '@/lib/db';
import { hashPassword } from '@/lib/auth/password';
import { createSession } from '@/lib/auth/session';

const cookieStore = { value: undefined as string | undefined };
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: () => (cookieStore.value ? { value: cookieStore.value } : undefined) }),
  headers: async () => new Headers(),
}));
import { GET } from './route';

async function makeUser(roleId: string, email: string) {
  return db.user.create({
    data: { nombre: email, email, passwordHash: await hashPassword('xxxxxxxxxx'), roleId },
  });
}

beforeEach(async () => {
  await db.activityLog.deleteMany();
  await db.session.deleteMany();
  await db.customer.deleteMany({ where: { esGenerico: false } });
  await db.user.deleteMany();
  await db.role.deleteMany({ where: { nombre: 'SinAccesoClientes' } });
});
afterAll(async () => {
  await db.customer.deleteMany({ where: { esGenerico: false } });
  await db.user.deleteMany();
  await db.role.deleteMany({ where: { nombre: 'SinAccesoClientes' } });
});

describe('GET /clientes/export', () => {
  it('403 sin permiso clientes.ver', async () => {
    const role = await db.role.create({ data: { nombre: 'SinAccesoClientes', descripcion: 'test' } });
    const u = await makeUser(role.id, 'noaccess@pos.com');
    cookieStore.value = (await createSession(u.id, {})).token;

    const res = await GET(new Request('http://x/clientes/export'));
    expect(res.status).toBe(403);
  });

  it('200 text/csv con permiso; RFC completo en el cuerpo', async () => {
    const gerente = await db.role.findFirstOrThrow({ where: { nombre: 'Gerente' } });
    const u = await makeUser(gerente.id, 'gerente@pos.com');
    cookieStore.value = (await createSession(u.id, {})).token;

    await db.customer.create({
      data: {
        nombre: 'Cliente Export', rfc: 'ABC010101XYZ', razonSocial: 'ACME',
        regimenFiscalCode: '601', usoCfdiCode: 'G03', cpFiscal: '06000',
      },
    });

    const res = await GET(new Request('http://x/clientes/export?estado=todos'));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/csv');
    const body = await res.text();
    expect(body).toContain('Cliente Export');
    expect(body).toContain('ABC010101XYZ'); // RFC completo, no enmascarado
  });
});
```

- [ ] **Step 2: Ejecutar y verificar que falla**

Run: `npm run test:integration -- src/app/(app)/clientes/export/route.itest.ts`
Expected: FAIL — módulo inexistente.

- [ ] **Step 3: Escribir `src/app/(app)/clientes/export/route.ts`**

```ts
import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/context';
import { ForbiddenError } from '@/lib/errors';
import { listCustomers, type CustomerRow } from '@/lib/customers/customers';
import { getRegimenLabel } from '@/lib/sat/regimenes-fiscales';
import { getUsoCfdiLabel } from '@/lib/sat/usos-cfdi';
import { db } from '@/lib/db';

export const runtime = 'nodejs';

const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

function estadoFrom(v: string | null): 'activos' | 'archivados' | 'todos' {
  return v === 'archivados' || v === 'todos' ? v : 'activos';
}

export async function GET(req: Request) {
  try {
    await requirePermission('clientes.ver');
  } catch (e) {
    if (e instanceof ForbiddenError) return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }

  const url = new URL(req.url);
  const q = url.searchParams.get('q')?.trim() || undefined;
  const estado = estadoFrom(url.searchParams.get('estado'));
  const soloFacturables = url.searchParams.get('soloFacturables') === '1';

  const { rows } = await listCustomers({ q, estado, soloFacturables, page: 1, pageSize: 5000 });

  // listCustomers/CustomerRow no trae los campos fiscales completos: releer los
  // detalles necesarios para la exportación en una sola consulta.
  const ids = rows.map((r) => r.id);
  const full = ids.length
    ? await db.customer.findMany({
        where: { id: { in: ids } },
        select: {
          id: true, razonSocial: true, regimenFiscalCode: true,
          usoCfdiCode: true, cpFiscal: true,
        },
      })
    : [];
  const byId = new Map(full.map((c) => [c.id, c] as const));

  const header =
    'Nombre,Teléfono,Correo,RFC,Razón social,Régimen,Uso CFDI,CP fiscal,Facturable,Estado';
  const lines = rows.map((r: CustomerRow) => {
    const extra = byId.get(r.id);
    return [
      r.nombre,
      r.telefono ?? '',
      r.correo ?? '',
      r.rfc ?? '',
      extra?.razonSocial ?? '',
      extra?.regimenFiscalCode ? getRegimenLabel(extra.regimenFiscalCode) : '',
      extra?.usoCfdiCode ? getUsoCfdiLabel(extra.usoCfdiCode) : '',
      extra?.cpFiscal ?? '',
      r.facturable ? 'Sí' : 'No',
      r.estado === 'archivado' ? 'Archivado' : 'Activo',
    ]
      .map((v) => esc(String(v)))
      .join(',');
  });

  const csv = '﻿' + [header, ...lines].join('\n') + '\n';
  const fecha = new Date().toISOString().slice(0, 10);
  return new NextResponse(csv, {
    status: 200,
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="clientes-${fecha}.csv"`,
    },
  });
}
```

> Alternativa más limpia si el revisor lo prefiere: añadir los campos `razonSocial`, `regimenFiscalCode`, `usoCfdiCode`, `cpFiscal` a `CustomerRow` y a `listCustomers` desde Task 9, y evitar la segunda consulta aquí. Cualquiera de las dos es aceptable; NO cambies la firma pública de `listCustomers` sin actualizar sus tests.

- [ ] **Step 4: Ejecutar y verificar que pasa**

Run: `npm run test:integration -- src/app/(app)/clientes/export/route.itest.ts`
Expected: PASS.

- [ ] **Step 5: Suite completa**

Run: `npm run typecheck && npm run lint && npm run test:unit && npm run test:integration && npm run build`
Expected: 0 errores; todo verde.

- [ ] **Step 6: Commit**

```bash
git add "src/app/(app)/clientes/export/"
git commit -m "feat(clientes): exportación CSV bajo permiso clientes.ver

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01EnFJHWm8zVoqgkmfwwcRHi"
```

---

## Task 13: E2E de clientes (Playwright)

**Files:**
- Create: `e2e/clientes.spec.ts`

**Interfaces:**
- Consumes: helpers existentes de `e2e/` (login como Administrador, creación de usuarios). Revisar `e2e/productos-inventario.spec.ts` para el idioma exacto de `test.describe`, `globalSetup`, y los helpers de sesión.
- Produces: nada (suite terminal).

- [ ] **Step 1: Escribir `e2e/clientes.spec.ts`**

Cubrir, con aserciones reales y datos únicos por corrida (sufijo aleatorio en nombres/teléfonos):

1. **Alta no facturable:** login Admin → `/clientes` → "Nuevo cliente" → nombre "María López <rnd>" + teléfono "<rnd 10 díg>", sección CFDI vacía → "Crear cliente" → redirige a `/clientes/<id>`; volver a `/clientes` → la fila aparece con Facturable = "No".
2. **Completar datos fiscales:** abrir ese cliente → desplegar "Datos de facturación (CFDI)" → RFC `LOAM8001011X3`, razón social "Maria Lopez", régimen `612`, uso `G03`, CP `06000` → "Guardar cambios" → recargar → Facturable = "Sí".
3. **Teléfono único:** "Nuevo cliente" con el mismo teléfono del paso 1 → error de campo visible ("Ya está en uso.").
4. **Cliente genérico protegido:** `/clientes` → "Público en General" es la primera fila; abrir su detalle → NO hay botón "Archivar"; el input "Nombre" y la sección CFDI están deshabilitados/solo lectura; el campo "Notas" sí es editable y se puede guardar.
5. **Permisos de Cajero:** crear (como Admin) un usuario con rol Cajero → cerrar sesión → entrar como Cajero → `/clientes` muestra "Nuevo cliente" y puede crear uno → abrir `/clientes/<id>` de otro cliente: el botón "Guardar cambios" no aparece (form en modo lectura) y navegar directo a una acción de archivar no está disponible / muestra "No tienes permiso".

- [ ] **Step 2: Ejecutar la suite E2E**

Run: `npm run test:e2e -- clientes`
Expected: PASS. (La `globalSetup` de Playwright levanta PG efímero en `54330` db `pos_e2e` y hace `build`+`start` en el puerto 3100.)

- [ ] **Step 3: Commit**

```bash
git add e2e/clientes.spec.ts
git commit -m "test(clientes): E2E de alta, datos fiscales, unicidad, cliente genérico y permisos

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01EnFJHWm8zVoqgkmfwwcRHi"
```

---

## Verificación final del bloque (tras la revisión de rama completa)

- [ ] `npm run typecheck` → 0 errores
- [ ] `npm run lint` → 0 errores/warnings
- [ ] `npm run test:unit` → verde
- [ ] `npm run test:integration` → verde, estable en 3 corridas seguidas (sin flakes por orden de archivos)
- [ ] `npm run build` → OK
- [ ] `npm run test` (unit + integración, como en `master`) → verde
- [ ] `npm run test:e2e` → verde
- [ ] Revisión de seguridad e integridad: (a) toda Server Action mutante empieza con `requirePermission`; (b) el RFC nunca aparece completo en `activity_log` (grep de `metadata` en los itests); (c) el cliente genérico no es archivable ni editable en nombre/fiscal; (d) el RFC genérico se rechaza en alta/edición manual; (e) migración estrictamente aditiva (revisar `migration.sql`); (f) sin `console.*`, sin `any`, sin `new PrismaClient()` fuera de `seed.ts`.
- [ ] Actualizar `docs/` si el bloque cambió algo del contrato descrito en specs anteriores (no debería).

---

## Global Self-Review (autor del plan)

**Cobertura del spec:**
- Entidad `Customer` con columnas fiscales anulables → Task 4.
- `facturable` derivado → Tasks 2, 6, 7, 9.
- Catálogos SAT como constantes → Task 1.
- Validación de contacto + bloque fiscal condicional + RFC genérico rechazado + régimen↔RFC → Tasks 2, 5.
- CRUD con archivado lógico → Tasks 7, 8.
- Cliente "Público en General" sembrado y protegido → Tasks 4, 8, 11.
- Permisos `clientes.*` + reparto por rol → Tasks 3, 4.
- Auditoría con RFC enmascarado (5 acciones) → Tasks 3, 7, 8.
- Búsqueda reutilizable → Task 6.
- Pantallas (listado/alta/detalle/form CFDI plegable/placeholder Compras) → Task 11.
- Export CSV con RFC completo bajo `clientes.ver` → Task 12.
- E2E → Task 13.
- Migración aditiva → Task 4.

**Consistencia de tipos:** `CustomerHit` (search) y `CustomerRow`/`CustomerDetail` (customers) tienen shapes distintos y deliberados; `bloqueFiscalCompleto` acepta el modelo Prisma y el input Zod (campos opcionales string|null). `FISCAL_KEYS` se declara en Task 7 y se consume en Task 8 (nota explícita para el implementador). `fiscalMetadata` toma un shape estructural común a `current` (Prisma) y `next` (input).

**Sin placeholders:** todo el código de módulos puros, validación, servicios, actions y route handler está completo. Las pantallas RSC (Task 11) referencian ficheros existentes del Bloque 2 como plantilla y dan el `CustomerForm` completo; `CustomerRow`/`ClienteAdminActions`/`page.tsx`/`[id]/page.tsx` se describen por delta contra ficheros concretos ya en el repo, que es el nivel de detalle correcto para componentes de presentación sin lógica nueva.
