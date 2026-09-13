import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { db } from '@/lib/db';
import { hashPassword } from '@/lib/auth/password';
import { listRoles, createRole, updateRole, deleteRole } from './admin';
import { ValidationError } from '@/lib/errors';
import { ADMIN_LOCKED_PERMISSIONS } from '@/lib/auth/rbac';
import { ROLE_PERMISSIONS as SEED_ROLE_PERMISSIONS } from '@/lib/auth/role-permissions';

// Estos tests mutan a propósito los permisos de roles de sistema (p. ej. Administrador).
// Restauramos el estado canónico del seed al terminar para no contaminar otras suites.
// `SEED_ROLE_PERMISSIONS` es la misma constante que consume `prisma/seed.ts`, así que
// no puede divergir del seed.

afterAll(async () => {
  await db.user.deleteMany();
  await db.rolePermission.deleteMany({ where: { role: { esSistema: false } } });
  await db.role.deleteMany({ where: { esSistema: false } });
  for (const [nombre, permisos] of Object.entries(SEED_ROLE_PERMISSIONS)) {
    const role = await db.role.findFirst({ where: { nombre } });
    if (!role) continue;
    await db.rolePermission.deleteMany({ where: { roleId: role.id } });
    if (permisos.length) {
      await db.rolePermission.createMany({ data: permisos.map((permiso) => ({ roleId: role.id, permiso })) });
    }
  }
});

let actorId: string;
beforeEach(async () => {
  await db.activityLog.deleteMany();
  await db.user.deleteMany();
  await db.rolePermission.deleteMany({ where: { role: { esSistema: false } } });
  await db.role.deleteMany({ where: { esSistema: false } });
  const admin = await db.role.findFirstOrThrow({ where: { nombre: 'Administrador' } });
  actorId = (
    await db.user.create({
      data: { nombre: 'A', email: 'a@pos.com', passwordHash: await hashPassword('xxxxxxxxxx'), roleId: admin.id },
    })
  ).id;
});

describe('createRole', () => {
  it('crea un rol con permisos saneados', async () => {
    const { id } = await createRole(actorId, { nombre: 'Supervisor', permisos: ['usuarios.ver', 'inventado.xxx'] }, null);
    const r = (await listRoles()).find((x) => x.id === id)!;
    expect(r.permisos).toEqual(['usuarios.ver']);
    expect(await db.activityLog.count({ where: { accion: 'roles.crear' } })).toBe(1);
  });
  it('rechaza nombre duplicado', async () => {
    await createRole(actorId, { nombre: 'Supervisor', permisos: [] }, null);
    await expect(createRole(actorId, { nombre: 'Supervisor', permisos: [] }, null)).rejects.toBeInstanceOf(ValidationError);
  });
});

describe('updateRole', () => {
  it('no permite quitar los permisos blindados del Administrador', async () => {
    const admin = await db.role.findFirstOrThrow({ where: { nombre: 'Administrador' } });
    await updateRole(actorId, admin.id, { nombre: 'Administrador', permisos: ['usuarios.ver'] }, null);
    const after = await db.rolePermission.findMany({ where: { roleId: admin.id } });
    for (const p of ADMIN_LOCKED_PERMISSIONS) expect(after.map((x) => x.permiso)).toContain(p);
  });

  it('no permite renombrar un rol de sistema', async () => {
    const cajero = await db.role.findFirstOrThrow({ where: { nombre: 'Cajero' } });
    await expect(updateRole(actorId, cajero.id, { nombre: 'Caja', permisos: [] }, null)).rejects.toBeInstanceOf(
      ValidationError,
    );
  });

  it('permite editar permisos y descripción de un rol de sistema si no se cambia el nombre', async () => {
    const gerente = await db.role.findFirstOrThrow({ where: { nombre: 'Gerente' } });
    await updateRole(
      actorId,
      gerente.id,
      { nombre: 'Gerente', descripcion: 'x', permisos: ['roles.ver'] },
      null,
    );
    const after = await db.role.findUniqueOrThrow({
      where: { id: gerente.id },
      include: { permissions: true },
    });
    expect(after.nombre).toBe('Gerente');
    expect(after.descripcion).toBe('x');
    expect(after.permissions.map((p) => p.permiso).sort()).toEqual(['roles.ver']);
    expect(await db.activityLog.count({ where: { accion: 'roles.editar' } })).toBe(1);
  });

  it('bloquea dejar al sistema sin guardián al editar el rol del único admin', async () => {
    // El rol Administrador conserva sus permisos blindados aunque se intenten quitar, así que
    // este caso usa un rol NO-sistema que actúa como guardián alterno del único usuario admin.
    const custom = await createRole(actorId, { nombre: 'Gestor', permisos: ['roles.gestionar', 'usuarios.editar'] }, null);
    await db.user.update({ where: { id: actorId }, data: { roleId: custom.id } });
    await expect(
      updateRole(actorId, custom.id, { nombre: 'Gestor', permisos: ['usuarios.ver'] }, null),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

describe('deleteRole', () => {
  it('no borra un rol de sistema', async () => {
    const cajero = await db.role.findFirstOrThrow({ where: { nombre: 'Cajero' } });
    await expect(deleteRole(actorId, cajero.id, null)).rejects.toBeInstanceOf(ValidationError);
  });
  it('no borra un rol con usuarios', async () => {
    const { id } = await createRole(actorId, { nombre: 'ConGente', permisos: [] }, null);
    await db.user.update({ where: { id: actorId }, data: { roleId: id } });
    await expect(deleteRole(actorId, id, null)).rejects.toBeInstanceOf(ValidationError);
  });
  it('borra un rol vacío y audita', async () => {
    const { id } = await createRole(actorId, { nombre: 'Vacio', permisos: [] }, null);
    await deleteRole(actorId, id, null);
    expect(await db.role.findUnique({ where: { id } })).toBeNull();
    expect(await db.activityLog.count({ where: { accion: 'roles.borrar' } })).toBe(1);
  });
});
