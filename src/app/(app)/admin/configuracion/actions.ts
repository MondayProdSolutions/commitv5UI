'use server';

import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { requirePermission } from '@/lib/auth/context';
import { getClientIp } from '@/lib/http';
import { updateIdleTimeout } from '@/lib/settings-admin';
import { idleTimeoutSchema } from '@/lib/validation/settings';
import type { FormState } from '@/app/(auth)/setup/actions';

export async function updateInactivityAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const actor = await requirePermission('config.editar');

  const parsed = idleTimeoutSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? '');
      if (key && !(key in fieldErrors)) fieldErrors[key] = issue.message;
    }
    return { ok: false, fieldErrors };
  }

  const h = await headers();
  const ip = getClientIp(h);
  await updateIdleTimeout(actor.id, parsed.data.minutes, ip);
  revalidatePath('/admin/configuracion');
  return { ok: true };
}
