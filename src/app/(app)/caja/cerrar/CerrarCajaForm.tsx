'use client';

import { useActionState, useRef, useState } from 'react';
import { Field } from '@/components/forms/Field';
import { money, fmtFechaMX, inputClass } from '@/app/(app)/ventas/types';
import type { CashSessionLite } from '@/lib/cash/sessions';
import { cerrarCajaAction } from '../actions';
import type { FormState } from '@/app/(auth)/setup/actions';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';

const INITIAL: FormState = { ok: false };

export function CerrarCajaForm({ session }: { session: CashSessionLite }) {
  const [state, formAction, pending] = useActionState(cerrarCajaAction, INITIAL);
  const errors = state.fieldErrors ?? {};
  const [confirmOpen, setConfirmOpen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  function handleTriggerClick() {
    // El "efectivo contado" es obligatorio — se valida antes de abrir el
    // diálogo para no confirmar un cierre que el navegador rechazaría de
    // todos modos por campos incompletos.
    if (formRef.current?.reportValidity()) {
      setConfirmOpen(true);
    }
  }

  return (
    <form
      ref={formRef}
      action={formAction}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && e.target instanceof HTMLInputElement) {
          e.preventDefault();
          handleTriggerClick();
        }
      }}
      className="max-w-sm space-y-4"
    >
      <div className="rounded-card border border-line bg-surface p-4 text-sm text-ink-muted">
        <p>Fondo de apertura: {money(session.fondoApertura)}</p>
        <p>Apertura: {fmtFechaMX(session.abiertaEn)}</p>
      </div>

      {state.formError ? (
        <p className="rounded-control bg-danger-soft px-3 py-2 text-sm text-on-danger-soft">{state.formError}</p>
      ) : null}

      <p className="rounded-control bg-warning-soft px-3 py-2 text-sm text-on-warning-soft">
        Cuenta el efectivo antes de confirmar; verás la diferencia después.
      </p>

      <Field label="Efectivo contado en el cajón" error={errors.efectivoContado}>
        <input
          name="efectivoContado"
          type="number"
          min={0}
          step="0.01"
          required
          className={inputClass}
        />
      </Field>

      <Field label="Nota de cierre (opcional)" error={errors.notaCierre}>
        <textarea name="notaCierre" rows={3} className={inputClass} />
      </Field>

      <Button
        type="button"
        variant="primary"
        pending={pending}
        pendingLabel="Confirmando…"
        onClick={handleTriggerClick}
      >
        Confirmar cierre
      </Button>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="¿Cerrar la caja?"
        description="Se calculará el arqueo con el efectivo contado que capturaste. Esta acción no se puede deshacer."
        confirmLabel="Cerrar caja"
        onConfirm={() => {
          setConfirmOpen(false);
          formRef.current?.requestSubmit();
        }}
      />
    </form>
  );
}
