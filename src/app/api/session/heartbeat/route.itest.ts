import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '@/lib/db';
import { hashPassword } from '@/lib/auth/password';
import { createSession, hashToken } from '@/lib/auth/session';
import { POST } from './route';

async function makeSession() {
  const role = await db.role.findFirstOrThrow({ where: { nombre: 'Cajero' } });
  const u = await db.user.create({
    data: {
      nombre: 'H', email: `h${Math.random()}@pos.com`,
      passwordHash: await hashPassword('xxxxxxxxxx'), roleId: role.id,
    },
  });
  return createSession(u.id, {});
}

beforeEach(async () => {
  await db.session.deleteMany();
  await db.user.deleteMany();
});

describe('POST /api/session/heartbeat', () => {
  it('200 y toca la sesión con cookie válida', async () => {
    const { token } = await makeSession();
    // fuerza lastActivityAt viejo para que touchSession escriba
    await db.session.update({
      where: { tokenHash: hashToken(token) },
      data: { lastActivityAt: new Date(Date.now() - 5 * 60_000) },
    });
    const res = await POST(new Request('http://x/api/session/heartbeat', {
      method: 'POST', headers: { cookie: `pos_session=${token}` },
    }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ ok: true });
    expect(typeof body.idleTimeoutMinutes).toBe('number');
    const row = await db.session.findUniqueOrThrow({ where: { tokenHash: hashToken(token) } });
    expect(row.lastActivityAt.getTime()).toBeGreaterThan(Date.now() - 60_000);
  });

  it('403 con Origin cross-origin', async () => {
    const { token } = await makeSession();
    const res = await POST(new Request('http://x/api/session/heartbeat', {
      method: 'POST',
      headers: {
        cookie: `pos_session=${token}`,
        host: 'x',
        origin: 'https://evil.example',
      },
    }));
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ ok: false });
  });

  it('401 sin cookie', async () => {
    const res = await POST(new Request('http://x/api/session/heartbeat', { method: 'POST' }));
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ ok: false });
  });

  it('401 con sesión revocada', async () => {
    const { token } = await makeSession();
    await db.session.updateMany({
      where: { tokenHash: hashToken(token) }, data: { revokedAt: new Date() },
    });
    const res = await POST(new Request('http://x/api/session/heartbeat', {
      method: 'POST', headers: { cookie: `pos_session=${token}` },
    }));
    expect(res.status).toBe(401);
  });
});
