'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { visibleNav } from '@/lib/nav';
import type { AuthUser } from '@/lib/auth/rbac';
import { NavIcon } from './NavIcon';

function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Nav inferior para tablet/mobile — los primeros items visibles del usuario (ya filtrados por permiso). */
export function BottomNav({ user }: { user: AuthUser }) {
  const pathname = usePathname();
  const items = visibleNav(user).slice(0, 5);

  return (
    <nav
      aria-label="Navegación principal"
      className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface px-2 py-1.5 lg:hidden"
    >
      <ul className="flex items-center justify-between">
        {items.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={
                  'flex flex-col items-center gap-0.5 rounded-control px-1 py-1.5 text-[11px] font-medium transition-colors duration-150 ' +
                  (active ? 'text-primary' : 'text-ink-muted')
                }
              >
                <NavIcon href={item.href} width={20} height={20} />
                <span className="truncate">{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
