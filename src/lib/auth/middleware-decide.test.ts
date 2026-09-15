import { describe, it, expect } from 'vitest';
import { decideRedirect } from './middleware-decide';

const base = { pathname: '/dashboard', hasSessionCookie: true, sessionStatus: 'ok' as const, mustChangePassword: false };

describe('decideRedirect', () => {
  it('deja pasar una ruta protegida con sesión ok', () => {
    expect(decideRedirect(base)).toEqual({ type: 'next' });
  });
  it('redirige a /login sin sesión en ruta protegida', () => {
    expect(decideRedirect({ ...base, hasSessionCookie: false, sessionStatus: 'invalid' }))
      .toEqual({ type: 'redirect', to: '/login?motivo=sesion_cerrada' });
  });
  it('usa motivo=inactividad cuando la sesión está idle', () => {
    expect(decideRedirect({ ...base, sessionStatus: 'idle' }))
      .toEqual({ type: 'redirect', to: '/login?motivo=inactividad' });
  });
  it('fuerza /cambiar-password si mustChangePassword', () => {
    expect(decideRedirect({ ...base, mustChangePassword: true }))
      .toEqual({ type: 'redirect', to: '/cambiar-password' });
  });
  it('permite /cambiar-password cuando ya está forzado', () => {
    expect(decideRedirect({ ...base, pathname: '/cambiar-password', mustChangePassword: true }))
      .toEqual({ type: 'next' });
  });
  it('manda al dashboard si visita /login con sesión ok', () => {
    expect(decideRedirect({ ...base, pathname: '/login' }))
      .toEqual({ type: 'redirect', to: '/dashboard' });
  });
  it('deja ver /login sin sesión', () => {
    expect(decideRedirect({ pathname: '/login', hasSessionCookie: false, sessionStatus: 'invalid', mustChangePassword: false }))
      .toEqual({ type: 'next' });
  });

  it('deja pasar /plataforma/login sin sesión de tenant (usa PlatformAdminSession, no esta sesión)', () => {
    expect(decideRedirect({ pathname: '/plataforma/login', hasSessionCookie: false, sessionStatus: 'invalid', mustChangePassword: false }))
      .toEqual({ type: 'next' });
  });

  it('deja pasar /plataforma (raíz del plano de Super Admin) sin sesión de tenant', () => {
    expect(decideRedirect({ pathname: '/plataforma', hasSessionCookie: false, sessionStatus: 'invalid', mustChangePassword: false }))
      .toEqual({ type: 'next' });
  });

  it('deja pasar cualquier ruta anidada bajo /plataforma/** sin sesión de tenant', () => {
    expect(decideRedirect({ pathname: '/plataforma/tenants/nuevo', hasSessionCookie: false, sessionStatus: 'invalid', mustChangePassword: false }))
      .toEqual({ type: 'next' });
  });

  it('deja pasar /plataforma/** incluso con sesión de tenant ok (no la redirige a /dashboard)', () => {
    expect(decideRedirect({ ...base, pathname: '/plataforma/login' }))
      .toEqual({ type: 'next' });
  });

  it('NO confunde /plataformaXYZ (sin separador) con el prefijo /plataforma/**', () => {
    expect(decideRedirect({ pathname: '/plataformaXYZ', hasSessionCookie: false, sessionStatus: 'invalid', mustChangePassword: false }))
      .toEqual({ type: 'redirect', to: '/login?motivo=sesion_cerrada' });
  });
});
