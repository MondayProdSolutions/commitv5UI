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
  const actor = await requirePermission('caja.gestionar');

  const parsed = openCashSessionSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsFrom(parsed.error) };

  try {
    await openCashSession(actor.id, parsed.data.fondoApertura, await ip());
  } catch (e) {
    if (e instanceof ValidationError) return fromValidationError(e);
    throw e;
  }

  revalidatePath('/caja');
  redirect('/caja');
}

export async function registrarMovimientoCajaAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
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
}

export async function cerrarCajaAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const actor = await requirePermission('caja.gestionar');

  const parsed = closeCashSessionSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsFrom(parsed.error) };

  let id: string;
  try {
    ({ id } = await closeCashSession(
      actor.id,
      parsed.data.efectivoContado,
      parsed.data.notaCierre,
      await ip(),
    ));
  } catch (e) {
    if (e instanceof ValidationError) return fromValidationError(e);
    throw e;
  }

  revalidatePath('/caja');
  revalidatePath('/caja/historial');
  redirect(`/caja/sesiones/${id}`);
}
