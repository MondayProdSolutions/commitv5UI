'use client';

import { useActionState, useRef, useState } from 'react';
import type { FormState } from '@/app/(auth)/setup/actions';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { archivarClienteAction, restaurarClienteAction } from './actions';

const INITIAL: FormState = { ok: false };

export function ClienteAdminActions({
  id,
  archivado,
}: {
  id: string;
  archivado: boolean;
}) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    archivado ? restaurarClienteAction : archivarClienteAction,
    INITIAL,
  );
  const [confirmOpen, setConfirmOpen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form ref={formRef} action={formAction} className="space-y-2">
      <input type="hidden" name="id" value={id} />
      {state.formError ? (
        <p className="rounded-control bg-danger-soft px-3 py-2 text-sm text-on-danger-soft">{state.formError}</p>
      ) : null}
      <Button
        type="button"
        variant={archivado ? 'primary' : 'danger-solid'}
        pending={pending}
        pendingLabel="Aplicando…"
        onClick={
          archivado
            ? () => formRef.current?.requestSubmit()
            : () => setConfirmOpen(true)
        }
      >
        {archivado ? 'Restaurar cliente' : 'Archivar cliente'}
      </Button>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="¿Archivar este cliente?"
        description="Dejará de aparecer en los listados activos. Podrás restaurarlo después."
        confirmLabel="Archivar cliente"
        onConfirm={() => {
          setConfirmOpen(false);
          formRef.current?.requestSubmit();
        }}
        pending={pending}
      />
    </form>
  );
}
