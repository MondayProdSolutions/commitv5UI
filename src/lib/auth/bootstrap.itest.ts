import { describe, it, expect, beforeEach } from 'vitest';
import { db, getCurrentTenantId } from '@/lib/db';
import { isBootstrapNeeded, createFirstAdmin } from './bootstrap';
import { verifyPassword } from './password';
import { ValidationError } from '@/lib/errors';

beforeEach(async () => {
  await db.activityLog.deleteMany();
  await db.session.deleteMany();
  await db.user.deleteMany();
});

describe('bootstrap', () => {
  it('isBootstrapNeeded true cuando no hay usuarios', async () => {
    expect(await isBootstrapNeeded()).toBe(true);
  });

  it('createFirstAdmin crea un Administrador utilizable', async () => {
    const { userId } = await createFirstAdmin({
      nombre: 'Ana', email: 'ana@pos.com', password: 'caballoAzul42', confirm: 'caballoAzul42',
    });
    const u = await db.user.findUniqueOrThrow({ where: { id: userId }, include: { role: true } });
    expect(u.role.nombre).toBe('Administrador');
    expect(u.role.esSistema).toBe(true);
    expect(u.mustChangePassword).toBe(false);
    expect(await verifyPassword(u.passwordHash, 'caballoAzul42')).toBe(true);
    expect(await isBootstrapNeeded()).toBe(false);
    const log = await db.activityLog.findFirst({ where: { accion: 'usuarios.crear' } });
    expect(log?.metadata).toMatchObject({ bootstrap: true });
  });

  it('no duplica el rol Administrador (upsert defensivo)', async () => {
    await db.role.upsert({
      where: { tenantId_nombre: { tenantId: getCurrentTenantId(), nombre: 'Administrador' } },
      update: {},
      create: { nombre: 'Administrador', esSistema: true, descripcion: 'Rol de sistema: Administrador' },
    });
    const { userId } = await createFirstAdmin({
      nombre: 'Bob', email: 'bob@pos.com', password: 'perritoVerde99', confirm: 'perritoVerde99',
    });
    const roles = await db.role.findMany({ where: { nombre: 'Administrador' } });
    expect(roles).toHaveLength(1);
    const u = await db.user.findUniqueOrThrow({ where: { id: userId } });
    expect(u.roleId).toBe(roles[0].id);
  });

  it('rechaza contraseñas que violan la política y no crea usuario', async () => {
    await expect(
      createFirstAdmin({ nombre: 'Ana', email: 'ana@pos.com', password: 'password123', confirm: 'password123' }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(await db.user.count()).toBe(0);
  });
});
