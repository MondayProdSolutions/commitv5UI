'use client';

import { useActionState } from 'react';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/forms/Field';
import { inputClass } from '@/app/(app)/ventas/types';
import { abrirCajaAction } from './actions';
import type { FormState } from '@/app/(auth)/setup/actions';

const INITIAL: FormState = { ok: false };

export function AbrirCajaForm() {
  const [state, formAction, pending] = useActionState(abrirCajaAction, INITIAL);
  const errors = state.fieldErrors ?? {};

  return (
    <form action={formAction} className="max-w-sm space-y-4">
      {state.formError ? (
        <p className="rounded-control bg-danger-soft px-3 py-2 text-sm text-on-danger-soft">{state.formError}</p>
      ) : null}

      <Field label="Fondo de apertura" error={errors.fondoApertura}>
        <input
          name="fondoApertura"
          type="number"
          min={0}
          step="0.01"
          defaultValue={0}
          required
          className={inputClass}
        />
      </Field>

      <Button type="submit" variant="primary" pending={pending} pendingLabel="Abriendo…">
        Abrir caja
      </Button>
    </form>
  );
}
