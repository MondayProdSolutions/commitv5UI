import Link from 'next/link';
import { inputClass } from '@/app/(app)/ventas/types';
import { Button } from '@/components/ui/Button';

const ATAJOS: { value: string; label: string }[] = [
  { value: 'hoy', label: 'Hoy' },
  { value: 'semana', label: 'Esta semana' },
  { value: 'mes', label: 'Este mes' },
  { value: '30dias', label: 'Últimos 30 días' },
];

/**
 * Selector de período compartido por los 4 reportes: atajos (links GET) +
 * rango personalizado (`<form method="get">`). `base` es la ruta del
 * reporte, p. ej. `/reportes/ventas`.
 */
export function PeriodFilterForm({
  base,
  atajo,
  desde,
  hasta,
}: {
  base: string;
  atajo?: string;
  desde?: string;
  hasta?: string;
}) {
  const rangoActivo = Boolean(desde || hasta);
  const activo = rangoActivo ? null : (atajo ?? 'mes');

  return (
    <div className="space-y-3 rounded-card border border-line bg-surface p-4">
      <div className="flex flex-wrap gap-2">
        {ATAJOS.map((a) => (
          <Link
            key={a.value}
            href={`${base}?atajo=${a.value}`}
            className={
              'rounded-pill px-3 py-1 text-xs font-medium ' +
              (activo === a.value
                ? 'bg-primary text-on-primary'
                : 'bg-surface-raised text-ink-muted hover:bg-surface-sunken')
            }
          >
            {a.label}
          </Link>
        ))}
      </div>
      <form method="get" action={base} className="flex flex-wrap items-end gap-3">
        <label className="block space-y-1">
          <span className="text-sm font-medium text-ink-muted">Desde</span>
          <input type="date" name="desde" defaultValue={desde ?? ''} className={inputClass} />
        </label>
        <label className="block space-y-1">
          <span className="text-sm font-medium text-ink-muted">Hasta</span>
          <input type="date" name="hasta" defaultValue={hasta ?? ''} className={inputClass} />
        </label>
        <Button type="submit" variant="primary">
          Aplicar rango
        </Button>
        {rangoActivo ? (
          <Link href={base} className="px-2 py-2 text-sm text-ink-subtle hover:text-ink">
            Limpiar
          </Link>
        ) : null}
      </form>
    </div>
  );
}
