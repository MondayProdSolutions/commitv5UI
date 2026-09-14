'use server';

import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { requirePermission } from '@/lib/auth/context';
import { getClientIp } from '@/lib/http';
import { ValidationError } from '@/lib/errors';
import {
  createProductSchema,
  updateProductSchema,
  editVariantSchema,
  variantInputSchema,
} from '@/lib/validation/product';
import {
  createProduct,
  updateProduct,
  archiveProduct,
  restoreProduct,
  setProductDisponible,
} from '@/lib/catalog/products';
import {
  editVariant,
  addVariant,
  convertToVariants,
  archiveVariant,
  setVariantDisponible,
} from '@/lib/catalog/variants';
import { withTenant } from '@/lib/db';
import { requireRequestTenantId } from '@/lib/tenant/with-request-tenant';
import type { FormState } from '@/app/(auth)/setup/actions';

const PRODUCTOS_PATH = '/productos';

function idPath(id: string): string {
  return `/productos/${id}`;
}

function fieldErrorsFrom(error: z.ZodError): Record<string, string> {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.map(String).join('.');
    if (key && !(key in fieldErrors)) fieldErrors[key] = issue.message;
  }
  return fieldErrors;
}

function fromValidationError(e: ValidationError): FormState {
  const { _form, ...fieldErrors } = e.fields;
  return { ok: false, formError: _form || undefined, fieldErrors };
}

async function ip(): Promise<string | null> {
  return getClientIp(await headers());
}

// Schema para añadir una variante suelta a un producto CON_VARIANTES.
const addVariantSchema = variantInputSchema.extend({
  productId: z.string().min(1, 'Producto no válido.'),
  nombre: z.string().trim().min(1, 'El nombre es obligatorio.'),
});

// Cada variante nueva en una conversión SIMPLE -> CON_VARIANTES.
const nuevaVarianteSchema = variantInputSchema.extend({
  nombre: z.string().trim().min(1, 'El nombre es obligatorio.'),
});

export async function crearProductoAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  // `createProduct` es una escritura; corre dentro de `withTenant` y el
  // `redirect()` va después de que la transacción ya hizo commit (ver la nota
  // en `caja/actions.ts`).
  const tenantId = await requireRequestTenantId();
  const result = await withTenant(tenantId, async (): Promise<FormState | { redirectId: string }> => {
    const actor = await requirePermission('productos.crear');

    let variantes: unknown;
    try {
      variantes = JSON.parse(String(formData.get('variantes') ?? '[]'));
    } catch {
      return fromValidationError(
        new ValidationError({ variantes: 'Datos de variantes inválidos.' }),
      );
    }

    const parsed = createProductSchema.safeParse({
      nombre: formData.get('nombre'),
      descripcion: formData.get('descripcion') ?? undefined,
      categoryId: formData.get('categoryId') ?? undefined,
      taxRateId: formData.get('taxRateId'),
      tipo: formData.get('tipo'),
      variantes,
    });
    if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsFrom(parsed.error) };

    try {
      const created = await createProduct(actor.id, parsed.data, await ip());
      return { redirectId: created.productId };
    } catch (e) {
      if (e instanceof ValidationError) return fromValidationError(e);
      throw e;
    }
  });

  if ('redirectId' in result) {
    revalidatePath(PRODUCTOS_PATH);
    redirect(idPath(result.redirectId));
  }
  return result;
}

export async function editarProductoAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const tenantId = await requireRequestTenantId();
  return withTenant(tenantId, async () => {
    const actor = await requirePermission('productos.editar');

    const parsed = updateProductSchema.safeParse({
      id: formData.get('id'),
      nombre: formData.get('nombre'),
      descripcion: formData.get('descripcion') ?? undefined,
      categoryId: formData.get('categoryId') ?? undefined,
      taxRateId: formData.get('taxRateId'),
    });
    if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsFrom(parsed.error) };

    try {
      await updateProduct(actor.id, parsed.data.id, parsed.data, await ip());
      revalidatePath(PRODUCTOS_PATH);
      revalidatePath(idPath(parsed.data.id));
      return { ok: true };
    } catch (e) {
      if (e instanceof ValidationError) return fromValidationError(e);
      throw e;
    }
  });
}

export async function archivarProductoAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const tenantId = await requireRequestTenantId();
  return withTenant(tenantId, async () => {
    const actor = await requirePermission('productos.archivar');

    const id = String(formData.get('id') ?? '');
    if (!id) return { ok: false, formError: 'Producto no válido.' };

    try {
      await archiveProduct(actor.id, id, await ip());
      revalidatePath(PRODUCTOS_PATH);
      revalidatePath(idPath(id));
      return { ok: true };
    } catch (e) {
      if (e instanceof ValidationError) return fromValidationError(e);
      throw e;
    }
  });
}

