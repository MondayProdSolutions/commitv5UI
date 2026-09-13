import Link from 'next/link';
import { requirePermission } from '@/lib/auth/context';
import { Card } from '@/components/ui/Card';
import { CustomerForm } from '../CustomerForm';

export const dynamic = 'force-dynamic';

export default async function NuevoClientePage() {
  await requirePermission('clientes.crear');
  return (
    <div className="space-y-6">
      <div>
        <Link href="/clientes" className="text-sm text-ink-subtle hover:text-ink">← Clientes</Link>
        <h1 className="text-2xl font-bold">Nuevo cliente</h1>
      </div>
      <Card>
        <CustomerForm mode="crear" />
      </Card>
    </div>
  );
}
