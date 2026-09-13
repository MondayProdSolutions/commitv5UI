'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { DiscountPopover } from './DiscountPopover';
import { money, type CartLine, type Descuento, type SaleComputeResult } from './types';

function descuentoLabel(d: Descuento): string {
  return d.tipo === 'porcentaje' ? `${d.valor}%` : money(d.valor);
}

export function CartTable({
  lines,
  quote,
  canDescuento,
  onQty,
  onRemove,
  onDescuento,
}: {
  lines: CartLine[];
  quote: SaleComputeResult | null;
  canDescuento: boolean;
  onQty: (key: string, cantidad: number) => void;
  onRemove: (key: string) => void;
  onDescuento: (key: string, d: Descuento | null) => void;
}) {
  const [openKey, setOpenKey] = useState<string | null>(null);

  if (lines.length === 0) {
    return (
      <div className="rounded-card border border-line bg-surface">
        <EmptyState message="El carrito está vacío. Busca un producto o elige una categoría." />
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-card border border-line bg-surface">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-subtle">
            <th className="px-3 py-2 font-medium">Producto</th>
            <th className="px-3 py-2 text-right font-medium">P. unit.</th>
            <th className="px-3 py-2 text-center font-medium">Cantidad</th>
            {canDescuento ? <th className="px-3 py-2 font-medium">Descuento</th> : null}
            <th className="px-3 py-2 text-right font-medium">Importe</th>
            <th className="px-3 py-2" />
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {lines.map((l, i) => {
            const importe = quote?.lineas[i]?.total ?? null;
            return (
              <tr key={l.key}>
                <td className="px-3 py-2">
                  <div className="font-medium text-ink">{l.productoNombre}</div>
                  {l.varianteNombre ? (
                    <div className="text-xs text-ink-subtle">{l.varianteNombre}</div>
                  ) : null}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-ink-muted">
                  {money(l.precioConImpuesto)}
                </td>
                <td className="px-3 py-2">
                  <div className="flex items-center justify-center gap-1">
                    <button
                      type="button"
                      onClick={() => onQty(l.key, l.cantidad - 1)}
                      className="h-11 w-11 shrink-0 rounded-control border border-line-strong text-lg text-ink-muted hover:bg-surface-raised active:bg-surface-sunken"
                      aria-label="Restar uno"
                    >
                      −
                    </button>
                    <input
                      type="number"
                      inputMode="numeric"
                      min={1}
                      step={1}
                      value={l.cantidad}
                      onChange={(e) => {
                        const n = Math.trunc(Number(e.target.value));
                        onQty(l.key, Number.isFinite(n) && n >= 1 ? n : 1);
                      }}
                      className="h-11 w-14 rounded-control border border-line-strong px-2 text-center text-sm tabular-nums outline-none focus:border-primary focus:ring-1 focus:ring-ring/40"
                    />
                    <button
                      type="button"
                      onClick={() => onQty(l.key, l.cantidad + 1)}
                      className="h-11 w-11 shrink-0 rounded-control border border-line-strong text-lg text-ink-muted hover:bg-surface-raised active:bg-surface-sunken"
                      aria-label="Sumar uno"
                    >
                      +
                    </button>
                  </div>
                  {l.cantidad > l.stock ? (
                    <p className="mt-1 text-center text-xs text-warning">
                      Stock disponible: {l.stock}
                    </p>
                  ) : null}
                </td>
                {canDescuento ? (
                  <td className="relative px-3 py-2">
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => setOpenKey((k) => (k === l.key ? null : l.key))}
                    >
                      {l.descuento ? descuentoLabel(l.descuento) : 'Añadir'}
                    </Button>
                    {openKey === l.key ? (
                      <DiscountPopover
                        value={l.descuento}
                        onApply={(d) => onDescuento(l.key, d)}
                        onClear={() => onDescuento(l.key, null)}
                        onClose={() => setOpenKey(null)}
                      />
                    ) : null}
                  </td>
                ) : null}
                <td className="px-3 py-2 text-right tabular-nums text-ink">
                  {importe == null ? '—' : money(importe)}
                </td>
                <td className="px-3 py-2 text-right">
                  <button
                    type="button"
                    onClick={() => onRemove(l.key)}
                    className="inline-flex min-h-11 items-center rounded-control px-2 text-xs font-semibold text-danger hover:bg-danger-soft"
                  >
                    Quitar
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
