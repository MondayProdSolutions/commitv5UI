'use client';

import { useActionState, useState } from 'react';
import { Field } from '@/components/forms/Field';
import { Button } from '@/components/ui/Button';
import { inputClass } from '@/app/(app)/ventas/types';
import type { FormState } from '@/app/(auth)/setup/actions';
import type { CategoryOption } from './categoryOptions';
import { crearProductoAction, editarProductoAction } from './actions';

const INITIAL: FormState = { ok: false };

type TaxRate = { id: string; nombre: string; tasa: number; esDefault: boolean };

type ProductInitial = {
  id: string;
  nombre: string;
  descripcion: string | null;
  categoryId: string | null;
  taxRateId: string;
};

type VariantDraft = {
  nombre: string;
  sku: string;
  codigoBarras: string;
  precioVenta: string;
  precioCompra: string;
  stockMinimo: string;
  stockInicial: string;
};

function emptyDraft(): VariantDraft {
  return {
    nombre: '',
    sku: '',
    codigoBarras: '',
    precioVenta: '',
    precioCompra: '',
    stockMinimo: '',
    stockInicial: '',
  };
}

function VariantFields({
  draft,
  onChange,
  withNombre,
  nombreError,
}: {
  draft: VariantDraft;
  onChange: (patch: Partial<VariantDraft>) => void;
  withNombre: boolean;
  nombreError?: string;
}) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {withNombre ? (
        <Field label="Nombre de la variante" error={nombreError}>
          <input
            value={draft.nombre}
            onChange={(e) => onChange({ nombre: e.target.value })}
            required
            className={inputClass}
          />
        </Field>
      ) : null}
      <Field label="SKU (opcional)">
        <input
          value={draft.sku}
          onChange={(e) => onChange({ sku: e.target.value })}
          className={inputClass}
        />
      </Field>
      <Field label="Código de barras (opcional)">
        <input
          value={draft.codigoBarras}
          onChange={(e) => onChange({ codigoBarras: e.target.value })}
          className={inputClass}
        />
      </Field>
      <Field label="Precio de venta (sin impuesto)">
        <input
          type="number"
          min="0"
          step="0.01"
          value={draft.precioVenta}
          onChange={(e) => onChange({ precioVenta: e.target.value })}
          required
          className={inputClass}
        />
      </Field>
      <Field label="Precio de compra (opcional)">
        <input
          type="number"
          min="0"
          step="0.01"
          value={draft.precioCompra}
          onChange={(e) => onChange({ precioCompra: e.target.value })}
          className={inputClass}
        />
      </Field>
      <Field label="Stock mínimo (0 = sin alerta)">
        <input
          type="number"
          min="0"
          step="1"
          value={draft.stockMinimo}
          onChange={(e) => onChange({ stockMinimo: e.target.value })}
          className={inputClass}
        />
      </Field>
      <Field label="Stock inicial">
        <input
          type="number"
          min="0"
          step="1"
          value={draft.stockInicial}
          onChange={(e) => onChange({ stockInicial: e.target.value })}
          className={inputClass}
        />
      </Field>
    </div>
  );
}

