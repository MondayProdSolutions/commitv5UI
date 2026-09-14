import { notFound } from 'next/navigation';
import Link from 'next/link';
import { requirePermission } from '@/lib/auth/context';
import { getSetting } from '@/lib/settings';
import { getCashSession } from '@/lib/cash/sessions';
import { CorteView } from '@/app/(app)/caja/CorteView';
import { PrintOnMount } from '@/app/(app)/ventas/PrintOnMount';
import { withTenant } from '@/lib/db';
import { requireRequestTenantId } from '@/lib/tenant/with-request-tenant';

export const dynamic = 'force-dynamic';

export default async function CajaCortePage(props: { params: Promise<{ id: string }> }) {
  const tenantId = await requireRequestTenantId();
  return withTenant(tenantId, () => renderCajaCortePage(props));
}

async function renderCajaCortePage(props: { params: Promise<{ id: string }> }) {
  await requirePermission('caja.gestionar');
  const { id } = await props.params;

  const session = await getCashSession(id);
  if (!session || session.estado !== 'CERRADA') notFound();

  const negocio = await getSetting<string>('negocio.nombre', 'Punto de venta');

  return (
    <main className="mx-auto w-full max-w-[320px] bg-surface p-4 print:p-0">
      <CorteView session={session} negocio={negocio} />
      <PrintOnMount />
      <Link
        href={`/caja/sesiones/${id}`}
        className="no-print mt-2 block text-center text-xs text-ink-subtle hover:text-ink"
      >
        ← Volver al detalle
      </Link>
    </main>
  );
}
