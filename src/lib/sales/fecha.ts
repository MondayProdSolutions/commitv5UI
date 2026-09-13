/**
 * Comparación de día natural anclada a `America/Mexico_City`.
 *
 * Antes del Bloque 5, `cancelSale` y el gate del botón "Cancelar venta" en la
 * ficha usaban esta regla ("mismo día"); ahora ambos exigen que la sesión de
 * caja de la venta siga ABIERTA (`Sale.cashSessionEstado`). Se conserva sin
 * uso en producción — cualquier comparación de día natural debe evaluarse en
 * la zona horaria del negocio, no en la del host ni en UTC (cerca de
 * medianoche un `toISOString().slice(0, 10)` daría un día distinto) — por si
 * un bloque futuro (p. ej. reportes agrupados por día) la necesita.
 */
const diaMX = (d: Date): string =>
  d.toLocaleDateString('en-CA', { timeZone: 'America/Mexico_City' });

/** `true` si `a` y `b` caen en el mismo día natural de `America/Mexico_City`. */
export const esMismoDiaMX = (a: Date, b: Date): boolean => diaMX(a) === diaMX(b);
