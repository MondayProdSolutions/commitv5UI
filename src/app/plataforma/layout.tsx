import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { getCurrentPlatformAdmin } from '@/lib/platform-auth/context';

export const dynamic = 'force-dynamic';

/**
 * Gate de sesión para todo `/plataforma/**`. El proxy (ver
 * src/lib/auth/middleware-decide.ts) exime por completo este árbol de rutas
 * de su árbol de decisión — la sesión de tenant no aplica en el dominio raíz
 * y no hay `tenantId` que resolver ahí. Este layout es, por lo tanto, la
 * única autoridad de auth para Super Admin.
 *
 * `/plataforma/login` vive dentro de este mismo árbol y por lo tanto también
 * pasa por este layout. Si se exigiera sesión ahí también, un visitante sin
 * sesión sería redirigido de `/plataforma/login` a `/plataforma/login`: un
 * bucle. Por eso esa ruta se deja pasar sin admin.
 */
export default async function PlataformaLayout({ children }: { children: ReactNode }) {
  const pathname = (await headers()).get('x-pathname') ?? '';
  const admin = await getCurrentPlatformAdmin();

  if (!admin) {
    if (pathname === '/plataforma/login') return <>{children}</>;
    redirect('/plataforma/login');
  }

  return (
    <div className="min-h-screen bg-canvas">
      <header className="border-b border-line bg-surface px-6 py-4">
        <span className="text-sm font-semibold text-ink">Plataforma — {admin.nombre}</span>
        <nav className="mt-2 flex gap-4 text-sm">
          <a href="/plataforma" className="text-ink-muted hover:text-ink">
            Negocios
          </a>
          <a href="/plataforma/planes" className="text-ink-muted hover:text-ink">
            Planes
          </a>
        </nav>
      </header>
      <main className="p-6">{children}</main>
    </div>
  );
}
