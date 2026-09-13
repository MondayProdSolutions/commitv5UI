import { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { recordMovement } from '@/lib/inventory/movements';
import { logActivity } from '@/lib/audit';
import { ValidationError } from '@/lib/errors';
import type { EditVariantInput, VariantInput } from '@/lib/validation/product';

function isP2002(e: unknown): e is Prisma.PrismaClientKnownRequestError {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';
}

// Traduce el target de un P2002 al campo del input (`sku` por defecto).
function uniqueField(e: Prisma.PrismaClientKnownRequestError): 'sku' | 'codigoBarras' {
  const target = e.meta?.target;
  const parts = Array.isArray(target) ? target.map(String) : [String(target ?? '')];
  return parts.some((t) => t.includes('codigoBarras')) ? 'codigoBarras' : 'sku';
}

const norm = (s: string) => s.trim().toLowerCase();

/**
 * Edita los datos de una variante. **Nunca** escribe `stock` (eso pasa por
 * `recordMovement` con `tipo: 'AJUSTE'`, un flujo aparte).
 *
 * Auditoría: si `precioVenta`/`precioCompra` cambian se emite
 * `productos.precio_cambiado`; si además cambian otros campos
 * (`nombre/sku/codigoBarras/stockMinimo/disponible`) se emite también
 * `productos.editar` para dejar traza completa de esos cambios.
 */
export async function editVariant(
  actorId: string,
  variantId: string,
  input: EditVariantInput,
  ip: string | null,
): Promise<void> {
  const current = await db.productVariant.findUnique({ where: { id: variantId } });
  if (!current) throw new ValidationError({ _form: 'La variante no existe.' });

  // El formulario de edición es autoritativo: siempre envía el payload completo
  // (campo vacío → `null` vía transform). `nombre`, `sku` y `codigoBarras` se
  // tratan igual — un campo omitido/vacío lo limpia, no lo conserva.
  const nombre = input.nombre ?? null;
  const sku = input.sku ?? null;
  const codigoBarras = input.codigoBarras ?? null;

  await db.$transaction(async (tx) => {
    try {
      await tx.productVariant.update({
        where: { id: variantId },
        data: {
          nombre,
          sku,
          codigoBarras,
          precioVenta: input.precioVenta,
          precioCompra: input.precioCompra,
          stockMinimo: input.stockMinimo,
          disponible: input.disponible,
        },
      });
    } catch (e) {
      if (isP2002(e)) throw new ValidationError({ [uniqueField(e)]: 'Ya está en uso.' });
      throw e;
    }

    const precioCambio =
      Number(current.precioVenta) !== input.precioVenta ||
      Number(current.precioCompra) !== input.precioCompra;

    const antes = {
      nombre: current.nombre,
      sku: current.sku,
      codigoBarras: current.codigoBarras,
      stockMinimo: current.stockMinimo,
      disponible: current.disponible,
    };
    const despues = { nombre, sku, codigoBarras, stockMinimo: input.stockMinimo, disponible: input.disponible };
    const otroCambio = (Object.keys(antes) as (keyof typeof antes)[]).some(
      (k) => antes[k] !== despues[k],
    );

    if (precioCambio) {
      await logActivity(
        {
          actorId,
          accion: 'productos.precio_cambiado',
          entidad: 'ProductVariant',
          entidadId: variantId,
          metadata: {
            variantId,
            antes: {
              precioVenta: Number(current.precioVenta),
              precioCompra: Number(current.precioCompra),
            },
            despues: { precioVenta: input.precioVenta, precioCompra: input.precioCompra },
          },
          ip,
        },
        tx,
      );
    }

    if (otroCambio) {
      await logActivity(
        {
          actorId,
          accion: 'productos.editar',
          entidad: 'ProductVariant',
          entidadId: variantId,
          metadata: { variantId, antes, despues },
          ip,
        },
        tx,
      );
    }
  });
}

/**
 * Añade una variante a un producto que ya es `CON_VARIANTES`.
 */
export async function addVariant(
  actorId: string,
  productId: string,
  input: VariantInput & { nombre: string },
  ip: string | null,
): Promise<{ variantId: string }> {
  const product = await db.product.findUnique({
    where: { id: productId },
    include: { variants: true },
  });
  if (!product) throw new ValidationError({ _form: 'El producto no existe.' });
  if (product.tipo !== 'CON_VARIANTES') {
    throw new ValidationError({
      _form: 'Convierte el producto a «con variantes» antes de añadir variantes.',
    });
  }

  const nombre = input.nombre.trim();
  if (!nombre) throw new ValidationError({ nombre: 'El nombre es obligatorio.' });

  const colision = product.variants.some(
    (v) => !v.archivada && v.nombre != null && norm(v.nombre) === norm(nombre),
  );
  if (colision) throw new ValidationError({ nombre: 'Ya existe una variante con ese nombre.' });

  return db.$transaction(async (tx) => {
    let variantId: string;
    try {
      const variant = await tx.productVariant.create({
        data: {
          productId,
          nombre,
          esDefault: false,
          sku: input.sku ?? null,
          codigoBarras: input.codigoBarras ?? null,
          precioVenta: input.precioVenta,
          precioCompra: input.precioCompra ?? 0,
          stockMinimo: input.stockMinimo ?? 0,
          stock: 0,
        },
      });
      variantId = variant.id;
    } catch (e) {
      if (isP2002(e)) throw new ValidationError({ [uniqueField(e)]: 'Ya está en uso.' });
      throw e;
    }

    if (input.stockInicial > 0) {
      await recordMovement(
        {
          variantId,
          tipo: 'ENTRADA',
          valor: input.stockInicial,
          motivo: 'Alta de producto',
          costoUnitario: input.precioCompra || null,
          actorId,
        },
        tx,
      );
    }

    await logActivity(
      {
        actorId,
        accion: 'productos.variante_agregada',
        entidad: 'Product',
        entidadId: productId,
        metadata: { productId, variantId, nombre },
        ip,
      },
      tx,
    );

    return { variantId };
  });
}

/**
 * Convierte un producto `SIMPLE` en `CON_VARIANTES`: la variante `esDefault`
 * deja de serlo y recibe un nombre; se añaden las nuevas variantes.
 */
export async function convertToVariants(
  actorId: string,
  productId: string,
  input: { defaultNombre: string; nuevas: (VariantInput & { nombre: string })[] },
  ip: string | null,
): Promise<void> {
  const product = await db.product.findUnique({
    where: { id: productId },
    include: { variants: true },
  });
  if (!product) throw new ValidationError({ _form: 'El producto no existe.' });
  if (product.tipo !== 'SIMPLE') {
    throw new ValidationError({ _form: 'El producto ya tiene variantes.' });
  }

  const defaultNombre = input.defaultNombre.trim();
  if (!defaultNombre) throw new ValidationError({ defaultNombre: 'El nombre es obligatorio.' });
  if (input.nuevas.length < 1) {
    throw new ValidationError({ _form: 'Añade al menos una variante nueva.' });
  }

  const nombres = [defaultNombre, ...input.nuevas.map((n) => n.nombre.trim())];
  if (nombres.some((n) => !n)) {
    throw new ValidationError({ _form: 'Todas las variantes deben tener un nombre.' });
  }
  if (new Set(nombres.map(norm)).size !== nombres.length) {
    throw new ValidationError({ _form: 'Los nombres de variante deben ser únicos.' });
  }

  const defaultVariant = product.variants.find((v) => v.esDefault) ?? product.variants[0];
  if (!defaultVariant) throw new ValidationError({ _form: 'El producto no tiene variante base.' });

  await db.$transaction(async (tx) => {
    await tx.product.update({ where: { id: productId }, data: { tipo: 'CON_VARIANTES' } });

    await tx.productVariant.update({
      where: { id: defaultVariant.id },
      data: { esDefault: false, nombre: defaultNombre },
    });

    for (const nueva of input.nuevas) {
      let variantId: string;
      try {
        const variant = await tx.productVariant.create({
          data: {
            productId,
            nombre: nueva.nombre.trim(),
            esDefault: false,
            sku: nueva.sku ?? null,
            codigoBarras: nueva.codigoBarras ?? null,
            precioVenta: nueva.precioVenta,
            precioCompra: nueva.precioCompra ?? 0,
            stockMinimo: nueva.stockMinimo ?? 0,
            stock: 0,
          },
        });
        variantId = variant.id;
      } catch (e) {
        if (isP2002(e)) throw new ValidationError({ [uniqueField(e)]: 'Ya está en uso.' });
        throw e;
      }

      if (nueva.stockInicial > 0) {
        await recordMovement(
          {
            variantId,
            tipo: 'ENTRADA',
            valor: nueva.stockInicial,
            motivo: 'Alta de producto',
            costoUnitario: nueva.precioCompra || null,
            actorId,
          },
          tx,
        );
      }
    }

    await logActivity(
      {
        actorId,
        accion: 'productos.editar',
        entidad: 'Product',
        entidadId: productId,
        metadata: {
          productId,
          conversion: 'SIMPLE_A_CON_VARIANTES',
          nuevasVariantes: input.nuevas.length,
        },
        ip,
      },
      tx,
    );
  });
}

/**
 * Archiva una variante. No se puede archivar la última variante activa de un
 * producto (habría que archivar el producto entero).
 */
export async function archiveVariant(
  actorId: string,
  variantId: string,
  ip: string | null,
): Promise<void> {
  const variant = await db.productVariant.findUnique({ where: { id: variantId } });
  if (!variant) throw new ValidationError({ _form: 'La variante no existe.' });

  const activas = await db.productVariant.count({
    where: { productId: variant.productId, archivada: false },
  });
  if (activas === 1) {
    throw new ValidationError({
      _form: 'Es la única variante activa del producto; archiva el producto entero.',
    });
  }

  await db.$transaction(async (tx) => {
    await tx.productVariant.update({ where: { id: variantId }, data: { archivada: true } });
    await logActivity(
      {
        actorId,
        accion: 'productos.variante_archivada',
        entidad: 'ProductVariant',
        entidadId: variantId,
        metadata: { variantId },
        ip,
      },
      tx,
    );
  });
}

export async function setVariantDisponible(
  actorId: string,
  variantId: string,
  disponible: boolean,
  ip: string | null,
): Promise<void> {
  await db.$transaction(async (tx) => {
    await tx.productVariant.update({ where: { id: variantId }, data: { disponible } });
    await logActivity(
      {
        actorId,
        accion: 'productos.disponibilidad',
        entidad: 'ProductVariant',
        entidadId: variantId,
        metadata: { variantId, disponible },
        ip,
      },
      tx,
    );
  });
}
