'use server';

import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { changePasswordSchema } from '@/lib/validation/auth';
import { getCurrentUser } from '@/lib/auth/context';
import { changePassword } from '@/lib/auth/change-password';
import { validateSession, SESSION_COOKIE } from '@/lib/auth/session';
import { getIdleTimeoutMinutes } from '@/lib/settings';
import { getClientIp } from '@/lib/http';
import { ValidationError } from '@/lib/errors';
import { logout } from '@/lib/auth/logout';
import { withTenant } from '@/lib/db';
import { requireRequestTenantId } from '@/lib/tenant/with-request-tenant';
import type { FormState } from '@/app/(auth)/setup/actions';

export async function changePasswordAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const tenantId = await requireRequestTenantId();
  return withTenant(tenantId, async () => {
    const user = await getCurrentUser();
    if (!user) redirect('/login');

    const parsed = changePasswordSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? '');
        if (key && !(key in fieldErrors)) fieldErrors[key] = issue.message;
      }
      return { ok: false, fieldErrors };
    }

    const h = await headers();
    const token = (await cookies()).get(SESSION_COOKIE)?.value;
    const vs = await validateSession(token, await getIdleTimeoutMinutes());

    try {
      await changePassword({
        userId: user.id,
        currentPassword: parsed.data.currentPassword,
        newPassword: parsed.data.newPassword,
        requireCurrent: !user.mustChangePassword,
        currentSessionId: vs.session?.id ?? null,
        ip: getClientIp(h),
      });
    } catch (e) {
      if (e instanceof ValidationError) return { ok: false, fieldErrors: e.fields };
      throw e;
    }
    return { ok: true };
  });
}

export async function logoutAction(): Promise<void> {
  const h = await headers();
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;

  // `logout` toca `db` (revoca la sesión) — corre dentro de `withTenant` y
  // termina (commit) antes del `redirect()` final, para no arriesgar un
  // rollback de la revocación si quedara dentro de la misma transacción.
  const tenantId = await requireRequestTenantId();
  await withTenant(tenantId, async () => {
    const user = await getCurrentUser();
    await logout(token, user?.id ?? null, getClientIp(h));
  });

  jar.delete(SESSION_COOKIE);
  redirect('/login');
}
