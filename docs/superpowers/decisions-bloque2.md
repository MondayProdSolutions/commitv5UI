# Bloque 2 (Productos / Categorías / Inventario) — decisiones autónomas

Decisiones tomadas por los implementadores bajo el "Ruling PR4" (reversibles, sin impacto de
negocio) durante las tareas 1–16. Compiladas de los `task-*-report.md` del spec
`2026-09-03-pos-block2-products-inventory`.

## Esquema, seed y validación

- **T1 — Enums Prisma.** Reescritos en forma multilínea canónica; Prisma 7.10 rechaza la forma de
  una sola línea del brief. Mismos nombres y valores, cero cambio semántico.
- **T1 — Fixture de permisos.** `src/lib/roles/admin.itest.ts` mantiene un espejo hardcodeado del
  mapa de permisos del seed que restaura en `afterAll`; se sincronizó con el nuevo canon del
  Bloque 2 (data de test, no lógica RBAC).
- **T1 — Seed de impuestos.** Upsert idempotente de `IVA 16%` (`0.16`, `esDefault`) y `Exento` (`0`).
- **T4 — Zod.** `.superRefine()` para validación cross-field (API estándar Zod 4) en lugar del
  `.check()` inexistente del brief. Typo `costroUnitario` → `costoUnitario`. Transforms
  opcional-string → `null` con el patrón establecido. `imagenUrl` = `string.nullable().optional()`.
- **T10/T11 — Clave de campo en P2002.** `variantes.${i}.codigoBarras` o `.sku` según
  `e.meta.target`; colisiones de nombre normalizadas con `trim().toLowerCase()` (sin fold de acentos).

## Inventario / stock

- **T5 — `recordMovement`.** En el camino con `tx` externa devuelve `run(tx, input)` directo; sólo
  abre `db.$transaction` e invoca `invalidateStockAlertsCache()` en el camino auto-abierto (el
  caller externo es dueño del commit/rollback y de invalidar la cache).
- **T6/T10/T14 — Filtros `stock <= stockMinimo`.** Prisma no los expresa en `where`; se resuelven
  en memoria tras `findMany`. Cuando el filtro está activo, `total` = longitud del set filtrado.
  Aceptable a tamaños típicos de catálogo (< 10k variantes); documentado en JSDoc.
- **T6 — Cache de alertas.** TTL de módulo de 30 s; `recordMovement` la invalida.
- **T9 — Búsqueda.** Over-fetch `limit * 3` (cap 60) para reordenar en memoria. Orden: código de
  barras exacto → prefijo de SKU → nombre de producto ASC → nombre de variante ASC (nulls last).

## Categorías

- **T8 — P2002 de `@@unique([parentId, nombre])`.** Capturado *fuera* del `$transaction` (patrón
  `roles/admin.ts`) y mapeado a `ValidationError({ nombre })`.
- **T8 — `archiveCategory`.** `updateMany` sin guardia `archivada:false` (idempotente, conteo
  estable al repetir). `productosAfectados` es un `count` puro; **ninguna escritura a `Product`**.
- **T8 — `listCategoryTree`.** Árbol de 2 niveles armado en memoria con 1 `findMany` + 1 `groupBy`;
  `productosCount` directo, sin roll-up. id inexistente → `ValidationError({ _form })`. `nombre`
  trimmed antes de persistir/auditar.
- **T11 — `logActivity` de `addVariant` / `convertToVariants`.** Entidad `Product` (la mutación
  principal es sobre el producto). `convertToVariants` usa `find(esDefault)` con fallback a
  `variants[0]` para la variante base.

## UI

- **T12 — `sin-categoria-activa/RecategorizeForm.tsx`** (6º archivo): la firma
  `(prev, formData)` obliga a `useActionState` → client component.
- **T12 — `CategoryForm`** como modal con trigger (espejo de `UserFormDialog` del Bloque 1),
  keyed per-open para resetear el estado; `<select>` sólo con categorías activas.
- **T13 — Variantes** como tarjetas apiladas (no `<input>`-en-`<td>`) por legibilidad móvil;
  "Últimos movimientos" como `<details>`. `nuevo/` como página separada. Editor sólo si el actor
  tiene `productos.editar`; si no, `<dl>` de sólo lectura. Archivado/disponibilidad del producto en
  `ProductAdminActions.tsx`.
- **T15 — Buscador de variante** como server action `buscarVariantesAction` vía un segundo
  `useActionState` en un `<form>` hermano. Deep link `?variantId=` pre-rellena el hidden input
  (`searchProducts` busca por texto, no por ID). Filtros `productId` / `actorId` como inputs de
  texto. Enlace "Registrar movimiento" visible con cualquiera de
  `inventario.entrada` / `.salida` / `.ajustar`.
- **T14/T13/T12 — Estilo** alineado al admin del Bloque 1 (paleta slate/red, tarjetas redondeadas,
  avisos ámbar).

## Diferido (menor) — fuera del alcance del Bloque 2

- **`imagenUrl`** en `Product` / `ProductVariant`: campo reservado; sin subida de imágenes en este
  bloque, siempre `null`. Añadir passthrough oculto en los formularios de edición si llega la subida.
- **Filtros de stock bajo** (`stock <= stockMinimo`, `soloStockBajo`, `listStock`): resueltos en
  memoria; migrar a SQL / vista materializada si el catálogo supera ~10k variantes.
- **Cache de alertas de stock bajo**: TTL fijo de 30 s en memoria de proceso, no compartida entre
  instancias.
- **`MovementType.VENTA` / `.DEVOLUCION`**: presentes en el enum del schema pero sin ruta ni lógica
  en el Bloque 2; los consumirá el POS (Bloque 4).
- **Búsqueda sin fold de acentos**: normalización sólo `trim().toLowerCase()`.
