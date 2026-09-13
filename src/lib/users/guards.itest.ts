import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '@/lib/db';
import { hashPassword } from '@/lib/auth/password';
import { assertGuardPreserved, countActiveGuardUsers } from './guards';
import { ValidationError } from '@/lib/errors';

async function user(roleName: string, activo = true) {
  const role = await db.role.findFirstOrThrow({ where: { nombre: roleName } });
  return db.user.create({
    data: {
      nombre: roleName,
      email: `${roleName}-${Math.random()}@pos.com`,
      passwordHash: await hashPassword('xxxxxxxxxx'),
      roleId: role.id,
      activo,
    },
  });
}

beforeEach(async () => {
  await db.session.deleteMany();
  await db.user.deleteMany();
});

describe('guardianes del sistema', () => {
  it('cuenta al Administrador activo como guardián', async () => {
    await user('Administrador');
    expect(await countActiveGuardUsers()).toBe(1);
  });

  it('assertGuardPreserved lanza si desactivar deja 0 guardianes', async () => {
    const admin = await user('Administrador');
    await expect(assertGuardPreserved({ excludeUserId: admin.id, deactivating: true }))
      .rejects.toBeInstanceOf(ValidationError);
  });

  it('no lanza si queda otro Administrador activo', async () => {
    const a1 = await user('Administrador');
    await user('Administrador');
    await expect(assertGuardPreserved({ excludeUserId: a1.id, deactivating: true })).resolves.toBeUndefined();
  });

  it('lanza si cambiar el rol del único Administrador a Cajero rompe el guard', async () => {
    const admin = await user('Administrador');
    const cajero = await db.role.findFirstOrThrow({ where: { nombre: 'Cajero' } });
    await expect(assertGuardPreserved({ excludeUserId: admin.id, prospectiveRoleId: cajero.id }))
      .rejects.toBeInstanceOf(ValidationError);
  });
});
