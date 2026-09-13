'use server';

import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requirePermission } from '@/lib/auth/context';
import { getClientIp } from '@/lib/http';
import { ValidationError } from '@/lib/errors';
import { createCategorySchema, updateCategorySchema } from '@/lib/validation/category';
import {
  createCategory,
  updateCategory,
  archiveCategory,
  restoreCategory,
} from '@/lib/catalog/categories';
import { getProduct, updateProduct } from '@/lib/catalog/products';
import type { FormState } from '@/app/(auth)/setup/actions';

export type CategoriaActionState = FormState & {
  id?: string;
  subcategoriasArchivadas?: number;
  productosAfectados?: number;
};

const CATEGORIAS_PATH = '/categorias';
const SIN_CATEGORIA_PATH = '/categorias/sin-categoria-activa';

function fieldErrorsFrom(error: z.ZodError): Record<string, string> {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? '');
    if (key && !(key in fieldErrors)) fieldErrors[key] = issue.message;
  }
  return fieldErrors;
}

function fromValidationError(e: ValidationError): CategoriaActionState {
  const { _form, ...fieldErrors } = e.fields;
  return { ok: false, formError: _form || undefined, fieldErrors };
}

async function ip(): Promise<string | null> {
  return getClientIp(await headers());
}

export async function crearCategoriaAction(
  _prev: CategoriaActionState,
  formData: FormData,
): Promise<CategoriaActionState> {
  const actor = await requirePermission('categorias.gestionar');

  const parsed = createCategorySchema.safeParse({
    nombre: formData.get('nombre'),
    parentId: formData.get('parentId') ?? undefined,
    icono: formData.get('icono') ?? undefined,
    color: formData.get('color') ?? undefined,
    orden: formData.get('orden') ?? undefined,
  });
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsFrom(parsed.error) };

  try {
    const { id } = await createCategory(actor.id, parsed.data, await ip());
    revalidatePath(CATEGORIAS_PATH);
    return { ok: true, id };
  } catch (e) {
    if (e instanceof ValidationError) return fromValidationError(e);
    throw e;
  }
}

export async function editarCategoriaAction(
  _prev: CategoriaActionState,
  formData: FormData,
): Promise<CategoriaActionState> {
  const actor = await requirePermission('categorias.gestionar');

  const parsed = updateCategorySchema.safeParse({
    id: formData.get('id'),
    nombre: formData.get('nombre'),
    parentId: formData.get('parentId') ?? undefined,
    icono: formData.get('icono') ?? undefined,
    color: formData.get('color') ?? undefined,
    orden: formData.get('orden') ?? undefined,
  });
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsFrom(parsed.error) };

  const { id, nombre, parentId, icono, color, orden } = parsed.data;
  try {
    await updateCategory(actor.id, id, { nombre, parentId, icono, color, orden }, await ip());
    revalidatePath(CATEGORIAS_PATH);
    return { ok: true, id };
  } catch (e) {
    if (e instanceof ValidationError) return fromValidationError(e);
    throw e;
  }
}

export async function archivarCategoriaAction(
  _prev: CategoriaActionState,
  formData: FormData,
): Promise<CategoriaActionState> {
  const actor = await requirePermission('categorias.gestionar');

  const id = String(formData.get('id') ?? '');
  if (!id) return { ok: false, formError: 'Categoría no válida.' };

  try {
    const r = await archiveCategory(actor.id, id, await ip());
    revalidatePath(CATEGORIAS_PATH);
    return {
      ok: true,
      id,
      subcategoriasArchivadas: r.subcategoriasArchivadas,
      productosAfectados: r.productosAfectados,
    };
  } catch (e) {
    if (e instanceof ValidationError) return fromValidationError(e);
    throw e;
  }
}

export async function restaurarCategoriaAction(
  _prev: CategoriaActionState,
  formData: FormData,
): Promise<CategoriaActionState> {
  const actor = await requirePermission('categorias.gestionar');

  const id = String(formData.get('id') ?? '');
  if (!id) return { ok: false, formError: 'Categoría no válida.' };

  try {
    await restoreCategory(actor.id, id, await ip());
    revalidatePath(CATEGORIAS_PATH);
    return { ok: true, id };
  } catch (e) {
    if (e instanceof ValidationError) return fromValidationError(e);
    throw e;
  }
}

export async function recategorizarProductoAction(
  _prev: CategoriaActionState,
  formData: FormData,
): Promise<CategoriaActionState> {
  const actor = await requirePermission('productos.editar');

  const productId = String(formData.get('productId') ?? '');
  if (!productId) return { ok: false, formError: 'Producto no válido.' };
  const categoryId = String(formData.get('categoryId') ?? '') || null;

  try {
    const producto = await getProduct(productId);
    if (!producto) return { ok: false, formError: 'El producto no existe.' };

    await updateProduct(
      actor.id,
      productId,
      {
        id: productId,
        nombre: producto.nombre,
        descripcion: producto.descripcion,
        categoryId,
        taxRateId: producto.taxRateId,
        imagenUrl: producto.imagenUrl,
      },
      await ip(),
    );
    revalidatePath(SIN_CATEGORIA_PATH);
    revalidatePath(CATEGORIAS_PATH);
    return { ok: true, id: productId };
  } catch (e) {
    if (e instanceof ValidationError) return fromValidationError(e);
    throw e;
  }
}
