import { Prisma, type MovementType, type ProductType } from '@prisma/client';
import { db } from '@/lib/db';
import { recordMovement } from '@/lib/inventory/movements';
import { precioConImpuesto } from '@/lib/taxes';
import { searchProducts } from './search';
import { logActivity } from '@/lib/audit';
import { ValidationError } from '@/lib/errors';
import type { CreateProductInput, UpdateProductInput } from '@/lib/validation/product';

export type VariantMovementRow = {
  id: string;
  tipo: MovementType;
  cantidad: number;
  stockPrevio: number;
  stockNuevo: number;
  motivo: string;
  createdAt: Date;
};

export type VariantDetail = {
  id: string;
  nombre: string | null;
  esDefault: boolean;
  sku: string | null;
  codigoBarras: string | null;
  precioVenta: number;
  precioConImpuesto: number;
  precioCompra: number;
  stock: number;
  stockMinimo: number;
  disponible: boolean;
  archivada: boolean;
  movimientos: VariantMovementRow[];
};

export type ProductDetail = {
  id: string;
  nombre: string;
  descripcion: string | null;
  categoryId: string | null;
  categoriaNombre: string | null;
  taxRateId: string;
  tasa: number;
  tipo: ProductType;
  imagenUrl: string | null;
  archivado: boolean;
  createdAt: Date;
  variants: VariantDetail[];
};

export type ProductEstado = 'activo' | 'no_disponible' | 'agotado' | 'archivado';

export type ProductListRow = {
  id: string;
  nombre: string;
  categoriaNombre: string | null;
  imagenUrl: string | null;
  nVariantes: number;
  precioMin: number;
  precioMax: number;
  stockTotal: number;
  estado: ProductEstado;
};

export type ListProductsFilter = {
  q?: string;
  categoryId?: string;
  estado?: 'activos' | 'archivados' | 'todos';
  soloStockBajo?: boolean;
  page: number;
  pageSize: number;
};

function isP2002(e: unknown): e is Prisma.PrismaClientKnownRequestError {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';
}

// Traduce el target de un P2002 al campo del input (`sku` por defecto).
function uniqueField(e: Prisma.PrismaClientKnownRequestError): 'sku' | 'codigoBarras' {
  const target = e.meta?.target;
  const parts = Array.isArray(target) ? target.map(String) : [String(target ?? '')];
  return parts.some((t) => t.includes('codigoBarras')) ? 'codigoBarras' : 'sku';
}

export async function createProduct(
  actorId: string,
  input: CreateProductInput,
  ip: string | null,
): Promise<{ productId: string; variantIds: string[] }> {
  return db.$transaction(async (tx) => {
    const product = await tx.product.create({
      data: {
        nombre: input.nombre,
        descripcion: input.descripcion ?? null,
        categoryId: input.categoryId ?? null,
        taxRateId: input.taxRateId,
        tipo: input.tipo,
        imagenUrl: input.imagenUrl ?? null,
        createdById: actorId,
      },
    });

    const variantIds: string[] = [];
    for (let i = 0; i < input.variantes.length; i++) {
      const vin = input.variantes[i];
      try {
        const variant = await tx.productVariant.create({
          data: {
            productId: product.id,
            nombre: input.tipo === 'SIMPLE' ? null : vin.nombre,
            esDefault: input.tipo === 'SIMPLE',
            sku: vin.sku ?? null,
            codigoBarras: vin.codigoBarras ?? null,
            precioVenta: vin.precioVenta,
            precioCompra: vin.precioCompra ?? 0,
            stockMinimo: vin.stockMinimo ?? 0,
            stock: 0,
          },
        });
        variantIds.push(variant.id);
      } catch (e) {
        if (isP2002(e)) {
          throw new ValidationError({ [`variantes.${i}.${uniqueField(e)}`]: 'Ya está en uso.' });
        }
        throw e;
      }
    }

    for (let i = 0; i < input.variantes.length; i++) {
      const vin = input.variantes[i];
      if (vin.stockInicial > 0) {
        await recordMovement(
          {
            variantId: variantIds[i],
            tipo: 'ENTRADA',
            valor: vin.stockInicial,
            motivo: 'Alta de producto',
            costoUnitario: vin.precioCompra || null,
            actorId,
          },
          tx,
        );
      }
    }

    await logActivity(
      {
        actorId,
        accion: 'productos.crear',
        entidad: 'Product',
        entidadId: product.id,
        metadata: {
          nombre: input.nombre,
          tipo: input.tipo,
          categoryId: input.categoryId ?? null,
          nVariantes: input.variantes.length,
        },
        ip,
      },
      tx,
    );

    return { productId: product.id, variantIds };
  });
}

