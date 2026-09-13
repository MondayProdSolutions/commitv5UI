const PUBLIC_PATHS = ['/login', '/setup'];

export function decideRedirect(input: {
  pathname: string;
  hasSessionCookie: boolean;
  sessionStatus: 'ok' | 'idle' | 'invalid';
  mustChangePassword: boolean;
}): { type: 'next' } | { type: 'redirect'; to: string } {
  const { pathname, sessionStatus, mustChangePassword } = input;
  const isPublic = PUBLIC_PATHS.some((p) => pathname === p);

  if (sessionStatus === 'ok') {
    if (isPublic) return { type: 'redirect', to: '/dashboard' };
    if (mustChangePassword && pathname !== '/cambiar-password')
      return { type: 'redirect', to: '/cambiar-password' };
    return { type: 'next' };
  }

  if (isPublic) return { type: 'next' };
  const motivo = sessionStatus === 'idle' ? 'inactividad' : 'sesion_cerrada';
  return { type: 'redirect', to: `/login?motivo=${motivo}` };
}
