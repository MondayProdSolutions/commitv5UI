'use server';

import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { setupSchema } from '@/lib/validation/auth';
import { isBootstrapNeeded, createFirstAdmin } from '@/lib/auth/bootstrap';
import { createSession, SESSION_COOKIE, SESSION_TTL_MS } from '@/lib/auth/session';
import { getClientIp } from '@/lib/http';
import { logActivity } from '@/lib/audit';
import { ValidationError } from '@/lib/errors';

/**
 * Canonical form-state shape for the auth flows. Tasks 10-17 re-import this from
 * `@/app/(auth)/setup/actions`.
 */
export type FormState = { ok: boolean; formError?: string; fieldErrors?: Record<string, string> };

export async function setupAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = setupSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? '');
      if (key && !(key in fieldErrors)) fieldErrors[key] = issue.message;
    }
    return { ok: false, fieldErrors };
  }

  if (!(await isBootstrapNeeded())) {
    return { ok: false, formError: 'El sistema ya está configurado.' };
  }

  let userId: string;
  try {
    ({ userId } = await createFirstAdmin(parsed.data));
  } catch (e) {
    if (e instanceof ValidationError) return { ok: false, fieldErrors: e.fields };
    throw e;
  }

  const h = await headers();
  const ip = getClientIp(h);
  const { token } = await createSession(userId, { ip, userAgent: h.get('user-agent') });
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  });
  await logActivity({ actorId: userId, accion: 'auth.login', ip, metadata: { via: 'setup' } });

  redirect('/dashboard');
}
