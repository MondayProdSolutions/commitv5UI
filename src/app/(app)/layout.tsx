import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { getCurrentUser } from '@/lib/auth/context';
import { getIdleTimeoutMinutes } from '@/lib/settings';
import { visibleNav } from '@/lib/nav';
import { can } from '@/lib/auth/rbac';
import { stockAlertsCount } from '@/lib/inventory/stock';
import { Sidebar } from '@/components/Sidebar';
import { Topbar } from '@/components/Topbar';
import { InactivityWatcher } from '@/components/InactivityWatcher';
import { AssistantWidget } from '@/components/assistant/AssistantWidget';
import { withTenant } from '@/lib/db';
import { requireRequestTenantId } from '@/lib/tenant/with-request-tenant';

export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }: { children: ReactNode }) {
  const tenantId = await requireRequestTenantId();
  return withTenant(tenantId, () => renderAppLayout(children));
}

async function renderAppLayout(children: ReactNode) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const idle = await getIdleTimeoutMinutes();
  const pathname = (await headers()).get('x-pathname') ?? '';
  // En la pantalla del cajero el sidebar se colapsa a un riel de 76px.
  const railMode = pathname === '/ventas';

  // Calculado aquí (dentro del `withTenant` de este layout) y pasado como
  // prop: `Sidebar` ya no es un Server Component async propio — ver la nota
  // en src/components/Sidebar.tsx.
  const items = visibleNav(user);
  const stockAlerts = items.some((i) => i.badge === 'stock' && can(user, 'inventario.ver'))
    ? await stockAlertsCount()
    : 0;

  return (
    <div
      className={
        'grid min-h-screen grid-cols-1 ' +
        (railMode ? 'md:grid-cols-[76px_1fr]' : 'md:grid-cols-[240px_1fr]')
      }
    >
      <Sidebar user={user} pathname={pathname} stockAlerts={stockAlerts} />
      <div className="flex min-w-0 flex-col">
        <Topbar user={user} />
        <main className="flex-1 p-6">{children}</main>
      </div>
      <InactivityWatcher idleTimeoutMinutes={idle} />
      <AssistantWidget supportEmail={process.env.SUPPORT_EMAIL} supportPhone={process.env.SUPPORT_PHONE} />
    </div>
  );
}
