import { db } from '@/lib/db';
import type { MovementType } from '@prisma/client';

export type MovementRow = {
  id: string;
  createdAt: Date;
  productoNombre: string;
  varianteNombre: string | null;
  tipo: string;
  tipoLabel: string;
  cantidad: number;
  stockPrevio: number;
  stockNuevo: number;
  motivo: string;
  actorNombre: string | null;
  costoUnitario: number | null;
};

const TIPO_LABEL: Record<string, string> = {
  ENTRADA: 'Entrada',
  SALIDA: 'Salida',
  AJUSTE: 'Ajuste',
  VENTA: 'Venta',
  DEVOLUCION: 'Devolución',
};

export function movementTipoLabel(t: string): string {
  return TIPO_LABEL[t] ?? t;
}

export async function listMovements(filtro: {
  variantId?: string;
  productId?: string;
  tipo?: string;
  desde?: Date;
  hasta?: Date;
  actorId?: string;
  page: number;
  pageSize: number;
}): Promise<{ rows: MovementRow[]; total: number }> {
  const where = {
    ...(filtro.variantId ? { variantId: filtro.variantId } : {}),
    ...(filtro.productId ? { variant: { productId: filtro.productId } } : {}),
    ...(filtro.tipo ? { tipo: filtro.tipo as MovementType } : {}),
    ...(filtro.desde || filtro.hasta
      ? {
          createdAt: {
            ...(filtro.desde ? { gte: filtro.desde } : {}),
            ...(filtro.hasta ? { lte: filtro.hasta } : {}),
          },
        }
      : {}),
    ...(filtro.actorId ? { actorId: filtro.actorId } : {}),
  };

  const [rows, total] = await Promise.all([
    db.inventoryMovement.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (filtro.page - 1) * filtro.pageSize,
      take: filtro.pageSize,
      include: {
        actor: { select: { nombre: true } },
        variant: { select: { nombre: true, product: { select: { nombre: true } } } },
      },
    }),
    db.inventoryMovement.count({ where }),
  ]);

  return {
    total,
    rows: rows.map((r) => ({
      id: r.id,
      createdAt: r.createdAt,
      productoNombre: r.variant.product.nombre,
      varianteNombre: r.variant.nombre,
      tipo: r.tipo,
      tipoLabel: movementTipoLabel(r.tipo),
      cantidad: r.cantidad,
      stockPrevio: r.stockPrevio,
      stockNuevo: r.stockNuevo,
      motivo: r.motivo,
      actorNombre: r.actor?.nombre ?? null,
      costoUnitario: r.costoUnitario == null ? null : Number(r.costoUnitario),
    })),
  };
}

export type StockRow = {
  variantId: string;
  productId: string;
  productoNombre: string;
  varianteNombre: string | null;
  sku: string | null;
  stock: number;
  stockMinimo: number;
  estado: 'ok' | 'bajo' | 'agotado';
};

/**
 * Lists active product variants with their stock status.
 *
 * Criteria: non-archived variants of non-archived products
 * Filters: q (product name contains / SKU contains / codigoBarras exact, all in-memory),
 *          categoryId, soloAgotados, soloStockBajo
 * Estado: 'agotado' if stock <= 0; 'bajo' if stockMinimo > 0 && stock <= stockMinimo; else 'ok'
 * Sorted by: product nombre ASC, variant nombre ASC
 *
 * Note: estado filter is applied in-memory after db fetch for simplicity.
 * total counts the filtered estado results.
 */
export async function listStock(filtro: {
  q?: string;
  categoryId?: string;
  soloAgotados?: boolean;
  soloStockBajo?: boolean;
  page: number;
  pageSize: number;
}): Promise<{ rows: StockRow[]; total: number }> {
  const where = {
    archivada: false,
    product: {
      archivado: false,
      ...(filtro.categoryId ? { categoryId: filtro.categoryId } : {}),
    },
  };

  // Fetch all variants matching base criteria
  const variants = await db.productVariant.findMany({
    where,
    include: {
      product: {
        select: { id: true, nombre: true },
      },
    },
    orderBy: [{ product: { nombre: 'asc' } }, { nombre: 'asc' }],
  });

  // Filter by q (in-memory: product nombre contains, or sku contains, or codigoBarras equals)
  let matched = variants;
  if (filtro.q) {
    const qLower = filtro.q.toLowerCase();
    matched = matched.filter(
      (v) =>
        v.product.nombre.toLowerCase().includes(qLower) ||
        (v.sku && v.sku.toLowerCase().includes(qLower)) ||
        (v.codigoBarras && v.codigoBarras.toLowerCase() === qLower),
    );
  }

  // Map to StockRow with estado derivation
  let rows = matched.map((v) => {
    const estado: 'ok' | 'bajo' | 'agotado' =
      v.stock <= 0 ? 'agotado' : v.stockMinimo > 0 && v.stock <= v.stockMinimo ? 'bajo' : 'ok';

    return {
      variantId: v.id,
      productId: v.product.id,
      productoNombre: v.product.nombre,
      varianteNombre: v.nombre,
      sku: v.sku,
      stock: v.stock,
      stockMinimo: v.stockMinimo,
      estado,
    };
  });

  // Filter by estado
  if (filtro.soloAgotados) {
    rows = rows.filter((r) => r.estado === 'agotado');
  }
  if (filtro.soloStockBajo) {
    rows = rows.filter((r) => r.estado === 'bajo');
  }

  // Pagination
  const total = rows.length;
  const start = (filtro.page - 1) * filtro.pageSize;
  const end = start + filtro.pageSize;
  const paginatedRows = rows.slice(start, end);

  return { rows: paginatedRows, total };
}
