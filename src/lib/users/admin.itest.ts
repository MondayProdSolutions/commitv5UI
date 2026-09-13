import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '@/lib/db';
import { hashPassword, verifyPassword } from '@/lib/auth/password';
import { createSession, validateSession } from '@/lib/auth/session';
import {
  listUsers,
  createUser,
  updateUser,
  setUserActive,
  resetUserPassword,
  adminRevokeUserSessions,
} from './admin';
import { ValidationError } from '@/lib/errors';

let adminId: string;
async function roleId(nombre: string) {
  return (await db.role.findFirstOrThrow({ where: { nombre } })).id;
}

beforeEach(async () => {
  await db.activityLog.deleteMany();
  await db.session.deleteMany();
  await db.user.deleteMany();
  const admin = await db.user.create({
    data: {
      nombre: 'Admin',
      email: 'admin@pos.com',
      passwordHash: await hashPassword('xxxxxxxxxx'),
      roleId: await roleId('Administrador'),
    },
  });
  adminId = admin.id;
});

describe('createUser', () => {
  it('crea usuario con contraseña temporal y mustChangePassword', async () => {
    const { userId, tempPassword } = await createUser(
      adminId,
      { nombre: 'Nuevo', email: 'nuevo@pos.com', telefono: null, roleId: await roleId('Cajero') },
      null,
    );
    const u = await db.user.findUniqueOrThrow({ where: { id: userId } });
    expect(u.mustChangePassword).toBe(true);
    expect(await verifyPassword(u.passwordHash, tempPassword)).toBe(true);
    const log = await db.activityLog.findFirstOrThrow({ where: { accion: 'usuarios.crear', entidadId: userId } });
    expect(log.metadata).toMatchObject({ email: 'nuevo@pos.com', rol: 'Cajero' });
  });

  it('rechaza email duplicado con ValidationError', async () => {
    await expect(
      createUser(
        adminId,
        { nombre: 'X', email: 'admin@pos.com', telefono: null, roleId: await roleId('Cajero') },
        null,
      ),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

describe('updateUser', () => {
  it('audita rol_cambiado cuando cambia el rol', async () => {
    const { userId } = await createUser(
      adminId,
      { nombre: 'R', email: 'r@pos.com', telefono: null, roleId: await roleId('Cajero') },
      null,
    );
    await updateUser(
      adminId,
      { id: userId, nombre: 'R', email: 'r@pos.com', telefono: null, roleId: await roleId('Gerente') },
      null,
    );
    expect(await db.activityLog.count({ where: { accion: 'usuarios.rol_cambiado', entidadId: userId } })).toBe(1);
  });

  it('impide bajar de rol al último Administrador', async () => {
    await expect(
      updateUser(
        adminId,
        { id: adminId, nombre: 'Admin', email: 'admin@pos.com', telefono: null, roleId: await roleId('Cajero') },
        null,
      ),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

describe('setUserActive', () => {
  it('desactivar revoca sesiones y audita', async () => {
    const { userId } = await createUser(
      adminId,
      { nombre: 'D', email: 'd@pos.com', telefono: null, roleId: await roleId('Cajero') },
      null,
    );
    const s = await createSession(userId, {});
    await setUserActive(adminId, userId, false, null);
    expect((await db.user.findUniqueOrThrow({ where: { id: userId } })).activo).toBe(false);
    expect((await validateSession(s.token, 15)).status).toBe('invalid');
    expect(await db.activityLog.count({ where: { accion: 'usuarios.desactivar', entidadId: userId } })).toBe(1);
  });

  it('no permite auto-desactivarse', async () => {
    await expect(setUserActive(adminId, adminId, false, null)).rejects.toBeInstanceOf(ValidationError);
  });

  it('no permite desactivar al último Administrador', async () => {
    const other = await createUser(
      adminId,
      { nombre: 'O', email: 'o@pos.com', telefono: null, roleId: await roleId('Cajero') },
      null,
    );
    await expect(setUserActive(other.userId, adminId, false, null)).rejects.toBeInstanceOf(ValidationError);
  });
});

describe('resetUserPassword', () => {
  it('genera temporal, fuerza cambio, revoca sesiones y audita el motivo', async () => {
    const { userId } = await createUser(
      adminId,
      { nombre: 'P', email: 'p@pos.com', telefono: null, roleId: await roleId('Cajero') },
      null,
    );
    const s = await createSession(userId, {});
    const { tempPassword } = await resetUserPassword(adminId, userId, 'olvidó su contraseña', null);
    const u = await db.user.findUniqueOrThrow({ where: { id: userId } });
    expect(u.mustChangePassword).toBe(true);
    expect(await verifyPassword(u.passwordHash, tempPassword)).toBe(true);
    expect((await validateSession(s.token, 15)).status).toBe('invalid');
    const log = await db.activityLog.findFirstOrThrow({ where: { accion: 'usuarios.reset_password', entidadId: userId } });
    expect(log.metadata).toMatchObject({ motivo: 'olvidó su contraseña' });
  });

  it('exige un motivo no vacío', async () => {
    const { userId } = await createUser(
      adminId,
      { nombre: 'Q', email: 'q@pos.com', telefono: null, roleId: await roleId('Cajero') },
      null,
    );
    await expect(resetUserPassword(adminId, userId, '   ', null)).rejects.toBeInstanceOf(ValidationError);
  });
});

describe('adminRevokeUserSessions', () => {
  it('revoca todas las sesiones del usuario y audita la cantidad', async () => {
    const { userId } = await createUser(
      adminId,
      { nombre: 'S', email: 's@pos.com', telefono: null, roleId: await roleId('Cajero') },
      null,
    );
    await createSession(userId, {});
    await createSession(userId, {});
    const count = await adminRevokeUserSessions(adminId, userId, null);
    expect(count).toBe(2);
    const log = await db.activityLog.findFirstOrThrow({
      where: { accion: 'usuarios.sesiones_revocadas', entidadId: userId },
    });
    expect(log.metadata).toMatchObject({ objetivoUserId: userId, cantidad: 2 });
  });
});

describe('listUsers', () => {
  it('filtra por búsqueda y estado', async () => {
    await createUser(
      adminId,
      { nombre: 'Zoraida', email: 'zoraida@pos.com', telefono: null, roleId: await roleId('Cajero') },
      null,
    );
    const r = await listUsers({ q: 'zora', estado: 'todos', page: 1, pageSize: 10 });
    expect(r.rows.map((x) => x.email)).toContain('zoraida@pos.com');
  });

  it('por defecto solo devuelve usuarios activos', async () => {
    const { userId } = await createUser(
      adminId,
      { nombre: 'Inactivo', email: 'inactivo@pos.com', telefono: null, roleId: await roleId('Cajero') },
      null,
    );
    await setUserActive(adminId, userId, false, null);
    const activos = await listUsers({ estado: 'activos', page: 1, pageSize: 50 });
    expect(activos.rows.map((x) => x.email)).not.toContain('inactivo@pos.com');
    const inactivos = await listUsers({ estado: 'inactivos', page: 1, pageSize: 50 });
    expect(inactivos.rows.map((x) => x.email)).toContain('inactivo@pos.com');
  });
});
