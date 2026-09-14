'use server';

import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import type { z } from 'zod';
import { requirePermission } from '@/lib/auth/context';
import { getClientIp } from '@/lib/http';
import { ValidationError } from '@/lib/errors';
import { customerSchema, editCustomerSchema } from '@/lib/validation/customer';
import {
  createCustomer,
  updateCustomer,
  archiveCustomer,
  restoreCustomer,
} from '@/lib/customers/customers';
import { withTenant } from '@/lib/db';
import { requireRequestTenantId } from '@/lib/tenant/with-request-tenant';
import type { FormState } from '@/app/(auth)/setup/actions';

const CLIENTES_PATH = '/clientes';
const idPath = (id: string): string => `/clientes/${id}`;

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

function readCustomerFields(formData: FormData) {
  return {
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
  };
}

export async function crearClienteAction(_prev: FormState, formData: FormData): Promise<FormState> {
  // `createCustomer` es una escritura; corre dentro de `withTenant` y el
  // `redirect()` va después de que la transacción ya hizo commit (ver la nota
  // en `caja/actions.ts`).
  const tenantId = await requireRequestTenantId();
  const result = await withTenant(tenantId, async (): Promise<FormState | { redirectId: string }> => {
    const actor = await requirePermission('clientes.crear');

    const parsed = customerSchema.safeParse(readCustomerFields(formData));
    if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsFrom(parsed.error) };

    try {
      const { id } = await createCustomer(actor.id, parsed.data, await ip());
      return { redirectId: id };
    } catch (e) {
      if (e instanceof ValidationError) return fromValidationError(e);
      throw e;
    }
  });

  if ('redirectId' in result) {
    revalidatePath(CLIENTES_PATH);
    redirect(idPath(result.redirectId));
  }
  return result;
}

export async function editarClienteAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const tenantId = await requireRequestTenantId();
  return withTenant(tenantId, async () => {
    const actor = await requirePermission('clientes.editar');

    const parsed = editCustomerSchema.safeParse({
      id: formData.get('id'),
      ...readCustomerFields(formData),
    });
    if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsFrom(parsed.error) };

    try {
      await updateCustomer(actor.id, parsed.data.id, parsed.data, await ip());
      revalidatePath(CLIENTES_PATH);
      revalidatePath(idPath(parsed.data.id));
      return { ok: true };
    } catch (e) {
      if (e instanceof ValidationError) return fromValidationError(e);
      throw e;
    }
  });
}

export async function archivarClienteAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const tenantId = await requireRequestTenantId();
  return withTenant(tenantId, async () => {
    const actor = await requirePermission('clientes.archivar');

    const id = String(formData.get('id') ?? '');
    if (!id) return { ok: false, formError: 'Cliente no válido.' };

    try {
      await archiveCustomer(actor.id, id, await ip());
      revalidatePath(CLIENTES_PATH);
      revalidatePath(idPath(id));
      return { ok: true };
    } catch (e) {
      if (e instanceof ValidationError) return fromValidationError(e);
      throw e;
    }
  });
}

export async function restaurarClienteAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const tenantId = await requireRequestTenantId();
  return withTenant(tenantId, async () => {
    const actor = await requirePermission('clientes.archivar');

    const id = String(formData.get('id') ?? '');
    if (!id) return { ok: false, formError: 'Cliente no válido.' };

    try {
      await restoreCustomer(actor.id, id, await ip());
      revalidatePath(CLIENTES_PATH);
      revalidatePath(idPath(id));
      return { ok: true };
    } catch (e) {
      if (e instanceof ValidationError) return fromValidationError(e);
      throw e;
    }
  });
}
