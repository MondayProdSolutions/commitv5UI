'use server';

import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import type { z } from 'zod';
import { requirePermission } from '@/lib/auth/context';
import { can } from '@/lib/auth/rbac';
import { getClientIp } from '@/lib/http';
import { ValidationError } from '@/lib/errors';
import { createSaleSchema } from '@/lib/validation/sale';
import { createReturnSchema } from '@/lib/validation/return';
import { createSale, cancelSale } from '@/lib/sales/sales';
import { createReturn } from '@/lib/sales/returns';
import { searchProducts } from '@/lib/catalog/search';
import { searchCustomers, type CustomerHit } from '@/lib/customers/search';
import { listProducts, getProduct } from '@/lib/catalog/products';
import { customerSchema } from '@/lib/validation/customer';
import { createCustomer } from '@/lib/customers/customers';
import { bloqueFiscalCompleto } from '@/lib/customers/fiscal';
import { withTenant } from '@/lib/db';
import { requireRequestTenantId } from '@/lib/tenant/with-request-tenant';
import type { FormState } from '@/app/(auth)/setup/actions';

const HISTORIAL_PATH = '/ventas/historial';
const idPath = (id: string): string => `/ventas/${id}`;
const devolucionPath = (id: string): string => `/ventas/devoluciones/${id}`;

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

export async function crearVentaAction(_prev: FormState, formData: FormData): Promise<FormState> {
  // `createSale` es una escritura; corre dentro de `withTenant` y el
  // `redirect()` va después de que la transacción ya hizo commit (ver la nota
  // en `caja/actions.ts`).
  const tenantId = await requireRequestTenantId();
  const result = await withTenant(tenantId, async (): Promise<FormState | { redirectId: string }> => {
    const actor = await requirePermission('ventas.crear');

    let payload: unknown;
    try {
      payload = JSON.parse(String(formData.get('payload') ?? ''));
    } catch {
      return { ok: false, fieldErrors: { payload: 'Datos de venta inválidos.' } };
    }

    const parsed = createSaleSchema.safeParse(payload);
    if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsFrom(parsed.error) };

    const traeDescuento =
      parsed.data.lineas.some((l) => l.descuento != null) || parsed.data.descuentoTicket != null;
    if (traeDescuento && !can(actor, 'ventas.descuento'))
      return { ok: false, formError: 'No tienes permiso para aplicar descuentos.' };

    try {
      const sale = await createSale(actor.id, parsed.data, await ip());
      return { redirectId: sale.id };
    } catch (e) {
      if (e instanceof ValidationError) return fromValidationError(e);
      throw e;
    }
  });

  if ('redirectId' in result) {
    revalidatePath(HISTORIAL_PATH);
    redirect(idPath(result.redirectId));
  }
  return result;
}

export async function cancelarVentaAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const tenantId = await requireRequestTenantId();
  return withTenant(tenantId, async () => {
    const actor = await requirePermission('ventas.cancelar');

    const saleId = String(formData.get('saleId') ?? '');
    const motivo = String(formData.get('motivo') ?? '');
    if (!saleId) return { ok: false, formError: 'Venta no válida.' };

    try {
      await cancelSale(actor.id, saleId, motivo, await ip());
      revalidatePath(HISTORIAL_PATH);
      revalidatePath(idPath(saleId));
      return { ok: true };
    } catch (e) {
      if (e instanceof ValidationError) return fromValidationError(e);
      throw e;
    }
  });
}

// ---------------------------------------------------------------------------
// Server actions de apoyo para la pantalla de cajero (`/ventas`).
// Sin itests dedicados: el flujo se cubre en E2E (Task 14); typecheck/lint/build
// las validan. Todas exigen `ventas.crear` como primera sentencia y devuelven
// datos serializables. El cuerpo va en try/catch: ante un fallo blando (BD,
// desincronización de sesión) devuelven `{ ok: false, … }` en lugar de lanzar,
// para que los sitios de llamada directa puedan recuperarse.
// ---------------------------------------------------------------------------

export type SearchHitLite = {
  variantId: string;
  productId: string;
  productoNombre: string;
  varianteNombre: string | null;
  sku: string | null;
  precioConImpuesto: number;
  stock: number;
  exactBarcode: boolean;
};

export type BuscarProductosState = { ok: boolean; hits: SearchHitLite[] };

export async function buscarProductosAction(
  _prev: BuscarProductosState,
  formData: FormData,
): Promise<BuscarProductosState> {
  const tenantId = await requireRequestTenantId();
  return withTenant(tenantId, async () => {
    await requirePermission('ventas.crear');
    try {
      const q = String(formData.get('q') ?? '');
      const hits = await searchProducts(q, {
        soloDisponibles: true,
        incluirArchivados: false,
        limit: 20,
      });
      return {
        ok: true,
        hits: hits.map((h) => ({
          variantId: h.variantId,
          productId: h.productId,
          productoNombre: h.productoNombre,
          varianteNombre: h.varianteNombre,
          sku: h.sku,
          precioConImpuesto: h.precioConImpuesto,
          stock: h.stock,
          exactBarcode: h.exactBarcode,
        })),
      };
    } catch {
      return { ok: false, hits: [] };
    }
  });
}

export type ProductoGridRow = {
  id: string;
  nombre: string;
  imagenUrl: string | null;
  precioMin: number;
  precioMax: number;
  nVariantes: number;
};

