'use client';

import { money } from './types';
import type { VarianteLite } from './actions';

export function VariantPicker({
  productoNombre,
  variantes,
  loading,
  onPick,
  onClose,
}: {
  productoNombre: string;
  variantes: VarianteLite[];
  loading: boolean;
  onPick: (v: VarianteLite) => void;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-card border border-line bg-surface p-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-sm font-semibold text-ink">
            Elige una variante — {productoNombre}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="text-ink-subtle hover:text-ink"
            aria-label="Cerrar"
          >
            ✕
          </button>
        </div>

        {loading ? (
          <p className="mt-4 text-sm text-ink-subtle">Cargando variantes…</p>
        ) : variantes.length === 0 ? (
          <p className="mt-4 text-sm text-ink-subtle">Este producto no tiene variantes disponibles.</p>
        ) : (
          <ul className="mt-3 divide-y divide-line rounded-control border border-line">
            {variantes.map((v) => (
              <li key={v.id}>
                <button
                  type="button"
                  onClick={() => onPick(v)}
                  className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-surface-raised"
                >
                  <span>{v.nombre ?? 'Única'}</span>
                  <span className="tabular-nums text-ink-subtle">
                    {money(v.precioConImpuesto)} · stock {v.stock}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
