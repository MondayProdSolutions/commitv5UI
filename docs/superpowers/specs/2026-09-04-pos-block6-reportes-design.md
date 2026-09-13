# POS Bloque 6 (Reportes) — Diseño

**Fecha:** 2026-09-04
**Depende de:** Bloques 1-5 (ya en `master`). Sin migración de esquema — Reportes es de solo lectura sobre datos existentes.

## 1. Resumen

Cuatro reportes gerenciales — Ventas, Inventario, Utilidad/Margen, Clientes — cada uno con selector de período, tarjetas resumen, 1-2 gráficas y una tabla detalle exportable a CSV. Construidos sobre los datos ya existentes de los Bloques 2-5; ninguna tabla ni columna nueva.

## 2. Decisiones de diseño (de la sesión de brainstorming)

- **Permisos:** `reportes.ver` (Administrador, Gerente, Cajero) cubre Ventas/Inventario/Clientes. `reportes.margen` (solo Administrador, Gerente) cubre Utilidad — expone `precioCompra`, un dato sensible que hoy nadie ve fuera de Productos.
- **Alcance de datos para Cajero:** sin restricción adicional — ve las mismas cifras completas del negocio que Administrador/Gerente en los reportes que sí puede abrir (todo menos Margen). No hay filtrado por-cajero automático.
- **Devoluciones netas:** Ingreso y Utilidad se calculan netos de devoluciones del período (ventas − devoluciones), igual criterio que ya usa el arqueo de Caja con los reembolsos.
- **Costeo de Margen:** se usa el `precioCompra` **actual** de cada variante para todo el período (aproximación). `SaleLine` no guarda costo histórico y `InventoryMovement.costoUnitario` solo se puebla en movimientos `ENTRADA` (verificado en `src/lib/inventory/movements.ts:76` — nunca en `VENTA`), así que no hay costo histórico real disponible sin una migración; se decidió NO añadirla. La pantalla de Margen muestra una nota visible de que es una aproximación.
- **Cliente "Público en general" (`Customer.esGenerico`):** excluido del ranking de Top clientes (es un cubo genérico, no una persona real); se reporta aparte como cifra informativa.
- **Selector de período:** atajos (Hoy / Esta semana / Este mes / Últimos 30 días) + rango personalizado, mismo patrón `<form method="get">` + `parseDateParam` que Ventas/Caja/Auditoría. Por defecto (sin filtros en la URL): **Este mes**.
- **Gráficas:** SVG hecho a mano, sin dependencia nueva — dos componentes reutilizables (`BarChart`, `LineChart`) en `src/components/charts/`, mismo nivel de reutilización que `DataTable`/`Pagination`. Es la primera vez que el repo tendría gráficas; se decidió explícitamente NO añadir una librería (Recharts u otra) para mantener cero dependencias de UI.
- **Export CSV:** cada reporte tiene un botón "Exportar CSV" junto a su tabla detalle, mismo patrón que `ventas/historial/export` y `caja/historial/export` (BOM, `esc` local, `content-disposition`).
- **Sin auditoría nueva:** confirmado que los exports existentes (Ventas, Caja) no llaman `logActivity` — solo el gate de permiso. Reportes es de solo lectura; no se añaden acciones de auditoría.
- **Sin nuevas migraciones:** todo el bloque son funciones de lectura (`Prisma.groupBy`/`aggregate`/`findMany`) sobre tablas existentes, sin `db.$transaction` (no hay escritura).

## 3. Permisos y navegación

En `PERMISSIONS` (`src/lib/auth/rbac.ts`), nuevo módulo al final, tras `caja`:

```ts
{
  modulo: 'reportes', label: 'Reportes',
  permisos: [
    { key: 'reportes.ver', label: 'Ver reportes de ventas, inventario y clientes' },
    { key: 'reportes.margen', label: 'Ver el reporte de utilidad y margen (costos)' },
  ],
},
```

