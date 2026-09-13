'use client';

import { useActionState, useRef, useState } from 'react';
import type { FormState } from '@/app/(auth)/setup/actions';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import {
  archivarProductoAction,
  restaurarProductoAction,
  disponibilidadProductoAction,
} from './actions';

const INITIAL: FormState = { ok: false };

export function ArchiveRestoreForm({
  productId,
  archivado,
}: {
  productId: string;
  archivado: boolean;
}) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    archivado ? restaurarProductoAction : archivarProductoAction,
    INITIAL,
  );
  const [confirmOpen, setConfirmOpen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form ref={formRef} action={formAction} className="space-y-2">
      <input type="hidden" name="id" value={productId} />
      {state.formError ? (
        <p className="rounded-control bg-danger-soft px-3 py-2 text-sm text-on-danger-soft">{state.formError}</p>
      ) : null}
      <Button
        type="button"
        variant={archivado ? 'primary' : 'danger-solid'}
        pending={pending}
        pendingLabel="Aplicando…"
        onClick={
          archivado ? () => formRef.current?.requestSubmit() : () => setConfirmOpen(true)
        }
      >
        {archivado ? 'Restaurar producto' : 'Archivar producto'}
      </Button>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="¿Archivar este producto?"
        description="Se archivarán también todas sus variantes. Podrás restaurarlo después."
        confirmLabel="Archivar producto"
        pending={pending}
        onConfirm={() => {
          setConfirmOpen(false);
          formRef.current?.requestSubmit();
        }}
      />
    </form>
  );
}

export function DisponibilidadForm({
  productId,
  disponible,
}: {
  productId: string;
  disponible: boolean;
}) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    disponibilidadProductoAction,
    INITIAL,
  );

  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="id" value={productId} />
      <input type="hidden" name="disponible" value={disponible ? '0' : '1'} />
      {state.formError ? (
        <p className="rounded-control bg-danger-soft px-3 py-2 text-sm text-on-danger-soft">{state.formError}</p>
      ) : null}
      {state.ok ? (
        <p className="rounded-control bg-success-soft px-3 py-2 text-sm text-on-success-soft">
          Disponibilidad actualizada en todas las variantes.
        </p>
      ) : null}
      <Button type="submit" variant="secondary" pending={pending} pendingLabel="Aplicando…">
        {disponible
          ? 'Marcar todo el producto como no disponible'
          : 'Marcar todo el producto como disponible'}
      </Button>
    </form>
  );
}
