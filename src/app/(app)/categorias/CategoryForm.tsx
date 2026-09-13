'use client';

import { useActionState, useState } from 'react';
import { Field } from '@/components/forms/Field';
import { Button } from '@/components/ui/Button';
import { CategoryIcon } from '@/components/CategoryIcon';
import { CATEGORY_ICON_KEYS } from '@/lib/catalog/category-icons';
import { CATEGORY_COLORS, categorySwatch } from '@/lib/catalog/category-style';
import { inputClass } from '@/app/(app)/ventas/types';
import {
  crearCategoriaAction,
  editarCategoriaAction,
  type CategoriaActionState,
} from './actions';

const INITIAL: CategoriaActionState = { ok: false };

export type RootOption = { id: string; nombre: string };

export type CategoryFormMode = 'crear-raiz' | 'crear-sub' | 'editar';

type CategoryInitial = {
  id: string;
  nombre: string;
  parentId: string | null;
  icono: string | null;
  color: string | null;
  orden: number;
};

function tituloFor(mode: CategoryFormMode): string {
  if (mode === 'editar') return 'Editar categoría';
  if (mode === 'crear-sub') return 'Nueva subcategoría';
  return 'Nueva categoría raíz';
}

const swatchBtn = (active: boolean): string =>
  'inline-flex h-10 w-10 items-center justify-center rounded-control border transition-colors ' +
  (active
    ? 'border-primary bg-primary-soft text-primary'
    : 'border-transparent text-ink-muted hover:bg-surface-raised');

function IconoPicker({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (v: string | null) => void;
}) {
  return (
    <div className="flex max-h-44 flex-wrap gap-1.5 overflow-y-auto rounded-control border border-line p-2">
      <button
        type="button"
        onClick={() => onChange(null)}
        aria-pressed={value === null}
        title="Sin icono"
        className={swatchBtn(value === null)}
      >
        <span className="text-xs font-medium text-ink-subtle">—</span>
      </button>
      {CATEGORY_ICON_KEYS.map((k) => (
        <button
          key={k}
          type="button"
          onClick={() => onChange(k)}
          aria-pressed={value === k}
          title={k}
          className={swatchBtn(value === k)}
        >
          <CategoryIcon name={k} width={22} height={22} />
        </button>
      ))}
    </div>
  );
}

function ColorPicker({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (v: string | null) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        onClick={() => onChange(null)}
        aria-pressed={value === null}
        className={
          'inline-flex h-10 items-center rounded-control border px-3 text-xs font-medium transition-colors ' +
          (value === null
            ? 'border-primary text-primary'
            : 'border-line text-ink-muted hover:bg-surface-raised')
        }
      >
        Sin color
      </button>
      {CATEGORY_COLORS.map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => onChange(c)}
          aria-pressed={value === c}
          title={c}
          className={
            'inline-flex h-10 w-10 items-center justify-center rounded-control border transition-colors ' +
            (value === c ? 'border-ink' : 'border-line hover:bg-surface-raised')
          }
        >
          <span className={'h-5 w-5 rounded-pill ' + categorySwatch(c).dot} />
        </button>
      ))}
    </div>
  );
}

function CategoryDialog({
  mode,
  roots,
  initial,
  parentId,
  onClose,
}: {
  mode: CategoryFormMode;
  roots: RootOption[];
  initial?: CategoryInitial;
  parentId?: string;
  onClose: () => void;
}) {
  const isEdit = mode === 'editar';
  const esSubcategoria = mode === 'crear-sub' || (isEdit && initial?.parentId != null);
  const defaultParent = initial?.parentId ?? parentId ?? '';
  const titulo = tituloFor(mode);

  const [state, formAction, pending] = useActionState<CategoriaActionState, FormData>(
    isEdit ? editarCategoriaAction : crearCategoriaAction,
    INITIAL,
  );
  const errors = state.fieldErrors ?? {};

  const [icono, setIcono] = useState<string | null>(initial?.icono ?? null);
  const [color, setColor] = useState<string | null>(initial?.color ?? null);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-card bg-surface p-6 shadow-pop">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{titulo}</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-ink-subtle hover:text-ink"
            aria-label="Cerrar"
          >
            ✕
          </button>
        </div>

        {state.ok ? (
          <div className="space-y-4">
            <p className="rounded-control bg-success-soft px-3 py-2 text-sm text-on-success-soft">
              {isEdit ? 'Cambios guardados correctamente.' : 'Categoría creada correctamente.'}
            </p>
            <Button type="button" variant="primary" className="w-full" onClick={onClose}>
              Cerrar
            </Button>
          </div>
        ) : (
          <form action={formAction} className="space-y-4">
            {isEdit ? <input type="hidden" name="id" value={initial!.id} /> : null}

            {state.formError ? (
              <p className="rounded-control bg-danger-soft px-3 py-2 text-sm text-on-danger-soft">{state.formError}</p>
            ) : null}

            <Field label="Nombre" error={errors.nombre}>
              <input
                name="nombre"
                defaultValue={initial?.nombre ?? ''}
                required
                minLength={2}
                autoFocus
                className={inputClass}
              />
            </Field>

            {esSubcategoria ? (
              <Field label="Categoría padre" error={errors.parentId}>
                <select name="parentId" defaultValue={defaultParent} required className={inputClass}>
                  <option value="" disabled>
                    Selecciona una categoría raíz
                  </option>
                  {roots.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.nombre}
                    </option>
                  ))}
                </select>
              </Field>
            ) : (
              <input type="hidden" name="parentId" value="" />
            )}

            <Field label="Icono (acceso rápido en Ventas)" error={errors.icono}>
              <input type="hidden" name="icono" value={icono ?? ''} />
              <IconoPicker value={icono} onChange={setIcono} />
            </Field>

            <Field label="Color" error={errors.color}>
              <input type="hidden" name="color" value={color ?? ''} />
              <ColorPicker value={color} onChange={setColor} />
            </Field>

            <Field label="Orden en el tablero" error={errors.orden}>
              <input
                name="orden"
                type="number"
                inputMode="numeric"
                min={0}
                step={1}
                defaultValue={initial?.orden ?? 0}
                className={inputClass}
              />
              <span className="mt-1 block text-xs text-ink-subtle">
                Menor número aparece primero. Empate: orden alfabético.
              </span>
            </Field>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="secondary" onClick={onClose}>
                Cancelar
              </Button>
              <Button
                type="submit"
                variant="primary"
                pending={pending}
                pendingLabel="Guardando…"
              >
                {isEdit ? 'Guardar cambios' : 'Crear'}
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

export function CategoryForm({
  mode,
  roots,
  initial,
  parentId,
  triggerLabel,
  triggerClassName,
}: {
  mode: CategoryFormMode;
  roots: RootOption[];
  initial?: CategoryInitial;
  parentId?: string;
  triggerLabel?: string;
  triggerClassName?: string;
}) {
  const [instance, setInstance] = useState(0);

  return (
    <>
      {triggerClassName ? (
        <button
          type="button"
          onClick={() => setInstance((n) => n + 1)}
          className={triggerClassName}
        >
          {triggerLabel ?? tituloFor(mode)}
        </button>
      ) : (
        <Button type="button" variant="primary" onClick={() => setInstance((n) => n + 1)}>
          {triggerLabel ?? tituloFor(mode)}
        </Button>
      )}

      {instance > 0 ? (
        <CategoryDialog
          key={instance}
          mode={mode}
          roots={roots}
          initial={initial}
          parentId={parentId}
          onClose={() => setInstance(0)}
        />
      ) : null}
    </>
  );
}
