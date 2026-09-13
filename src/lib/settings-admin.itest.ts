import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { db } from '@/lib/db';
import { hashPassword } from '@/lib/auth/password';
import { updateIdleTimeout } from './settings-admin';
import { getIdleTimeoutMinutes } from './settings';

let actorId: string;
beforeEach(async () => {
  await db.activityLog.deleteMany();
  await db.user.deleteMany();
  await db.appSetting.upsert({
    where: { clave: 'session.idleTimeoutMinutes' },
    update: { valor: 15 },
    create: { clave: 'session.idleTimeoutMinutes', valor: 15 },
  });
  const admin = await db.role.findFirstOrThrow({ where: { nombre: 'Administrador' } });
  actorId = (
    await db.user.create({
      data: {
        nombre: 'A',
        email: 'a@pos.com',
        passwordHash: await hashPassword('xxxxxxxxxx'),
        roleId: admin.id,
      },
    })
  ).id;
});

afterAll(async () => {
  await db.appSetting.upsert({
    where: { clave: 'session.idleTimeoutMinutes' },
    update: { valor: 15 },
    create: { clave: 'session.idleTimeoutMinutes', valor: 15 },
  });
});

describe('updateIdleTimeout', () => {
  it('persiste y audita antes/después', async () => {
    await updateIdleTimeout(actorId, 30, '1.1.1.1');
    expect(await getIdleTimeoutMinutes()).toBe(30);
    const log = await db.activityLog.findFirstOrThrow({ where: { accion: 'config.editar' } });
    expect(log.metadata).toMatchObject({
      clave: 'session.idleTimeoutMinutes',
      antes: 15,
      despues: 30,
    });
  });
});
