'use server';

import { revalidatePath } from 'next/cache';
import { requirePermission } from '@/lib/auth/context';
import { ValidationError } from '@/lib/errors';
import { checkIn, checkOut } from '@/lib/attendance/records';
import { savePhoto } from '@/lib/attendance/photos';
import { diaKeyMX } from '@/lib/reports/period';
import { withTenant } from '@/lib/db';
import { requireRequestTenantId } from '@/lib/tenant/with-request-tenant';
import type { FormState } from '@/app/(auth)/setup/actions';

const RUTA = '/asistencia/registrar';
const MAX_FOTO_BYTES = 5 * 1024 * 1024;

/**
 * Extrae y guarda la foto si vino una válida. Nunca lanza: si la foto falta,
 * no es JPEG, excede el tamaño, o `savePhoto` falla por cualquier razón, el
 * check-in/check-out continúa sin foto (spec §2/§9 — nunca se bloquea la
 * asistencia por un problema de cámara/foto).
 */
async function fotoPathFrom(
  formData: FormData,
  userId: string,
  tipo: 'checkin' | 'checkout',
): Promise<string | null> {
  const foto = formData.get('foto');
  if (!(foto instanceof File) || foto.size === 0) return null;
  if (foto.type !== 'image/jpeg' || foto.size > MAX_FOTO_BYTES) return null;
  try {
    const buffer = Buffer.from(await foto.arrayBuffer());
    return await savePhoto(buffer, { userId, tipo, fecha: diaKeyMX(new Date()) });
  } catch {
    return null;
  }
}

export async function registrarEntradaAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const tenantId = await requireRequestTenantId();
  return withTenant(tenantId, async () => {
    const actor = await requirePermission('asistencia.registrar');
    const fotoPath = await fotoPathFrom(formData, actor.id, 'checkin');
    try {
      await checkIn({ userId: actor.id, fotoPath });
    } catch (e) {
      if (e instanceof ValidationError) return { ok: false, formError: e.message, fieldErrors: e.fields };
      throw e;
    }
    revalidatePath(RUTA);
    return { ok: true };
  });
}

export async function registrarSalidaAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const tenantId = await requireRequestTenantId();
  return withTenant(tenantId, async () => {
    const actor = await requirePermission('asistencia.registrar');
    const fotoPath = await fotoPathFrom(formData, actor.id, 'checkout');
    try {
      await checkOut({ userId: actor.id, fotoPath });
    } catch (e) {
      if (e instanceof ValidationError) return { ok: false, formError: e.message, fieldErrors: e.fields };
      throw e;
    }
    revalidatePath(RUTA);
    return { ok: true };
  });
}
