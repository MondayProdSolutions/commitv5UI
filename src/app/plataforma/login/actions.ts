'use server';

import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { attemptPlatformLogin } from '@/lib/platform-auth/login';
import { PLATFORM_SESSION_COOKIE, SESSION_TTL_MS } from '@/lib/platform-auth/session';
import { getClientIp } from '@/lib/http';

export type PlatformLoginState = { ok: boolean; error?: string };

export async function platformLoginAction(
  _prev: PlatformLoginState,
  formData: FormData,
): Promise<PlatformLoginState> {
  const email = String(formData.get('email') ?? '').trim();
  const password = String(formData.get('password') ?? '');

  const h = await headers();
  const r = await attemptPlatformLogin({
    email,
    password,
    ip: getClientIp(h),
    userAgent: h.get('user-agent'),
  });

  if (!r.ok) {
    return {
      ok: false,
      error:
        r.reason === 'rate_limited'
          ? `Demasiados intentos. Inténtalo de nuevo en ${Math.ceil((r.retryAfterSec ?? 0) / 60)} min.`
          : 'Correo o contraseña incorrectos',
    };
  }

  (await cookies()).set(PLATFORM_SESSION_COOKIE, r.token, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  });

  redirect('/plataforma');
}
