import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE, validateSession } from '@/lib/auth/session';
import { getIdleTimeoutMinutes } from '@/lib/settings';
import { loadAuthUser } from '@/lib/auth/context';
import { decideRedirect } from '@/lib/auth/middleware-decide';

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

  if (IGNORE.some((re) => re.test(pathname))) return pass();

  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const hasSessionCookie = Boolean(token);

  let sessionStatus: 'ok' | 'idle' | 'invalid' = 'invalid';
  let mustChangePassword = false;

  if (token) {
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