export async function updateProduct(
  actorId: string,
  id: string,
  input: UpdateProductInput,
  ip: string | null,
): Promise<void> {
  await db.$transaction(async (tx) => {
    const current = await tx.product.findUnique({ where: { id }, include: { taxRate: true } });
    if (!current) throw new ValidationError({ _form: 'El producto no existe.' });

    const despuesValores = {
      nombre: input.nombre,
      descripcion: input.descripcion ?? null,
      categoryId: input.categoryId ?? null,
      taxRateId: input.taxRateId,
      imagenUrl: input.imagenUrl ?? null,
    };
    const antesValores = {
      nombre: current.nombre,
      descripcion: current.descripcion,
      categoryId: current.categoryId,
      taxRateId: current.taxRateId,
      imagenUrl: current.imagenUrl,
    };

    await tx.product.update({ where: { id }, data: despuesValores });

    const antes: Record<string, unknown> = {};
    const despues: Record<string, unknown> = {};
    for (const key of Object.keys(despuesValores) as (keyof typeof despuesValores)[]) {
      if (antesValores[key] !== despuesValores[key]) {
        antes[key] = antesValores[key];
        despues[key] = despuesValores[key];
      }
    }

    const metadata: Record<string, unknown> = { antes, despues };
    if (antesValores.taxRateId !== despuesValores.taxRateId) {
      metadata.taxRateAntes = antesValores.taxRateId;
      metadata.taxRateDespues = despuesValores.taxRateId;
    }

    await logActivity(
      { actorId, accion: 'productos.editar', entidad: 'Product', entidadId: id, metadata, ip },
      tx,
    );
  });
}

export async function setProductDisponible(
  actorId: string,
  id: string,
  disponible: boolean,
  ip: string | null,
): Promise<void> {
  await db.$transaction(async (tx) => {
    await tx.productVariant.updateMany({ where: { productId: id }, data: { disponible } });
    await logActivity(
      {
        actorId,
        accion: 'productos.disponibilidad',
        entidad: 'Product',
        entidadId: id,
        metadata: { productId: id, disponible },
        ip,
      },
      tx,
    );
  });
}

async function setArchived(
  actorId: string,
  id: string,
  archivado: boolean,
  accion: 'productos.archivar' | 'productos.restaurar',
  ip: string | null,
): Promise<void> {
  await db.$transaction(async (tx) => {
    await tx.product.update({ where: { id }, data: { archivado } });
    await tx.productVariant.updateMany({ where: { productId: id }, data: { archivada: archivado } });
    await logActivity(
      { actorId, accion, entidad: 'Product', entidadId: id, metadata: { productId: id }, ip },
      tx,
    );
  });
}

export function archiveProduct(actorId: string, id: string, ip: string | null): Promise<void> {
  return setArchived(actorId, id, true, 'productos.archivar', ip);
}

export function restoreProduct(actorId: string, id: string, ip: string | null): Promise<void> {
  return setArchived(actorId, id, false, 'productos.restaurar', ip);
}

