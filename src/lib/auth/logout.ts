import { revokeSessionByToken } from './session';
import { logActivity } from '@/lib/audit';

export async function logout(
  token: string | undefined,
  actorId: string | null,
  ip: string | null,
): Promise<void> {
  if (token) await revokeSessionByToken(token);
  await logActivity({ actorId, accion: 'auth.logout', ip });
}
