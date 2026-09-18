import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/context';
import { getIdleTimeoutMinutes } from '@/lib/settings';
import { visibleNav } from '@/lib/nav';
import { can } from '@/lib/auth/rbac';
import { stockAlertsCount } from '@/lib/inventory/stock';
import { Sidebar } from '@/components/Sidebar';
import { Header } from '@/components/Header';
import { BottomNav } from '@/components/BottomNav';
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

  // Calculado aquí (dentro del `withTenant` de este layout) y pasado como
  // prop: `Sidebar` ya no es un Server Component async propio — ver la nota
  // en src/components/Sidebar.tsx.
  const items = visibleNav(user);
  const stockAlerts = items.some((i) => i.badge === 'stock' && can(user, 'inventario.ver'))
    ? await stockAlertsCount()
    : 0;

  return (
    <div className="min-h-screen pb-20 lg:pb-0">
      <Header user={user} />
      <div className="mx-auto flex max-w-[1360px] gap-4 px-4 pt-8 md:px-8">
        <Sidebar user={user} stockAlerts={stockAlerts} />
        <main className="min-w-0 flex-1 pb-6">{children}</main>
      </div>
      <BottomNav user={user} />
      <InactivityWatcher idleTimeoutMinutes={idle} />
      <AssistantWidget supportEmail={process.env.SUPPORT_EMAIL} supportPhone={process.env.SUPPORT_PHONE} />
    </div>
  );
}
