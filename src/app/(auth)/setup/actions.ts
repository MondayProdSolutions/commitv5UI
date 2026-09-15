'use server';

import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { setupSchema } from '@/lib/validation/auth';
import { isBootstrapNeeded, createFirstAdmin } from '@/lib/auth/bootstrap';
import { createSession, SESSION_COOKIE, SESSION_TTL_MS } from '@/lib/auth/session';
import { getClientIp } from '@/lib/http';
import { logActivity } from '@/lib/audit';
import { ValidationError } from '@/lib/errors';
import { withTenant } from '@/lib/db';
import { requireRequestTenantId } from '@/lib/tenant/with-request-tenant';

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

  // Todo lo de abajo toca `db` (conteo de usuarios, alta del Administrador,
  // sesión, auditoría) — corre dentro de `withTenant` y termina (commit) antes
  // de la cookie/redirect finales, para no arriesgar un rollback de la sesión
  // recién creada si `redirect()` quedara dentro de la misma transacción.
  const tenantId = await requireRequestTenantId();
  const result = await withTenant(tenantId, async () => {
    if (!(await isBootstrapNeeded())) {
      return { ok: false as const, formError: 'El sistema ya está configurado.' };
    }

    let userId: string;
    try {
      ({ userId } = await createFirstAdmin(parsed.data));
    } catch (e) {
      if (e instanceof ValidationError) return { ok: false as const, fieldErrors: e.fields };
      throw e;
    }

    const h = await headers();
    const ip = getClientIp(h);
    const { token } = await createSession(userId, { ip, userAgent: h.get('user-agent') });
    await logActivity({ actorId: userId, accion: 'auth.login', ip, metadata: { via: 'setup' } });
    return { ok: true as const, token };
  });

  if (!result.ok) return result;

  (await cookies()).set(SESSION_COOKIE, result.token, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  });

  redirect('/dashboard');
}
