'use client';

import { useRef, type CSSProperties, type ReactNode } from 'react';

/**
 * Tarjeta de gráfica con botón "expandir" → `<dialog>` nativo con la misma
 * gráfica en grande (mismo nodo de datos, solo cambia el contenedor). Sin
 * dependencia nueva — mismo patrón que `ConfirmDialog`. El modal, a
 * diferencia de un popover, no está anclado a un disparador puntual, así
 * que mantiene `transform-origin` centrado (excepción documentada en la
 * skill de diseño).
 */
export function ExpandableChartCard({
  title,
  dotClassName = 'bg-primary',
  revealDelay,
  children,
}: {
  title: string;
  dotClassName?: string;
  revealDelay?: number;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  return (
    <div
      className="reveal flex h-[400px] flex-col rounded-card border border-line bg-surface p-4 shadow-card"
      style={revealDelay ? ({ '--reveal-delay': `${revealDelay}ms` } as CSSProperties) : undefined}
    >
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-2 text-sm font-medium text-ink">
          <span aria-hidden="true" className={'inline-block h-2.5 w-2.5 rounded-pill ' + dotClassName} />
          {title}
        </p>
        <button
          type="button"
          onClick={() => ref.current?.showModal()}
          aria-label={`Expandir ${title}`}
          className="press hidden rounded-control p-1.5 text-ink-subtle transition-colors duration-150 hover:bg-surface-raised hover:text-ink sm:inline-flex"
        >
          <svg viewBox="0 0 24 24" width={16} height={16} fill="none" stroke="currentColor" strokeWidth={1.75}>
            <path d="M9 3H3v6M15 21h6v-6M21 3h-6M3 21h6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>
      <div className="mt-4 min-h-0 flex-1">{children}</div>

      <dialog
        ref={ref}
        onClick={(e) => {
          if (e.target === ref.current) ref.current?.close();
        }}
        className="m-auto w-full max-w-3xl rounded-card border border-line bg-surface p-6 shadow-pop backdrop:bg-black/50"
      >
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-ink">{title}</p>
          <button
            type="button"
            onClick={() => ref.current?.close()}
            aria-label="Cerrar"
            className="press rounded-pill p-1 text-ink-subtle transition-colors duration-150 hover:bg-surface-raised hover:text-ink"
          >
            ✕
          </button>
        </div>
        <div className="mt-4 h-[60vh]">{children}</div>
      </dialog>
    </div>
  );
}
