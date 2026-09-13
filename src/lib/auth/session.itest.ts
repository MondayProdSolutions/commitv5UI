import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '@/lib/db';
import { hashPassword } from './password';
import {
  createSession, validateSession, touchSession, revokeSessionByToken, revokeAllForUser,
} from './session';

async function makeUser() {
  const role = await db.role.findFirstOrThrow({ where: { nombre: 'Cajero' } });
  return db.user.create({
    data: {
      nombre: 'S', email: `s${Math.random()}@pos.com`,
      passwordHash: await hashPassword('xxxxxxxxxx'), roleId: role.id,
    },
  });
}

beforeEach(async () => {
  await db.activityLog.deleteMany();
  await db.session.deleteMany();
  await db.user.deleteMany();
});

describe('sesiones', () => {
  it('createSession devuelve token y guarda solo el hash', async () => {
    const u = await makeUser();
    const { token } = await createSession(u.id, { ip: '1.1.1.1', userAgent: 'jest' });
    const rows = await db.session.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0].tokenHash).not.toBe(token);
    expect(rows[0].ip).toBe('1.1.1.1');
  });

  it('validateSession = ok para sesión fresca', async () => {
    const u = await makeUser();
    const { token } = await createSession(u.id, {});
    expect((await validateSession(token, 15)).status).toBe('ok');
  });

  it('validateSession = invalid para token desconocido', async () => {
    expect((await validateSession('nope', 15)).status).toBe('invalid');
  });

  it('validateSession = invalid tras revocar', async () => {
    const u = await makeUser();
    const { token } = await createSession(u.id, {});
    await revokeSessionByToken(token);
    expect((await validateSession(token, 15)).status).toBe('invalid');
  });

  it('validateSession = idle y revoca si supera el timeout', async () => {
    const u = await makeUser();
    const { token } = await createSession(u.id, {});
    const h = (await import('./session')).hashToken(token);
    await db.session.update({
      where: { tokenHash: h },
      data: { lastActivityAt: new Date(Date.now() - 20 * 60_000) },
    });
    const res = await validateSession(token, 15);
    expect(res.status).toBe('idle');
    expect((await validateSession(token, 15)).status).toBe('invalid'); // ya revocada

    const logs = await db.activityLog.findMany({
      where: { actorId: u.id, accion: 'auth.logout_idle' },
    });
    expect(logs).toHaveLength(1);
    expect(typeof (logs[0].metadata as { minutosInactivo: number }).minutosInactivo).toBe('number');
  });

  it('touchSession no escribe si no pasó el throttle', async () => {
    const u = await makeUser();
    const { token } = await createSession(u.id, {});
    const h = (await import('./session')).hashToken(token);
    const before = await db.session.findUniqueOrThrow({ where: { tokenHash: h } });
    await new Promise((r) => setTimeout(r, 10));
    await touchSession(token);
    const after = await db.session.findUniqueOrThrow({ where: { tokenHash: h } });
    expect(after.lastActivityAt.getTime()).toBe(before.lastActivityAt.getTime());
  });

  it('revokeAllForUser revoca todas menos la excepción', async () => {
    const u = await makeUser();
    const a = await createSession(u.id, {});
    const b = await createSession(u.id, {});
    const bId = (await db.session.findUniqueOrThrow({
      where: { tokenHash: (await import('./session')).hashToken(b.token) },
    })).id;
    const n = await revokeAllForUser(u.id, bId);
    expect(n).toBe(1);
    expect((await validateSession(a.token, 15)).status).toBe('invalid');
    expect((await validateSession(b.token, 15)).status).toBe('ok');
  });
});
