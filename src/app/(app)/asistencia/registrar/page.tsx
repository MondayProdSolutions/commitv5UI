import { requirePermission } from '@/lib/auth/context';
import { getTodayRecord } from '@/lib/attendance/records';
import { CameraCapture } from './CameraCapture';

export const dynamic = 'force-dynamic';

export default async function RegistrarAsistenciaPage() {
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
      {accion === 'completo' ? (
        <p className="rounded-control bg-surface-raised px-3 py-2 text-sm text-ink-muted">
          Ya registraste tu entrada y salida de hoy.
        </p>
      ) : (
        <CameraCapture accion={accion} />
      )}
    </div>
  );
}
