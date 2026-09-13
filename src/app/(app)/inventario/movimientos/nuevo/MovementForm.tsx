'use client';

import { useActionState, useState } from 'react';
import { Field } from '@/components/forms/Field';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import type { SearchHit } from '@/lib/catalog/search';
import type { FormState } from '@/app/(auth)/setup/actions';
import { inputClass } from '@/app/(app)/ventas/types';
import {
  registrarMovimientoAction,
  buscarVariantesAction,
  type BuscarVariantesState,
} from '../actions';

export type MovementTipo = 'ENTRADA' | 'SALIDA' | 'AJUSTE';

const TIPO_LABEL: Record<MovementTipo, string> = {
  ENTRADA: 'Entrada',
  SALIDA: 'Salida',
  AJUSTE: 'Ajuste',
};

const FORM_INITIAL: FormState = { ok: false };
const SEARCH_INITIAL: BuscarVariantesState = { ok: false, hits: [] };

export function MovementForm({
  allowedTipos,
  initialVariantId,
}: {
  allowedTipos: MovementTipo[];
  initialVariantId?: string;
}) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    registrarMovimientoAction,
    FORM_INITIAL,
  );
  const [searchState, searchAction, searchPending] = useActionState<BuscarVariantesState, FormData>(
    buscarVariantesAction,
    SEARCH_INITIAL,
  );

  const [picked, setPicked] = useState<SearchHit | null>(null);
  const [tipo, setTipo] = useState<MovementTipo>(allowedTipos[0] ?? 'ENTRADA');
  const [valor, setValor] = useState('');

  const errors = state.fieldErrors ?? {};
  const variantId = picked?.variantId ?? initialVariantId ?? '';
  const stockActual = picked?.stock ?? null;

  const valorNum = Number(valor);
  const ajusteValido = tipo === 'AJUSTE' && valor !== '' && Number.isFinite(valorNum);
  const nuevoStock = ajusteValido ? valorNum : null;
  const delta =
    ajusteValido && stockActual != null ? valorNum - stockActual : null;

  return (
    <div className="space-y-6">
      {/* Buscador de variante — formulario independiente (hermano, no anidado) */}
      <Card className="space-y-3">
        <form action={searchAction} className="flex items-end gap-2">
          <label className="block flex-1 space-y-1">
            <span className="text-sm font-medium text-ink-muted">Buscar variante</span>
            <input
              name="q"
              placeholder="Nombre, SKU o código de barras"
              className={inputClass}
            />
          </label>
          <Button type="submit" variant="primary" pending={searchPending} pendingLabel="Buscando…">Buscar</Button>
        </form>

        {searchState.ok && searchState.hits.length === 0 ? (
          <p className="text-sm text-ink-subtle">Sin resultados.</p>
        ) : null}

        {searchState.hits.length > 0 ? (
          <ul className="divide-y divide-line rounded-control border border-line">
            {searchState.hits.map((hit) => (
              <li key={hit.variantId}>
                <button
                  type="button"
                  onClick={() => setPicked(hit)}
                  className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-surface-raised"
                >
                  <span>
                    {hit.varianteNombre
                      ? `${hit.productoNombre} · ${hit.varianteNombre}`
                      : hit.productoNombre}
                    {hit.sku ? <span className="text-ink-subtle"> · {hit.sku}</span> : null}
                  </span>
                  <span className="tabular-nums text-ink-subtle">Stock: {hit.stock}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}

        {picked ? (
          <p className="rounded-control bg-surface-raised px-3 py-2 text-sm text-ink-muted">
            Variante seleccionada:{' '}
            <span className="font-medium">
              {picked.varianteNombre
                ? `${picked.productoNombre} · ${picked.varianteNombre}`
                : picked.productoNombre}
            </span>{' '}
            — stock actual <span className="font-medium tabular-nums">{picked.stock}</span>
          </p>
        ) : initialVariantId ? (
          <p className="rounded-control bg-surface-raised px-3 py-2 text-sm text-ink-muted">
            Variante preseleccionada (ID <code>{initialVariantId}</code>). Búscala arriba para ver su
            stock actual.
          </p>
        ) : null}
      </Card>

      {/* Formulario de registro */}
      <form action={formAction} className="space-y-4 rounded-card border border-line bg-surface p-4">
        <input type="hidden" name="variantId" value={variantId} />

        {state.formError ? (
          <p className="rounded-control bg-danger-soft px-3 py-2 text-sm text-on-danger-soft">{state.formError}</p>
        ) : null}
        {errors.variantId ? (
          <p className="rounded-control bg-danger-soft px-3 py-2 text-sm text-on-danger-soft">{errors.variantId}</p>
        ) : null}

        <Field label="Tipo de movimiento" error={errors.tipo}>
          <select
            name="tipo"
            value={tipo}
            onChange={(e) => setTipo(e.target.value as MovementTipo)}
            className={inputClass}
          >
            {allowedTipos.map((t) => (
              <option key={t} value={t}>
                {TIPO_LABEL[t]}
              </option>
            ))}
          </select>
        </Field>

        <Field
          label={tipo === 'AJUSTE' ? 'Stock objetivo' : 'Cantidad'}
          error={errors.valor}
        >
          <input
            name="valor"
            type="number"
            inputMode="numeric"
            step="1"
            min={tipo === 'AJUSTE' ? 0 : 1}
            required
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            className={inputClass}
          />
        </Field>

        {tipo === 'AJUSTE' ? (
          <p className="text-sm text-ink-muted">
            {stockActual == null
              ? 'Selecciona una variante para ver el ajuste calculado.'
              : nuevoStock == null
                ? `Actual: ${stockActual}`
                : `Actual: ${stockActual} → Nuevo: ${nuevoStock} (Δ ${
                    delta != null && delta > 0 ? '+' : ''
                  }${delta ?? 0})`}
          </p>
        ) : null}

        <Field label="Motivo" error={errors.motivo}>
          <textarea name="motivo" required rows={2} className={inputClass} />
        </Field>

        {tipo === 'ENTRADA' ? (
          <Field label="Costo unitario (opcional)" error={errors.costoUnitario}>
            <input
              name="costoUnitario"
              type="number"
              inputMode="decimal"
              step="0.01"
              min={0}
              className={inputClass}
            />
          </Field>
        ) : null}

        <div className="rounded-control bg-surface-raised px-3 py-2 text-sm text-ink-muted">
          <p className="font-medium">Resumen</p>
          <p>
            {TIPO_LABEL[tipo]} ·{' '}
            {picked
              ? picked.varianteNombre
                ? `${picked.productoNombre} · ${picked.varianteNombre}`
                : picked.productoNombre
              : variantId
                ? `variante ${variantId}`
                : 'sin variante seleccionada'}{' '}
            · {tipo === 'AJUSTE' ? 'stock objetivo' : 'cantidad'} {valor || '—'}
          </p>
        </div>

        <Button type="submit" variant="primary" className="w-full" disabled={!variantId} pending={pending} pendingLabel="Registrando…">Registrar movimiento</Button>
      </form>
    </div>
  );
}
