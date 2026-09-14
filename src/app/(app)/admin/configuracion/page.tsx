import { requirePermission } from '@/lib/auth/context';
import { getIdleTimeoutMinutes } from '@/lib/settings';
import { Card } from '@/components/ui/Card';
import InactivityForm from './InactivityForm';
import { withTenant } from '@/lib/db';
import { requireRequestTenantId } from '@/lib/tenant/with-request-tenant';

export const dynamic = 'force-dynamic';

export default async function ConfigurationPage() {
  const tenantId = await requireRequestTenantId();
  return withTenant(tenantId, renderConfigurationPage);
}

async function renderConfigurationPage() {
  await requirePermission('config.editar');
  const minutes = await getIdleTimeoutMinutes();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Configuración</h1>
        <p className="text-sm text-ink-subtle">Gestiona los parámetros del sistema</p>
      </div>

      <Card>
        <h2 className="text-lg font-semibold mb-4">Timeout de Inactividad</h2>
        <InactivityForm defaultMinutes={minutes} />
      </Card>
    </div>
  );
}
