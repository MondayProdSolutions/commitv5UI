import { describe, it, expect, beforeEach } from 'vitest';
import { db, getCurrentTenantId } from '@/lib/db';
import { getSetting, setSetting, getIdleTimeoutMinutes } from './settings';

beforeEach(async () => {
  await db.appSetting.deleteMany({ where: { clave: { startsWith: 'test.' } } });
  // Reset idle timeout to seed value
  await db.appSetting.upsert({
    where: { tenantId_clave: { tenantId: getCurrentTenantId(), clave: 'session.idleTimeoutMinutes' } },
    update: { valor: 15 },
    create: { tenantId: getCurrentTenantId(), clave: 'session.idleTimeoutMinutes', valor: 15 },
  });
});

describe('settings', () => {
  it('devuelve el fallback si no existe', async () => {
    expect(await getSetting('test.x', 7)).toBe(7);
  });
  it('persiste y lee', async () => {
    await setSetting('test.x', 42);
    expect(await getSetting('test.x', 0)).toBe(42);
  });
  it('getIdleTimeoutMinutes devuelve 15 por defecto (seed)', async () => {
    expect(await getIdleTimeoutMinutes()).toBe(15);
  });
});
