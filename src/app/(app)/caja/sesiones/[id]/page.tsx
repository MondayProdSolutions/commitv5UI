import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requirePermission } from '@/lib/auth/context';
import { getCashSession } from '@/lib/cash/sessions';
import { getSetting } from '@/lib/settings';
import { fmtFechaMX } from '@/app/(app)/ventas/types';
import { CorteView } from '../../CorteView';
import { SesionAbiertaResumen } from '../../SesionAbiertaResumen';

export const dynamic = 'force-dynamic';

export default async function CajaSessionDetailPage(props: { params: Promise<{ id: string }> }) {
  await requirePermission('caja.gestionar');
  const { id } = await props.params;

  const session = await getCashSession(id);
  if (!session) notFound();

  if (session.estado === 'ABIERTA') {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Caja {session.folio}</h1>
          <p className="text-ink-muted">
            Abierta por {session.abiertaPorNombre} · {fmtFechaMX(session.abiertaEn)}
          </p>
        </div>

        <SesionAbiertaResumen session={session} />

        <p className="rounded-control bg-surface-raised px-4 py-3 text-sm text-ink-muted">
          Caja abierta; el arqueo se verá al cerrar.
        </p>
      </div>
    );
  }

  const negocio = await getSetting<string>('negocio.nombre', 'Punto de venta');

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Caja {session.folio}</h1>
          <p className="text-ink-muted">Corte de caja cerrada.</p>
        </div>
        <Link
          href={`/caja-corte/${session.id}`}
          className="inline-flex items-center justify-center gap-1.5 rounded-control bg-primary px-4 py-2 text-sm font-medium text-on-primary shadow-sm transition-colors hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
        >
          Imprimir corte
        </Link>
      </div>

      <div className="max-w-[420px] rounded-card border border-line bg-surface p-5">
        <CorteView session={session} negocio={negocio} />
      </div>
    </div>
  );
}
