'use client';

import { useActionState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/forms/Field';
import { inputClass } from '@/app/(app)/ventas/types';
import { registrarMovimientoCajaAction } from './actions';
import type { FormState } from '@/app/(auth)/setup/actions';

const INITIAL: FormState = { ok: false };

const TIPO_LABEL: Record<'RETIRO' | 'INGRESO', string> = {
  RETIRO: 'Retiro',
  INGRESO: 'Ingreso',
};

export function CashMovementForm({ tipo }: { tipo: 'RETIRO' | 'INGRESO' }) {
  const [state, formAction, pending] = useActionState(registrarMovimientoCajaAction, INITIAL);
  const errors = state.fieldErrors ?? {};
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok) formRef.current?.reset();
  }, [state]);

  return (
    <form
      ref={formRef}
      action={formAction}
      className="space-y-3 rounded-card border border-line bg-surface p-4"
    >
      <h3 className="text-sm font-semibold text-ink-muted">{TIPO_LABEL[tipo]}</h3>
      <input type="hidden" name="tipo" value={tipo} />

      {state.formError ? (
        <p className="rounded-control bg-danger-soft px-3 py-2 text-sm text-on-danger-soft">{state.formError}</p>
      ) : null}

      {state.ok ? (
        <p className="rounded-control bg-success-soft px-3 py-2 text-sm text-on-success-soft">
          Movimiento registrado
        </p>
      ) : null}

      <Field label="Monto" error={errors.monto}>
        <input name="monto" type="number" min={0.01} step="0.01" required className={inputClass} />
      </Field>

      <Field label="Motivo" error={errors.motivo}>
        <input name="motivo" type="text" required className={inputClass} />
      </Field>

      <Button
        type="submit"
        variant="secondary"
        pending={pending}
        pendingLabel="Registrando…"
      >
        {`Registrar ${TIPO_LABEL[tipo].toLowerCase()}`}
      </Button>
    </form>
  );
}
