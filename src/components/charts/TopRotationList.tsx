export type RotationItem = {
  variantId: string;
  nombre: string;
  unidadesVendidas: number;
  imagenUrl: string | null;
  /** Delta de posición vs. el período anterior. null = sin dato para comparar. */
  rankDelta: number | null;
};

/** Lista de rotación con barra de gradiente y reveal de detalle al hover (sin JS: solo group-hover). */
export function TopRotationList({ items }: { items: RotationItem[] }) {
  if (items.length === 0) {
    return <p className="text-sm text-ink-subtle">Sin datos de rotación en este período.</p>;
  }

  const max = Math.max(...items.map((i) => i.unidadesVendidas), 1);

  return (
    <ul className="space-y-3">
      {items.map((item) => {
        const pct = Math.max((item.unidadesVendidas / max) * 100, 6);
        return (
          <li key={item.variantId} className="group flex items-center gap-3">
            <span
              className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-control bg-surface-raised"
              aria-hidden="true"
            >
              {item.imagenUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- thumbnail decorativo, no vale el overhead de next/image aquí.
                <img src={item.imagenUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                <svg viewBox="0 0 24 24" width={20} height={20} fill="none" stroke="currentColor" strokeWidth={1.5} className="text-ink-subtle">
                  <path d="M21 8 12 3 3 8v8l9 5 9-5V8ZM3 8l9 5 9-5M12 13v8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </span>
            <div className="min-w-0 flex-1">
              <div className="h-6 w-full overflow-hidden rounded-pill bg-surface-raised">
                <div
                  className="h-full rounded-pill bg-gradient-to-r from-primary-soft to-primary transition-[width] duration-300 ease-[var(--ease-out)]"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <div className="relative mt-1 h-4 overflow-hidden text-xs">
                <p className="truncate text-ink-muted transition-transform duration-200 ease-[var(--ease-out)] group-hover:-translate-y-4">
                  {item.nombre}
                </p>
                <p className="absolute inset-0 translate-y-4 truncate text-ink-subtle transition-transform duration-200 ease-[var(--ease-out)] group-hover:translate-y-0">
                  Rotación: {item.unidadesVendidas}/período
                </p>
              </div>
            </div>
            <RankBadge delta={item.rankDelta} />
          </li>
        );
      })}
    </ul>
  );
}

function RankBadge({ delta }: { delta: number | null }) {
  if (!delta) {
    return (
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-pill bg-surface-raised text-[11px] font-semibold text-ink-muted">
        0
      </span>
    );
  }
  const up = delta > 0;
  return (
    <span
      className={
        'flex h-6 w-6 shrink-0 items-center justify-center rounded-pill text-[11px] font-semibold ' +
        (up ? 'bg-success-soft text-on-success-soft' : 'bg-danger-soft text-on-danger-soft')
      }
    >
      {up ? `+${delta}` : delta}
    </span>
  );
}
