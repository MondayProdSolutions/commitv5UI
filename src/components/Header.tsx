'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { logoutAction } from '@/app/(auth)/cambiar-password/actions';
import { visibleNav } from '@/lib/nav';
import type { AuthUser } from '@/lib/auth/rbac';
import { Badge } from './ui/Badge';
import { ThemeToggle } from './ThemeToggle';

function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function initials(nombre: string): string {
  const parts = nombre.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase();
}

// CTA contextual: solo para rutas donde "crear algo nuevo" es la acción
// principal y ya existe una pantalla real de creación. El resto no muestra CTA.
const CREATE_CTA: Record<string, { label: string; href: string }> = {
  '/productos': { label: 'Nuevo producto', href: '/productos/nuevo' },
  '/clientes': { label: 'Nuevo cliente', href: '/clientes/nuevo' },
  '/inventario/movimientos': { label: 'Nuevo movimiento', href: '/inventario/movimientos/nuevo' },
};

export function Header({ user }: { user: AuthUser }) {
  const pathname = usePathname();
  const activeItem = visibleNav(user).find((i) => isActive(pathname, i.href));
  const cta = CREATE_CTA[pathname];

  return (
    <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-line bg-canvas/95 px-4 py-3 backdrop-blur-sm">
      <div className="flex items-center gap-2">
        <span
          aria-hidden="true"
          className="flex h-[50px] w-[50px] shrink-0 items-center justify-center overflow-hidden rounded-pill"
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- marca fija de 26KB, no vale el runtime de next/image. */}
          <img src="/commit-mark.png" alt="" className="h-full w-full object-cover" />
        </span>
        <span className="hidden items-center rounded-pill bg-ink px-5 py-2 text-sm font-semibold text-surface sm:inline-flex">
          Mi<span className="font-normal opacity-80">ERP</span>
        </span>
        {activeItem ? (
          <span className="hidden items-center rounded-pill bg-primary px-5 py-2 text-sm font-semibold text-on-primary md:inline-flex">
            {activeItem.label}
          </span>
        ) : null}
      </div>

      <div className="flex items-center gap-2">
        {cta ? (
          <Link
            href={cta.href}
            className="press hidden items-center gap-2 rounded-pill bg-primary px-5 py-2 text-sm font-semibold text-on-primary hover:bg-ink sm:inline-flex"
          >
            {cta.label}
            <span aria-hidden="true">→</span>
          </Link>
        ) : null}
        <ThemeToggle />
        <details className="menu-animated group relative">
          <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-pill px-1 py-1 text-sm font-semibold text-ink-muted transition-colors duration-150 hover:bg-surface-raised hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:px-2.5 [&::-webkit-details-marker]:hidden">
            <span className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-pill bg-ink text-xs font-bold text-surface">
              {initials(user.nombre)}
            </span>
            <span className="hidden sm:inline">{user.nombre}</span>
            <span aria-hidden="true" className="hidden text-ink-subtle sm:inline">▾</span>
          </summary>
          <div className="absolute right-0 z-10 mt-1 w-52 rounded-card border border-line bg-surface py-1 shadow-pop">
            <div className="px-3 py-2">
              <Badge tone="neutral">{user.roleName}</Badge>
            </div>
            <Link
              href="/cambiar-password"
              className="block px-3 py-2 text-sm text-ink-muted hover:bg-surface-raised hover:text-ink"
            >
              Cambiar contraseña
            </Link>
            <form action={logoutAction}>
              <button
                type="submit"
                className="block w-full px-3 py-2 text-left text-sm text-ink-muted hover:bg-surface-raised hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                Cerrar sesión
              </button>
            </form>
          </div>
        </details>
      </div>
    </header>
  );
}
