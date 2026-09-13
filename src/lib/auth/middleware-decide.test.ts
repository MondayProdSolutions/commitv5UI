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
});
