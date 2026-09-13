import { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { precioConImpuesto } from '@/lib/taxes';

export type SearchHit = {
  variantId: string;
  productId: string;
  productoNombre: string;
  varianteNombre: string | null;
  sku: string | null;
  codigoBarras: string | null;
  precioVenta: number;
  precioConImpuesto: number;
  stock: number;
  disponible: boolean;
  exactBarcode: boolean;
};

/**
 * Busca variantes por nombre de producto (contains, case-insensitive), prefijo
 * de SKU o código de barras exacto.
 *
 * `limit` (por defecto 20) es el número de resultados devueltos. Internamente se
 * sobre-lee `max(limit * 3, limit)` filas (tope duro 500) para que el orden en
 * memoria — código de barras exacto y prefijo de SKU primero — tenga material
 * suficiente; un `limit` explícito grande (p. ej. el `limit: 200` de
 * `listProducts`) se respeta y no queda silenciosamente recortado a 60.
 */
export async function searchProducts(
  q: string,
  opts?: { incluirArchivados?: boolean; soloDisponibles?: boolean; limit?: number },
): Promise<SearchHit[]> {
  const term = q.trim();

  if (term === '') {
    return [];
  }

  const limit = opts?.limit ?? 20;
  const overFetchLimit = Math.min(Math.max(limit * 3, limit), 500);

  // Build the where clause. `{ sku: { equals: term } }` es redundante: lo cubre
  // por completo `{ sku: { startsWith: term } }` (el boost de coincidencia
  // exacta/prefijo ocurre en el orden en memoria de abajo).
  const where: Prisma.ProductVariantWhereInput = {
    OR: [
      { product: { nombre: { contains: term, mode: 'insensitive' } } },
      { sku: { startsWith: term } },
      { codigoBarras: { equals: term } },
    ],
  };

  // Add archive filters
  if (!opts?.incluirArchivados) {
    where.archivada = false;
    where.product = { archivado: false };
  }

  // Add disponible filter
  if (opts?.soloDisponibles) {
    where.disponible = true;
  }

  // Fetch variants with product and tax info
  const variants = await db.productVariant.findMany({
    where,
    include: { product: { include: { taxRate: true } } },
    take: overFetchLimit,
  });

  // Map to SearchHit and sort
  const hits = variants.map((v): SearchHit => {
    const precioVentaNum = Number(v.precioVenta);
    const tasaNum = Number(v.product.taxRate.tasa);

    return {
      variantId: v.id,
      productId: v.productId,
      productoNombre: v.product.nombre,
      varianteNombre: v.nombre ?? null,
      sku: v.sku ?? null,
      codigoBarras: v.codigoBarras ?? null,
      precioVenta: precioVentaNum,
      precioConImpuesto: precioConImpuesto(precioVentaNum, tasaNum),
      stock: v.stock,
      disponible: v.disponible,
      exactBarcode: v.codigoBarras === term,
    };
  });

  // Sort by: exactBarcode (true first), SKU startsWith, productoNombre, varianteNombre
  hits.sort((a, b) => {
    // 1. exactBarcode (true before false)
    if (a.exactBarcode !== b.exactBarcode) {
      return a.exactBarcode ? -1 : 1;
    }

    // 2. SKU prefix match (those that startWith term come first)
    const aSkuStarts = a.sku ? a.sku.startsWith(term) : false;
    const bSkuStarts = b.sku ? b.sku.startsWith(term) : false;
    if (aSkuStarts !== bSkuStarts) {
      return aSkuStarts ? -1 : 1;
    }

    // 3. productoNombre asc
    if (a.productoNombre !== b.productoNombre) {
      return a.productoNombre.localeCompare(b.productoNombre);
    }

    // 4. varianteNombre asc (nulls last)
    const aVarName = a.varianteNombre ?? '';
    const bVarName = b.varianteNombre ?? '';
    return aVarName.localeCompare(bVarName);
  });

  // Slice to limit
  return hits.slice(0, limit);
}
