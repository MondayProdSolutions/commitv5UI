const PUBLIC_PATHS = ['/login', '/setup'];

// `/plataforma/**` es el plano de Super Admin: usa su propia sesión
// (PlatformAdminSession, ver src/lib/platform-auth), completamente separada de
// la sesión de tenant (Session) que decide todo lo demás en esta función. El
// proxy ni siquiera resuelve un tenantId en el dominio raíz donde vive
// `/plataforma` — no hay sesión de tenant que evaluar aquí. Su propio gate de
// auth (PlataformaLayout, Task 9) es la autoridad; este árbol de decisión no
// aplica en absoluto, así que toda la rama queda exenta por prefijo (no solo
// `/plataforma/login`, con un exact-match en PUBLIC_PATHS, que dejaría fuera a
// `/plataforma`, `/plataforma/tenants/nuevo`, etc.).
const PLATFORM_PREFIX = /^\/plataforma(\/|$)/;

export function decideRedirect(input: {
  pathname: string;
  hasSessionCookie: boolean;
  sessionStatus: 'ok' | 'idle' | 'invalid';
  mustChangePassword: boolean;
}): { type: 'next' } | { type: 'redirect'; to: string } {
  const { pathname, sessionStatus, mustChangePassword } = input;

  if (PLATFORM_PREFIX.test(pathname)) return { type: 'next' };

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
