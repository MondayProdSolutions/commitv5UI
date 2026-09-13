import Link from 'next/link';
import { requirePermission } from '@/lib/auth/context';
import { can } from '@/lib/auth/rbac';
import { DataTable, type Column } from '@/components/DataTable';
import Pagination from '@/components/Pagination';
import { parseDateParam } from '@/lib/activity/query';
import { listMovements, movementTipoLabel, type MovementRow } from '@/lib/inventory/query';
import { Button } from '@/components/ui/Button';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 30;

type SearchParams = {
  productId?: string;
  tipo?: string;
  desde?: string;
  hasta?: string;
  actorId?: string;
  page?: string;
};

const TIPO_OPCIONES: { value: string; label: string }[] = [
  { value: 'ENTRADA', label: 'Entrada' },
  { value: 'SALIDA', label: 'Salida' },
  { value: 'AJUSTE', label: 'Ajuste' },
];

const inputClass =
  'block rounded-control border border-line-strong px-3 py-2 text-sm shadow-sm outline-none focus:border-primary focus:ring-1 focus:ring-ring/40';

function Cantidad({ n }: { n: number }) {
  const cls = n > 0 ? 'text-on-success-soft' : n < 0 ? 'text-on-danger-soft' : 'text-ink-subtle';
  const signo = n > 0 ? '+' : '';
  return <span className={`font-medium tabular-nums ${cls}`}>{`${signo}${n}`}</span>;
}

function fmtFecha(d: Date): string {
  return new Intl.DateTimeFormat('es-MX', { dateStyle: 'short', timeStyle: 'medium' }).format(d);
}

export default async function MovimientosPage(props: { searchParams: Promise<SearchParams> }) {
  const actor = await requirePermission('inventario.ver');
  const sp = await props.searchParams;

  const productId = sp.productId?.trim() || undefined;
  const actorId = sp.actorId?.trim() || undefined;
  const tipo = sp.tipo && ['ENTRADA', 'SALIDA', 'AJUSTE'].includes(sp.tipo) ? sp.tipo : undefined;
  const desde = sp.desde?.trim() || undefined;
  const hasta = sp.hasta?.trim() || undefined;
  const page = Math.max(1, Number(sp.page) || 1);

  const { rows, total } = await listMovements({
    productId,
    tipo,
    desde: parseDateParam(desde),
    hasta: parseDateParam(hasta),
    actorId,
    page,
    pageSize: PAGE_SIZE,
  });

  const baseParams = new URLSearchParams();
  if (productId) baseParams.set('productId', productId);
  if (tipo) baseParams.set('tipo', tipo);
  if (desde) baseParams.set('desde', desde);
  if (hasta) baseParams.set('hasta', hasta);
  if (actorId) baseParams.set('actorId', actorId);

  const puedeRegistrar =
    can(actor, 'inventario.entrada') ||
    can(actor, 'inventario.salida') ||
    can(actor, 'inventario.ajustar');

  const columns: Column<MovementRow>[] = [
    { key: 'createdAt', header: 'Fecha/hora', render: (r) => fmtFecha(r.createdAt) },
    {
      key: 'producto',
      header: 'Producto · Variante',
      render: (r) => (r.varianteNombre ? `${r.productoNombre} · ${r.varianteNombre}` : r.productoNombre),
    },
    { key: 'tipo', header: 'Tipo', render: (r) => movementTipoLabel(r.tipo) },
    { key: 'cantidad', header: 'Cantidad', render: (r) => <Cantidad n={r.cantidad} /> },
    {
      key: 'stock',
      header: 'Stock',
      render: (r) => (
        <span className="tabular-nums text-ink-muted">
          {r.stockPrevio} <span className="text-ink-subtle">→</span> {r.stockNuevo}
        </span>
      ),
    },
    { key: 'motivo', header: 'Motivo', render: (r) => r.motivo || '—' },
    { key: 'usuario', header: 'Usuario', render: (r) => r.actorNombre ?? 'Sistema' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Movimientos de inventario</h1>
          <p className="text-ink-muted">Historial de entradas, salidas y ajustes de stock.</p>
        </div>
        <div className="flex items-center gap-2">
          {puedeRegistrar ? (
            <Link
              href="/inventario/movimientos/nuevo"
              className="inline-flex items-center justify-center gap-1.5 rounded-control bg-primary px-4 py-2.5 text-sm font-medium text-on-primary shadow-sm transition-colors hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
            >
              Registrar movimiento
            </Link>
          ) : null}
          <a
            href={`/inventario/movimientos/export?${baseParams.toString()}`}
            download
            className="inline-flex items-center justify-center gap-1.5 rounded-control border border-line-strong bg-surface px-4 py-2.5 text-sm font-medium text-ink-muted transition-colors hover:bg-surface-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
          >
            Exportar CSV
          </a>
        </div>
      </div>

      <form
        method="get"
        className="flex flex-wrap items-end gap-3 rounded-card border border-line bg-surface p-4"
      >
        <label className="block space-y-1">
          <span className="text-sm font-medium text-ink-muted">Tipo</span>
          <select name="tipo" defaultValue={tipo ?? ''} className={inputClass}>
            <option value="">Todos</option>
            {TIPO_OPCIONES.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block space-y-1">
          <span className="text-sm font-medium text-ink-muted">Desde</span>
          <input type="date" name="desde" defaultValue={desde ?? ''} className={inputClass} />
        </label>
        <label className="block space-y-1">
          <span className="text-sm font-medium text-ink-muted">Hasta</span>
          <input type="date" name="hasta" defaultValue={hasta ?? ''} className={inputClass} />
        </label>
        <label className="block space-y-1">
          <span className="text-sm font-medium text-ink-muted">Producto (ID)</span>
          <input
            name="productId"
            defaultValue={productId ?? ''}
            placeholder="ID de producto"
            className={inputClass + ' w-44'}
          />
        </label>
        <label className="block space-y-1">
          <span className="text-sm font-medium text-ink-muted">Usuario (ID)</span>
          <input
            name="actorId"
            defaultValue={actorId ?? ''}
            placeholder="ID de usuario"
            className={inputClass + ' w-44'}
          />
        </label>
        <Button type="submit" variant="primary">
          Filtrar
        </Button>
        <Link
          href="/inventario/movimientos"
          className="px-2 py-2 text-sm text-ink-subtle hover:text-ink"
        >
          Limpiar
        </Link>
      </form>

      <DataTable
        columns={columns}
        rows={rows}
        getKey={(r) => r.id}
        emptyMessage="No hay movimientos que coincidan con los filtros."
      />

      <Pagination
        page={page}
        pageSize={PAGE_SIZE}
        total={total}
        baseHref="/inventario/movimientos"
        baseSearchParams={baseParams}
      />
    </div>
  );
}
