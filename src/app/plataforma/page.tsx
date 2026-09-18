import Link from 'next/link';
import { listTenants, type TenantSummary } from '@/lib/platform/tenants';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { DataTable, type Column } from '@/components/DataTable';
import { TenantEstadoForm } from './tenants/TenantEstadoForm';

function EstadoBadge({ estado }: { estado: TenantSummary['estado'] }) {
  if (estado === 'ACTIVO') return <Badge tone="success">Activo</Badge>;
  if (estado === 'SUSPENDIDO') return <Badge tone="danger">Suspendido</Badge>;
  return <Badge tone="warning">Prueba</Badge>;
}

const fechaLicencia = new Intl.DateTimeFormat('es-MX', { dateStyle: 'long' });

const ESTADO_DESDE_LABEL: Record<TenantSummary['estado'], string> = {
  ACTIVO: 'Licencia activa desde',
  SUSPENDIDO: 'Suspendida desde',
  PRUEBA: 'En prueba desde',
};

function LicenciaDesdeBox({ estado, desde }: { estado: TenantSummary['estado']; desde: Date }) {
  return (
    <div className="inline-flex flex-col rounded-control border border-line bg-surface-raised px-2.5 py-1.5 text-xs">
      <span className="text-ink-subtle">{ESTADO_DESDE_LABEL[estado]}</span>
      <span className="font-semibold text-ink">{fechaLicencia.format(desde)}</span>
    </div>
  );
}

export default async function TenantsPage() {
  const tenants = await listTenants();

  const columns: Column<TenantSummary>[] = [
    { key: 'nombre', header: 'Nombre' },
    { key: 'slug', header: 'Subdominio' },
    { key: 'planNombre', header: 'Plan' },
    { key: 'estado', header: 'Estado', render: (t) => <EstadoBadge estado={t.estado} /> },
    {
      key: 'estadoDesde',
      header: 'Licencia',
      render: (t) => <LicenciaDesdeBox estado={t.estado} desde={t.estadoDesde} />,
    },
    {
      key: 'acciones',
      header: '',
      render: (t) => <TenantEstadoForm tenantId={t.id} nombre={t.nombre} estado={t.estado} />,
    },
  ];

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-semibold text-ink">Negocios</h1>
        <Link
          href="/plataforma/tenants/nuevo"
          className="inline-flex items-center justify-center gap-1.5 rounded-control bg-primary px-4 py-2.5 text-sm font-medium text-on-primary shadow-sm transition-colors hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
        >
          + Crear negocio
        </Link>
      </div>
      <div className="mt-4">
        <DataTable
          columns={columns}
          rows={tenants}
          getKey={(t) => t.id}
          emptyMessage="Todavía no hay negocios registrados."
        />
      </div>
    </Card>
  );
}
