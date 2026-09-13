import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requirePermission, getCurrentUser } from '@/lib/auth/context';
import { can } from '@/lib/auth/rbac';
import { getCustomer } from '@/lib/customers/customers';
import { PermissionGate } from '@/components/PermissionGate';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { CustomerForm } from '../CustomerForm';
import { ClienteAdminActions } from '../ClienteAdminActions';

export const dynamic = 'force-dynamic';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-subtle">{title}</h2>
      {children}
    </Card>
  );
}

export default async function ClienteDetallePage(props: { params: Promise<{ id: string }> }) {
  await requirePermission('clientes.ver');
  const { id } = await props.params;

  const cliente = await getCustomer(id);
  if (!cliente) notFound();

  const actor = await getCurrentUser();
  const canEditar = can(actor, 'clientes.editar');
  const canArchivar = can(actor, 'clientes.archivar');

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/clientes" className="text-sm text-ink-subtle hover:text-ink">
            ← Clientes
          </Link>
          <h1 className="text-2xl font-bold">{cliente.nombre}</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          {cliente.esGenerico ? <Badge tone="warning">Genérico</Badge> : null}
          {cliente.archivado ? <Badge tone="neutral">Archivado</Badge> : null}
          {cliente.facturable ? <Badge tone="success">Facturable</Badge> : null}
        </div>
      </div>

      <Section title="Datos del cliente">
        <CustomerForm
          mode="editar"
          readOnly={!canEditar}
          genericoLock={cliente.esGenerico}
          initial={{
            id: cliente.id,
            nombre: cliente.nombre,
            telefono: cliente.telefono,
            correo: cliente.correo,
            direccion: cliente.direccion,
            notas: cliente.notas,
            rfc: cliente.rfc,
            razonSocial: cliente.razonSocial,
            regimenFiscalCode: cliente.regimenFiscalCode,
            usoCfdiCode: cliente.usoCfdiCode,
            cpFiscal: cliente.cpFiscal,
            correoFacturacion: cliente.correoFacturacion,
          }}
        />
      </Section>

      <Section title="Compras">
        <p className="text-sm text-ink-muted">
          El historial de compras estará disponible cuando se active el módulo de Ventas.
        </p>
      </Section>

      <PermissionGate permiso="clientes.archivar" user={actor}>
        {canArchivar && !cliente.esGenerico ? (
          <Section title={cliente.archivado ? 'Restaurar cliente' : 'Archivar cliente'}>
            <ClienteAdminActions id={cliente.id} archivado={cliente.archivado} />
          </Section>
        ) : null}
      </PermissionGate>
    </div>
  );
}
