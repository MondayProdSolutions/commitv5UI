import Link from 'next/link';
import { headers } from 'next/headers';
import { visibleNav } from '@/lib/nav';
import { can } from '@/lib/auth/rbac';
import { stockAlertsCount } from '@/lib/inventory/stock';
import type { AuthUser } from '@/lib/auth/rbac';
import { Badge } from './ui/Badge';
import { NavIcon } from './NavIcon';

function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export async function Sidebar({ user }: { user: AuthUser }) {
  const pathname = (await headers()).get('x-pathname') ?? '';
  const items = visibleNav(user);

  // Riel compacto (solo iconos) en la pantalla del cajero, para dar aire a la
  // cuadrícula táctil de productos. Solo la vista exacta `/ventas`; las
  // subrutas (historial, devoluciones, detalle) conservan el sidebar completo.
  const collapsed = pathname === '/ventas';

  // Fetch badge counts for items that need them
  let stockAlerts = 0;
  if (items.some((i) => i.badge === 'stock' && can(user, 'inventario.ver'))) {
    stockAlerts = await stockAlertsCount();
  }

  return (
    <aside className="border-r border-line bg-surface md:min-h-screen">
      <div
        className={
          'py-4 text-lg font-extrabold tracking-tight text-ink ' +
          (collapsed ? 'px-0 text-center' : 'px-4')
        }
      >
        POS
      </div>
      <nav aria-label="Navegación principal" className={collapsed ? 'px-2 pb-4' : 'px-2 pb-4'}>
        <ul className="space-y-1">
          {items.map((item) => {
            const active = isActive(pathname, item.href);
            const showBadge = item.badge === 'stock' && stockAlerts > 0;

            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  title={collapsed ? item.label : undefined}
                  className={
                    'relative flex min-h-11 items-center rounded-control border-l-[3px] text-sm font-semibold transition-colors ' +
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ' +
                    (collapsed ? 'justify-center px-0 py-2.5' : 'justify-between px-3 py-2') +
                    ' ' +
                    (active
                      ? 'border-primary bg-primary-soft text-on-primary-soft'
                      : 'border-transparent text-ink-muted hover:bg-surface-raised hover:text-ink')
                  }
                >
                  {collapsed ? (
                    <>
                      <NavIcon href={item.href} />
                      <span className="sr-only">{item.label}</span>
                      {showBadge && (
                        <span
                          aria-hidden="true"
                          className="absolute right-1.5 top-1.5 h-2 w-2 rounded-pill bg-danger-solid"
                        />
                      )}
                    </>
                  ) : (
                    <>
                      <span className="flex items-center gap-2.5">
                        <NavIcon href={item.href} className="shrink-0 opacity-80" />
                        {item.label}
                      </span>
                      {showBadge && <Badge tone="danger">{stockAlerts}</Badge>}
                    </>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </aside>
  );
}
