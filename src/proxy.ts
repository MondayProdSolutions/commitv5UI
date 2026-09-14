import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE, validateSession } from '@/lib/auth/session';
import { getIdleTimeoutMinutes } from '@/lib/settings';
import { loadAuthUser } from '@/lib/auth/context';
import { decideRedirect } from '@/lib/auth/middleware-decide';
import { resolveTenantSlug } from '@/lib/tenant/resolve';
import { withPlatformAdmin, withTenant, db } from '@/lib/db';

// Next 16 renamed the `middleware` convention to `proxy` and runs it on the
// Node.js runtime unconditionally (the `runtime` segment config is rejected
// here). That lets us call validateSession / loadAuthUser — and therefore the
// Prisma pg adapter — directly, with no self-fetch to a Route Handler.

const IGNORE = [/^\/_next\//, /^\/favicon\.ico$/, /^\/api\/session\//, /^\/api\/health$/];

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Expose the current path to Server Actions / RSC via request headers
  // (requirePermission reads `x-pathname` for audit logging) and echo it back.
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set('x-pathname', pathname);
  const pass = () => {
    const res = NextResponse.next({ request: { headers: requestHeaders } });
    res.headers.set('x-pathname', pathname);
    return res;
  };

  // Resolución de tenant por subdominio (Host header). No aplica a rutas
  // ignoradas (assets, health, sesión) — esas no necesitan una consulta a DB.
  const host = req.headers.get('host') ?? '';
  const slug = resolveTenantSlug(host);

  // Se conserva fuera del `if`: la sesión de usuario de tenant, más abajo,
  // sólo puede validarse dentro del contexto de ESTE tenant.
  let tenantId: string | null = null;

  if (slug && !IGNORE.some((re) => re.test(pathname))) {
    const tenant = await withPlatformAdmin(() => db.tenant.findUnique({ where: { slug } }));
    if (!tenant) {
      return NextResponse.rewrite(new URL('/tenant-no-encontrado', req.url));
    }
    if (tenant.estado === 'SUSPENDIDO') {
      return NextResponse.rewrite(new URL('/tenant-suspendido', req.url));
    }
    requestHeaders.set('x-tenant-id', tenant.id);
    requestHeaders.set('x-tenant-slug', tenant.slug);
    tenantId = tenant.id;
  }

  if (IGNORE.some((re) => re.test(pathname))) return pass();

  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const hasSessionCookie = Boolean(token);

  let sessionStatus: 'ok' | 'idle' | 'invalid' = 'invalid';
  let mustChangePassword = false;

  // `validateSession`/`loadAuthUser` leen User/Session de ESTE tenant (bajo
  // RLS) — sin un tenant resuelto (dominio raíz, p. ej. /plataforma/**) no
  // hay contexto en el que validarlas, así que se omiten (sessionStatus se
  // queda 'invalid', igual que si no hubiera cookie).
  if (token && tenantId) {
    await withTenant(tenantId, async () => {
      const res = await validateSession(token, await getIdleTimeoutMinutes());
      if (res.status === 'ok' && res.session) {
        const user = await loadAuthUser(res.session.userId);
        if (user) {
          sessionStatus = 'ok';
          mustChangePassword = user.mustChangePassword;
        } else {
          sessionStatus = 'invalid';
        }
      } else {
        sessionStatus = res.status;
      }
    });
  }

  const decision = decideRedirect({ pathname, hasSessionCookie, sessionStatus, mustChangePassword });

  if (decision.type === 'redirect') {
    const res = NextResponse.redirect(new URL(decision.to, req.url));
    res.headers.set('x-pathname', pathname);
    return res;
  }

  return pass();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/session).*)'],
};
