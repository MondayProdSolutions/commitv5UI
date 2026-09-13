import Link from 'next/link';
import { requirePermission } from '@/lib/auth/context';
import { listCategoryTree } from '@/lib/catalog/categories';
import { DataTable, type Column } from '@/components/DataTable';
import Pagination from '@/components/Pagination';
import { stockAlertsCount } from '@/lib/inventory/stock';
import { listStock, type StockRow } from '@/lib/inventory/query';
import { flattenCategories } from '../productos/categoryOptions';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 20;

type SearchParams = {
  q?: string;
  categoryId?: string;
  soloAgotados?: string;
  soloStockBajo?: string;
  page?: string;
};

const ESTADO_LABEL: Record<'ok' | 'bajo' | 'agotado', string> = {
  ok: 'OK',
  bajo: 'Stock Bajo',
  agotado: 'Agotado',
};

function EstadoBadge({ estado }: { estado: 'ok' | 'bajo' | 'agotado' }) {
  return (
    <Badge tone={estado === 'ok' ? 'success' : estado === 'bajo' ? 'warning' : 'danger'}>
      {ESTADO_LABEL[estado]}
    </Badge>
  );
}

const inputClass =
  'block rounded-control border border-line-strong px-3 py-2 text-sm shadow-sm outline-none focus:border-primary focus:ring-1 focus:ring-ring/40';

export default async function InventarioPage(props: { searchParams: Promise<SearchParams> }) {
  await requirePermission('inventario.ver');
  const sp = await props.searchParams;

  const q = sp.q?.trim() || undefined;
  const categoryId = sp.categoryId?.trim() || undefined;
  const soloAgotados = sp.soloAgotados === '1';
  const soloStockBajo = sp.soloStockBajo === '1';
  const page = Math.max(1, Number(sp.page) || 1);

  const [{ rows, total }, tree, alertsCount] = await Promise.all([
    listStock({ q, categoryId, soloAgotados, soloStockBajo, page, pageSize: PAGE_SIZE }),
    listCategoryTree({ incluirArchivadas: false }),
    stockAlertsCount(),
  ]);
  const categories = flattenCategories(tree);

  // Count of agotados and bajos
  const allVariants = await listStock({ q, categoryId, page: 1, pageSize: 10000 });
  const agotadosCount = allVariants.rows.filter((r) => r.estado === 'agotado').length;
  const totalActive = allVariants.total;

  const columns: Column<StockRow>[] = [
    {
      key: 'productoNombre',
      header: 'Producto',
      render: (r) =>
        r.varianteNombre ? `${r.productoNombre} · ${r.varianteNombre}` : r.productoNombre,
    },
    { key: 'sku', header: 'SKU', render: (r) => r.sku ?? '—' },
    { key: 'stock', header: 'Stock' },
    { key: 'stockMinimo', header: 'Mínimo' },
    { key: 'estado', header: 'Estado', render: (r) => <EstadoBadge estado={r.estado} /> },
  ];

  const baseParams = new URLSearchParams();
  if (q) baseParams.set('q', q);
  if (categoryId) baseParams.set('categoryId', categoryId);
  if (soloAgotados) baseParams.set('soloAgotados', '1');
  if (soloStockBajo) baseParams.set('soloStockBajo', '1');

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Inventario</h1>
          <p className="text-ink-muted">Stock, disponibilidad y alertas de nivel bajo.</p>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <div className="text-sm font-medium text-ink-muted">Variantes activas</div>
          <div className="mt-2 text-3xl font-bold text-ink">{totalActive}</div>
        </Card>
        <Card>
          <div className="text-sm font-medium text-ink-muted">Agotadas</div>
          <div className="mt-2 text-3xl font-bold text-danger">{agotadosCount}</div>
        </Card>
        <Link
          href="/inventario/stock-bajo"
          className="rounded-card border border-line bg-surface p-4 hover:bg-surface-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <div className="text-sm font-medium text-ink-muted">Stock bajo</div>
          <div className="mt-2 text-3xl font-bold text-warning">{alertsCount}</div>
        </Link>
      </div>

      {/* Filter Form */}
      <form
        method="get"
        className="flex flex-wrap items-end gap-3 rounded-card border border-line bg-surface p-4"
      >
        <label className="block space-y-1">
          <span className="text-sm font-medium text-ink-muted">Buscar</span>
          <input
            name="q"
            defaultValue={q ?? ''}
            placeholder="Nombre o SKU"
            className={inputClass + ' w-64'}
          />
        </label>
        <label className="block space-y-1">
          <span className="text-sm font-medium text-ink-muted">Categoría</span>
          <select name="categoryId" defaultValue={categoryId ?? ''} className={inputClass}>
            <option value="">Todas</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 py-2 text-sm font-medium text-ink-muted">
          <input
            type="checkbox"
            name="soloAgotados"
            value="1"
            defaultChecked={soloAgotados}
            className="h-4 w-4 rounded border-line-strong"
          />
          Solo agotados
        </label>
        <label className="flex items-center gap-2 py-2 text-sm font-medium text-ink-muted">
          <input
            type="checkbox"
            name="soloStockBajo"
            value="1"
            defaultChecked={soloStockBajo}
            className="h-4 w-4 rounded border-line-strong"
          />
          Solo stock bajo
        </label>
        <Button type="submit" variant="primary">
          Filtrar
        </Button>
        <Link href="/inventario" className="px-2 py-2 text-sm text-ink-subtle hover:text-ink">
          Limpiar
        </Link>
      </form>

      {/* Data Table */}
      <DataTable
        columns={columns}
        rows={rows}
        getKey={(r) => r.variantId}
        emptyMessage="No hay variantes que coincidan con el filtro."
      />

      {/* Pagination */}
      <Pagination
        page={page}
        pageSize={PAGE_SIZE}
        total={total}
        baseHref="/inventario"
        baseSearchParams={baseParams}
      />
    </div>
  );
}
