import { db } from '@/lib/db';
import { actionLabel } from '@/lib/audit';

/**
 * Convierte un parámetro de fecha (query string) en Date.
 * Devuelve undefined si falta o si no es una fecha válida, para no
 * pasar `Invalid Date` a Prisma (que lanzaría un 500).
 */
export function parseDateParam(s?: string | null): Date | undefined {
  if (!s) return undefined;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

export type ActivityRow = {
  id: string;
  accion: string;
  accionLabel: string;
  actorNombre: string | null;
  entidad: string | null;
  entidadId: string | null;
  metadata: unknown;
  ip: string | null;
  createdAt: Date;
};

export async function queryActivity(filter: {
  actorId?: string;
  accion?: string;
  desde?: Date;
  hasta?: Date;
  page: number;
  pageSize: number;
}): Promise<{ rows: ActivityRow[]; total: number }> {
  const where = {
    ...(filter.actorId ? { actorId: filter.actorId } : {}),
    ...(filter.accion ? { accion: filter.accion } : {}),
    ...(filter.desde || filter.hasta
      ? {
          createdAt: {
            ...(filter.desde ? { gte: filter.desde } : {}),
            ...(filter.hasta ? { lte: filter.hasta } : {}),
          },
        }
      : {}),
  };

  const [rows, total] = await Promise.all([
    db.activityLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (filter.page - 1) * filter.pageSize,
      take: filter.pageSize,
      include: { actor: { select: { nombre: true } } },
    }),
    db.activityLog.count({ where }),
  ]);

  return {
    total,
    rows: rows.map((r) => ({
      id: r.id,
      accion: r.accion,
      accionLabel: actionLabel(r.accion),
      actorNombre: r.actor?.nombre ?? null,
      entidad: r.entidad,
      entidadId: r.entidadId,
      metadata: r.metadata,
      ip: r.ip,
      createdAt: r.createdAt,
    })),
  };
}
