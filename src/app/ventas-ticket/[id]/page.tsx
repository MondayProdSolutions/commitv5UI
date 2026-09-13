import { notFound } from 'next/navigation';
import Link from 'next/link';
import { requirePermission } from '@/lib/auth/context';
import { getSetting } from '@/lib/settings';
import { getSale } from '@/lib/sales/sales';
import { TicketView } from '@/app/(app)/ventas/TicketView';
import { PrintOnMount } from '@/app/(app)/ventas/PrintOnMount';

export const dynamic = 'force-dynamic';

export default async function TicketPage(props: { params: Promise<{ id: string }> }) {
  await requirePermission('ventas.ver');
  const { id } = await props.params;

  const sale = await getSale(id);
  if (!sale) notFound();

  const negocio = await getSetting<string>('negocio.nombre', 'Punto de venta');

  return (
    <main className="mx-auto w-full max-w-[320px] bg-white p-4 print:p-0">
      <TicketView sale={sale} negocio={negocio} />
      <PrintOnMount />
      <Link
        href={`/ventas/${id}`}
        className="no-print mt-2 block text-center text-xs font-medium text-primary hover:text-primary-hover"
      >
        ← Volver al detalle
      </Link>
    </main>
  );
}
