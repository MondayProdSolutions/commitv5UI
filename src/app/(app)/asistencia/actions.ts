'use server';

import { revalidatePath } from 'next/cache';
import { requirePermission } from '@/lib/auth/context';
import { ValidationError } from '@/lib/errors';
import { corregirRegistro } from '@/lib/attendance/records';
import type { FormState } from '@/app/(auth)/setup/actions';

export async function corregirRegistroAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const actor = await requirePermission('asistencia.corregir');
  const id = String(formData.get('id') ?? '');
  const checkOutAt = new Date(String(formData.get('checkOutAt') ?? ''));
  if (!id || Number.isNaN(checkOutAt.getTime())) {
    return { ok: false, formError: 'Fecha/hora de salida inválida.' };
  }

  try {
    await corregirRegistro({ id, checkOutAt, actorId: actor.id });
  } catch (e) {
    if (e instanceof ValidationError) return { ok: false, formError: e.message, fieldErrors: e.fields };
    throw e;
  }
  revalidatePath('/asistencia');
  return { ok: true };
}