export type ProductosCategoriaState = { ok: boolean; productos: ProductoGridRow[] };

export async function productosDeCategoriaAction(
  _prev: ProductosCategoriaState,
  formData: FormData,
): Promise<ProductosCategoriaState> {
  const tenantId = await requireRequestTenantId();
  return withTenant(tenantId, async () => {
    await requirePermission('ventas.crear');
    try {
      const categoryId = String(formData.get('categoryId') ?? '');
      if (categoryId === '') return { ok: true, productos: [] };

      const { rows } = await listProducts({
        categoryId,
        estado: 'activos',
        page: 1,
        pageSize: 100,
      });

      return {
        ok: true,
        productos: rows.map((r) => ({
          id: r.id,
          nombre: r.nombre,
          imagenUrl: r.imagenUrl,
          precioMin: r.precioMin,
          precioMax: r.precioMax,
          nVariantes: r.nVariantes,
        })),
      };
    } catch {
      return { ok: false, productos: [] };
    }
  });
}

export type VarianteLite = {
  id: string;
  nombre: string | null;
  precioVenta: number;
  precioConImpuesto: number;
  stock: number;
};

export type VariantesProductoState = { ok: boolean; variantes: VarianteLite[] };

export async function variantesDeProductoAction(
  _prev: VariantesProductoState,
  formData: FormData,
): Promise<VariantesProductoState> {
  const tenantId = await requireRequestTenantId();
  return withTenant(tenantId, async () => {
    await requirePermission('ventas.crear');
    try {
      const productId = String(formData.get('productId') ?? '');
      const producto = productId === '' ? null : await getProduct(productId);
      if (!producto) return { ok: true, variantes: [] };

      return {
        ok: true,
        variantes: producto.variants
          .filter((v) => !v.archivada && v.disponible)
          .map((v) => ({
            id: v.id,
            nombre: v.nombre,
            precioVenta: v.precioVenta,
            precioConImpuesto: v.precioConImpuesto,
            stock: v.stock,
          })),
      };
    } catch {
      return { ok: false, variantes: [] };
    }
  });
}

export type BuscarClientesState = { ok: boolean; hits: CustomerHit[] };

export async function buscarClientesAction(
  _prev: BuscarClientesState,
  formData: FormData,
): Promise<BuscarClientesState> {
  const tenantId = await requireRequestTenantId();
  return withTenant(tenantId, async () => {
    await requirePermission('ventas.crear');
    try {
      const q = String(formData.get('q') ?? '');
      const hits = await searchCustomers(q, { limit: 15 });
      return { ok: true, hits };
    } catch {
      return { ok: false, hits: [] };
    }
  });
}

/**
 * Alta de cliente desde la pantalla de cajero SIN redirigir (a diferencia de
 * `crearClienteAction`, que navega a la ficha y haría perder el carrito).
 * Devuelve el `customerId` y si es facturable para que el `CustomerPicker`
 * lo seleccione en el acto.
 */
export async function crearClienteInlineAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState & { customerId?: string; facturable?: boolean }> {
  const tenantId = await requireRequestTenantId();
  return withTenant(tenantId, async () => {
    const actor = await requirePermission('clientes.crear');

    const parsed = customerSchema.safeParse({
      nombre: formData.get('nombre'),
      telefono: formData.get('telefono') ?? undefined,
      correo: formData.get('correo') ?? undefined,
      direccion: formData.get('direccion') ?? undefined,
      notas: formData.get('notas') ?? undefined,
      rfc: formData.get('rfc') ?? undefined,
      razonSocial: formData.get('razonSocial') ?? undefined,
      regimenFiscalCode: formData.get('regimenFiscalCode') ?? undefined,
      usoCfdiCode: formData.get('usoCfdiCode') ?? undefined,
      cpFiscal: formData.get('cpFiscal') ?? undefined,
      correoFacturacion: formData.get('correoFacturacion') ?? undefined,
    });
    if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsFrom(parsed.error) };

    try {
      const { id } = await createCustomer(actor.id, parsed.data, await ip());
      return { ok: true, customerId: id, facturable: bloqueFiscalCompleto(parsed.data) };
    } catch (e) {
      if (e instanceof ValidationError) return fromValidationError(e);
      throw e;
    }
  });
}

export async function crearDevolucionAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  // `createReturn` es una escritura; corre dentro de `withTenant` y el
  // `redirect()` va después de que la transacción ya hizo commit (ver la nota
  // en `caja/actions.ts`).
  const tenantId = await requireRequestTenantId();
  const result = await withTenant(tenantId, async (): Promise<FormState | { redirectId: string }> => {
    const actor = await requirePermission('ventas.devolver');

    let payload: unknown;
    try {
      payload = JSON.parse(String(formData.get('payload') ?? ''));
    } catch {
      return { ok: false, fieldErrors: { payload: 'Datos de devolución inválidos.' } };
    }

    const parsed = createReturnSchema.safeParse(payload);
    if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsFrom(parsed.error) };

    try {
      const ret = await createReturn(actor.id, parsed.data, await ip());
      return { redirectId: ret.id };
    } catch (e) {
      if (e instanceof ValidationError) return fromValidationError(e);
      throw e;
    }
  });

  if ('redirectId' in result) {
    revalidatePath(HISTORIAL_PATH);
    redirect(devolucionPath(result.redirectId));
  }
  return result;
}
