import Link from 'next/link';
import { logoutAction } from '@/app/(auth)/cambiar-password/actions';
import type { AuthUser } from '@/lib/auth/rbac';
import { ThemeToggle } from './ThemeToggle';

export function Topbar({ user }: { user: AuthUser }) {
  return (
    <header className="flex items-center justify-between border-b border-line bg-surface px-6 py-3">
      <div className="text-sm text-ink-muted">{user.roleName}</div>
      <div className="flex items-center gap-2">
        <ThemeToggle />
        <details className="group relative">
          <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-control px-3 py-1.5 text-sm font-semibold text-ink-muted hover:bg-surface-raised hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
            <span>{user.nombre}</span>
            <span aria-hidden="true" className="text-ink-subtle">▾</span>
          </summary>
          <div className="absolute right-0 z-10 mt-1 w-48 rounded-control border border-line bg-surface py-1 shadow-pop">
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
