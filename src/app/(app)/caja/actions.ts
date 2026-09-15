'use server';

import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import type { z } from 'zod';
import { requirePermission } from '@/lib/auth/context';
import { getClientIp } from '@/lib/http';
import { ValidationError } from '@/lib/errors';
import {
  openCashSessionSchema,
  cashMovementSchema,
  closeCashSessionSchema,
} from '@/lib/validation/cash';
import { openCashSession, recordCashMovement, closeCashSession } from '@/lib/cash/sessions';
import { withTenant } from '@/lib/db';
import { requireRequestTenantId } from '@/lib/tenant/with-request-tenant';
import type { FormState } from '@/app/(auth)/setup/actions';

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

export async function abrirCajaAction(_prev: FormState, formData: FormData): Promise<FormState> {
  // `openCashSession` es una escritura; corre dentro de `withTenant` y el
  // resultado se devuelve ANTES del `redirect()` final. `redirect()` lanza
  // internamente — si quedara dentro de la misma transacción, un rollback
  // revertiría la apertura de caja recién confirmada al usuario.
  const tenantId = await requireRequestTenantId();
  const error = await withTenant(tenantId, async (): Promise<FormState | null> => {
    const actor = await requirePermission('caja.gestionar');

    const parsed = openCashSessionSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsFrom(parsed.error) };

    try {
      await openCashSession(actor.id, parsed.data.fondoApertura, await ip());
    } catch (e) {
      if (e instanceof ValidationError) return fromValidationError(e);
      throw e;
    }
    return null;
  });
  if (error) return error;

  revalidatePath('/caja');
  redirect('/caja');
}

export async function registrarMovimientoCajaAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const tenantId = await requireRequestTenantId();
  return withTenant(tenantId, async () => {
    const actor = await requirePermission('caja.gestionar');

    const parsed = cashMovementSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsFrom(parsed.error) };

    try {
      await recordCashMovement(actor.id, parsed.data, await ip());
    } catch (e) {
      if (e instanceof ValidationError) return fromValidationError(e);
      throw e;
    }

    revalidatePath('/caja');
    return { ok: true };
  });
}

export async function cerrarCajaAction(_prev: FormState, formData: FormData): Promise<FormState> {
  // Mismo motivo que `abrirCajaAction`: `closeCashSession` es una escritura,
  // así que el `redirect()` va después de que la transacción de `withTenant`
  // ya hizo commit.
  const tenantId = await requireRequestTenantId();
  const result = await withTenant(tenantId, async (): Promise<FormState | { redirectId: string }> => {
    const actor = await requirePermission('caja.gestionar');

    const parsed = closeCashSessionSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsFrom(parsed.error) };

    try {
      const { id } = await closeCashSession(
        actor.id,
        parsed.data.efectivoContado,
        parsed.data.notaCierre,
        await ip(),
      );
      return { redirectId: id };
    } catch (e) {
      if (e instanceof ValidationError) return fromValidationError(e);
      throw e;
    }
  });

  if ('redirectId' in result) {
    revalidatePath('/caja');
    revalidatePath('/caja/historial');
    redirect(`/caja/sesiones/${result.redirectId}`);
  }
  return result;
}
