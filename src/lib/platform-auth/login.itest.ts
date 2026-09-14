import { describe, it, expect, beforeEach } from 'vitest';
import { db, withPlatformAdmin } from '@/lib/db';
import { hashPassword } from './password';
import { attemptPlatformLogin } from './login';
import { clearLoginFailures } from '@/lib/auth/rate-limit';

const EMAIL = 't-platform-login@tuapp.com';
const GHOST_EMAIL = 't-platform-login-fantasma@tuapp.com';
const ctx = { ip: '1.1.1.1', userAgent: 'jest' };

async function seedAdmin() {
  const passwordHash = await hashPassword('caballoAzul42');
  return withPlatformAdmin(() =>
    db.platformAdmin.create({ data: { nombre: 'Super', email: EMAIL, passwordHash } }),
  );
}

beforeEach(async () => {
  // PlatformAdminSession tiene onDelete: Cascade sobre platformAdminId, así que
  // borrar el admin ya limpia sus sesiones.
  await withPlatformAdmin(() => db.platformAdmin.deleteMany({ where: { email: EMAIL } }));
  clearLoginFailures(`platform|${EMAIL}|1.1.1.1`);
  clearLoginFailures(`platform|${GHOST_EMAIL}|1.1.1.1`);
});

describe('attemptPlatformLogin', () => {
  it('éxito con credenciales correctas', async () => {
    const admin = await seedAdmin();
    const r = await attemptPlatformLogin({ email: EMAIL, password: 'caballoAzul42', ...ctx });
    expect(r).toMatchObject({ ok: true });
    const sessions = await withPlatformAdmin(() =>
      db.platformAdminSession.count({ where: { platformAdminId: admin.id } }),
    );
    expect(sessions).toBe(1);
  });

  it('falla con contraseña incorrecta sin crear sesión', async () => {
    const admin = await seedAdmin();
    const r = await attemptPlatformLogin({ email: EMAIL, password: 'mala', ...ctx });
    expect(r).toEqual({ ok: false, reason: 'invalid' });
    const sessions = await withPlatformAdmin(() =>
      db.platformAdminSession.count({ where: { platformAdminId: admin.id } }),
    );
    expect(sessions).toBe(0);
  });

  it('falla con correo inexistente sin lanzar', async () => {
    const r = await attemptPlatformLogin({ email: GHOST_EMAIL, password: 'x', ...ctx });
    expect(r).toEqual({ ok: false, reason: 'invalid' });
  });

  it('el correo inexistente también corre verifyPassword y cuenta para el rate limit igual que una contraseña incorrecta', async () => {
    // Prueba explícita del hallazgo del reviewer: si el camino de "admin no
    // existe" no llamara a verifyPassword (o no llamara a recordLoginFailure),
    // este bucle no bloquearía — confirmando que ambos caminos de fallo pagan
    // el mismo costo y dejan el mismo rastro en el rate limiter.
    for (let i = 0; i < 5; i++) await attemptPlatformLogin({ email: GHOST_EMAIL, password: 'x', ...ctx });
    const r = await attemptPlatformLogin({ email: GHOST_EMAIL, password: 'x', ...ctx });
    expect(r).toMatchObject({ ok: false, reason: 'rate_limited' });
  });

  it('bloquea tras 5 fallos', async () => {
    await seedAdmin();
    for (let i = 0; i < 5; i++) await attemptPlatformLogin({ email: EMAIL, password: 'mala', ...ctx });
    const r = await attemptPlatformLogin({ email: EMAIL, password: 'caballoAzul42', ...ctx });
    expect(r).toMatchObject({ ok: false, reason: 'rate_limited' });
  });

  it('limpia el contador tras un login correcto', async () => {
    await seedAdmin();
    for (let i = 0; i < 3; i++) await attemptPlatformLogin({ email: EMAIL, password: 'mala', ...ctx });
    await attemptPlatformLogin({ email: EMAIL, password: 'caballoAzul42', ...ctx });
    // 3 fallos más no deben bloquear porque el contador se reseteó
    for (let i = 0; i < 3; i++) await attemptPlatformLogin({ email: EMAIL, password: 'mala', ...ctx });
    const r = await attemptPlatformLogin({ email: EMAIL, password: 'caballoAzul42', ...ctx });
    expect(r).toMatchObject({ ok: true });
  });
});
