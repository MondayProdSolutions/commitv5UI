import { randomBytes, createHash } from 'node:crypto';
import { db, withPlatformAdmin } from '@/lib/db';

export const PLATFORM_SESSION_COOKIE = 'platform_session';
export const SESSION_TTL_MS = 8 * 60 * 60 * 1000; // 8 horas — sesión de trabajo de soporte, no de POS

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export async function createPlatformSession(
  platformAdminId: string,
  ctx: { ip?: string | null; userAgent?: string | null },
): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(32).toString('base64url');
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);
  await withPlatformAdmin(() =>
    db.platformAdminSession.create({
      data: {
        tokenHash: hashToken(token),
        platformAdminId,
        createdAt: now,
        lastActivityAt: now,
        expiresAt,
        ip: ctx.ip ?? null,
        userAgent: ctx.userAgent ?? null,
      },
    }),
  );
  return { token, expiresAt };
}

export type PlatformSessionResult =
  | { status: 'ok'; session: { platformAdminId: string } }
  | { status: 'invalid' }
  | { status: 'expired' };

export async function validatePlatformSession(token: string | undefined): Promise<PlatformSessionResult> {
  if (!token) return { status: 'invalid' };
  const session = await withPlatformAdmin(() =>
    db.platformAdminSession.findUnique({ where: { tokenHash: hashToken(token) } }),
  );
  if (!session || session.revokedAt) return { status: 'invalid' };
  if (session.expiresAt < new Date()) return { status: 'expired' };
  return { status: 'ok', session: { platformAdminId: session.platformAdminId } };
}
