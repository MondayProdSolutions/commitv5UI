import { requirePermission } from '@/lib/auth/context';
import { getTodayRecord } from '@/lib/attendance/records';
import { CameraCapture } from './CameraCapture';
import { withTenant } from '@/lib/db';
import { requireRequestTenantId } from '@/lib/tenant/with-request-tenant';

export const dynamic = 'force-dynamic';

export default async function RegistrarAsistenciaPage() {
  const tenantId = await requireRequestTenantId();
  return withTenant(tenantId, renderRegistrarAsistenciaPage);
}

async function renderRegistrarAsistenciaPage() {
  const actor = await requirePermission('asistencia.registrar');
  const registro = await getTodayRecord(actor.id);

  const accion: 'checkin' | 'checkout' | 'completo' = !registro
    ? 'checkin'
    : !registro.checkOutAt
      ? 'checkout'
      : 'completo';

  return (
    <div className="mx-auto max-w-md space-y-4">
      <h1 className="text-2xl font-bold">Mi asistencia</h1>
      <CameraCapture accion={accion} />
    </div>
  );
}
