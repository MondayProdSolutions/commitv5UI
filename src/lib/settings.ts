import { db, getCurrentTenantId } from '@/lib/db';

export async function getSetting<T>(clave: string, fallback: T): Promise<T> {
  const tenantId = getCurrentTenantId();
  const row = await db.appSetting.findUnique({ where: { tenantId_clave: { tenantId, clave } } });
  return row ? (row.valor as T) : fallback;
}

export async function setSetting(clave: string, valor: unknown): Promise<void> {
  const tenantId = getCurrentTenantId();
  await db.appSetting.upsert({
    where: { tenantId_clave: { tenantId, clave } },
    update: { valor: valor as object },
    create: { tenantId, clave, valor: valor as object },
  });
}

export async function getIdleTimeoutMinutes(): Promise<number> {
  const v = await getSetting<number>('session.idleTimeoutMinutes', 15);
  return typeof v === 'number' && v > 0 ? v : 15;
}
