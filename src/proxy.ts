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

// Rutas que no necesitan una consulta a DB para resolver el tenant (assets,
// health) — a diferencia de antes, /api/session/** YA NO está aquí: heartbeat
// (la única ruta bajo /api/session/**) sí necesita el x-tenant-id que este
// proxy resuelve por subdominio (ver SKIP_AUTH más abajo y la nota junto al
// `matcher`, al final del archivo).
const SKIP_TENANT_RESOLUTION = [/^\/_next\//, /^\/favicon\.ico$/, /^\/api\/health$/];

// Rutas que manejan su propia autenticación/autorización y no pasan por
// decideRedirect (ni por la validación de sesión de tenant que lo alimenta).
// /api/session/** sigue aquí a propósito: heartbeat valida su propia cookie de
// sesión "a mano" (ver src/app/api/session/heartbeat/route.ts) y no debe
// redirigirse como una página.
const SKIP_AUTH = [/^\/_next\//, /^\/favicon\.ico$/, /^\/api\/session\//, /^\/api\/health$/];

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // El cliente nunca debe poder fijar estos headers: el proxy es la única
  // autoridad que los establece más abajo, a partir del Host resuelto contra
  // DB — nunca a partir de lo que el request ya traía. Sin este strip, un
  // x-tenant-id enviado por el cliente pasaría intacto en cualquier ruta
  // ignorada o sin subdominio resuelto (dominio raíz, slug reservado, tenant
  // desconocido) hasta quien sea que lea ese header más adelante
  // (requireRequestTenantId). Hoy RLS sigue filtrando correctamente pase lo
  // que pase con el header, así que no se encontró una explotación real — pero
  // es un límite de confianza no forzado, y basta con que algo futuro llegue a
  // confiar en el header de forma más directa para que se vuelva explotable.
  const requestHeaders = new Headers(req.headers);
  requestHeaders.delete('x-tenant-id');
  requestHeaders.delete('x-tenant-slug');

  // Expose the current path to Server Actions / RSC via request headers
  // (requirePermission reads `x-pathname` for audit logging) and echo it back.
  requestHeaders.set('x-pathname', pathname);
  const pass = () => {
    const res = NextResponse.next({ request: { headers: requestHeaders } });
    res.headers.set('x-pathname', pathname);
    return res;
  };

  // Resolución de tenant por subdominio (Host header). No aplica a rutas
  // ignoradas (assets, health) — esas no necesitan una consulta a DB.
  //
  // Se prioriza x-forwarded-host sobre host: cuando una Server Action muta
  // cookies Y llama a redirect() en la misma invocación (p. ej. login,
  // logout), Next.js arma la respuesta de "single roundtrip" con un
  // re-render interno adicional de la ruta actual (la que dispara la
  // acción) para reflejar la cookie recién mutada. Ese re-render viaja como
  // una sub-request de loopback cuyo header `host` es el bind interno del
  // servidor (p. ej. "localhost:3000"), no el subdominio real del tenant —
  // pero Next SÍ preserva fielmente el host original en x-forwarded-host.
  // Sin esto, ese re-render interno no resuelve tenant, lanza NO_TENANT sin
  // capturar, y el cliente lo recibe como un error sin capturar justo al
  // iniciar/cerrar sesión (visible como el error de hidratación reportado;
  // un refresh normal no pasa por esta sub-request y por eso "arregla" todo).
  //
  // No es una superficie nueva de spoofing: `host` ya se usaba sin validar
  // más allá de "el slug existe como tenant" — la confianza en cualquiera de
  // los dos headers depende igual de que el borde/proxy real de despliegue
  // fuerce el Host correcto antes de llegar aquí.
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? '';
  const slug = resolveTenantSlug(host);

  // Se conserva fuera del `if`: la sesión de usuario de tenant, más abajo,
  // sólo puede validarse dentro del contexto de ESTE tenant.
  let tenantId: string | null = null;

  if (slug && !SKIP_TENANT_RESOLUTION.some((re) => re.test(pathname))) {
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

  if (SKIP_AUTH.some((re) => re.test(pathname))) return pass();

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

// Fix 2 (revisión final de rama): /api/session ya NO está excluido del
// matcher. Antes, el proxy no corría en absoluto para /api/session/**
// (heartbeat), así que nunca resolvía ni fijaba x-tenant-id para esa ruta —
// heartbeat llamaba a requireRequestTenantId() confiando por completo en
// cualquier x-tenant-id que el cliente hubiera enviado (ver el test de
// heartbeat, que hoy mockea next/headers directamente para simular esto). Con
// el strip de headers de arriba y el proxy corriendo para esta ruta, el
// x-tenant-id que heartbeat lee ahora siempre viene del subdominio real,
// igual que cualquier otra ruta de la app (p. ej. /api/asistencia/foto/**).
// SKIP_AUTH (arriba) sigue evitando que decideRedirect actúe sobre esta ruta.
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