export async function restaurarProductoAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const tenantId = await requireRequestTenantId();
  return withTenant(tenantId, async () => {
    const actor = await requirePermission('productos.archivar');

    const id = String(formData.get('id') ?? '');
    if (!id) return { ok: false, formError: 'Producto no válido.' };

    try {
      await restoreProduct(actor.id, id, await ip());
      revalidatePath(PRODUCTOS_PATH);
      revalidatePath(idPath(id));
      return { ok: true };
    } catch (e) {
      if (e instanceof ValidationError) return fromValidationError(e);
      throw e;
    }
  });
}

export async function disponibilidadProductoAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const tenantId = await requireRequestTenantId();
  return withTenant(tenantId, async () => {
    const actor = await requirePermission('productos.editar');

    const id = String(formData.get('id') ?? '');
    if (!id) return { ok: false, formError: 'Producto no válido.' };
    const disponible = String(formData.get('disponible') ?? '') === '1';

    try {
      await setProductDisponible(actor.id, id, disponible, await ip());
      revalidatePath(idPath(id));
      return { ok: true };
    } catch (e) {
      if (e instanceof ValidationError) return fromValidationError(e);
      throw e;
    }
  });
}

export async function editarVarianteAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const tenantId = await requireRequestTenantId();
  return withTenant(tenantId, async () => {
    const actor = await requirePermission('productos.editar');

    const parsed = editVariantSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsFrom(parsed.error) };

    const productId = String(formData.get('productId') ?? '');
    try {
      await editVariant(actor.id, parsed.data.id, parsed.data, await ip());
      if (productId) revalidatePath(idPath(productId));
      return { ok: true };
    } catch (e) {
      if (e instanceof ValidationError) return fromValidationError(e);
      throw e;
    }
  });
}

export async function agregarVarianteAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const tenantId = await requireRequestTenantId();
  return withTenant(tenantId, async () => {
    const actor = await requirePermission('productos.editar');

    const parsed = addVariantSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsFrom(parsed.error) };

    const { productId, ...variant } = parsed.data;
    try {
      await addVariant(actor.id, productId, variant, await ip());
      revalidatePath(idPath(productId));
      return { ok: true };
    } catch (e) {
      if (e instanceof ValidationError) return fromValidationError(e);
      throw e;
    }
  });
}

export async function convertirAVariantesAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const tenantId = await requireRequestTenantId();
  return withTenant(tenantId, async () => {
    const actor = await requirePermission('productos.editar');

    const productId = String(formData.get('productId') ?? '');
    const defaultNombre = String(formData.get('defaultNombre') ?? '');

    let nuevasRaw: unknown;
    try {
      nuevasRaw = JSON.parse(String(formData.get('nuevas') ?? '[]'));
    } catch {
      return fromValidationError(
        new ValidationError({ nuevas: 'Datos de variantes inválidos.' }),
      );
    }

    const parsed = z
      .array(nuevaVarianteSchema)
      .min(1, 'Añade al menos una variante nueva.')
      .safeParse(nuevasRaw);
    if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsFrom(parsed.error) };
    if (!productId) return { ok: false, formError: 'Producto no válido.' };

    try {
      await convertToVariants(
        actor.id,
        productId,
        { defaultNombre, nuevas: parsed.data },
        await ip(),
      );
      revalidatePath(idPath(productId));
      return { ok: true };
    } catch (e) {
      if (e instanceof ValidationError) return fromValidationError(e);
      throw e;
    }
  });
}

export async function archivarVarianteAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const tenantId = await requireRequestTenantId();
  return withTenant(tenantId, async () => {
    const actor = await requirePermission('productos.archivar');

    const variantId = String(formData.get('variantId') ?? '');
    if (!variantId) return { ok: false, formError: 'Variante no válida.' };
    const productId = String(formData.get('productId') ?? '');

    try {
      await archiveVariant(actor.id, variantId, await ip());
      if (productId) revalidatePath(idPath(productId));
      return { ok: true };
    } catch (e) {
      if (e instanceof ValidationError) return fromValidationError(e);
      throw e;
    }
  });
}

export async function disponibilidadVarianteAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const tenantId = await requireRequestTenantId();
  return withTenant(tenantId, async () => {
    const actor = await requirePermission('productos.editar');

    const variantId = String(formData.get('variantId') ?? '');
    if (!variantId) return { ok: false, formError: 'Variante no válida.' };
    const productId = String(formData.get('productId') ?? '');
    const disponible = String(formData.get('disponible') ?? '') === '1';

    try {
      await setVariantDisponible(actor.id, variantId, disponible, await ip());
      if (productId) revalidatePath(idPath(productId));
      return { ok: true };
    } catch (e) {
      if (e instanceof ValidationError) return fromValidationError(e);
      throw e;
    }
  });
}
