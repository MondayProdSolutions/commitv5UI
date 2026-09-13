'use server';

import { headers } from 'next/headers';
import { requireUser } from '@/lib/auth/context';
import { profileSchema } from '@/lib/validation/user';
import { updateOwnProfile } from '@/lib/users/profile';
import { revokeSession, revokeAllForUser } from '@/lib/auth/session';
import { logActivity } from '@/lib/audit';
import { getClientIp } from '@/lib/http';
import { ValidationError } from '@/lib/errors';
import type { FormState } from '@/app/(auth)/setup/actions';

export async function updateProfileAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();

  const parsed = profileSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? '');
      if (key && !(key in fieldErrors)) fieldErrors[key] = issue.message;
    }
    return { ok: false, fieldErrors };
  }

  try {
    const h = await headers();
    const ip = getClientIp(h);
    await updateOwnProfile(user.id, parsed.data, ip);
  } catch (e) {
    if (e instanceof ValidationError) return { ok: false, fieldErrors: e.fields };
    throw e;
  }

  return { ok: true };
}

export async function revokeMySessionAction(_prev: FormState, sessionId: string): Promise<FormState> {
  const user = await requireUser();

  // Verify the session belongs to this user
  const { db } = await import('@/lib/db');
  const session = await db.session.findUnique({ where: { id: sessionId } });
  if (!session || session.userId !== user.id) {
    return { ok: false, formError: 'Sesión no encontrada' };
  }

  const h = await headers();
  const ip = getClientIp(h);

  await revokeSession(sessionId);
  await logActivity({
    actorId: user.id,
    accion: 'usuarios.sesiones_revocadas',
    entidad: 'Session',
    entidadId: sessionId,
    metadata: { objetivoUserId: user.id, cantidad: 1, propio: true },
    ip,
  });

  return { ok: true };
}

export async function revokeMyOtherSessionsAction(
  _prev: FormState,
  currentSessionId: string | null,
): Promise<FormState> {
  const user = await requireUser();

  const h = await headers();
  const ip = getClientIp(h);

  const count = await revokeAllForUser(user.id, currentSessionId ?? undefined);
  if (count > 0) {
    await logActivity({
      actorId: user.id,
      accion: 'usuarios.sesiones_revocadas',
      metadata: { objetivoUserId: user.id, cantidad: count, propio: true },
      ip,
    });
  }

  return { ok: true };
}
