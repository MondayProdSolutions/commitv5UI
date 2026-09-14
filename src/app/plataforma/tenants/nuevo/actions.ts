'use server';

import { redirect } from 'next/navigation';
import { createTenant } from '@/lib/platform/tenants';
import { ValidationError } from '@/lib/errors';

export type CreateTenantState = { ok: boolean; error?: string };

export async function createTenantAction(
  _prev: CreateTenantState,
  formData: FormData,
): Promise<CreateTenantState> {
  try {
    await createTenant({
      slug: String(formData.get('slug') ?? ''),
      nombre: String(formData.get('nombre') ?? ''),
      planId: String(formData.get('planId') ?? ''),
      adminNombre: String(formData.get('adminNombre') ?? ''),
      adminEmail: String(formData.get('adminEmail') ?? ''),
      adminPassword: String(formData.get('adminPassword') ?? ''),
    });
  } catch (e) {
    if (e instanceof ValidationError) return { ok: false, error: Object.values(e.fields)[0] };
    throw e;
  }
  redirect('/plataforma');
}