En `ROLE_PERMISSIONS` (`src/lib/auth/role-permissions.ts`): `Gerente` += `['reportes.ver', 'reportes.margen']`; `Cajero` += `['reportes.ver']`; `Empleado` sin cambios; `Administrador` vía `ALL_PERMISSION_KEYS`.

En `nav.ts` (`src/lib/nav.ts`): un ítem `{ href: '/reportes', label: 'Reportes', permiso: 'reportes.ver' }` entre `/caja` y `/perfil`.

## 4. Arquitectura técnica

**Capa de servicio** — `src/lib/reports/`:
- `period.ts` — resuelve el filtro de período. `type ReportPeriod = { desde: Date; hasta: Date; etiqueta: string }`. `resolvePeriod(searchParams: { atajo?: string; desde?: string; hasta?: string }): ReportPeriod` — si `atajo` es uno de `'hoy'|'semana'|'mes'|'30dias'`, calcula el rango en `America/Mexico_City` (mismo criterio de día natural que `esMismoDiaMX`/`diaMX` de `@/lib/sales/fecha` — un helper local `diaKeyMX(d: Date): string = d.toLocaleDateString('en-CA', { timeZone: 'America/Mexico_City' })` para bucketing por día); si vienen `desde`/`hasta` (vía `parseDateParam` de `@/lib/activity/query`), rango personalizado; sin nada, default `'mes'` (mes calendario actual en curso, MX). `hasta` es inclusivo hasta el final del día MX.
- `ventas.ts` → `getSalesReport(period): Promise<SalesReport>`
- `inventario.ts` → `getInventoryReport(period): Promise<InventoryReport>`
- `margen.ts` → `getMarginReport(period): Promise<MarginReport>`
- `clientes.ts` → `getCustomersReport(period): Promise<CustomersReport>`

Todas de solo lectura: `db.<modelo>.findMany/groupBy/aggregate`, sin `db.$transaction`. `round2 = (x: number) => Math.round(x * 100) / 100` local en cada archivo (idioma del repo).

**Componentes de gráficas** — `src/components/charts/`:
- `BarChart.tsx` — recibe `{ data: { label: string; value: number }[]; orientacion?: 'vertical' | 'horizontal'; formatValue?: (n: number) => string }`. SVG puro, barras proporcionales al máximo del set, etiqueta + valor por barra. Sin librería.
- `LineChart.tsx` — recibe `{ data: { label: string; value: number }[]; formatValue?: (n: number) => string }`. SVG con polyline + área rellena (gradiente sutil), eje X con las etiquetas, sin librería.
- Ambos son componentes de render puro (no `'use client'` a menos que necesiten interactividad — no la necesitan: son SVG estático generado desde datos ya calculados en el servidor).

**Selector de período compartido** — `src/app/(app)/reportes/PeriodFilterForm.tsx`: recibe `{ base: string; atajo?: string; desde?: string; hasta?: string }` (la ruta base, p. ej. `/reportes/ventas`, y los valores actuales). Renderiza 4 links de atajo (marcando el activo) + `<form method="get">` con 2 `<input type="date">` para rango personalizado + submit. Reutilizado por los 4 reportes.

**Rutas:**
```
src/app/(app)/reportes/
  page.tsx                    — aterrizaje: 4 tarjetas enlazando a cada reporte (sin datos)
  PeriodFilterForm.tsx        — compartido
  ventas/page.tsx
  ventas/export/route.ts (+ route.itest.ts)
  inventario/page.tsx
  inventario/export/route.ts (+ route.itest.ts)
  margen/page.tsx
  margen/export/route.ts (+ route.itest.ts)
  clientes/page.tsx
  clientes/export/route.ts (+ route.itest.ts)
```

Cada `page.tsx`: `requirePermission('reportes.ver')` (o `'reportes.margen'` en el caso de `margen/page.tsx`) primera sentencia; `export const dynamic = 'force-dynamic'`; lee `searchParams`, resuelve `period` con `resolvePeriod`, llama a su función de reporte, renderiza tarjetas + gráficas + tabla + link de export (con los mismos parámetros de período).

