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

  const hits = rows.map(
    (c): CustomerHit => ({
      id: c.id,
      nombre: c.nombre,
      telefono: c.telefono,
      correo: c.correo,
      rfc: c.rfc,
      facturable: bloqueFiscalCompleto(c),
      esGenerico: c.esGenerico,
    }),
  );

  hits.sort((a, b) => {
    if (a.esGenerico !== b.esGenerico) return a.esGenerico ? -1 : 1;
    const aExact = a.rfc === rfcNorm || a.telefono === term;
    const bExact = b.rfc === rfcNorm || b.telefono === term;
    if (aExact !== bExact) return aExact ? -1 : 1;
    return a.nombre.localeCompare(b.nombre);
  });

  return hits.slice(0, limit);
}
