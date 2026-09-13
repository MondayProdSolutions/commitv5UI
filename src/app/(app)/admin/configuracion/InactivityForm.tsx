'use client';

import { useActionState } from 'react';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/forms/Field';
import { inputClass } from '@/app/(app)/ventas/types';
import { updateInactivityAction } from './actions';
import type { FormState } from '@/app/(auth)/setup/actions';

const INITIAL: FormState = { ok: false };

export default function InactivityForm({ defaultMinutes }: { defaultMinutes: number }) {
  const [state, formAction, pending] = useActionState(updateInactivityAction, INITIAL);
  const errors = state.fieldErrors ?? {};

  return (
    <form action={formAction} className="space-y-4">
      {state.formError ? (
        <p className="rounded-control bg-danger-soft px-3 py-2 text-sm text-on-danger-soft">{state.formError}</p>
      ) : null}

      {state.ok ? (
        <p className="rounded-control bg-success-soft px-3 py-2 text-sm text-on-success-soft">
          Configuración actualizada
        </p>
      ) : null}

      <Field label="Minutos sin actividad" error={errors.minutes}>
        <input
          name="minutes"
          type="number"
          min={1}
          max={240}
          defaultValue={defaultMinutes}
          required
          className={inputClass}
        />
      </Field>

      <p className="text-sm text-ink-subtle">
        Los usuarios cerrarán sesión tras este tiempo sin actividad. Verán un aviso 1 minuto antes.
      </p>

      <Button type="submit" variant="primary" pending={pending} pendingLabel="Guardando…">
        Guardar
      </Button>
    </form>
  );
}
