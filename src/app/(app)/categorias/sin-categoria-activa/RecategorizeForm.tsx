'use client';

import { useActionState } from 'react';
import { Button } from '@/components/ui/Button';
import { recategorizarProductoAction, type CategoriaActionState } from '../actions';

const INITIAL: CategoriaActionState = { ok: false };

const selectClass =
  'rounded-control border border-line-strong px-2 py-1.5 text-sm shadow-sm outline-none focus:border-primary focus:ring-1 focus:ring-ring';

type Option = { id: string; nombre: string };

export function RecategorizeForm({
  productId,
  categories,
}: {
  productId: string;
  categories: Option[];
}) {
  const [state, formAction, pending] = useActionState<CategoriaActionState, FormData>(
    recategorizarProductoAction,
    INITIAL,
  );

  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="productId" value={productId} />
      <select name="categoryId" defaultValue="" required className={selectClass}>
        <option value="" disabled>
          Selecciona categoría
        </option>
        {categories.map((c) => (
          <option key={c.id} value={c.id}>
            {c.nombre}
          </option>
        ))}
      </select>
      <Button
        type="submit"
        variant="secondary"
        size="sm"
        pending={pending}
        pendingLabel="Cambiando…"
      >
        Cambiar categoría
      </Button>
      {state.ok ? <span className="text-xs text-on-success-soft">Actualizado</span> : null}
      {state.formError ? <span className="text-xs text-on-danger-soft">{state.formError}</span> : null}
    </form>
  );
}
