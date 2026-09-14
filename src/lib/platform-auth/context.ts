import { cookies } from 'next/headers';
import { db, withPlatformAdmin } from '@/lib/db';
import { PLATFORM_SESSION_COOKIE, validatePlatformSession } from './session';

export type CurrentPlatformAdmin = { id: string; nombre: string; email: string };

export async function getCurrentPlatformAdmin(): Promise<CurrentPlatformAdmin | null> {
  const token = (await cookies()).get(PLATFORM_SESSION_COOKIE)?.value;
  const res = await validatePlatformSession(token);
  if (res.status !== 'ok') return null;
  const admin = await withPlatformAdmin(() =>
    db.platformAdmin.findUnique({ where: { id: res.session.platformAdminId } }),
  );
  if (!admin) return null;
  return { id: admin.id, nombre: admin.nombre, email: admin.email };
}
