import Link from 'next/link';
import { requirePermission } from '@/lib/auth/context';
import { can } from '@/lib/auth/rbac';
import { listCategoryTree } from '@/lib/catalog/categories';
import { db, withTenant } from '@/lib/db';
import { getOpenCashSession } from '@/lib/cash/sessions';
import { CashierScreen } from './CashierScreen';
import { requireRequestTenantId } from '@/lib/tenant/with-request-tenant';

export const dynamic = 'force-dynamic';

export default async function VentasPage() {
  const tenantId = await requireRequestTenantId();
  return withTenant(tenantId, renderVentasPage);
}

async function renderVentasPage() {
  const actor = await requirePermission('ventas.crear');

  const [tree, generico, cajaAbierta] = await Promise.all([
    listCategoryTree({ incluirArchivadas: false }),
    db.customer.findFirst({ where: { esGenerico: true }, select: { id: true, nombre: true } }),
    getOpenCashSession(),
  ]);

  const genericCustomer = generico ?? { id: '', nombre: 'Público en general' };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Punto de venta</h1>
        <p className="text-ink-muted">
          Busca productos, arma el carrito, aplica descuentos y cobra.
        </p>
      </div>

      {cajaAbierta ? (
        <CashierScreen
          tree={tree}
          genericCustomer={genericCustomer}
          canDescuento={can(actor, 'ventas.descuento')}
          canCrearCliente={can(actor, 'clientes.crear')}
        />
      ) : (
        <div className="rounded-card border border-warning/30 bg-warning-soft p-5 text-sm text-on-warning-soft">
          <p className="font-medium">No hay una caja abierta.</p>
          <p className="mt-1">
            Debes abrir la caja antes de vender.{' '}
            <Link href="/caja" className="font-medium underline underline-offset-2">
              Abrir caja
            </Link>
          </p>
        </div>
      )}
    </div>
  );
}
