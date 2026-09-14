'use client';

import { useActionState } from 'react';
import { Field } from '@/components/forms/Field';
import { Button } from '@/components/ui/Button';
import { inputClass } from '@/app/(app)/ventas/types';
import { createPlanAction, type CreatePlanState } from './actions';

const INITIAL: CreatePlanState = { ok: false };

export function PlanForm() {
  const [state, formAction, pending] = useActionState(createPlanAction, INITIAL);

  return (
    <form action={formAction} className="space-y-4">
      <h2 className="text-base font-semibold text-ink">Crear plan</h2>

      {state.error ? (
        <p className="rounded-control bg-danger-soft px-3 py-2 text-sm text-on-danger-soft">{state.error}</p>
      ) : null}

      <Field label="Nombre">
        <input name="nombre" type="text" required className={inputClass} />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Máximo de usuarios">
          <input name="maxUsuarios" type="number" min={1} required className={inputClass} />
        </Field>
        <Field label="Máximo de sucursales">
          <input name="maxSucursales" type="number" min={1} required className={inputClass} />
        </Field>
      </div>

      <Button type="submit" variant="primary" pending={pending} pendingLabel="Creando…">
        Crear plan
      </Button>
    </form>
  );
}
