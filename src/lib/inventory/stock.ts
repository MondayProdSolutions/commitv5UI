import { db, getCurrentTenantId } from '@/lib/db';

export type LowStockRow = {
  variantId: string;
  productId: string;
  productoNombre: string;
  varianteNombre: string | null;
  stock: number;
  stockMinimo: number;
  deficit: number;
};

// Module-level cache, keyed by tenant: TTL 30,000 ms. Un Map (no un solo
// valor global) evita que el conteo de un tenant se filtre al sidebar de
// otro durante la ventana de TTL.
const cache = new Map<string, { value: number; at: number }>();
const CACHE_TTL = 30_000;

/**
 * Fetches paginated list of low-stock variants.
 *
 * Criteria: stockMinimo > 0 AND stock <= stockMinimo AND !archivada AND !product.archivado
 * Sorted by: deficit DESC (highest first), then productoNombre ASC
 *
 * Note: Filtering by stock <= stockMinimo is done in-memory after db fetch.
 * At typical catalog sizes (< 10k variants), this is acceptable and avoids a complex WHERE clause.
 */
export async function lowStockVariants({
  page = 1,
  pageSize = 50,
}: { page?: number; pageSize?: number } = {}): Promise<{ rows: LowStockRow[]; total: number }> {
  const variants = await db.productVariant.findMany({
    where: {
      archivada: false,
      stockMinimo: { gt: 0 },
      product: { archivado: false },
    },
    include: {
      product: {
        select: { id: true, nombre: true },
      },
    },
  });

  // Filter by stock <= stockMinimo and build rows with deficit
  const filtered = variants
    .filter((v) => v.stock <= v.stockMinimo)
    .map((v) => ({
      variantId: v.id,
      productId: v.product.id,
      productoNombre: v.product.nombre,
      varianteNombre: v.nombre,
      stock: v.stock,
      stockMinimo: v.stockMinimo,
      deficit: v.stockMinimo - v.stock,
    }));

  // Sort by deficit DESC (most critical first), then by productoNombre ASC
  const sorted = filtered.sort((a, b) => {
    if (b.deficit !== a.deficit) {
      return b.deficit - a.deficit;
    }
    return a.productoNombre.localeCompare(b.productoNombre);
  });

  // Apply pagination
  const start = (page - 1) * pageSize;
  const end = start + pageSize;
  const rows = sorted.slice(start, end);

  return {
    rows,
    total: filtered.length,
  };
}

/**
 * Returns the count of low-stock variants with module-level cache (TTL 30s).
 * Cache is invalidated by invalidateStockAlertsCache().
 */
export async function stockAlertsCount(): Promise<number> {
  const tenantId = getCurrentTenantId();
  const now = Date.now();

  // Check cache hit within TTL
  const cached = cache.get(tenantId);
  if (cached !== undefined && now - cached.at < CACHE_TTL) {
    return cached.value;
  }

  // Cache miss: recompute
  const variants = await db.productVariant.findMany({
    where: {
      archivada: false,
      stockMinimo: { gt: 0 },
      product: { archivado: false },
    },
  });

  const count = variants.filter((v) => v.stock <= v.stockMinimo).length;

  // Store in cache
  cache.set(tenantId, { value: count, at: now });

  return count;
}

/**
 * Invalidates the low-stock alerts cache for the current tenant.
 * Called by recordMovement after an inventory change.
 */
export function invalidateStockAlertsCache(): void {
  cache.delete(getCurrentTenantId());
}

/** Cuenta de variantes activas (no archivadas, de productos no archivados). Para la KPI "Total SKUs". */
export async function totalSkusActivos(): Promise<number> {
  return db.productVariant.count({
    where: { archivada: false, product: { archivado: false } },
  });
}
