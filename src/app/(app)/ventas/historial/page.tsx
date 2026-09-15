import Link from 'next/link';
import { requirePermission } from '@/lib/auth/context';
import { db, withTenant } from '@/lib/db';
import { parseDateParam } from '@/lib/activity/query';
import { listSales, type SaleRow as SaleListRow } from '@/lib/sales/sales';
import { DataTable, type Column } from '@/components/DataTable';
import Pagination from '@/components/Pagination';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { SaleRow } from '../SaleRow';
import { money, fmtFechaMX } from '../types';
import { requireRequestTenantId } from '@/lib/tenant/with-request-tenant';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 20;

type SearchParams = {
  q?: string;
  estado?: string;
  cajero?: string;
  desde?: string;
  hasta?: string;
  page?: string;
};

type EstadoFiltro = 'todas' | 'COMPLETADA' | 'CANCELADA';

function estadoFrom(v: string | undefined): EstadoFiltro {
  return v === 'COMPLETADA' || v === 'CANCELADA' ? v : 'todas';
}

function EstadoBadge({ estado }: { estado: SaleListRow['estado'] }) {
  return estado === 'COMPLETADA' ? (
    <Badge tone="success">Completada</Badge>
  ) : (
    <Badge tone="neutral">Cancelada</Badge>
  );
}

const inputClass =
  'block rounded-control border border-line-strong px-3 py-2 text-sm shadow-sm outline-none focus:border-primary focus:ring-1 focus:ring-ring/40';

type HistorialVentasPageProps = { searchParams: Promise<SearchParams> };

export default async function HistorialVentasPage(props: HistorialVentasPageProps) {
  const tenantId = await requireRequestTenantId();
  return withTenant(tenantId, () => renderHistorialVentasPage(props));
}

async function renderHistorialVentasPage(props: HistorialVentasPageProps) {
  await requirePermission('ventas.ver');
  const sp = await props.searchParams;

  const q = sp.q?.trim() || undefined;
  const estado = estadoFrom(sp.estado);
  const cajero = sp.cajero?.trim() || undefined;
  const desde = parseDateParam(sp.desde);
  const hasta = parseDateParam(sp.hasta);
  const page = Math.max(1, Number(sp.page) || 1);

  const [{ rows, total }, cajeros] = await Promise.all([
    listSales({
      q,
      estado: estado === 'todas' ? undefined : estado,
      cajeroId: cajero,
      desde,
      hasta,
      page,
      pageSize: PAGE_SIZE,
    }),
    db.user.findMany({
      where: { activo: true },
      select: { id: true, nombre: true },
      orderBy: { nombre: 'asc' },
    }),
  ]);

  const columns: Column<SaleListRow>[] = [
    { key: 'folio', header: 'Folio' },
    { key: 'fecha', header: 'Fecha', render: (r) => fmtFechaMX(r.fecha) },
    { key: 'cliente', header: 'Cliente' },
    { key: 'cajero', header: 'Cajero' },
    { key: 'nLineas', header: 'Nº líneas' },
    { key: 'total', header: 'Total', render: (r) => money(r.total) },
    { key: 'estado', header: 'Estado', render: (r) => <EstadoBadge estado={r.estado} /> },
  ];

  const baseParams = new URLSearchParams();
  if (q) baseParams.set('q', q);
  if (sp.estado && estado !== 'todas') baseParams.set('estado', estado);
  if (cajero) baseParams.set('cajero', cajero);
  if (sp.desde) baseParams.set('desde', sp.desde);
  if (sp.hasta) baseParams.set('hasta', sp.hasta);

  const exportHref = baseParams.toString()
    ? `/ventas/historial/export?${baseParams.toString()}`
    : '/ventas/historial/export';

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Ventas</h1>
          <p className="text-ink-muted">Historial de ventas registradas en el punto de venta.</p>
        </div>
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
            placeholder="Folio o cliente"
            className={inputClass + ' w-56'}
          />
        </label>
        <label className="block space-y-1">
          <span className="text-sm font-medium text-ink-muted">Estado</span>
          <select name="estado" defaultValue={estado} className={inputClass}>
            <option value="todas">Todas</option>
            <option value="COMPLETADA">Completadas</option>
            <option value="CANCELADA">Canceladas</option>
          </select>
        </label>
        <label className="block space-y-1">
          <span className="text-sm font-medium text-ink-muted">Cajero</span>
          <select name="cajero" defaultValue={cajero ?? ''} className={inputClass}>
            <option value="">Todos</option>
            {cajeros.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </select>
        </label>
        <label className="block space-y-1">
          <span className="text-sm font-medium text-ink-muted">Desde</span>
          <input type="date" name="desde" defaultValue={sp.desde ?? ''} className={inputClass} />
        </label>
        <label className="block space-y-1">
          <span className="text-sm font-medium text-ink-muted">Hasta</span>
          <input type="date" name="hasta" defaultValue={sp.hasta ?? ''} className={inputClass} />
        </label>
        <Button type="submit" variant="primary">
          Filtrar
        </Button>
        <Link
          href="/ventas/historial"
          className="px-2 py-2 text-sm text-ink-subtle hover:text-ink"
        >
          Limpiar
        </Link>
        <a href={exportHref} className="px-2 py-2 text-sm text-ink-subtle hover:text-ink">
          Exportar CSV
        </a>
      </form>

      <DataTable
        columns={columns}
        rows={rows}
        getKey={(r) => r.id}
        rowHref={(r) => `/ventas/${r.id}`}
        rowComponent={SaleRow}
        emptyMessage="No hay ventas que coincidan con el filtro."
      />

      <Pagination
        page={page}
        pageSize={PAGE_SIZE}
        total={total}
        baseHref="/ventas/historial"
        baseSearchParams={baseParams}
      />
    </div>
  );
}
