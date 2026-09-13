import { db } from '@/lib/db';
import { getSetting, setSetting } from './settings';
import { logActivity } from '@/lib/audit';

export async function updateIdleTimeout(
  actorId: string,
  minutes: number,
  ip: string | null,
): Promise<void> {
  const antes = await getSetting<number>('session.idleTimeoutMinutes', 15);
  await db.$transaction(async (tx) => {
    // setSetting uses `db`; for transaction we reproduce the upsert with tx
    await tx.appSetting.upsert({
      where: { clave: 'session.idleTimeoutMinutes' },
      update: { valor: minutes },
      create: { clave: 'session.idleTimeoutMinutes', valor: minutes },
    });
    await logActivity(
      {
        actorId,
        accion: 'config.editar',
        entidad: 'AppSetting',
        entidadId: 'session.idleTimeoutMinutes',
        ip,
        metadata: { clave: 'session.idleTimeoutMinutes', antes, despues: minutes },
      },
      tx,
    );
  });
  void setSetting; // Reference to avoid unused import
}
