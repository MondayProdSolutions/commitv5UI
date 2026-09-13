import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '@/lib/db';
import { hashPassword } from '@/lib/auth/password';
import { updateOwnProfile, listUserSessions } from './profile';
import { createSession } from '@/lib/auth/session';

async function makeUser() {
  const role = await db.role.findFirstOrThrow({ where: { nombre: 'Cajero' } });
  return db.user.create({
    data: { nombre: 'Pepe', email: `p${Math.random()}@pos.com`, passwordHash: await hashPassword('xxxxxxxxxx'), roleId: role.id },
  });
}

beforeEach(async () => {
  await db.activityLog.deleteMany();
  await db.session.deleteMany();
  await db.user.deleteMany();
});

describe('updateOwnProfile', () => {
  it('actualiza y audita con antes/después', async () => {
    const u = await makeUser();
    await updateOwnProfile(u.id, { nombre: 'Pepe Pérez', telefono: '600' }, '1.1.1.1');
    const after = await db.user.findUniqueOrThrow({ where: { id: u.id } });
    expect(after.nombre).toBe('Pepe Pérez');
    const log = await db.activityLog.findFirstOrThrow({ where: { accion: 'usuarios.editar' } });
    expect(log.metadata).toMatchObject({ antes: { nombre: 'Pepe' }, despues: { nombre: 'Pepe Pérez' }, propio: true });
  });
});

describe('listUserSessions', () => {
  it('marca la sesión actual', async () => {
    const u = await makeUser();
    const a = await createSession(u.id, { ip: '1.1.1.1' });
    const aId = (await db.session.findFirstOrThrow({
      where: { tokenHash: (await import('@/lib/auth/session')).hashToken(a.token) },
    })).id;
    await createSession(u.id, { ip: '2.2.2.2' });
    const list = await listUserSessions(u.id, aId);
    expect(list).toHaveLength(2);
    expect(list.find((s) => s.id === aId)?.actual).toBe(true);
  });
});
