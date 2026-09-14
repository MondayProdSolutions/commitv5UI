import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/context';
import { ChangePasswordForm } from './ChangePasswordForm';
import { withTenant } from '@/lib/db';
import { requireRequestTenantId } from '@/lib/tenant/with-request-tenant';

export const dynamic = 'force-dynamic';

export default async function CambiarPasswordPage() {
  const tenantId = await requireRequestTenantId();
  return withTenant(tenantId, renderCambiarPasswordPage);
}

async function renderCambiarPasswordPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  return <ChangePasswordForm forced={user.mustChangePassword} />;
}
