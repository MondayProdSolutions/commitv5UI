import Link from 'next/link';
import { requirePermission } from '@/lib/auth/context';
import { listCustomers, type CustomerRow as CustomerListRow } from '@/lib/customers/customers';
import { DataTable, type Column } from '@/components/DataTable';
import Pagination from '@/components/Pagination';
import { PermissionGate } from '@/components/PermissionGate';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { inputClass } from '@/app/(app)/ventas/types';
import { CustomerRow } from './CustomerRow';
import { withTenant } from '@/lib/db';
import { requireRequestTenantId } from '@/lib/tenant/with-request-tenant';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 20;

type SearchParams = {
  q?: string;
  estado?: string;
  soloFacturables?: string;
  page?: string;
};

function estadoFrom(v: string | undefined): 'activos' | 'archivados' | 'todos' {
  return v === 'archivados' || v === 'todos' ? v : 'activos';
}

export default async function ClientesPage(props: { searchParams: Promise<SearchParams> }) {
  const tenantId = await requireRequestTenantId();
  return withTenant(tenantId, () => renderClientesPage(props));
}

async function renderClientesPage(props: { searchParams: Promise<SearchParams> }) {
  const actor = await requirePermission('clientes.ver');
  const sp = await props.searchParams;

  const q = sp.q?.trim() || undefined;
  const estado = estadoFrom(sp.estado);
  const soloFacturables = sp.soloFacturables === '1';
  const page = Math.max(1, Number(sp.page) || 1);

  const { rows, total } = await listCustomers({
    q,
    estado,
    soloFacturables,
    page,
    pageSize: PAGE_SIZE,
  });

  const columns: Column<CustomerListRow>[] = [
    { key: 'nombre', header: 'Nombre' },
    { key: 'telefono', header: 'Teléfono', render: (r) => r.telefono ?? '—' },
    { key: 'correo', header: 'Correo', render: (r) => r.correo ?? '—' },
    { key: 'rfc', header: 'RFC', render: (r) => r.rfc ?? '—' },
    {
      key: 'facturable',
      header: 'Facturable',
      render: (r) => <Badge tone={r.facturable ? 'success' : 'neutral'}>{r.facturable ? 'Sí' : 'No'}</Badge>,
    },
    {
      key: 'estado',
      header: 'Estado',
      render: (r) => (
        <Badge tone={r.estado === 'activo' ? 'success' : 'neutral'}>
          {r.estado === 'activo' ? 'Activo' : 'Archivado'}
        </Badge>
      ),
    },
  ];

  const baseParams = new URLSearchParams();
  if (q) baseParams.set('q', q);
  if (sp.estado) baseParams.set('estado', estado);
  if (soloFacturables) baseParams.set('soloFacturables', '1');

  const exportHref = baseParams.toString()
    ? `/clientes/export?${baseParams.toString()}`
    : '/clientes/export';

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Clientes</h1>
          <p className="text-ink-muted">Directorio de clientes y sus datos de facturación.</p>
        </div>
        <PermissionGate permiso="clientes.crear" user={actor}>
          <Link
            href="/clientes/nuevo"
            className="inline-flex items-center justify-center gap-1.5 rounded-control bg-primary px-4 py-2.5 text-sm font-medium text-on-primary shadow-sm transition-colors hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
          >
            Nuevo cliente
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
            placeholder="Nombre, teléfono, correo o RFC"
            className={inputClass}
          />
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
            name="soloFacturables"
            value="1"
            defaultChecked={soloFacturables}
            className="h-4 w-4 rounded border-line-strong"
          />
          Solo facturables
        </label>
        <Button type="submit" variant="primary">
          Filtrar
        </Button>
        <Link href="/clientes" className="px-2 py-2 text-sm text-ink-subtle hover:text-ink">
          Limpiar
        </Link>
        <a
          href={exportHref}
          className="px-2 py-2 text-sm text-ink-subtle hover:text-ink"
        >
          Exportar CSV
        </a>
      </form>

      <DataTable
        columns={columns}
        rows={rows}
        getKey={(r) => r.id}
        rowHref={(r) => `/clientes/${r.id}`}
        rowComponent={CustomerRow}
        emptyMessage="No hay clientes que coincidan con el filtro."
      />

      <Pagination
        page={page}
        pageSize={PAGE_SIZE}
        total={total}
        baseHref="/clientes"
        baseSearchParams={baseParams}
      />
    </div>
  );
}
