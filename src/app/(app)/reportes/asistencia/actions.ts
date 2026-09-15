'use server';

import { revalidatePath } from 'next/cache';
import { requirePermission } from '@/lib/auth/context';
import { ValidationError } from '@/lib/errors';
import { corregirRegistro } from '@/lib/attendance/records';
import type { FormState } from '@/app/(auth)/setup/actions';

export async function corregirRegistroAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const actor = await requirePermission('asistencia.corregir');
  const id = String(formData.get('id') ?? '');
  // El <input type="datetime-local"> envía "YYYY-MM-DDTHH:mm" sin offset — se
  // interpreta como hora local de America/Mexico_City (mismo criterio MX_OFFSET
  // que @/lib/reports/period; México no observa horario de verano desde 2022),
  // nunca como la hora local del proceso del servidor.
  const rawCheckOutAt = String(formData.get('checkOutAt') ?? '');
  const checkOutAt = rawCheckOutAt ? new Date(`${rawCheckOutAt}:00-06:00`) : new Date(NaN);
  if (!id || Number.isNaN(checkOutAt.getTime())) {
    return { ok: false, formError: 'Fecha/hora de salida inválida.' };
  }

  try {
    await corregirRegistro({ id, checkOutAt, actorId: actor.id });
  } catch (e) {
    if (e instanceof ValidationError) return { ok: false, formError: e.message, fieldErrors: e.fields };
    throw e;
  }
  revalidatePath('/reportes/asistencia');
  return { ok: true };
}
