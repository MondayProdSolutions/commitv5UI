import Link from 'next/link';
import { requirePermission } from '@/lib/auth/context';
import { can } from '@/lib/auth/rbac';

export const dynamic = 'force-dynamic';

const REPORTES = [
  {
    href: '/reportes/ventas',
    titulo: 'Ventas',
    descripcion: 'Ingresos, tendencia diaria, cobros por método, top productos y por cajero.',
  },
  {
    href: '/reportes/inventario',
    titulo: 'Inventario',
    descripcion: 'Valorización de stock, movimientos del período y rotación.',
  },
  {
    href: '/reportes/clientes',
    titulo: 'Clientes',
    descripcion: 'Clientes activos, nuevos y top compradores del período.',
  },
] as const;

export default async function ReportesPage() {
  const actor = await requirePermission('reportes.ver');
  const verMargen = can(actor, 'reportes.margen');
  const verAsistencia = can(actor, 'asistencia.ver');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Reportes</h1>
        <p className="text-ink-muted">Elige un reporte para consultarlo.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {REPORTES.map((r) => (
          <Link
            key={r.href}
            href={r.href}
            className="rounded-card border border-line bg-surface p-5 shadow-sm hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <h2 className="text-lg font-semibold text-ink">{r.titulo}</h2>
            <p className="mt-1 text-sm text-ink-muted">{r.descripcion}</p>
          </Link>
        ))}
        {verMargen ? (
          <Link
            href="/reportes/margen"
            className="rounded-card border border-line bg-surface p-5 shadow-sm hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <h2 className="text-lg font-semibold text-ink">Utilidad / margen</h2>
            <p className="mt-1 text-sm text-ink-muted">
              Ganancia bruta por producto, usando el costo actual.
            </p>
          </Link>
        ) : null}
        {verAsistencia ? (
          <Link
            href="/reportes/asistencia"
            className="rounded-card border border-line bg-surface p-5 shadow-sm hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <h2 className="text-lg font-semibold text-ink">Asistencia</h2>
            <p className="mt-1 text-sm text-ink-muted">
              Llegadas por hora, horas por empleado, turnos abiertos y galería de fotos.
            </p>
          </Link>
        ) : null}
      </div>
    </div>
  );
}