Cada `export/route.ts`: `runtime='nodejs'`; gate `try { await requirePermission(...) } catch (e) { if (e instanceof ForbiddenError) return NextResponse.json({ error: e.message }, { status: 403 }); throw e }`; misma resolución de período desde `url.searchParams`; llama a la misma función de reporte que su página; arma el CSV con BOM y `content-disposition: attachment; filename="reporte-<nombre>-<YYYY-MM-DD>.csv"`.

## 5. Reporte de Ventas

`getSalesReport(period)`:

```
ventasCompletadas = Sale WHERE estado = 'COMPLETADA' AND createdAt BETWEEN period.desde AND period.hasta
ventasCanceladas  = count(Sale WHERE estado = 'CANCELADA' AND createdAt BETWEEN period.desde AND period.hasta)
devoluciones      = Return WHERE createdAt BETWEEN period.desde AND period.hasta

ingresoBruto      = round2(Σ Sale.total, ventasCompletadas)
devolucionesTotal = round2(Σ Return.total, devoluciones)
ingresoNeto       = round2(ingresoBruto − devolucionesTotal)
ticketPromedio    = count(ventasCompletadas) > 0 ? round2(ingresoBruto / count(ventasCompletadas)) : 0
ivaTotal          = round2(Σ Sale.impuestos, ventasCompletadas) − round2(Σ Return.impuestos, devoluciones)
descuentosTotal   = round2(Σ (Sale.descuentoLineas + Sale.descuentoTicket), ventasCompletadas)
```

`type SalesReport = { periodo: ReportPeriod; kpis: { ventasCompletadas: number; ventasCanceladas: number; ingresoNeto: number; ticketPromedio: number; ivaTotal: number; descuentosTotal: number }; tendenciaDiaria: { fecha: string; ventas: number; ingresoBruto: number; devoluciones: number; ingresoNeto: number; iva: number }[]; cobrosPorMetodo: { metodo: PaymentMethod; monto: number }[]; topProductos: { variantId: string; nombre: string; cantidad: number; ingreso: number }[]; porCajero: { cajeroId: string; nombre: string; ventas: number; ingreso: number }[] }`

- **`tendenciaDiaria`**: agrupa `ventasCompletadas` y `devoluciones` por día natural MX (`diaKeyMX`), un renglón por día del rango con datos (no rellena días vacíos con ceros — la gráfica y la tabla solo muestran días con actividad). Respalda la Gráfica 1 (línea/área de `ingresoNeto`) y es la tabla detalle exportada a CSV.
- **`cobrosPorMetodo`**: `Payment.groupBy({ by: ['metodo'], where: { sale: { estado: 'COMPLETADA', createdAt: {...} } }, _sum: { monto: true } })`. Respalda la Gráfica 2 (barras). Es el total COBRADO (no neto de devoluciones — un reembolso es un flujo aparte con su propio `metodoReembolso`), etiquetado en pantalla como "Cobros por método", distinto de "Ingreso neto".
- **`topProductos`**: agrupa `SaleLine` de `ventasCompletadas` por `variantId`; `cantidad = Σ SaleLine.cantidad − Σ ReturnLine.cantidad` (de `devoluciones` cuyo `saleLineId` pertenece a esas líneas); `ingreso = Σ SaleLine.total − Σ ReturnLine.total` (mismo criterio). Top 20 por `ingreso` desc. Solo en pantalla, no se exporta.
- **`porCajero`**: agrupa `ventasCompletadas` por `cajeroId`; `ventas = count`, `ingreso = Σ Sale.total` (bruto por cajero — no se netea devolución a nivel de cajero, para no tener que decidir a qué cajero se le carga un reembolso que puede procesar alguien distinto de quien vendió). Solo en pantalla.

## 6. Reporte de Inventario

`getInventoryReport(period)`:

