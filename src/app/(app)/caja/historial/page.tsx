import Link from 'next/link';
import { requirePermission } from '@/lib/auth/context';
import { parseDateParam } from '@/lib/activity/query';
import { listCashSessions, type CashSessionRow as CashSessionListRow } from '@/lib/cash/sessions';
import { DataTable, type Column } from '@/components/DataTable';
import Pagination from '@/components/Pagination';
import { CajaSessionRow } from '../CajaSessionRow';
import { money, fmtFechaMX } from '@/app/(app)/ventas/types';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { withTenant } from '@/lib/db';
import { requireRequestTenantId } from '@/lib/tenant/with-request-tenant';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 20;

type SearchParams = {
  estado?: string;
  desde?: string;
  hasta?: string;
  page?: string;
};

type EstadoFiltro = 'todas' | 'ABIERTA' | 'CERRADA';

function estadoFrom(v: string | undefined): EstadoFiltro {
  return v === 'ABIERTA' || v === 'CERRADA' ? v : 'todas';
}

function EstadoBadge({ estado }: { estado: CashSessionListRow['estado'] }) {
  return estado === 'ABIERTA' ? (
    <Badge tone="success">Abierta</Badge>
  ) : (
    <Badge tone="neutral">Cerrada</Badge>
  );
}

function DiferenciaBadge({ diferencia }: { diferencia: number | null }) {
  if (diferencia === null) return <span className="text-ink-subtle">—</span>;
  if (diferencia === 0) return <Badge tone="success">Cuadra</Badge>;
  if (diferencia > 0) return <Badge tone="warning">Sobrante +{money(diferencia)}</Badge>;
  return <Badge tone="danger">Faltante −{money(Math.abs(diferencia))}</Badge>;
}

const inputClass =
  'block rounded-control border border-line-strong px-3 py-2 text-sm shadow-sm outline-none focus:border-primary focus:ring-1 focus:ring-ring/40';

export default async function HistorialCajaPage(props: { searchParams: Promise<SearchParams> }) {
  const tenantId = await requireRequestTenantId();
  return withTenant(tenantId, () => renderHistorialCajaPage(props));
}

async function renderHistorialCajaPage(props: { searchParams: Promise<SearchParams> }) {
  await requirePermission('caja.gestionar');
  const sp = await props.searchParams;

  const estado = estadoFrom(sp.estado);
  const desde = parseDateParam(sp.desde);
  const hasta = parseDateParam(sp.hasta);
  const page = Math.max(1, Number(sp.page) || 1);

  const { rows, total } = await listCashSessions({
    estado: estado === 'todas' ? undefined : estado,
    desde,
    hasta,
    page,
    pageSize: PAGE_SIZE,
  });

  const columns: Column<CashSessionListRow>[] = [
    { key: 'folio', header: 'Folio' },
    { key: 'estado', header: 'Estado', render: (r) => <EstadoBadge estado={r.estado} /> },
    { key: 'abiertaEn', header: 'Apertura', render: (r) => fmtFechaMX(r.abiertaEn) },
    {
      key: 'cerradaEn',
      header: 'Cierre',
      render: (r) => (r.cerradaEn ? fmtFechaMX(r.cerradaEn) : '—'),
    },
    { key: 'abiertaPor', header: 'Abrió' },
    { key: 'fondoApertura', header: 'Fondo', render: (r) => money(r.fondoApertura) },
    {
      key: 'efectivoContado',
      header: 'Contado',
      render: (r) => (r.efectivoContado === null ? '—' : money(r.efectivoContado)),
    },
    {
      key: 'diferencia',
      header: 'Diferencia',
      render: (r) => <DiferenciaBadge diferencia={r.diferencia} />,
    },
  ];

  const baseParams = new URLSearchParams();
  if (sp.estado && estado !== 'todas') baseParams.set('estado', estado);
  if (sp.desde) baseParams.set('desde', sp.desde);
  if (sp.hasta) baseParams.set('hasta', sp.hasta);

  const exportHref = baseParams.toString()
    ? `/caja/historial/export?${baseParams.toString()}`
    : '/caja/historial/export';

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Historial de caja</h1>
          <p className="text-ink-muted">Sesiones de caja abiertas y cortes cerrados.</p>
        </div>
      </div>

      <form
        method="get"
        className="flex flex-wrap items-end gap-3 rounded-card border border-line bg-surface p-4"
      >
        <label className="block space-y-1">
          <span className="text-sm font-medium text-ink-muted">Estado</span>
          <select name="estado" defaultValue={estado} className={inputClass}>
            <option value="todas">Todas</option>
            <option value="ABIERTA">Abierta</option>
            <option value="CERRADA">Cerrada</option>
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
          href="/caja/historial"
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
        rowHref={(r) => `/caja/sesiones/${r.id}`}
        rowComponent={CajaSessionRow}
        emptyMessage="No hay sesiones de caja que coincidan con el filtro."
      />

      <Pagination
        page={page}
        pageSize={PAGE_SIZE}
        total={total}
        baseHref="/caja/historial"
        baseSearchParams={baseParams}
      />
    </div>
  );
}
