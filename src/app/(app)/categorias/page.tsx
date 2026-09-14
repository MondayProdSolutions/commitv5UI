import Link from 'next/link';
import { requirePermission } from '@/lib/auth/context';
import { listCategoryTree, productsInArchivedCategories } from '@/lib/catalog/categories';
import { CategoryTree } from './CategoryTree';
import { CategoryForm } from './CategoryForm';
import { withTenant } from '@/lib/db';
import { requireRequestTenantId } from '@/lib/tenant/with-request-tenant';

export const dynamic = 'force-dynamic';

type SearchParams = { archivadas?: string };

export default async function CategoriasPage(props: { searchParams: Promise<SearchParams> }) {
  const tenantId = await requireRequestTenantId();
  return withTenant(tenantId, () => renderCategoriasPage(props));
}

async function renderCategoriasPage(props: { searchParams: Promise<SearchParams> }) {
  await requirePermission('categorias.gestionar');
  const sp = await props.searchParams;
  const incluirArchivadas = sp.archivadas === '1';

  const [tree, sinCategoria] = await Promise.all([
    listCategoryTree({ incluirArchivadas }),
    productsInArchivedCategories({ page: 1, pageSize: 1 }),
  ]);

  const roots = tree
    .filter((n) => !n.archivada)
    .map((n) => ({ id: n.id, nombre: n.nombre }));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Categorías</h1>
          <p className="text-ink-muted">
            Organiza el catálogo en dos niveles: categoría raíz y subcategoría.
          </p>
        </div>
        <CategoryForm mode="crear-raiz" roots={roots} triggerLabel="Nueva categoría raíz" />
      </div>

      {sinCategoria.total > 0 ? (
        <p className="rounded-control bg-warning-soft px-3 py-2 text-sm text-on-warning-soft">
          {sinCategoria.total} producto{sinCategoria.total === 1 ? '' : 's'} pertenece
          {sinCategoria.total === 1 ? '' : 'n'} a una categoría archivada.{' '}
          <Link href="/categorias/sin-categoria-activa" className="font-medium underline">
            Recategorizar
          </Link>
          .
        </p>
      ) : null}

      <div className="text-sm">
        {incluirArchivadas ? (
          <Link href="/categorias" className="text-primary hover:text-primary-hover">
            Ocultar categorías archivadas
          </Link>
        ) : (
          <Link href="/categorias?archivadas=1" className="text-primary hover:text-primary-hover">
            Mostrar categorías archivadas
          </Link>
        )}
      </div>

      <CategoryTree tree={tree} roots={roots} />

      <p className="text-xs text-ink-subtle">
        Al restaurar una categoría raíz, sus subcategorías siguen archivadas; restáuralas una a una.
      </p>
    </div>
  );
}
