import { redirect } from 'next/navigation';
import { requirePermission } from '@/lib/auth/context';
import { getOpenCashSession } from '@/lib/cash/sessions';
import { CerrarCajaForm } from './CerrarCajaForm';
import { withTenant } from '@/lib/db';
import { requireRequestTenantId } from '@/lib/tenant/with-request-tenant';

export const dynamic = 'force-dynamic';

export default async function CerrarCajaPage() {
  const tenantId = await requireRequestTenantId();
  return withTenant(tenantId, renderCerrarCajaPage);
}

async function renderCerrarCajaPage() {
  await requirePermission('caja.gestionar');

  const abierta = await getOpenCashSession();
  if (!abierta) redirect('/caja');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Cerrar caja</h1>
        <p className="text-ink-muted">Arqueo de la caja {abierta.folio}.</p>
      </div>

      <CerrarCajaForm session={abierta} />
    </div>
  );
}
