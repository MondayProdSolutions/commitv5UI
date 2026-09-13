import { db } from '@/lib/db';
import { hashPassword, verifyPassword, passwordPolicyError } from './password';
import { revokeAllForUser } from './session';
import { logActivity } from '@/lib/audit';
import { ValidationError } from '@/lib/errors';

export async function changePassword(input: {
  userId: string;
  currentPassword?: string;
  newPassword: string;
  requireCurrent: boolean;
  currentSessionId: string | null;
  ip: string | null;
}): Promise<void> {
  const user = await db.user.findUniqueOrThrow({ where: { id: input.userId } });

  if (input.requireCurrent) {
    if (!input.currentPassword || !(await verifyPassword(user.passwordHash, input.currentPassword)))
      throw new ValidationError({ currentPassword: 'La contraseña actual no es correcta.' });
  }

  const policy = passwordPolicyError(input.newPassword, user.email);
  if (policy) throw new ValidationError({ newPassword: policy });

  const passwordHash = await hashPassword(input.newPassword);
  await db.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: user.id },
      data: { passwordHash, mustChangePassword: false },
    });
    await logActivity(
      {
        actorId: user.id,
        accion: 'auth.password_changed',
        ip: input.ip,
        metadata: { forzado: !input.requireCurrent },
      },
      tx,
    );
  });
  await revokeAllForUser(user.id, input.currentSessionId ?? undefined);
}
