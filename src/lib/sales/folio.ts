import type { Prisma } from '@prisma/client';

/**
 * Incrementa el contador `FolioCounter[prefijo]` de forma atómica dentro de la
 * transacción del llamador y devuelve el folio formateado (`V-000123`).
 *
 * El `UPDATE ... RETURNING` serializa por fila, así que dos llamadas concurrentes
 * obtienen valores distintos. Si la transacción del llamador hace rollback, el
 * incremento se revierte y no quedan huecos en la numeración.
 *
 * Soporta las series: V (ventas), D (devoluciones), C (caja).
 */
export async function nextFolio(
  tx: Prisma.TransactionClient,
  prefijo: 'V' | 'D' | 'C',
): Promise<string> {
  const rows = await tx.$queryRaw<{ valor: number }[]>`
    UPDATE "FolioCounter" SET valor = valor + 1 WHERE serie = ${prefijo} RETURNING valor`;
  const valor = rows[0]?.valor;
  if (valor == null) throw new Error(`FolioCounter '${prefijo}' no existe`);
  return `${prefijo}-${String(valor).padStart(6, '0')}`;
}
