import { cookies } from 'next/headers';
import { db, withPlatformAdmin } from '@/lib/db';
import { ForbiddenError } from '@/lib/errors';
import { PLATFORM_SESSION_COOKIE, validatePlatformSession } from './session';

export type CurrentPlatformAdmin = { id: string; nombre: string; email: string };

export async function getCurrentPlatformAdmin(): Promise<CurrentPlatformAdmin | null> {
  const token = (await cookies()).get(PLATFORM_SESSION_COOKIE)?.value;
  const res = await validatePlatformSession(token);
  if (res.status !== 'ok') return null;
  const admin = await withPlatformAdmin(() =>
    db.platformAdmin.findUnique({ where: { id: res.session.platformAdminId } }),
  );
  if (!admin) return null;
  return { id: admin.id, nombre: admin.nombre, email: admin.email };
}

/**
 * Autorización real para las funciones de negocio de Super Admin
 * (src/lib/platform/tenants.ts, src/lib/platform/plans.ts).
 *
 * `src/app/plataforma/layout.tsx` llama a getCurrentPlatformAdmin() para
 * decidir si renderiza o redirige a /plataforma/login — eso protege la UI,
 * pero NO protege los Server Actions que esas páginas invocan. Next.js expone
 * cada Server Action en su propio endpoint (identificado por un `Next-Action`
 * ID que viaja en el JS público del cliente), alcanzable directamente sin
 * pasar por ningún layout — ver node_modules/next/dist/docs/01-app/02-guides/
 * authentication.md, sección "Server Actions": la verificación de sesión debe
 * repetirse dentro de cada Server Action (o, como aquí, dentro de la función
 * de negocio que ese Server Action invoca), nunca asumirse heredada del
 * árbol de layouts. Por eso esta función se llama al inicio de cada función
 * exportada de tenants.ts/plans.ts, junto al withPlatformAdmin() que cada una
 * ya hace — así ningún caller futuro puede olvidarla.
 */
export async function requirePlatformAdmin(): Promise<CurrentPlatformAdmin> {
  const admin = await getCurrentPlatformAdmin();
  if (!admin) throw new ForbiddenError('NO_PLATFORM_SESSION', 'Sesión de Super Admin requerida');
  return admin;
}
