import Link from 'next/link';
import { requirePermission } from '@/lib/auth/context';
import { getTaxRates } from '@/lib/taxes';
import { listCategoryTree } from '@/lib/catalog/categories';
import { flattenCategories } from '../categoryOptions';
import { ProductForm } from '../ProductForm';
import { withTenant } from '@/lib/db';
import { requireRequestTenantId } from '@/lib/tenant/with-request-tenant';

export const dynamic = 'force-dynamic';

export default async function NuevoProductoPage() {
  const tenantId = await requireRequestTenantId();
  return withTenant(tenantId, renderNuevoProductoPage);
}

async function renderNuevoProductoPage() {
  await requirePermission('productos.crear');

  const [taxRates, tree] = await Promise.all([getTaxRates(), listCategoryTree({ incluirArchivadas: false })]);
  const categories = flattenCategories(tree);

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <Link href="/productos" className="text-sm text-ink-subtle hover:text-ink">
          ← Productos
        </Link>
        <h1 className="text-2xl font-bold">Nuevo producto</h1>
        <p className="text-ink-muted">
          Da de alta un producto simple o uno con variantes. El stock inicial se registra como una
          entrada de inventario.
        </p>
      </div>

      <ProductForm mode="crear" taxRates={taxRates} categories={categories} />
    </div>
  );
}
