'use client';

import { useFormStatus } from 'react-dom';
import { Button } from '@/components/ui/Button';
import {
  METODO_LABEL,
  money,
  type MetodoPago,
  type PagoRow,
} from './types';

const METODOS: MetodoPago[] = ['EFECTIVO', 'TARJETA', 'TRANSFERENCIA'];

function ConfirmBtn({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      variant="primary"
      className="w-full"
      disabled={disabled}
      pending={pending}
      pendingLabel="Confirmando…"
    >
      Confirmar venta
    </Button>
  );
}

export function PaymentPanel({
  total,
  pagos,
  onChange,
  formError,
  fieldErrors,
}: {
  total: number;
  pagos: PagoRow[];
  onChange: (pagos: PagoRow[]) => void;
  formError?: string;
  fieldErrors?: Record<string, string>;
}) {
  const pagado = pagos.reduce((s, p) => s + (Number.isFinite(p.monto) ? p.monto : 0), 0);
  const cambio = Math.max(0, pagado - total);
  const falta = Math.max(0, total - pagado);

  function updateRow(i: number, patch: Partial<PagoRow>) {
    onChange(pagos.map((p, idx) => (idx === i ? { ...p, ...patch } : p)));
  }

  function addRow() {
    onChange([...pagos, { id: crypto.randomUUID(), metodo: 'EFECTIVO', monto: 0 }]);
  }

  function removeRow(i: number) {
    onChange(pagos.filter((_, idx) => idx !== i));
  }

  function efectivoExacto() {
    onChange([{ id: crypto.randomUUID(), metodo: 'EFECTIVO', monto: Number(total.toFixed(2)) }]);
  }

  const pagoErrors = Object.entries(fieldErrors ?? {}).filter(([k]) => k.startsWith('pagos'));

  return (
    <div className="space-y-3 rounded-card border border-line bg-surface p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-ink">Pago</p>
        <Button type="button" variant="secondary" size="sm" onClick={efectivoExacto}>
          Efectivo exacto
        </Button>
      </div>

      {formError ? (
        <p className="rounded-control bg-danger-soft px-3 py-2 text-sm text-on-danger-soft">{formError}</p>
      ) : null}
      {pagoErrors.map(([k, v]) => (
        <p key={k} className="rounded-control bg-danger-soft px-3 py-2 text-xs text-on-danger-soft">
          {v}
        </p>
      ))}

      <div className="space-y-2">
        {pagos.map((p, i) => (
          <div key={p.id} className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-control border border-line-strong p-0.5" role="group">
              {METODOS.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => updateRow(i, { metodo: m })}
                  aria-pressed={p.metodo === m}
                  className={
                    'min-h-10 rounded px-3 text-xs font-semibold transition-colors ' +
                    (p.metodo === m
                      ? 'bg-primary text-on-primary'
                      : 'text-ink-muted hover:bg-surface-raised')
                  }
                >
                  {METODO_LABEL[m]}
                </button>
              ))}
            </div>
            <input
              type="number"
              inputMode="decimal"
              step="0.01"
              min={0}
              value={Number.isFinite(p.monto) ? p.monto : 0}
              onChange={(e) => updateRow(i, { monto: Number(e.target.value) })}
              className="h-11 w-28 rounded-control border border-line-strong px-2 text-right text-sm tabular-nums outline-none focus:border-primary focus:ring-1 focus:ring-ring/40"
            />
            <button
              type="button"
              onClick={() => removeRow(i)}
              className="inline-flex min-h-11 items-center rounded-control px-2 text-xs font-semibold text-danger hover:bg-danger-soft"
              aria-label="Quitar pago"
            >
              Quitar
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={addRow}
          className="inline-flex min-h-11 items-center rounded-control px-2 text-sm font-semibold text-ink-muted hover:bg-surface-raised hover:text-ink"
        >
          + Añadir pago
        </button>
      </div>

      <dl className="space-y-1 border-t border-line pt-2 text-sm">
        <div className="flex justify-between text-ink-muted">
          <dt>Total</dt>
          <dd className="tabular-nums">{money(total)}</dd>
        </div>
        <div className="flex justify-between text-ink-muted">
          <dt>Pagado</dt>
          <dd className="tabular-nums">{money(pagado)}</dd>
        </div>
        {falta > 0 ? (
          <div className="flex justify-between font-medium text-warning">
            <dt>Falta</dt>
            <dd className="tabular-nums">{money(falta)}</dd>
          </div>
        ) : (
          <div className="flex justify-between font-medium text-ink">
            <dt>Cambio</dt>
            <dd className="tabular-nums">{money(cambio)}</dd>
          </div>
        )}
      </dl>

      <ConfirmBtn disabled={pagos.length === 0} />
    </div>
  );
}
