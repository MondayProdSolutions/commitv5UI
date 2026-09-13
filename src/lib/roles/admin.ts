import { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import {
  ALL_PERMISSION_KEYS,
  ADMIN_LOCKED_PERMISSIONS,
  MANAGER_GUARD_PERMISSIONS,
} from '@/lib/auth/rbac';
import { logActivity } from '@/lib/audit';
import { ValidationError } from '@/lib/errors';

export type RoleRow = {
  id: string;
  nombre: string;
  descripcion: string | null;
  esSistema: boolean;
  usuarios: number;
  permisos: string[];
};

export type RoleWriteInput = {
  nombre: string;
  descripcion?: string | null;
  permisos: string[];
};

const VALID = new Set<string>(ALL_PERMISSION_KEYS);

/** Descarta permisos desconocidos y elimina duplicados. */
function sanitize(perms: string[]): string[] {
  return [...new Set(perms.filter((p) => VALID.has(p)))];
}

function isDuplicateName(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';
}

export async function listRoles(): Promise<RoleRow[]> {
  const roles = await db.role.findMany({
    orderBy: [{ esSistema: 'desc' }, { nombre: 'asc' }],
    include: { permissions: true, _count: { select: { users: true } } },
  });
  return roles.map((r) => ({
    id: r.id,
    nombre: r.nombre,
    descripcion: r.descripcion,
    esSistema: r.esSistema,
    usuarios: r._count.users,
    permisos: r.permissions.map((p) => p.permiso).sort(),
  }));
}

export async function getRole(id: string): Promise<RoleRow | null> {
  return (await listRoles()).find((r) => r.id === id) ?? null;
}

async function setPermissions(
  tx: Prisma.TransactionClient,
  roleId: string,
  permisos: string[],
): Promise<void> {
  await tx.rolePermission.deleteMany({ where: { roleId } });
  if (permisos.length) {
    await tx.rolePermission.createMany({
      data: permisos.map((permiso) => ({ roleId, permiso })),
    });
  }
}

export async function createRole(
  actorId: string,
  input: RoleWriteInput,
  ip: string | null,
): Promise<{ id: string }> {
  const permisos = sanitize(input.permisos);
  try {
    return await db.$transaction(async (tx) => {
      const role = await tx.role.create({
        data: {
          nombre: input.nombre.trim(),
          descripcion: input.descripcion ?? null,
          esSistema: false,
        },
      });
      await setPermissions(tx, role.id, permisos);
      await logActivity(
        {
          actorId,
          accion: 'roles.crear',
          entidad: 'Role',
          entidadId: role.id,
          metadata: { despues: { nombre: role.nombre, permisos } },
          ip,
        },
        tx,
      );
      return { id: role.id };
    });
  } catch (e) {
    if (isDuplicateName(e)) throw new ValidationError({ nombre: 'Ya existe un rol con ese nombre.' });
    throw e;
  }
}

export async function updateRole(
  actorId: string,
  id: string,
  input: RoleWriteInput,
  ip: string | null,
): Promise<void> {
  await db.$transaction(async (tx) => {
    const role = await tx.role.findUniqueOrThrow({
      where: { id },
      include: {
        permissions: true,
        _count: { select: { users: { where: { activo: true } } } },
      },
    });

    let permisos = sanitize(input.permisos);
    const antes = role.permissions.map((p) => p.permiso).sort();

    if (role.nombre === 'Administrador') {
      for (const p of ADMIN_LOCKED_PERMISSIONS) {
        if (!permisos.includes(p)) permisos.push(p);
      }
    }

    const nombreFinal = role.esSistema ? role.nombre : input.nombre.trim();
    if (role.esSistema && input.nombre.trim() !== role.nombre) {
      throw new ValidationError({ nombre: 'No se puede renombrar un rol de sistema.' });
    }

    const eraGuardian = MANAGER_GUARD_PERMISSIONS.every((p) => antes.includes(p));
    const seguiraGuardian = MANAGER_GUARD_PERMISSIONS.every((p) => permisos.includes(p));
    if (eraGuardian && !seguiraGuardian && role._count.users > 0) {
      const otrosRoles = await tx.role.findMany({
        where: { id: { not: id } },
        include: {
          permissions: true,
          _count: { select: { users: { where: { activo: true } } } },
        },
      });
      const quedaOtroGuardian = otrosRoles.some(
        (r) =>
          r._count.users > 0 &&
          MANAGER_GUARD_PERMISSIONS.every((p) => r.permissions.some((x) => x.permiso === p)),
      );
      if (!quedaOtroGuardian) {
        throw new ValidationError({
          _form: 'Esta edición dejaría al sistema sin un administrador con permisos de gestión.',
        });
      }
    }

    try {
      await tx.role.update({
        where: { id },
        data: { nombre: nombreFinal, descripcion: input.descripcion ?? null },
      });
    } catch (e) {
      if (isDuplicateName(e)) throw new ValidationError({ nombre: 'Ya existe un rol con ese nombre.' });
      throw e;
    }

    permisos = [...permisos].sort();
    await setPermissions(tx, id, permisos);
    await logActivity(
      {
        actorId,
        accion: 'roles.editar',
        entidad: 'Role',
        entidadId: id,
        metadata: {
          nombreAntes: role.nombre,
          nombreDespues: nombreFinal,
          antes: { permisos: antes },
          despues: { permisos },
        },
        ip,
      },
      tx,
    );
  });
}

export async function deleteRole(
  actorId: string,
  id: string,
  ip: string | null,
): Promise<void> {
  await db.$transaction(async (tx) => {
    const role = await tx.role.findUniqueOrThrow({
      where: { id },
      include: { permissions: true, _count: { select: { users: true } } },
    });
    if (role.esSistema) {
      throw new ValidationError({ _form: 'No se puede borrar un rol de sistema.' });
    }
    if (role._count.users > 0) {
      throw new ValidationError({ _form: 'Reasigna primero los usuarios de este rol.' });
    }
    await tx.role.delete({ where: { id } });
    await logActivity(
      {
        actorId,
        accion: 'roles.borrar',
        entidad: 'Role',
        entidadId: id,
        metadata: { nombre: role.nombre, permisos: role.permissions.map((p) => p.permiso).sort() },
        ip,
      },
      tx,
    );
  });
}
