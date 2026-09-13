import { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { hashPassword, generateTempPassword } from '@/lib/auth/password';
import { revokeAllForUser } from '@/lib/auth/session';
import { logActivity } from '@/lib/audit';
import { ValidationError } from '@/lib/errors';
import { assertGuardPreserved } from './guards';
import type { CreateUserInput, EditUserInput } from '@/lib/validation/user';

export type UserListRow = {
  id: string;
  nombre: string;
  email: string;
  roleNombre: string;
  activo: boolean;
  lastLoginAt: Date | null;
};

export type ListUsersFilter = {
  q?: string;
  roleId?: string;
  estado?: 'activos' | 'inactivos' | 'todos';
  page: number;
  pageSize: number;
};

export async function listUsers(
  filter: ListUsersFilter,
): Promise<{ rows: UserListRow[]; total: number }> {
  const where: Prisma.UserWhereInput = {
    ...(filter.roleId ? { roleId: filter.roleId } : {}),
    ...(filter.estado === 'inactivos'
      ? { activo: false }
      : filter.estado === 'todos'
        ? {}
        : { activo: true }),
    ...(filter.q
      ? {
          OR: [
            { nombre: { contains: filter.q, mode: 'insensitive' } },
            { email: { contains: filter.q, mode: 'insensitive' } },
          ],
        }
      : {}),
  };
  const [rows, total] = await Promise.all([
    db.user.findMany({
      where,
      orderBy: { nombre: 'asc' },
      skip: (filter.page - 1) * filter.pageSize,
      take: filter.pageSize,
      include: { role: { select: { nombre: true } } },
    }),
    db.user.count({ where }),
  ]);
  return {
    total,
    rows: rows.map((u) => ({
      id: u.id,
      nombre: u.nombre,
      email: u.email,
      roleNombre: u.role.nombre,
      activo: u.activo,
      lastLoginAt: u.lastLoginAt,
    })),
  };
}

function isDuplicateEmail(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';
}

export async function createUser(
  actorId: string,
  input: CreateUserInput,
  ip: string | null,
): Promise<{ userId: string; tempPassword: string }> {
  const tempPassword = generateTempPassword();
  const passwordHash = await hashPassword(tempPassword);
  try {
    const userId = await db.$transaction(async (tx) => {
      const role = await tx.role.findUniqueOrThrow({ where: { id: input.roleId } });
      const user = await tx.user.create({
        data: {
          nombre: input.nombre,
          email: input.email,
          telefono: input.telefono ?? null,
          passwordHash,
          roleId: input.roleId,
          mustChangePassword: true,
          createdById: actorId,
        },
      });
      await logActivity(
        {
          actorId,
          accion: 'usuarios.crear',
          entidad: 'User',
          entidadId: user.id,
          metadata: {
            nombre: user.nombre,
            email: user.email,
            telefono: user.telefono,
            rol: role.nombre,
          },
          ip,
        },
        tx,
      );
      return user.id;
    });
    return { userId, tempPassword };
  } catch (e) {
    if (isDuplicateEmail(e)) throw new ValidationError({ email: 'Ya existe un usuario con ese correo.' });
    throw e;
  }
}

export async function updateUser(
  actorId: string,
  input: EditUserInput,
  ip: string | null,
): Promise<void> {
  await db.$transaction(async (tx) => {
    const before = await tx.user.findUniqueOrThrow({
      where: { id: input.id },
      include: { role: true },
    });
    const roleChanged = before.roleId !== input.roleId;
    if (roleChanged) {
      await assertGuardPreserved({ excludeUserId: input.id, prospectiveRoleId: input.roleId }, tx);
    }
    const newRole = roleChanged
      ? await tx.role.findUniqueOrThrow({ where: { id: input.roleId } })
      : before.role;

    const telefono = input.telefono ?? null;
    try {
      await tx.user.update({
        where: { id: input.id },
        data: { nombre: input.nombre, email: input.email, telefono, roleId: input.roleId },
      });
    } catch (e) {
      if (isDuplicateEmail(e)) throw new ValidationError({ email: 'Ya existe un usuario con ese correo.' });
      throw e;
    }

    const antes: Record<string, unknown> = {};
    const despues: Record<string, unknown> = {};
    if (before.nombre !== input.nombre) {
      antes.nombre = before.nombre;
      despues.nombre = input.nombre;
    }
    if (before.email !== input.email) {
      antes.email = before.email;
      despues.email = input.email;
    }
    if ((before.telefono ?? null) !== telefono) {
      antes.telefono = before.telefono;
      despues.telefono = telefono;
    }
    if (Object.keys(despues).length > 0) {
      await logActivity(
        {
          actorId,
          accion: 'usuarios.editar',
          entidad: 'User',
          entidadId: input.id,
          metadata: { antes, despues },
          ip,
        },
        tx,
      );
    }
    if (roleChanged) {
      await logActivity(
        {
          actorId,
          accion: 'usuarios.rol_cambiado',
          entidad: 'User',
          entidadId: input.id,
          metadata: { rolAntes: before.role.nombre, rolDespues: newRole.nombre },
          ip,
        },
        tx,
      );
    }
  });
}

export async function setUserActive(
  actorId: string,
  targetId: string,
  activo: boolean,
  ip: string | null,
): Promise<void> {
  if (!activo && actorId === targetId) {
    throw new ValidationError({ _form: 'No puedes desactivar tu propia cuenta.' });
  }
  await db.$transaction(async (tx) => {
    if (!activo) await assertGuardPreserved({ excludeUserId: targetId, deactivating: true }, tx);
    await tx.user.update({ where: { id: targetId }, data: { activo } });
    await logActivity(
      {
        actorId,
        accion: activo ? 'usuarios.activar' : 'usuarios.desactivar',
        entidad: 'User',
        entidadId: targetId,
        ip,
      },
      tx,
    );
  });
  if (!activo) await revokeAllForUser(targetId);
}

export async function resetUserPassword(
  actorId: string,
  targetId: string,
  motivo: string,
  ip: string | null,
): Promise<{ tempPassword: string }> {
  if (!motivo.trim()) throw new ValidationError({ motivo: 'Indica el motivo del restablecimiento.' });
  const tempPassword = generateTempPassword();
  const passwordHash = await hashPassword(tempPassword);
  await db.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: targetId },
      data: { passwordHash, mustChangePassword: true },
    });
    await logActivity(
      {
        actorId,
        accion: 'usuarios.reset_password',
        entidad: 'User',
        entidadId: targetId,
        metadata: { motivo: motivo.trim() },
        ip,
      },
      tx,
    );
  });
  await revokeAllForUser(targetId);
  return { tempPassword };
}

export async function adminRevokeUserSessions(
  actorId: string,
  targetId: string,
  ip: string | null,
): Promise<number> {
  const cantidad = await revokeAllForUser(targetId);
  await logActivity({
    actorId,
    accion: 'usuarios.sesiones_revocadas',
    entidad: 'User',
    entidadId: targetId,
    metadata: { objetivoUserId: targetId, cantidad },
    ip,
  });
  return cantidad;
}
