'use server';

import { revalidatePath } from 'next/cache';
import { setTenantEstado, type TenantStatus } from '@/lib/platform/tenants';

export type TenantActionState = { ok: boolean; formError?: string };

const ESTADOS_VALIDOS: TenantStatus[] = ['PRUEBA', 'ACTIVO', 'SUSPENDIDO'];

export async function setTenantEstadoAction(
  _prev: TenantActionState,
  formData: FormData,
): Promise<TenantActionState> {
  const tenantId = String(formData.get('tenantId') ?? '');
  const estado = String(formData.get('estado') ?? '') as TenantStatus;
  if (!tenantId) return { ok: false, formError: 'Negocio no válido.' };
  if (!ESTADOS_VALIDOS.includes(estado)) return { ok: false, formError: 'Estado no válido.' };

  await setTenantEstado(tenantId, estado);
  revalidatePath('/plataforma');
  return { ok: true };
}
