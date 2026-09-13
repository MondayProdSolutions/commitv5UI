'use client';

import { useActionState, useRef, useState } from 'react';
import type { FormState } from '@/app/(auth)/setup/actions';
import { cancelarVentaAction } from './actions';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';

const INITIAL: FormState = { ok: false };

export function CancelSaleForm({ saleId }: { saleId: string }) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    cancelarVentaAction,
    INITIAL,
  );
  const [confirmOpen, setConfirmOpen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  function handleTriggerClick() {
    // Valida el formulario (el `motivo` es obligatorio) ANTES de abrir el
    // diálogo, igual que el submit nativo validaba antes de disparar el
    // confirm() — así el usuario no ve el diálogo de confirmación si aún
    // le falta escribir el motivo.
    if (formRef.current?.reportValidity()) {
      setConfirmOpen(true);
    }
  }

  return (
    <form ref={formRef} action={formAction} className="space-y-3">
      <input type="hidden" name="saleId" value={saleId} />
      <label className="block space-y-1">
        <span className="text-sm font-medium text-ink-muted">Motivo de la cancelación</span>
        <textarea
          name="motivo"
          required
          rows={3}
          className="block w-full rounded-control border border-line-strong px-3 py-2 text-sm shadow-sm outline-none focus:border-primary focus:ring-1 focus:ring-ring/40"
          placeholder="Explica por qué se cancela esta venta"
        />
      </label>
      {state.formError ? (
        <p className="rounded-control bg-danger-soft px-3 py-2 text-sm text-on-danger-soft">{state.formError}</p>
      ) : null}
      {state.ok ? (
        <p className="rounded-control bg-success-soft px-3 py-2 text-sm text-on-success-soft">
          Venta cancelada. El stock fue reintegrado.
        </p>
      ) : null}
      <Button
        type="button"
        variant="danger-solid"
        disabled={pending || state.ok}
        pending={pending}
        pendingLabel="Cancelando…"
        onClick={handleTriggerClick}
      >
        Cancelar venta
      </Button>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="¿Cancelar esta venta?"
        description="Se reintegrará el stock de todos los productos de esta venta. Esta acción no se puede deshacer."
        confirmLabel="Cancelar venta"
        onConfirm={() => {
          setConfirmOpen(false);
          formRef.current?.requestSubmit();
        }}
      />
    </form>
  );
}
