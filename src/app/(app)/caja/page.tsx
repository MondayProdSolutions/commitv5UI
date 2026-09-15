import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requirePermission } from '@/lib/auth/context';
import { getOpenCashSession, getCashSession } from '@/lib/cash/sessions';
import { AbrirCajaForm } from './AbrirCajaForm';
import { PanelCajaAbierta } from './PanelCajaAbierta';
import { withTenant } from '@/lib/db';
import { requireRequestTenantId } from '@/lib/tenant/with-request-tenant';

export const dynamic = 'force-dynamic';

export default async function CajaPage() {
  const tenantId = await requireRequestTenantId();
  return withTenant(tenantId, renderCajaPage);
}

// La sección de caja abierta se resuelve aquí mismo (en vez de un componente
// async anidado renderizado vía JSX) para que su lectura de `db` quede
// garantizada dentro de este mismo `withTenant` — un componente hijo separado
// podría, igual que layout → page, no heredar el contexto de la función que
// lo referencia.
async function renderCajaPage() {
  await requirePermission('caja.gestionar');

  const abierta = await getOpenCashSession();
  const session = abierta ? await getCashSession(abierta.id) : null;
  if (abierta && !session) notFound();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Caja</h1>
        <p className="text-ink-muted">Apertura, movimientos y cierre de la caja del turno.</p>
      </div>

      {session === null ? (
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
        <PanelCajaAbierta session={session} />
      )}
    </div>
  );
}
