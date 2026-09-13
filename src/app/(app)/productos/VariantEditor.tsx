'use client';

import { useActionState, useRef, useState } from 'react';
import { Field } from '@/components/forms/Field';
import type { FormState } from '@/app/(auth)/setup/actions';
import type { ProductDetail, VariantDetail } from '@/lib/catalog/products';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { inputClass } from '@/app/(app)/ventas/types';
import {
  editarVarianteAction,
  agregarVarianteAction,
  convertirAVariantesAction,
  archivarVarianteAction,
  disponibilidadVarianteAction,
} from './actions';

const INITIAL: FormState = { ok: false };

const MOV_LABEL: Record<string, string> = {
  ENTRADA: 'Entrada',
  SALIDA: 'Salida',
  AJUSTE: 'Ajuste',
  VENTA: 'Venta',
  DEVOLUCION: 'Devolución',
};

function money(n: number): string {
  return `$${n.toFixed(2)}`;
}

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

function DraftFields({
  draft,
  onChange,
}: {
  draft: VariantDraft;
  onChange: (patch: Partial<VariantDraft>) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <Field label="Nombre de la variante">
        <input
          value={draft.nombre}
          onChange={(e) => onChange({ nombre: e.target.value })}
          required
          className={inputClass}
        />
      </Field>
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

function FormMessages({ state }: { state: FormState }) {
  return (
    <>
      {state.formError ? (
        <p className="rounded-control bg-danger-soft px-3 py-2 text-sm text-on-danger-soft">{state.formError}</p>
      ) : null}
      {state.fieldErrors
        ? Object.entries(state.fieldErrors).map(([k, v]) => (
            <p key={k} className="text-sm text-danger">
              {v}
            </p>
          ))
        : null}
      {state.ok ? (
        <p className="rounded-control bg-success-soft px-3 py-2 text-sm text-on-success-soft">Guardado.</p>
      ) : null}
    </>
  );
}

function VariantCard({
  producto,
  variant,
  conVariantes,
  canEditar,
  canArchivar,
}: {
  producto: ProductDetail;
  variant: VariantDetail;
  conVariantes: boolean;
  canEditar: boolean;
  canArchivar: boolean;
}) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    editarVarianteAction,
    INITIAL,
  );
  const [dispState, dispAction, dispPending] = useActionState<FormState, FormData>(
    disponibilidadVarianteAction,
    INITIAL,
  );
  const [archState, archAction, archPending] = useActionState<FormState, FormData>(
    archivarVarianteAction,
    INITIAL,
  );
  const [confirmOpen, setConfirmOpen] = useState(false);
  const archFormRef = useRef<HTMLFormElement>(null);

  const puedeArchivar = conVariantes && canArchivar && !variant.archivada;

  return (
    <div
      className={
        'rounded-card border p-4 ' +
        (variant.archivada ? 'border-line bg-surface-raised opacity-70' : 'border-line bg-surface')
      }
    >
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="font-semibold text-ink">
          {variant.nombre ?? 'Variante única'}
        </span>
        {variant.esDefault ? <Badge tone="neutral">Predeterminada</Badge> : null}
        {variant.archivada ? <Badge tone="neutral">Archivada</Badge> : null}
      </div>

      <form action={formAction} className="space-y-3">
        <input type="hidden" name="id" value={variant.id} />
        <input type="hidden" name="productId" value={producto.id} />

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {conVariantes ? (
            <Field label="Nombre">
              <input
                name="nombre"
                defaultValue={variant.nombre ?? ''}
                required
                disabled={!canEditar || variant.archivada}
                className={inputClass}
              />
            </Field>
          ) : null}
          <Field label="SKU">
            <input
              name="sku"
              defaultValue={variant.sku ?? ''}
              disabled={!canEditar || variant.archivada}
              className={inputClass}
            />
          </Field>
          <Field label="Código de barras">
            <input
              name="codigoBarras"
              defaultValue={variant.codigoBarras ?? ''}
              disabled={!canEditar || variant.archivada}
              className={inputClass}
            />
          </Field>
          <Field label="Precio de venta (sin impuesto)">
            <input
              name="precioVenta"
              type="number"
              min="0"
              step="0.01"
              defaultValue={variant.precioVenta}
              required
              disabled={!canEditar || variant.archivada}
              className={inputClass}
            />
          </Field>
          <Field label="Precio con impuesto (referencia)">
            <input
              value={money(variant.precioConImpuesto)}
              readOnly
              disabled
              className={inputClass + ' bg-surface-raised text-ink-subtle'}
            />
          </Field>
          <Field label="Precio de compra">
            <input
              name="precioCompra"
              type="number"
              min="0"
              step="0.01"
              defaultValue={variant.precioCompra}
              required
              disabled={!canEditar || variant.archivada}
              className={inputClass}
            />
          </Field>
          <Field label="Stock (ajústalo en Inventario)">
            <input
              value={variant.stock}
              readOnly
              disabled
              className={inputClass + ' bg-surface-raised text-ink-subtle'}
            />
          </Field>
          <Field label="Stock mínimo (0 = sin alerta)">
            <input
              name="stockMinimo"
              type="number"
              min="0"
              step="1"
              defaultValue={variant.stockMinimo}
              required
              disabled={!canEditar || variant.archivada}
              className={inputClass}
            />
          </Field>
        </div>

        <label className="flex items-center gap-2 text-sm font-medium text-ink-muted">
          <input
            type="checkbox"
            name="disponible"
            value="1"
            defaultChecked={variant.disponible}
            disabled={!canEditar || variant.archivada}
            className="h-4 w-4 rounded border-line-strong"
          />
          Disponible para la venta
        </label>

        <FormMessages state={state} />

        {canEditar && !variant.archivada ? (
          <Button type="submit" variant="primary" pending={pending} pendingLabel="Guardando…">
            Guardar variante
          </Button>
        ) : null}
      </form>

      {(canEditar || puedeArchivar) && !variant.archivada ? (
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3">
          {canEditar ? (
            <form action={dispAction}>
              <input type="hidden" name="variantId" value={variant.id} />
              <input type="hidden" name="productId" value={producto.id} />
              <input type="hidden" name="disponible" value={variant.disponible ? '0' : '1'} />
              <Button
                type="submit"
                variant="secondary"
                size="sm"
                pending={dispPending}
                pendingLabel="Aplicando…"
              >
                {variant.disponible ? 'Marcar no disponible' : 'Marcar disponible'}
              </Button>
            </form>
          ) : null}
          {puedeArchivar ? (
            <form action={archAction} ref={archFormRef}>
              <input type="hidden" name="variantId" value={variant.id} />
              <input type="hidden" name="productId" value={producto.id} />
              <Button
                type="button"
                variant="danger"
                size="sm"
                pending={archPending}
                pendingLabel="Archivando…"
                onClick={() => setConfirmOpen(true)}
              >
                Archivar variante
              </Button>
            </form>
          ) : null}
        </div>
      ) : null}

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="¿Archivar esta variante?"
        description="Podrás seguir consultando su historial. Esta acción se puede revertir restaurando la variante."
        confirmLabel="Archivar variante"
        pending={archPending}
        onConfirm={() => {
          setConfirmOpen(false);
          archFormRef.current?.requestSubmit();
        }}
      />

      {dispState.formError ? (
        <p className="mt-2 text-xs text-on-danger-soft">{dispState.formError}</p>
      ) : null}
      {archState.formError ? (
        <p className="mt-2 text-xs text-on-danger-soft">{archState.formError}</p>
      ) : null}

      {variant.movimientos.length > 0 ? (
        <details className="mt-3">
          <summary className="cursor-pointer text-xs font-medium text-ink-subtle hover:text-ink">
            Últimos movimientos ({variant.movimientos.length})
          </summary>
          <ul className="mt-2 space-y-1 text-xs text-ink-muted">
            {variant.movimientos.map((m) => (
              <li key={m.id} className="flex flex-wrap gap-x-2">
                <span className="text-ink-subtle">
                  {new Date(m.createdAt).toLocaleString('es-ES')}
                </span>
                <span className="font-medium">{MOV_LABEL[m.tipo] ?? m.tipo}</span>
                <span>
                  {m.cantidad > 0 ? '+' : ''}
                  {m.cantidad}
                </span>
                <span className="text-ink-subtle">
                  ({m.stockPrevio} → {m.stockNuevo})
                </span>
                <span className="text-ink-subtle">{m.motivo}</span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}

function AddVariantForm({ productId }: { productId: string }) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    agregarVarianteAction,
    INITIAL,
  );
  const [draft, setDraft] = useState<VariantDraft>(emptyDraft());

  return (
    <form action={formAction} className="space-y-3 rounded-card border border-line bg-surface p-4">
      <h3 className="text-sm font-semibold text-ink-muted">Añadir variante</h3>
      <input type="hidden" name="productId" value={productId} />
      <input type="hidden" name="nombre" value={draft.nombre} />
      <input type="hidden" name="sku" value={draft.sku} />
      <input type="hidden" name="codigoBarras" value={draft.codigoBarras} />
      <input type="hidden" name="precioVenta" value={draft.precioVenta} />
      <input type="hidden" name="precioCompra" value={draft.precioCompra} />
      <input type="hidden" name="stockMinimo" value={draft.stockMinimo} />
      <input type="hidden" name="stockInicial" value={draft.stockInicial} />

      <DraftFields draft={draft} onChange={(patch) => setDraft((d) => ({ ...d, ...patch }))} />
      <FormMessages state={state} />
      <Button type="submit" variant="primary" pending={pending} pendingLabel="Añadiendo…">
        Añadir variante
      </Button>
    </form>
  );
}

function ConvertForm({ productId }: { productId: string }) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    convertirAVariantesAction,
    INITIAL,
  );
  const [defaultNombre, setDefaultNombre] = useState('');
  const [nuevas, setNuevas] = useState<VariantDraft[]>([emptyDraft()]);

  return (
    <form action={formAction} className="space-y-4 rounded-card border border-line bg-surface p-4">
      <div>
        <h3 className="text-sm font-semibold text-ink-muted">Convertir a producto con variantes</h3>
        <p className="text-xs text-ink-subtle">
          Asigna un nombre a la variante actual y añade al menos una variante nueva.
        </p>
      </div>
      <input type="hidden" name="productId" value={productId} />
      <input type="hidden" name="defaultNombre" value={defaultNombre} />
      <input type="hidden" name="nuevas" value={JSON.stringify(nuevas)} />

      <Field label="Nombre de la variante actual">
        <input
          value={defaultNombre}
          onChange={(e) => setDefaultNombre(e.target.value)}
          required
          className={inputClass}
        />
      </Field>

      <div className="space-y-4">
        {nuevas.map((draft, i) => (
          <div key={i} className="rounded-control border border-line p-3">
            <div className="mb-2 flex items-center justify-between">
              <h4 className="text-xs font-semibold text-ink-muted">Variante nueva {i + 1}</h4>
              {nuevas.length > 1 ? (
                <button
                  type="button"
                  onClick={() => setNuevas((rows) => rows.filter((_, idx) => idx !== i))}
                  className="text-xs font-medium text-danger hover:text-danger"
                >
                  Quitar
                </button>
              ) : null}
            </div>
            <DraftFields
              draft={draft}
              onChange={(patch) =>
                setNuevas((rows) => rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)))
              }
            />
          </div>
        ))}
        <button
          type="button"
          onClick={() => setNuevas((rows) => [...rows, emptyDraft()])}
          className="rounded-control border border-line-strong bg-surface px-3 py-1.5 text-sm font-medium text-ink-muted hover:bg-surface-raised"
        >
          Añadir otra variante
        </button>
      </div>

      <FormMessages state={state} />
      <Button type="submit" variant="primary" pending={pending} pendingLabel="Convirtiendo…">
        Convertir
      </Button>
    </form>
  );
}

export function VariantEditor({
  producto,
  canEditar,
  canArchivar,
}: {
  producto: ProductDetail;
  canEditar: boolean;
  canArchivar: boolean;
}) {
  const conVariantes = producto.tipo === 'CON_VARIANTES';

  return (
    <div className="space-y-4">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-subtle">Variantes</h2>

      <div className="space-y-4">
        {producto.variants.map((v) => (
          <VariantCard
            key={v.id}
            producto={producto}
            variant={v}
            conVariantes={conVariantes}
            canEditar={canEditar}
            canArchivar={canArchivar}
          />
        ))}
      </div>

      {canEditar && conVariantes ? <AddVariantForm productId={producto.id} /> : null}
      {canEditar && !conVariantes ? <ConvertForm productId={producto.id} /> : null}
    </div>
  );
}
