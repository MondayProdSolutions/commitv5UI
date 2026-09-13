import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '@/lib/db';
import { hashPassword, verifyPassword } from './password';
import { createSession, validateSession } from './session';
import { changePassword } from './change-password';
import { ValidationError } from '@/lib/errors';

async function makeUser(mustChange = false) {
  const role = await db.role.findFirstOrThrow({ where: { nombre: 'Cajero' } });
  return db.user.create({
    data: { nombre: 'C', email: `c${Math.random()}@pos.com`,
      passwordHash: await hashPassword('viejaClave12'), roleId: role.id, mustChangePassword: mustChange },
  });
}

beforeEach(async () => {
  await db.activityLog.deleteMany();
  await db.session.deleteMany();
  await db.user.deleteMany();
});

describe('changePassword', () => {
  it('flujo normal: exige la actual, rehash, limpia mustChangePassword', async () => {
    const u = await makeUser();
    await changePassword({
      userId: u.id, currentPassword: 'viejaClave12', newPassword: 'nuevaClave34',
      requireCurrent: true, currentSessionId: null, ip: null,
    });
    const after = await db.user.findUniqueOrThrow({ where: { id: u.id } });
    expect(await verifyPassword(after.passwordHash, 'nuevaClave34')).toBe(true);
    expect(after.mustChangePassword).toBe(false);
    const log = await db.activityLog.findFirst({ where: { accion: 'auth.password_changed' } });
    expect(log?.metadata).toMatchObject({ forzado: false });
  });

  it('rechaza si la contraseña actual es incorrecta', async () => {
    const u = await makeUser();
    await expect(changePassword({
      userId: u.id, currentPassword: 'mal', newPassword: 'nuevaClave34',
      requireCurrent: true, currentSessionId: null, ip: null,
    })).rejects.toBeInstanceOf(ValidationError);
  });

  it('flujo forzado: no exige la actual, forzado:true', async () => {
    const u = await makeUser(true);
    await changePassword({
      userId: u.id, newPassword: 'nuevaClave34',
      requireCurrent: false, currentSessionId: null, ip: null,
    });
    const log = await db.activityLog.findFirst({ where: { accion: 'auth.password_changed' } });
    expect(log?.metadata).toMatchObject({ forzado: true });
  });

  it('revoca las demás sesiones pero conserva la actual', async () => {
    const u = await makeUser();
    const keep = await createSession(u.id, {});
    const other = await createSession(u.id, {});
    const keepId = (await db.session.findFirstOrThrow({
      where: { tokenHash: (await import('./session')).hashToken(keep.token) },
    })).id;
    await changePassword({
      userId: u.id, currentPassword: 'viejaClave12', newPassword: 'nuevaClave34',
      requireCurrent: true, currentSessionId: keepId, ip: null,
    });
    expect((await validateSession(keep.token, 15)).status).toBe('ok');
    expect((await validateSession(other.token, 15)).status).toBe('invalid');
  });

  it('aplica la política de contraseña', async () => {
    const u = await makeUser();
    await expect(changePassword({
      userId: u.id, currentPassword: 'viejaClave12', newPassword: 'corta',
      requireCurrent: true, currentSessionId: null, ip: null,
    })).rejects.toBeInstanceOf(ValidationError);
  });
});
