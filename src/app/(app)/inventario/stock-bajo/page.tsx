import Link from 'next/link';
import { requirePermission } from '@/lib/auth/context';
import { DataTable, type Column } from '@/components/DataTable';
import Pagination from '@/components/Pagination';
import { lowStockVariants, type LowStockRow } from '@/lib/inventory/stock';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 50;

type SearchParams = {
  page?: string;
};

const columns: Column<LowStockRow>[] = [
  {
    key: 'productoNombre',
    header: 'Producto',
    render: (r) =>
      r.varianteNombre ? `${r.productoNombre} · ${r.varianteNombre}` : r.productoNombre,
  },
  { key: 'stock', header: 'Stock actual' },
  { key: 'stockMinimo', header: 'Stock mínimo' },
  { key: 'deficit', header: 'Déficit' },
  {
    key: 'acciones',
    header: 'Acción',
    render: (r) => (
      <Link
        href={`/inventario/movimientos/nuevo?variantId=${encodeURIComponent(r.variantId)}`}
        className="text-primary hover:text-primary-hover hover:underline"
      >
        Registrar movimiento
      </Link>
    ),
  },
];

export default async function StockBajoPage(props: { searchParams: Promise<SearchParams> }) {
  await requirePermission('inventario.ver');
  const sp = await props.searchParams;

  const page = Math.max(1, Number(sp.page) || 1);

  const { rows, total } = await lowStockVariants({ page, pageSize: PAGE_SIZE });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Stock bajo</h1>
        <p className="text-ink-muted">Variantes que están por debajo de su nivel mínimo.</p>
      </div>

      {/* Data Table */}
      <DataTable
        columns={columns}
        rows={rows}
        getKey={(r) => r.variantId}
        emptyMessage="No hay variantes en stock bajo."
      />

      {/* Pagination */}
      <Pagination page={page} pageSize={PAGE_SIZE} total={total} baseHref="/inventario/stock-bajo" />
    </div>
  );
}
