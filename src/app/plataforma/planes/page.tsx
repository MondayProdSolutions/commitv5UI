import { listPlans } from '@/lib/platform/plans';
import { Card } from '@/components/ui/Card';
import { PlanForm } from './PlanForm';

export default async function PlanesPage() {
  const plans = await listPlans();

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      <Card>
        <h1 className="text-lg font-semibold text-ink">Planes</h1>
        <table className="mt-4 w-full text-sm">
          <thead>
            <tr className="text-left text-ink-muted">
              <th className="py-2">Nombre</th>
              <th>Máx. usuarios</th>
              <th>Máx. sucursales</th>
            </tr>
          </thead>
          <tbody>
            {plans.length === 0 ? (
              <tr>
                <td colSpan={3} className="py-8 text-center text-ink-subtle">
                  Todavía no hay planes.
                </td>
              </tr>
            ) : (
              plans.map((p) => (
                <tr key={p.id} className="border-t border-line">
                  <td className="py-2 font-semibold text-ink">{p.nombre}</td>
                  <td className="text-ink-muted">{p.maxUsuarios}</td>
                  <td className="text-ink-muted">{p.maxSucursales}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </Card>

      <Card>
        <PlanForm />
      </Card>
    </div>
  );
}