```
variantesActivas = ProductVariant WHERE archivada = false AND product.archivado = false
valorCosto        = round2(Σ variantesActivas.stock × variantesActivas.precioCompra)
valorVenta        = round2(Σ variantesActivas.stock × variantesActivas.precioVenta)
stockBajo         = count(listStock() WHERE estado IN ('bajo', 'agotado'))   // reutiliza src/lib/inventory/query.ts:listStock — mismo criterio que /inventario/stock-bajo
movimientos       = InventoryMovement WHERE createdAt BETWEEN period.desde AND period.hasta
movimientosPeriodo = count(movimientos)
```

`type InventoryReport = { periodo: ReportPeriod; kpis: { valorCosto: number; valorVenta: number; stockBajo: number; movimientosPeriodo: number }; movimientosPorTipo: { tipo: MovementType; cantidad: number }[]; topRotacion: { variantId: string; nombre: string; unidadesVendidas: number }[]; detalle: { fecha: string; producto: string; tipo: MovementType; cantidad: number; usuario: string }[] }`

- **`movimientosPorTipo`**: `movimientos.groupBy({ by: ['tipo'], _count: true })`. Respalda la Gráfica 1 (barras).
- **`topRotacion`**: de `movimientos` con `tipo = 'VENTA'`, agrupa por `variantId`, `unidadesVendidas = Σ ABS(cantidad)` (la `cantidad`/`delta` de un movimiento `VENTA` es negativa — ver `src/lib/inventory/stock-calc.ts`). Top 10 desc. Respalda la Gráfica 2 (barras horizontales).
- **`detalle`**: `movimientos` completo del período (fecha, `variant.product.nombre` + `variant.nombre`, tipo, cantidad, `actor.nombre` o "Sistema" si `actorId` es null), ordenado `createdAt` desc. Es la tabla detalle exportada a CSV.
- Link "Ver alertas de stock bajo" → `/inventario/stock-bajo` (no se duplica esa pantalla aquí).

## 7. Reporte de Utilidad / Margen

Permiso `reportes.margen`. Nota fija en pantalla: *"El margen usa el costo actual de cada producto (precioCompra); si el costo cambió después de la venta, el margen histórico es una aproximación."*

`getMarginReport(period)`:

```
ventasCompletadas = Sale WHERE estado = 'COMPLETADA' AND createdAt BETWEEN period.desde AND period.hasta
líneas            = SaleLine de ventasCompletadas, join ProductVariant (precioCompra actual)
devoluciones      = ReturnLine de Return WHERE createdAt BETWEEN period.desde AND period.hasta AND saleLineId ∈ líneas

por línea: unidadesNetas = línea.cantidad − Σ devoluciones.cantidad (de esa línea)
           ingresoNeto   = línea.baseNeta − Σ devoluciones.baseNeta (de esa línea) — SIN IVA;
                           nunca .total (que sí lo incluye — el costo tampoco lo lleva)
           costoNeto     = round2(unidadesNetas × variant.precioCompra)
           utilidad      = round2(ingresoNeto − costoNeto)

utilidadTotal     = round2(Σ utilidad, todas las líneas)
ingresoNetoTotal  = round2(Σ ingresoNeto, todas las líneas)
margenPromedio    = ingresoNetoTotal > 0 ? round2((utilidadTotal / ingresoNetoTotal) * 100) : 0   // en %
```

`type MarginReport = { periodo: ReportPeriod; kpis: { utilidadTotal: number; margenPromedio: number; productoMasRentable: string | null }; topUtilidad: { variantId: string; nombre: string; utilidad: number }[]; detalle: { variantId: string; nombre: string; unidades: number; ingreso: number; costo: number; utilidad: number; margenPct: number }[] }`

- **`topUtilidad`**: agrupa por `variantId` sumando `utilidad` de todas sus líneas en el período; top 10 desc. Respalda la Gráfica (barras horizontales).
- **`detalle`**: una fila por producto/variante con actividad en el período (`unidades`, `ingreso`, `costo`, `utilidad`, `margenPct = ingreso > 0 ? round2((utilidad/ingreso)*100) : 0`), ordenable por `utilidad` desc. Es la tabla exportada a CSV.
- **`productoMasRentable`**: nombre de la variante con mayor `utilidad` en `topUtilidad[0]`, o `null` si no hay datos.

