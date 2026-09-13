'use client';

import { useActionState, useState } from 'react';
import type { FormState } from '@/app/(auth)/setup/actions';
import { Button } from '@/components/ui/Button';
import { prorateReturnLine } from '@/lib/sales/compute';
import { crearDevolucionAction } from './actions';
import { money } from './types';

type LineaDevolucion = {
  id: string;
  productoNombre: string;
  varianteNombre: string | null;
  cantidad: number;
  yaDevuelto: number;
  baseNeta: number;
  impuesto: number;
  total: number;
};

type MetodoReembolso = 'EFECTIVO' | 'TARJETA' | 'TRANSFERENCIA';

const INITIAL: FormState = { ok: false };

const METODOS: { value: MetodoReembolso; label: string }[] = [
  { value: 'EFECTIVO', label: 'Efectivo' },
  { value: 'TARJETA', label: 'Tarjeta' },
  { value: 'TRANSFERENCIA', label: 'Transferencia' },
];

const inputClass =
  'block rounded-control border border-line-strong px-3 py-2 text-sm shadow-sm outline-none focus:border-primary focus:ring-1 focus:ring-ring/40';

export function ReturnForm({
  saleId,
  folio,
  lineas,
}: {
  saleId: string;
  folio: string;
  lineas: LineaDevolucion[];
}) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    crearDevolucionAction,
    INITIAL,
  );

  // Estado tipo carrito: sobrevive a un error del servidor porque no deriva de `state`.
  const [cantidades, setCantidades] = useState<Record<string, number>>({});
  const [metodoReembolso, setMetodoReembolso] = useState<MetodoReembolso>('EFECTIVO');
  const [motivo, setMotivo] = useState('');

  const qtyOf = (l: LineaDevolucion): number => cantidades[l.id] ?? 0;
  const maxOf = (l: LineaDevolucion): number => l.cantidad - l.yaDevuelto;

  function setQty(l: LineaDevolucion, raw: string) {
    const n = Number.parseInt(raw, 10);
    const clamped = Number.isNaN(n) ? 0 : Math.max(0, Math.min(maxOf(l), n));
    setCantidades((prev) => ({ ...prev, [l.id]: clamped }));
  }

  // Estimado en vivo (solo informativo: el servidor recalcula con `prorateReturnLine`).
  function estimadoLinea(l: LineaDevolucion): number | null {
    const q = qtyOf(l);
    if (!Number.isInteger(q) || q <= 0 || q > maxOf(l)) return null;
    return prorateReturnLine(
      { cantidad: l.cantidad, baseNeta: l.baseNeta, impuesto: l.impuesto, total: l.total },
      q,
    ).total;
  }

  const seleccionadas = lineas.filter((l) => qtyOf(l) > 0);
  const totalEstimado = lineas.reduce((s, l) => s + (estimadoLinea(l) ?? 0), 0);
  const nadaSeleccionado = seleccionadas.length === 0;

  const payload = JSON.stringify({
    saleId,
    lineas: seleccionadas.map((l) => ({ saleLineId: l.id, cantidad: qtyOf(l) })),
    metodoReembolso,
    motivo,
  });

  // Los errores `lineas.N.cantidad` indexan el array del payload (solo líneas con
  // cantidad > 0); se remapean al id de línea para pintarlos junto a su input.
  const lineErrors: Record<string, string> = {};
  if (state.fieldErrors) {
    for (const [k, v] of Object.entries(state.fieldErrors)) {
      const m = /^lineas\.(\d+)\.(?:cantidad|saleLineId)$/.exec(k);
      if (m) {
        const sel = seleccionadas[Number(m[1])];
        if (sel) lineErrors[sel.id] = v;
      }
    }
  }
  const motivoError = state.fieldErrors?.motivo;
  const payloadError = state.fieldErrors?.payload;
  const lineasError = state.fieldErrors?.lineas;

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="payload" value={payload} />
      <p className="text-sm text-ink-subtle">Venta {folio}</p>

      <div className="overflow-x-auto rounded-card border border-line bg-surface">
        <table className="w-full min-w-[720px] border-collapse text-sm">
          <thead className="border-b border-line bg-surface-raised text-left text-ink-muted">
            <tr>
              <th className="px-4 py-3 font-medium">Producto</th>
              <th className="px-4 py-3 font-medium">Vendido</th>
              <th className="px-4 py-3 font-medium">Ya devuelto</th>
              <th className="px-4 py-3 font-medium">Cantidad a devolver</th>
              <th className="px-4 py-3 font-medium">Importe estimado a reembolsar</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {lineas.map((l) => {
              const est = estimadoLinea(l);
              const max = maxOf(l);
              return (
                <tr key={l.id}>
                  <td className="px-4 py-3">
                    {l.productoNombre}
                    {l.varianteNombre ? (
                      <span className="text-ink-subtle"> · {l.varianteNombre}</span>
                    ) : null}
                  </td>
                  <td className="px-4 py-3">{l.cantidad}</td>
                  <td className="px-4 py-3">{l.yaDevuelto}</td>
                  <td className="px-4 py-3">
                    <input
                      type="number"
                      min={0}
                      max={max}
                      step={1}
                      value={qtyOf(l)}
                      disabled={pending || max === 0}
                      onChange={(e) => setQty(l, e.target.value)}
                      className="w-24 rounded-control border border-line-strong px-2 py-1 text-sm shadow-sm outline-none focus:border-primary focus:ring-1 focus:ring-ring/40 disabled:bg-surface-raised"
                    />
                    {lineErrors[l.id] ? (
                      <p className="mt-1 text-xs text-on-danger-soft">{lineErrors[l.id]}</p>
                    ) : null}
                  </td>
                  <td className="px-4 py-3">{est != null ? money(est) : '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex justify-end text-sm font-semibold text-ink">
        Total estimado a reembolsar: {money(totalEstimado)}
      </div>

      <label className="block space-y-1">
        <span className="text-sm font-medium text-ink-muted">Método de reembolso</span>
        <select
          name="metodoReembolso"
          value={metodoReembolso}
          disabled={pending}
          onChange={(e) => setMetodoReembolso(e.target.value as MetodoReembolso)}
          className={inputClass}
        >
          {METODOS.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </select>
      </label>

      <label className="block space-y-1">
        <span className="text-sm font-medium text-ink-muted">Motivo</span>
        <textarea
          name="motivo"
          required
          minLength={3}
          rows={3}
          value={motivo}
          disabled={pending}
          onChange={(e) => setMotivo(e.target.value)}
          placeholder="Explica el motivo de la devolución"
          className={inputClass + ' w-full'}
        />
        {motivoError ? <p className="text-xs text-on-danger-soft">{motivoError}</p> : null}
      </label>

      {state.formError ? (
        <p className="rounded-control bg-danger-soft px-3 py-2 text-sm text-on-danger-soft">{state.formError}</p>
      ) : null}
      {lineasError ? (
        <p className="rounded-control bg-danger-soft px-3 py-2 text-sm text-on-danger-soft">{lineasError}</p>
      ) : null}
      {payloadError ? (
        <p className="rounded-control bg-danger-soft px-3 py-2 text-sm text-on-danger-soft">{payloadError}</p>
      ) : null}

      <Button
        type="submit"
        variant="primary"
        disabled={nadaSeleccionado}
        pending={pending}
        pendingLabel="Procesando…"
      >
        Confirmar devolución
      </Button>
    </form>
  );
}
