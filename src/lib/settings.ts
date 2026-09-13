import { db } from '@/lib/db';

export async function getSetting<T>(clave: string, fallback: T): Promise<T> {
  const row = await db.appSetting.findUnique({ where: { clave } });
  return row ? (row.valor as T) : fallback;
}

export async function setSetting(clave: string, valor: unknown): Promise<void> {
  await db.appSetting.upsert({
    where: { clave },
    update: { valor: valor as object },
    create: { clave, valor: valor as object },
  });
}

export async function getIdleTimeoutMinutes(): Promise<number> {
  const v = await getSetting<number>('session.idleTimeoutMinutes', 15);
  return typeof v === 'number' && v > 0 ? v : 15;
}
