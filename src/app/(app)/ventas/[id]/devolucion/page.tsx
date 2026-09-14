import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requirePermission } from '@/lib/auth/context';
import { getSale } from '@/lib/sales/sales';
import { ReturnForm } from '../../ReturnForm';
import { withTenant } from '@/lib/db';
import { requireRequestTenantId } from '@/lib/tenant/with-request-tenant';

export const dynamic = 'force-dynamic';

type RegistrarDevolucionPageProps = { params: Promise<{ id: string }> };

export default async function RegistrarDevolucionPage(props: RegistrarDevolucionPageProps) {
  const tenantId = await requireRequestTenantId();
  return withTenant(tenantId, () => renderRegistrarDevolucionPage(props));
}

async function renderRegistrarDevolucionPage(props: RegistrarDevolucionPageProps) {
  await requirePermission('ventas.devolver');
  const { id } = await props.params;

  const sale = await getSale(id);
  if (!sale || sale.estado !== 'COMPLETADA') notFound();

  const lineas = sale.lines.map((l) => ({
    id: l.id,
    productoNombre: l.productoNombre,
    varianteNombre: l.varianteNombre,
    cantidad: l.cantidad,
    yaDevuelto: sale.devuelto[l.id] ?? 0,
    baseNeta: l.baseNeta,
    impuesto: l.impuesto,
    total: l.total,
  }));

  const quedaAlgo = lineas.some((l) => l.cantidad - l.yaDevuelto > 0);

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/ventas/${sale.id}`} className="text-sm text-ink-subtle hover:text-ink">
          ← Venta {sale.folio}
        </Link>
        <h1 className="text-2xl font-bold">Registrar devolución</h1>
        <p className="text-ink-muted">Venta {sale.folio}</p>
      </div>

      {quedaAlgo ? (
        <ReturnForm saleId={sale.id} folio={sale.folio} lineas={lineas} />
      ) : (
        <p className="rounded-control border border-line bg-surface px-4 py-3 text-sm text-ink-muted">
          No queda nada por devolver en esta venta.
        </p>
      )}
    </div>
  );
}
