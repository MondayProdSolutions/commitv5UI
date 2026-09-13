import Link from 'next/link';
import { requirePermission } from '@/lib/auth/context';
import { productsInArchivedCategories, listCategoryTree } from '@/lib/catalog/categories';
import { DataTable, type Column } from '@/components/DataTable';
import Pagination from '@/components/Pagination';
import { RecategorizeForm } from './RecategorizeForm';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 20;

type Row = { id: string; nombre: string; categoriaNombre: string };

export default async function SinCategoriaActivaPage(props: {
  searchParams: Promise<{ page?: string }>;
}) {
  await requirePermission('categorias.gestionar');
  const sp = await props.searchParams;
  const page = Math.max(1, Number(sp.page) || 1);

  const [{ rows, total }, tree] = await Promise.all([
    productsInArchivedCategories({ page, pageSize: PAGE_SIZE }),
    listCategoryTree({ incluirArchivadas: false }),
  ]);

  const categories = tree.flatMap((r) => [
    { id: r.id, nombre: r.nombre },
    ...r.hijos.map((h) => ({ id: h.id, nombre: `${r.nombre} › ${h.nombre}` })),
  ]);

  const columns: Column<Row>[] = [
    { key: 'nombre', header: 'Producto' },
    {
      key: 'categoriaNombre',
      header: 'Categoría archivada actual',
      render: (r) => r.categoriaNombre || <span className="text-ink-subtle">—</span>,
    },
    {
      key: 'accion',
      header: 'Cambiar categoría',
      render: (r) => <RecategorizeForm productId={r.id} categories={categories} />,
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <Link href="/categorias" className="text-sm text-ink-subtle hover:text-ink">
          ← Categorías
        </Link>
        <h1 className="text-2xl font-bold">Productos sin categoría activa</h1>
        <p className="text-ink-muted">
          Estos productos pertenecen a una categoría archivada y conservan su categoría. Asígnales una
          categoría activa.
        </p>
      </div>

      <DataTable
        columns={columns}
        rows={rows}
        getKey={(r) => r.id}
        emptyMessage="No hay productos bajo categorías archivadas."
      />

      <Pagination page={page} pageSize={PAGE_SIZE} total={total} baseHref="/categorias/sin-categoria-activa" />
    </div>
  );
}
