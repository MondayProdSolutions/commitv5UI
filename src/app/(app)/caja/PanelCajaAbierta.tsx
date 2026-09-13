import Link from 'next/link';
import type { CashSessionDetail } from '@/lib/cash/sessions';
import { CashMovementForm } from './CashMovementForm';
import { SesionAbiertaResumen } from './SesionAbiertaResumen';

export function PanelCajaAbierta({ session }: { session: CashSessionDetail }) {
  return (
    <div className="space-y-6">
      <SesionAbiertaResumen session={session} />

      <div className="grid gap-4 sm:grid-cols-2">
        <CashMovementForm tipo="RETIRO" />
        <CashMovementForm tipo="INGRESO" />
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <Link
          href="/caja/cerrar"
          className="inline-flex items-center justify-center gap-1.5 rounded-control bg-primary px-4 py-2 text-sm font-medium text-on-primary shadow-sm transition-colors hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
        >
          Cerrar caja (arqueo)
        </Link>
        <Link
          href={`/ventas/historial?cashSessionId=${session.id}`}
          className="text-sm font-medium text-ink-muted underline-offset-2 hover:underline"
        >
          Ver ventas de esta caja
        </Link>
      </div>
    </div>
  );
}
