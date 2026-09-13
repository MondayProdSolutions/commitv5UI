import { db } from '@/lib/db';
import { logActivity } from '@/lib/audit';

export type UserSessionRow = {
  id: string;
  ip: string | null;
  userAgent: string | null;
  lastActivityAt: Date;
  createdAt: Date;
  actual: boolean;
};

export async function updateOwnProfile(
  userId: string,
  input: { nombre: string; telefono?: string | null },
  ip: string | null,
): Promise<void> {
  const before = await db.user.findUniqueOrThrow({ where: { id: userId } });
  const telefono = input.telefono ?? null;
  await db.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: userId },
      data: { nombre: input.nombre, telefono },
    });
    await logActivity(
      {
        actorId: userId,
        accion: 'usuarios.editar',
        entidad: 'User',
        entidadId: userId,
        metadata: {
          propio: true,
          antes: { nombre: before.nombre, telefono: before.telefono },
          despues: { nombre: input.nombre, telefono },
        },
        ip,
      },
      tx,
    );
  });
}

export async function listUserSessions(
  userId: string,
  currentSessionId: string | null,
): Promise<UserSessionRow[]> {
  const rows = await db.session.findMany({
    where: { userId, revokedAt: null },
    orderBy: { lastActivityAt: 'desc' },
  });
  return rows.map((s) => ({
    id: s.id,
    ip: s.ip,
    userAgent: s.userAgent,
    lastActivityAt: s.lastActivityAt,
    createdAt: s.createdAt,
    actual: s.id === currentSessionId,
  }));
}
