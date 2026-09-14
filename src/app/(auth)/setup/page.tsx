import { notFound } from 'next/navigation';
import { isBootstrapNeeded } from '@/lib/auth/bootstrap';
import { SetupForm } from './SetupForm';
import { withTenant } from '@/lib/db';
import { requireRequestTenantId } from '@/lib/tenant/with-request-tenant';

export const dynamic = 'force-dynamic';

export default async function SetupPage() {
  const tenantId = await requireRequestTenantId();
  return withTenant(tenantId, renderSetupPage);
}

async function renderSetupPage() {
  if (!(await isBootstrapNeeded())) notFound();
  return <SetupForm />;
}
