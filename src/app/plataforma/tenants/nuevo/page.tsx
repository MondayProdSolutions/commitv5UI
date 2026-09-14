import { listPlans } from '@/lib/platform/plans';
import { Card } from '@/components/ui/Card';
import { TenantForm } from './TenantForm';

export default async function NuevoTenantPage() {
  const plans = await listPlans();

  return (
    <main className="mx-auto w-full max-w-lg">
      <Card>
        <TenantForm plans={plans} />
      </Card>
    </main>
  );
}
