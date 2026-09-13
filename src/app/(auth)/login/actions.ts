'use server';

import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { loginSchema } from '@/lib/validation/auth';
import { attemptLogin } from '@/lib/auth/login';
import { SESSION_COOKIE, SESSION_TTL_MS } from '@/lib/auth/session';
import { getClientIp } from '@/lib/http';
import type { FormState } from '@/app/(auth)/setup/actions';

export async function loginAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = loginSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, formError: 'Credenciales inválidas' };

  const h = await headers();
  const r = await attemptLogin({
    email: parsed.data.email,
    password: parsed.data.password,
    ip: getClientIp(h),
    userAgent: h.get('user-agent'),
  });

  if (!r.ok) {
    return {
      ok: false,
      formError:
        r.reason === 'rate_limited'
          ? `Demasiados intentos. Inténtalo de nuevo en ${Math.ceil((r.retryAfterSec ?? 0) / 60)} min.`
          : 'Credenciales inválidas',
    };
  }

  (await cookies()).set(SESSION_COOKIE, r.token, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  });

  // Envía de inmediato a quien tiene contraseña temporal; el proxy lo reforzaría
  // en la siguiente navegación, pero así el cambio es obligatorio ya al entrar.
  redirect(r.mustChangePassword ? '/cambiar-password' : '/dashboard');
}
