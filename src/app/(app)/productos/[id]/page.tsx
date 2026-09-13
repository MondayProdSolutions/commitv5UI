import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requirePermission, getCurrentUser } from '@/lib/auth/context';
import { can } from '@/lib/auth/rbac';
import { getProduct } from '@/lib/catalog/products';
import { getTaxRates } from '@/lib/taxes';
import { listCategoryTree } from '@/lib/catalog/categories';
import { PermissionGate } from '@/components/PermissionGate';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { flattenCategories } from '../categoryOptions';
import { ProductForm } from '../ProductForm';
import { VariantEditor } from '../VariantEditor';
import { ArchiveRestoreForm, DisponibilidadForm } from '../ProductAdminActions';

export const dynamic = 'force-dynamic';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-subtle">{title}</h2>
      {children}
    </Card>
  );
}

export default async function ProductoDetallePage(props: { params: Promise<{ id: string }> }) {
  await requirePermission('productos.ver');
  const { id } = await props.params;

  const producto = await getProduct(id);
  if (!producto) notFound();

  const [taxRates, tree, actor] = await Promise.all([
    getTaxRates(),
    listCategoryTree({ incluirArchivadas: false }),
    getCurrentUser(),
  ]);
  const categories = flattenCategories(tree);
  const canEditar = can(actor, 'productos.editar');
  const canArchivar = can(actor, 'productos.archivar');

  const activas = producto.variants.filter((v) => !v.archivada);
  const disponibleGlobal = activas.length > 0 && activas.every((v) => v.disponible);
  const tipoLabel = producto.tipo === 'CON_VARIANTES' ? 'Con variantes' : 'Simple';

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/productos" className="text-sm text-ink-subtle hover:text-ink">
            ← Productos
          </Link>
          <h1 className="text-2xl font-bold">{producto.nombre}</h1>
          <p className="text-ink-muted">
            {tipoLabel}
            {producto.categoriaNombre ? ` · ${producto.categoriaNombre}` : ''}
            {producto.archivado ? ' · Archivado' : ''}
          </p>
        </div>
        {producto.archivado ? <Badge tone="neutral">Archivado</Badge> : null}
      </div>

      <Section title="Imagen">
        <div className="flex h-32 w-32 items-center justify-center rounded-control border border-dashed border-line-strong bg-surface-raised text-xs text-ink-subtle">
          Sin imagen
        </div>
      </Section>

      {canEditar ? (
        <Section title="Datos del producto">
          <ProductForm
            mode="editar"
            taxRates={taxRates}
            categories={categories}
            initial={{
              id: producto.id,
              nombre: producto.nombre,
              descripcion: producto.descripcion,
              categoryId: producto.categoryId,
              taxRateId: producto.taxRateId,
            }}
          />
        </Section>
      ) : (
        <Section title="Datos del producto">
          <dl className="grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2">
            <div>
              <dt className="text-xs text-ink-subtle">Descripción</dt>
              <dd className="text-sm text-ink">{producto.descripcion ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-xs text-ink-subtle">Categoría</dt>
              <dd className="text-sm text-ink">{producto.categoriaNombre ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-xs text-ink-subtle">Impuesto</dt>
              <dd className="text-sm text-ink">
                {taxRates.find((t) => t.id === producto.taxRateId)?.nombre ?? '—'}
              </dd>
            </div>
          </dl>
        </Section>
      )}

      <Section title="Variantes e inventario">
        <VariantEditor producto={producto} canEditar={canEditar} canArchivar={canArchivar} />
      </Section>

      {canEditar ? (
        <Section title="Disponibilidad del producto">
          <p className="mb-3 text-sm text-ink-muted">
            Estado actual:{' '}
            <span className="font-medium">
              {disponibleGlobal ? 'Disponible' : 'No disponible (total o parcialmente)'}
            </span>
          </p>
          <DisponibilidadForm productId={producto.id} disponible={disponibleGlobal} />
        </Section>
      ) : null}

      <PermissionGate permiso="productos.archivar" user={actor}>
        <Section title={producto.archivado ? 'Restaurar producto' : 'Archivar producto'}>
          <ArchiveRestoreForm productId={producto.id} archivado={producto.archivado} />
        </Section>
      </PermissionGate>
    </div>
  );
}
