import Link from 'next/link';
import { requirePermission } from '@/lib/auth/context';
import {
  listProducts,
  type ProductListRow,
  type ProductEstado,
} from '@/lib/catalog/products';
import { listCategoryTree } from '@/lib/catalog/categories';
import { DataTable, type Column } from '@/components/DataTable';
import Pagination from '@/components/Pagination';
import { PermissionGate } from '@/components/PermissionGate';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { inputClass } from '@/app/(app)/ventas/types';
import { flattenCategories } from './categoryOptions';
import { ProductRow } from './ProductRow';
import { withTenant } from '@/lib/db';
import { requireRequestTenantId } from '@/lib/tenant/with-request-tenant';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 20;

type SearchParams = {
  q?: string;
  categoryId?: string;
  estado?: string;
  soloStockBajo?: string;
  page?: string;
};

function estadoFrom(v: string | undefined): 'activos' | 'archivados' | 'todos' {
  return v === 'archivados' || v === 'todos' ? v : 'activos';
}

const ESTADO_LABEL: Record<ProductEstado, string> = {
  activo: 'Activo',
  no_disponible: 'No disponible',
  agotado: 'Agotado',
  archivado: 'Archivado',
};

const ESTADO_TONE = {
  activo: 'success',
  no_disponible: 'warning',
  agotado: 'danger',
  archivado: 'neutral',
} as const;

function EstadoBadge({ estado }: { estado: ProductEstado }) {
  return (
    <Badge tone={ESTADO_TONE[estado]}>
      {ESTADO_LABEL[estado]}
    </Badge>
  );
}

function money(n: number): string {
  return `$${n.toFixed(2)}`;
}

function precioLabel(row: ProductListRow): string {
  if (row.nVariantes === 0) return '—';
  return row.precioMin === row.precioMax
    ? money(row.precioMin)
    : `${money(row.precioMin)} – ${money(row.precioMax)}`;
}

export default async function ProductosPage(props: { searchParams: Promise<SearchParams> }) {
  const tenantId = await requireRequestTenantId();
  return withTenant(tenantId, () => renderProductosPage(props));
}

async function renderProductosPage(props: { searchParams: Promise<SearchParams> }) {
  const actor = await requirePermission('productos.ver');
  const sp = await props.searchParams;

  const q = sp.q?.trim() || undefined;
  const categoryId = sp.categoryId?.trim() || undefined;
  const estado = estadoFrom(sp.estado);
  const soloStockBajo = sp.soloStockBajo === '1';
  const page = Math.max(1, Number(sp.page) || 1);

  const [{ rows, total }, tree] = await Promise.all([
    listProducts({ q, categoryId, estado, soloStockBajo, page, pageSize: PAGE_SIZE }),
    listCategoryTree({ incluirArchivadas: false }),
  ]);
  const categories = flattenCategories(tree);

  const columns: Column<ProductListRow>[] = [
    { key: 'nombre', header: 'Nombre' },
    { key: 'categoriaNombre', header: 'Categoría', render: (r) => r.categoriaNombre ?? '—' },
    { key: 'nVariantes', header: 'Nº variantes' },
    { key: 'precio', header: 'Precio', render: (r) => precioLabel(r) },
    { key: 'stockTotal', header: 'Stock total' },
    { key: 'estado', header: 'Estado', render: (r) => <EstadoBadge estado={r.estado} /> },
  ];

  const baseParams = new URLSearchParams();
  if (q) baseParams.set('q', q);
  if (categoryId) baseParams.set('categoryId', categoryId);
  if (sp.estado) baseParams.set('estado', estado);
  if (soloStockBajo) baseParams.set('soloStockBajo', '1');

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Productos</h1>
          <p className="text-ink-muted">Catálogo, precios, variantes y disponibilidad.</p>
        </div>
        <PermissionGate permiso="productos.crear" user={actor}>
          <Link
            href="/productos/nuevo"
            className="inline-flex items-center justify-center gap-1.5 rounded-control bg-primary px-4 py-2.5 text-sm font-medium text-on-primary shadow-sm transition-colors hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
          >
            Nuevo producto
          </Link>
        </PermissionGate>
      </div>

      <form
        method="get"
        className="flex flex-wrap items-end gap-3 rounded-card border border-line bg-surface p-4"
      >
        <label className="block space-y-1">
          <span className="text-sm font-medium text-ink-muted">Buscar</span>
          <input
            name="q"
            defaultValue={q ?? ''}
            placeholder="Nombre, SKU o código de barras"
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
        <label className="block space-y-1">
          <span className="text-sm font-medium text-ink-muted">Estado</span>
          <select name="estado" defaultValue={estado} className={inputClass}>
            <option value="activos">Activos</option>
            <option value="archivados">Archivados</option>
            <option value="todos">Todos</option>
          </select>
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
        <Link href="/productos" className="px-2 py-2 text-sm text-ink-subtle hover:text-ink">
          Limpiar
        </Link>
      </form>

      <DataTable
        columns={columns}
        rows={rows}
        getKey={(r) => r.id}
        rowHref={(r) => `/productos/${r.id}`}
        rowComponent={ProductRow}
        emptyMessage="No hay productos que coincidan con el filtro."
      />

      <Pagination
        page={page}
        pageSize={PAGE_SIZE}
        total={total}
        baseHref="/productos"
        baseSearchParams={baseParams}
      />
    </div>
  );
}
