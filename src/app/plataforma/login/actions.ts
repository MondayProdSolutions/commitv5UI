'use server';

import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { db, withPlatformAdmin } from '@/lib/db';
import { verifyPassword } from '@/lib/platform-auth/password';
import { createPlatformSession, PLATFORM_SESSION_COOKIE } from '@/lib/platform-auth/session';
import { getClientIp } from '@/lib/http';

export type PlatformLoginState = { ok: boolean; error?: string };

export async function platformLoginAction(
  _prev: PlatformLoginState,
  formData: FormData,
): Promise<PlatformLoginState> {
  const email = String(formData.get('email') ?? '').trim();
  const password = String(formData.get('password') ?? '');

  const admin = await withPlatformAdmin(() => db.platformAdmin.findUnique({ where: { email } }));
  if (!admin || !(await verifyPassword(admin.passwordHash, password))) {
    return { ok: false, error: 'Correo o contraseña incorrectos' };
  }

  const h = await headers();
  const { token, expiresAt } = await createPlatformSession(admin.id, {
    ip: getClientIp(h),
    userAgent: h.get('user-agent'),
  });

  (await cookies()).set(PLATFORM_SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    expires: expiresAt,
    path: '/',
  });

  redirect('/plataforma');
}