export async function getProduct(id: string): Promise<ProductDetail | null> {
  const product = await db.product.findUnique({
    where: { id },
    include: {
      category: { select: { nombre: true } },
      taxRate: true,
      variants: {
        orderBy: { createdAt: 'asc' },
        include: { movements: { orderBy: { createdAt: 'desc' }, take: 10 } },
      },
    },
  });
  if (!product) return null;

  const tasa = Number(product.taxRate.tasa);

  return {
    id: product.id,
    nombre: product.nombre,
    descripcion: product.descripcion,
    categoryId: product.categoryId,
    categoriaNombre: product.category?.nombre ?? null,
    taxRateId: product.taxRateId,
    tasa,
    tipo: product.tipo,
    imagenUrl: product.imagenUrl,
    archivado: product.archivado,
    createdAt: product.createdAt,
    variants: product.variants.map((variant): VariantDetail => {
      const precioVenta = Number(variant.precioVenta);
      return {
        id: variant.id,
        nombre: variant.nombre,
        esDefault: variant.esDefault,
        sku: variant.sku,
        codigoBarras: variant.codigoBarras,
        precioVenta,
        precioConImpuesto: precioConImpuesto(precioVenta, tasa),
        precioCompra: Number(variant.precioCompra),
        stock: variant.stock,
        stockMinimo: variant.stockMinimo,
        disponible: variant.disponible,
        archivada: variant.archivada,
        movimientos: variant.movements.map((m) => ({
          id: m.id,
          tipo: m.tipo,
          cantidad: m.cantidad,
          stockPrevio: m.stockPrevio,
          stockNuevo: m.stockNuevo,
          motivo: m.motivo,
          createdAt: m.createdAt,
        })),
      };
    }),
  };
}

const listInclude = {
  category: { select: { nombre: true } },
  variants: { where: { archivada: false } },
} satisfies Prisma.ProductInclude;

type ProductWithList = Prisma.ProductGetPayload<{ include: typeof listInclude }>;

function toListRow(product: ProductWithList): ProductListRow {
  const vs = product.variants; // sólo no archivadas (filtradas en el include)
  const precios = vs.map((v) => Number(v.precioVenta));
  const stockTotal = vs.reduce((sum, v) => sum + v.stock, 0);

  let estado: ProductEstado;
  if (product.archivado) estado = 'archivado';
  else if (stockTotal <= 0) estado = 'agotado';
  else if (vs.length > 0 && vs.every((v) => v.disponible === false)) estado = 'no_disponible';
  else estado = 'activo';

  return {
    id: product.id,
    nombre: product.nombre,
    categoriaNombre: product.category?.nombre ?? null,
    imagenUrl: product.imagenUrl,
    nVariantes: vs.length,
    precioMin: precios.length ? Math.min(...precios) : 0,
    precioMax: precios.length ? Math.max(...precios) : 0,
    stockTotal,
    estado,
  };
}

function tieneStockBajo(product: ProductWithList): boolean {
  return product.variants.some((v) => v.stockMinimo > 0 && v.stock <= v.stockMinimo);
}

/**
 * `categoryId` filtra por coincidencia directa: NO se expande a subcategorías en este bloque.
 * `soloStockBajo` se resuelve en memoria (Prisma no expresa `stock <= stockMinimo` en `where`);
 * en ese caso `total` es la longitud del conjunto ya filtrado, no un `count()` de BD.
 * `q` resuelve los `productId` vía `searchProducts` con `limit: 200`: ese límite se
 * respeta (se leen hasta 200 variantes coincidentes, sin el antiguo tope de 60),
 * así que catálogos grandes ya no pierden coincidencias de forma silenciosa.
 */
export async function listProducts(
  filtro: ListProductsFilter,
): Promise<{ rows: ProductListRow[]; total: number }> {
  const { q, categoryId, estado = 'activos', soloStockBajo, page, pageSize } = filtro;

  const where: Prisma.ProductWhereInput = {};
  if (estado === 'activos') where.archivado = false;
  else if (estado === 'archivados') where.archivado = true;
  // 'todos' → sin filtro de archivado

  if (categoryId) where.categoryId = categoryId;

  if (q !== undefined && q.trim() !== '') {
    const hits = await searchProducts(q, { incluirArchivados: true, limit: 200 });
    const ids = [...new Set(hits.map((h) => h.productId))];
    if (ids.length === 0) return { rows: [], total: 0 };
    where.id = { in: ids };
  }

  const skip = (page - 1) * pageSize;

  if (soloStockBajo) {
    const all = await db.product.findMany({
      where,
      include: listInclude,
      orderBy: { nombre: 'asc' },
    });
    const filtered = all.filter(tieneStockBajo);
    return {
      rows: filtered.slice(skip, skip + pageSize).map(toListRow),
      total: filtered.length,
    };
  }

  const [total, products] = await Promise.all([
    db.product.count({ where }),
    db.product.findMany({
      where,
      include: listInclude,
      orderBy: { nombre: 'asc' },
      skip,
      take: pageSize,
    }),
  ]);

  return { rows: products.map(toListRow), total };
}
