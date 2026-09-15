import Link from 'next/link';
import { visibleNav } from '@/lib/nav';
import type { AuthUser } from '@/lib/auth/rbac';
import { Badge } from './ui/Badge';
import { NavIcon } from './NavIcon';

function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

// Antes un Server Component `async` que llamaba a `stockAlertsCount()` (db)
// directamente. Al renderizarse vía JSX como hijo de (app)/layout.tsx, un
// componente async separado no hereda el AsyncLocalStorage de `withTenant`
// del layout (mismo problema que layout → page) — confirmado con un 500 real
// ("db.productVariant llamado sin contexto de tenant activo") al probar el
// dashboard con un usuario con permiso `inventario.ver`. Ahora es síncrono;
// quien lo use (AppLayout) calcula `stockAlerts` dentro de su propio
// `withTenant` y lo pasa como prop.
export function Sidebar({
  user,
  pathname,
  stockAlerts,
}: {
  user: AuthUser;
  pathname: string;
  stockAlerts: number;
}) {
  const items = visibleNav(user);

  // Riel compacto (solo iconos) en la pantalla del cajero, para dar aire a la
  // cuadrícula táctil de productos. Solo la vista exacta `/ventas`; las
  // subrutas (historial, devoluciones, detalle) conservan el sidebar completo.
  const collapsed = pathname === '/ventas';

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
