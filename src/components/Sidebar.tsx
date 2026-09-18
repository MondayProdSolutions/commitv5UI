'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { CSSProperties } from 'react';
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
//
// `pathname` NO llega como prop del layout: el layout de (app) es un Server
// Component que persiste entre navegaciones del lado del cliente (Next no lo
// vuelve a ejecutar en cada <Link>, solo cambia el `children`), así que un
// `pathname` leído una vez en el layout vía headers() queda congelado en la
// primera carga — el item activo nunca se actualizaba al navegar. `usePathname()`
// es un hook de cliente que sí se re-evalúa en cada cambio de ruta.
export function Sidebar({
  user,
  stockAlerts,
}: {
  user: AuthUser;
  stockAlerts: number;
}) {
  const pathname = usePathname();
  const items = visibleNav(user);

  // Riel compacto (solo iconos) en la pantalla del cajero, para dar aire a la
  // cuadrícula táctil de productos. Solo la vista exacta `/ventas`; las
  // subrutas (historial, devoluciones, detalle) conservan el sidebar completo.
  const collapsed = pathname === '/ventas';

  return (
    <aside
      className={
        'sticky top-4 hidden shrink-0 self-start lg:block ' + (collapsed ? 'w-[76px]' : 'w-[224px]')
      }
    >
      <nav aria-label="Navegación principal" className={collapsed ? 'px-2 pb-4' : 'px-3 pb-4'}>
        <ul className="space-y-1">
          {items.map((item, i) => {
            const active = isActive(pathname, item.href);
            const showBadge = item.badge === 'stock' && stockAlerts > 0;

            return (
              <li
                key={item.href}
                className="reveal"
                style={{ '--reveal-delay': `${i * 30}ms` } as CSSProperties}
              >
                <Link
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  title={collapsed ? item.label : undefined}
                  className={
                    'relative flex min-h-11 items-center rounded-pill text-sm font-semibold transition-colors duration-150 ' +
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ' +
                    (collapsed ? 'justify-center px-0 py-2.5' : 'justify-between px-3.5 py-2') +
                    ' ' +
                    (active
                      ? 'bg-surface text-ink shadow-card'
                      : 'text-ink-muted hover:bg-surface-raised hover:text-ink')
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
