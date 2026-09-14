'use server';

import { revalidatePath } from 'next/cache';
import { createPlan } from '@/lib/platform/plans';
import { ValidationError } from '@/lib/errors';

export type CreatePlanState = { ok: boolean; error?: string };

export async function createPlanAction(
  _prev: CreatePlanState,
  formData: FormData,
): Promise<CreatePlanState> {
  try {
    await createPlan({
      nombre: String(formData.get('nombre') ?? ''),
      maxUsuarios: Number(formData.get('maxUsuarios') ?? 0),
      maxSucursales: Number(formData.get('maxSucursales') ?? 0),
    });
  } catch (e) {
    if (e instanceof ValidationError) return { ok: false, error: Object.values(e.fields)[0] };
    throw e;
  }
  revalidatePath('/plataforma/planes');
  return { ok: true };
}
