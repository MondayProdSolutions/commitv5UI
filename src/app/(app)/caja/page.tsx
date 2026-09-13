import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requirePermission } from '@/lib/auth/context';
import { getOpenCashSession, getCashSession } from '@/lib/cash/sessions';
import { AbrirCajaForm } from './AbrirCajaForm';
import { PanelCajaAbierta } from './PanelCajaAbierta';

export const dynamic = 'force-dynamic';

export default async function CajaPage() {
  await requirePermission('caja.gestionar');

  const abierta = await getOpenCashSession();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Caja</h1>
        <p className="text-ink-muted">Apertura, movimientos y cierre de la caja del turno.</p>
      </div>

      {abierta === null ? (
        <div className="space-y-4">
          <AbrirCajaForm />
          <Link
            href="/caja/historial"
            className="inline-block text-sm font-medium text-ink-muted underline-offset-2 hover:underline"
          >
            Ver historial de cortes
          </Link>
        </div>
      ) : (
        <CajaAbiertaSection sessionId={abierta.id} />
      )}
    </div>
  );
}

async function CajaAbiertaSection({ sessionId }: { sessionId: string }) {
  const session = await getCashSession(sessionId);
  if (!session) notFound();
  return <PanelCajaAbierta session={session} />;
}
