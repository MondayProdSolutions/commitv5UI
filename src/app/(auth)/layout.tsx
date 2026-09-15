import type { ReactNode } from 'react';
import { Card } from '@/components/ui/Card';
import { withTenant } from '@/lib/db';
import { requireRequestTenantId } from '@/lib/tenant/with-request-tenant';

export default async function AuthLayout({ children }: { children: ReactNode }) {
  const tenantId = await requireRequestTenantId();
  return withTenant(tenantId, () => renderAuthLayout(children));
}

async function renderAuthLayout(children: ReactNode) {
  return (
    <main className="mx-auto mt-16 w-full max-w-sm px-4">
      <p className="mb-6 text-center text-2xl font-extrabold tracking-tight text-ink">POS</p>
      <Card>{children}</Card>
    </main>
  );
}