export function ProductForm({
  mode,
  taxRates,
  categories,
  initial,
}: {
  mode: 'crear' | 'editar';
  taxRates: TaxRate[];
  categories: CategoryOption[];
  initial?: ProductInitial;
}) {
  const isEdit = mode === 'editar';
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    isEdit ? editarProductoAction : crearProductoAction,
    INITIAL,
  );
  const errors = state.fieldErrors ?? {};
  const variantErrors = Object.entries(errors).filter(([k]) => k.startsWith('variantes'));

  const defaultTaxRateId =
    initial?.taxRateId ?? taxRates.find((t) => t.esDefault)?.id ?? taxRates[0]?.id ?? '';

  const [tipo, setTipo] = useState<'SIMPLE' | 'CON_VARIANTES'>('SIMPLE');
  const [simpleDraft, setSimpleDraft] = useState<VariantDraft>(emptyDraft());
  const [variantDrafts, setVariantDrafts] = useState<VariantDraft[]>([
    emptyDraft(),
    emptyDraft(),
  ]);

  const variantesPayload =
    tipo === 'SIMPLE'
      ? [
          {
            sku: simpleDraft.sku,
            codigoBarras: simpleDraft.codigoBarras,
            precioVenta: simpleDraft.precioVenta,
            precioCompra: simpleDraft.precioCompra,
            stockMinimo: simpleDraft.stockMinimo,
            stockInicial: simpleDraft.stockInicial,
          },
        ]
      : variantDrafts.map((d) => ({
          nombre: d.nombre,
          sku: d.sku,
          codigoBarras: d.codigoBarras,
          precioVenta: d.precioVenta,
          precioCompra: d.precioCompra,
          stockMinimo: d.stockMinimo,
          stockInicial: d.stockInicial,
        }));

  function patchSimple(patch: Partial<VariantDraft>) {
    setSimpleDraft((d) => ({ ...d, ...patch }));
  }
  function patchVariant(i: number, patch: Partial<VariantDraft>) {
    setVariantDrafts((rows) => rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  return (
    <form action={formAction} className="space-y-6">
      {isEdit ? <input type="hidden" name="id" value={initial!.id} /> : null}

      {state.formError ? (
        <p className="rounded-control bg-danger-soft px-3 py-2 text-sm text-on-danger-soft">{state.formError}</p>
      ) : null}
      {isEdit && state.ok ? (
        <p className="rounded-control bg-success-soft px-3 py-2 text-sm text-on-success-soft">
          Cambios guardados correctamente.
        </p>
      ) : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Nombre" error={errors.nombre}>
          <input
            name="nombre"
            defaultValue={initial?.nombre ?? ''}
            required
            minLength={2}
            className={inputClass}
          />
        </Field>
        <Field label="Categoría (opcional)" error={errors.categoryId}>
          <select
            name="categoryId"
            defaultValue={initial?.categoryId ?? ''}
            className={inputClass}
          >
            <option value="">Sin categoría</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Tasa de impuesto" error={errors.taxRateId}>
          <select name="taxRateId" defaultValue={defaultTaxRateId} required className={inputClass}>
            {taxRates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.nombre}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Descripción (opcional)" error={errors.descripcion}>
          <textarea
            name="descripcion"
            defaultValue={initial?.descripcion ?? ''}
            rows={2}
            maxLength={500}
            className={inputClass}
          />
        </Field>
      </div>

      {!isEdit ? (
        <div className="space-y-4 rounded-card border border-line bg-surface-raised p-4">
          <input type="hidden" name="tipo" value={tipo} />
          <input type="hidden" name="variantes" value={JSON.stringify(variantesPayload)} />

          <div className="flex flex-wrap gap-2">
            {(['SIMPLE', 'CON_VARIANTES'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTipo(t)}
                className={
                  'rounded-control px-3 py-1.5 text-sm font-medium ' +
                  (tipo === t
                    ? 'bg-primary text-on-primary'
                    : 'border border-line-strong bg-surface text-ink-muted hover:bg-surface-raised')
                }
              >
                {t === 'SIMPLE' ? 'Producto simple' : 'Producto con variantes'}
              </button>
            ))}
          </div>

          {variantErrors.length > 0 ? (
            <ul className="rounded-control bg-danger-soft px-3 py-2 text-sm text-on-danger-soft">
              {variantErrors.map(([k, v]) => (
                <li key={k}>{v}</li>
              ))}
            </ul>
          ) : null}

          {tipo === 'SIMPLE' ? (
            <div className="rounded-control border border-line bg-surface p-4">
              <h3 className="mb-3 text-sm font-semibold text-ink-muted">Datos de la variante</h3>
              <VariantFields draft={simpleDraft} onChange={patchSimple} withNombre={false} />
            </div>
          ) : (
            <div className="space-y-4">
              {variantDrafts.map((draft, i) => (
                <div key={i} className="rounded-control border border-line bg-surface p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-ink-muted">Variante {i + 1}</h3>
                    {variantDrafts.length > 2 ? (
                      <button
                        type="button"
                        onClick={() =>
                          setVariantDrafts((rows) => rows.filter((_, idx) => idx !== i))
                        }
                        className="text-xs font-medium text-danger hover:text-danger"
                      >
                        Quitar
                      </button>
                    ) : null}
                  </div>
                  <VariantFields
                    draft={draft}
                    onChange={(patch) => patchVariant(i, patch)}
                    withNombre
                  />
                </div>
              ))}
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setVariantDrafts((rows) => [...rows, emptyDraft()])}
              >
                Añadir variante
              </Button>
              <p className="text-xs text-ink-subtle">Mínimo 2 variantes con nombre único.</p>
            </div>
          )}
        </div>
      ) : null}

      <div className="flex justify-end">
        <Button type="submit" variant="primary" pending={pending} pendingLabel="Guardando…">
          {isEdit ? 'Guardar cambios' : 'Crear producto'}
        </Button>
      </div>
    </form>
  );
}