## 8. Reporte de Clientes

`getCustomersReport(period)`:

```
ventasCompletadas = Sale WHERE estado = 'COMPLETADA' AND createdAt BETWEEN period.desde AND period.hasta AND customer.esGenerico = false
devoluciones      = Return de esas ventasCompletadas WHERE createdAt BETWEEN period.desde AND period.hasta
ventasGenerico    = Sale WHERE estado = 'COMPLETADA' AND createdAt BETWEEN period.desde AND period.hasta AND customer.esGenerico = true

por cliente: montoNeto = Σ Sale.total (sus ventas) − Σ Return.total (sus devoluciones)
             compras   = count(sus ventas)
             ticketProm = compras > 0 ? round2(Σ Sale.total / compras) : 0
             ultimaCompra = max(Sale.createdAt)

clientesActivos = count(clientes distintos con ≥1 venta en el período, sin contar Genérico)
clientesNuevos  = count(Customer WHERE createdAt BETWEEN period.desde AND period.hasta AND esGenerico = false)
ticketPromedioGeneral = clientesActivos > 0 ? round2(Σ montoNeto de todos / clientesActivos) : 0

genericoResumen = { ventas: count(ventasGenerico), monto: round2(Σ Sale.total, ventasGenerico) }
```

`type CustomerRow = { customerId: string; nombre: string; compras: number; montoNeto: number; ticketPromedio: number; ultimaCompra: Date }`

`type CustomersReport = { periodo: ReportPeriod; kpis: { clientesActivos: number; clientesNuevos: number; ticketPromedio: number }; genericoResumen: { ventas: number; monto: number }; topClientes: CustomerRow[]; detalle: CustomerRow[] }`

- **`topClientes`**: top 10 por `montoNeto` desc, excluye `esGenerico`. Respalda la Gráfica (barras horizontales). Solo en pantalla.
- **`detalle`**: TODOS los clientes (no genéricos) con al menos una compra en el período, mismo `CustomerRow`, ordenado por `montoNeto` desc — mismo cálculo que `topClientes` pero sin el límite de 10. Es la tabla exportada a CSV (mismo patrón que `detalle` en Inventario y Margen).

## 9. Testing

- **Unit** (`*.test.ts`, sin BD): `src/lib/reports/period.test.ts` — `resolvePeriod` para cada atajo, rango personalizado, default sin parámetros, límites de día MX (mismo caso regresión UTC-vs-MX que `fecha.test.ts`).
- **Integración** (`*.itest.ts`, BD real): `src/lib/reports/{ventas,inventario,margen,clientes}.itest.ts` — un escenario compuesto por reporte con datos sembrados vía los servicios reales de Bloques 2-5 (`createSale`, `createReturn`, `recordMovement`, etc.), verificando cada cifra a mano; casos de período vacío (sin datos → ceros/arrays vacíos, no error); exclusión de `CANCELADA`/`esGenerico` según corresponda. Cada `export/route.itest.ts` sigue el patrón ya establecido (403 sin permiso, 200 `text/csv` con cabecera y datos esperados en el cuerpo).
- **Página (RSC):** sin unit tests, siguiendo la convención de Bloques 2-5 — verificación por `typecheck` + `lint` + `build` + suites completas.
- **E2E** (`e2e/reportes.spec.ts`): login por rol y aserciones de que cada reporte renderiza con datos reales sembrados vía la UI; que Cajero ve Ventas/Inventario/Clientes pero NO Margen (403 o control ausente); que Empleado no ve el ítem de nav "Reportes" ni puede acceder por URL directa.

## 10. Fuera de alcance (bloques posteriores)

- Reportes fiscales/contables (CFDI agregado, declaraciones).
- Comparación entre períodos (este mes vs. el anterior) o proyecciones.
- Reportes programados / envío por correo.
- Dashboard de inicio (`/dashboard`) permanece como está — Reportes es una sección aparte, no reemplaza esa pantalla.
- Costeo histórico exacto (requeriría snapshot de costo por línea de venta — decisión explícita de no hacerlo en este bloque).
