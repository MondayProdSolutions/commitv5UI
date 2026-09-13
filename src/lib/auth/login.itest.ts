import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '@/lib/db';
import { hashPassword } from './password';
import { attemptLogin } from './login';
import { clearLoginFailures } from './rate-limit';

async function makeUser(over: Partial<{ activo: boolean; mustChangePassword: boolean }> = {}) {
  const role = await db.role.findFirstOrThrow({ where: { nombre: 'Cajero' } });
  return db.user.create({
    data: {
      nombre: 'L', email: 'l@pos.com', passwordHash: await hashPassword('caballoAzul42'),
      roleId: role.id, activo: over.activo ?? true, mustChangePassword: over.mustChangePassword ?? false,
    },
  });
}

beforeEach(async () => {
  await db.activityLog.deleteMany();
  await db.session.deleteMany();
  await db.user.deleteMany();
  clearLoginFailures('l@pos.com|1.1.1.1');
});

const ctx = { ip: '1.1.1.1', userAgent: 'jest' };

describe('attemptLogin', () => {
  it('éxito con credenciales correctas', async () => {
    await makeUser();
    const r = await attemptLogin({ email: 'l@pos.com', password: 'caballoAzul42', ...ctx });
    expect(r).toMatchObject({ ok: true, mustChangePassword: false });
    expect(await db.session.count()).toBe(1);
    expect(await db.activityLog.count({ where: { accion: 'auth.login' } })).toBe(1);
  });

  it('propaga mustChangePassword', async () => {
    await makeUser({ mustChangePassword: true });
    const r = await attemptLogin({ email: 'l@pos.com', password: 'caballoAzul42', ...ctx });
    expect(r).toMatchObject({ ok: true, mustChangePassword: true });
  });

  it('falla con contraseña incorrecta y audita auth.login_failed', async () => {
    await makeUser();
    const r = await attemptLogin({ email: 'l@pos.com', password: 'mala', ...ctx });
    expect(r).toEqual({ ok: false, reason: 'invalid' });
    expect(await db.activityLog.count({ where: { accion: 'auth.login_failed' } })).toBe(1);
  });

  it('falla con usuario inexistente sin lanzar', async () => {
    const r = await attemptLogin({ email: 'nadie@pos.com', password: 'x', ...ctx });
    expect(r).toEqual({ ok: false, reason: 'invalid' });
  });

  it('no crea sesión para usuario inactivo', async () => {
    await makeUser({ activo: false });
    const r = await attemptLogin({ email: 'l@pos.com', password: 'caballoAzul42', ...ctx });
    expect(r).toEqual({ ok: false, reason: 'invalid' });
    expect(await db.session.count()).toBe(0);
  });

  it('bloquea tras 5 fallos', async () => {
    await makeUser();
    for (let i = 0; i < 5; i++) await attemptLogin({ email: 'l@pos.com', password: 'mala', ...ctx });
    const r = await attemptLogin({ email: 'l@pos.com', password: 'caballoAzul42', ...ctx });
    expect(r).toMatchObject({ ok: false, reason: 'rate_limited' });
  });

  it('limpia el contador tras un login correcto', async () => {
    await makeUser();
    for (let i = 0; i < 3; i++) await attemptLogin({ email: 'l@pos.com', password: 'mala', ...ctx });
    await attemptLogin({ email: 'l@pos.com', password: 'caballoAzul42', ...ctx });
    // 3 fallos más no deben bloquear porque el contador se reseteó
    for (let i = 0; i < 3; i++) await attemptLogin({ email: 'l@pos.com', password: 'mala', ...ctx });
    const r = await attemptLogin({ email: 'l@pos.com', password: 'caballoAzul42', ...ctx });
    expect(r).toMatchObject({ ok: true });
  });
});
