import { createHash, randomBytes } from 'node:crypto';
import { db } from '@/lib/db';
import { logActivity } from '@/lib/audit';

export const SESSION_COOKIE = 'pos_session';
export const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
export const TOUCH_THROTTLE_MS = 60 * 1000;

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export async function createSession(
  userId: string,
  ctx: { ip?: string | null; userAgent?: string | null },
): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(32).toString('base64url');
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);
  await db.session.create({
    data: {
      tokenHash: hashToken(token),
      userId,
      createdAt: now,
      lastActivityAt: now,
      expiresAt,
      ip: ctx.ip ?? null,
      userAgent: ctx.userAgent ?? null,
    },
  });
  return { token, expiresAt };
}

export type ValidatedSession = {
  session: { id: string; userId: string; lastActivityAt: Date; expiresAt: Date } | null;
  status: 'ok' | 'idle' | 'invalid';
};

export async function validateSession(
  token: string | undefined,
  idleTimeoutMinutes: number,
): Promise<ValidatedSession> {
  if (!token) return { session: null, status: 'invalid' };
  const row = await db.session.findUnique({ where: { tokenHash: hashToken(token) } });
  const now = Date.now();
  if (!row || row.revokedAt || row.expiresAt.getTime() <= now)
    return { session: null, status: 'invalid' };
  if (now - row.lastActivityAt.getTime() > idleTimeoutMinutes * 60_000) {
    await db.session.update({ where: { id: row.id }, data: { revokedAt: new Date() } });
    try {
      await logActivity({
        actorId: row.userId,
        accion: 'auth.logout_idle',
        metadata: { minutosInactivo: Math.round((Date.now() - row.lastActivityAt.getTime()) / 60000) },
      });
    } catch {
      // best-effort: session.ts está en la ruta caliente; un fallo de auditoría no debe romper la petición
    }
    return {
      session: { id: row.id, userId: row.userId, lastActivityAt: row.lastActivityAt, expiresAt: row.expiresAt },
      status: 'idle',
    };
  }
  return {
    session: { id: row.id, userId: row.userId, lastActivityAt: row.lastActivityAt, expiresAt: row.expiresAt },
    status: 'ok',
  };
}

export async function touchSession(token: string): Promise<void> {
  const row = await db.session.findUnique({ where: { tokenHash: hashToken(token) } });
  if (!row || row.revokedAt) return;
  if (Date.now() - row.lastActivityAt.getTime() < TOUCH_THROTTLE_MS) return;
  const now = new Date();
  await db.session.update({
    where: { id: row.id },
    data: { lastActivityAt: now, expiresAt: new Date(now.getTime() + SESSION_TTL_MS) },
  });
}

export async function revokeSession(id: string): Promise<void> {
  await db.session.updateMany({ where: { id, revokedAt: null }, data: { revokedAt: new Date() } });
}

export async function revokeSessionByToken(token: string): Promise<void> {
  await db.session.updateMany({
    where: { tokenHash: hashToken(token), revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function revokeAllForUser(userId: string, exceptSessionId?: string): Promise<number> {
  const res = await db.session.updateMany({
    where: { userId, revokedAt: null, ...(exceptSessionId ? { id: { not: exceptSessionId } } : {}) },
    data: { revokedAt: new Date() },
  });
  return res.count;
}
