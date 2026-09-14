import Link from 'next/link';
import { requirePermission } from '@/lib/auth/context';
import { parseDateParam } from '@/lib/activity/query';
import { listReturns, type ReturnRow as ReturnListRow } from '@/lib/sales/returns';
import { DataTable, type Column } from '@/components/DataTable';
import Pagination from '@/components/Pagination';
import { Button } from '@/components/ui/Button';
import { ReturnRow } from '../ReturnRow';
import { money, fmtFechaMX } from '../types';
import { withTenant } from '@/lib/db';
import { requireRequestTenantId } from '@/lib/tenant/with-request-tenant';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 20;

type SearchParams = {
  desde?: string;
  hasta?: string;
  page?: string;
};

const inputClass =
  'block rounded-control border border-line-strong px-3 py-2 text-sm shadow-sm outline-none focus:border-primary focus:ring-1 focus:ring-ring/40';

export default async function DevolucionesPage(props: { searchParams: Promise<SearchParams> }) {
  const tenantId = await requireRequestTenantId();
  return withTenant(tenantId, () => renderDevolucionesPage(props));
}

async function renderDevolucionesPage(props: { searchParams: Promise<SearchParams> }) {
  await requirePermission('ventas.ver');
  const sp = await props.searchParams;

  const desde = parseDateParam(sp.desde);
  const hasta = parseDateParam(sp.hasta);
  const page = Math.max(1, Number(sp.page) || 1);

  const { rows, total } = await listReturns({ desde, hasta, page, pageSize: PAGE_SIZE });

  const columns: Column<ReturnListRow>[] = [
    { key: 'folio', header: 'Folio D' },
    { key: 'fecha', header: 'Fecha', render: (r) => fmtFechaMX(r.fecha) },
    { key: 'ventaFolio', header: 'Venta origen' },
    { key: 'total', header: 'Total', render: (r) => money(r.total) },
    { key: 'cajero', header: 'Cajero' },
  ];

  const baseParams = new URLSearchParams();
  if (sp.desde) baseParams.set('desde', sp.desde);
  if (sp.hasta) baseParams.set('hasta', sp.hasta);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Devoluciones</h1>
        <p className="text-ink-muted">Devoluciones registradas en el punto de venta.</p>
      </div>

      <form
        method="get"
        className="flex flex-wrap items-end gap-3 rounded-card border border-line bg-surface p-4"
      >
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
          href="/ventas/devoluciones"
          className="px-2 py-2 text-sm text-ink-subtle hover:text-ink"
        >
          Limpiar
        </Link>
      </form>

      <DataTable
        columns={columns}
        rows={rows}
        getKey={(r) => r.id}
        rowHref={(r) => `/ventas/devoluciones/${r.id}`}
        rowComponent={ReturnRow}
        emptyMessage="No hay devoluciones que coincidan con el filtro."
      />

      <Pagination
        page={page}
        pageSize={PAGE_SIZE}
        total={total}
        baseHref="/ventas/devoluciones"
        baseSearchParams={baseParams}
      />
    </div>
  );
}
