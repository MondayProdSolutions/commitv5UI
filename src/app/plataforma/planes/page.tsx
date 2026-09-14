import { listPlans, type PlanSummary } from '@/lib/platform/plans';
import { Card } from '@/components/ui/Card';
import { DataTable, type Column } from '@/components/DataTable';
import { PlanForm } from './PlanForm';

export default async function PlanesPage() {
  const plans = await listPlans();

  const columns: Column<PlanSummary>[] = [
    { key: 'nombre', header: 'Nombre' },
    { key: 'maxUsuarios', header: 'Máx. usuarios' },
    { key: 'maxSucursales', header: 'Máx. sucursales' },
  ];

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      <Card>
        <h1 className="text-lg font-semibold text-ink">Planes</h1>
        <div className="mt-4">
          <DataTable
            columns={columns}
            rows={plans}
            getKey={(p) => p.id}
            emptyMessage="Todavía no hay planes."
          />
        </div>
      </Card>

      <Card>
        <PlanForm />
      </Card>
    </div>
  );
}
