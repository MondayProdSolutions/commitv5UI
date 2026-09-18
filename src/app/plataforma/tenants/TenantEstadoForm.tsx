'use client';

import { useActionState, useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { setTenantEstadoAction, type TenantActionState } from './actions';
import type { TenantStatus } from '@/lib/platform/tenants';

const INITIAL: TenantActionState = { ok: false };

export function TenantEstadoForm({
  tenantId,
  nombre,
  estado,
}: {
  tenantId: string;
  nombre: string;
  estado: TenantStatus;
}) {
  const [state, formAction, pending] = useActionState<TenantActionState, FormData>(
    setTenantEstadoAction,
    INITIAL,
  );
  const [confirmOpen, setConfirmOpen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const suspendido = estado === 'SUSPENDIDO';
  const siguienteEstado: TenantStatus = suspendido ? 'ACTIVO' : 'SUSPENDIDO';

  return (
    <form ref={formRef} action={formAction} className="inline-flex items-center gap-2">
      <input type="hidden" name="tenantId" value={tenantId} />
      <input type="hidden" name="estado" value={siguienteEstado} />
      {state.formError ? <p className="text-xs text-danger">{state.formError}</p> : null}
      <Button
        type="button"
        size="sm"
        variant={suspendido ? 'primary' : 'danger'}
        pending={pending}
        pendingLabel="Aplicando…"
        onClick={
          suspendido
            ? () => formRef.current?.requestSubmit()
            : () => setConfirmOpen(true)
        }
      >
        {suspendido ? 'Reactivar' : 'Suspender'}
      </Button>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={`¿Suspender "${nombre}"?`}
        description="Los usuarios de este negocio no podrán iniciar sesión ni operar hasta que lo reactives. Los datos del negocio no se borran."
        confirmLabel="Suspender negocio"
        onConfirm={() => {
          setConfirmOpen(false);
          formRef.current?.requestSubmit();
        }}
        pending={pending}
      />
    </form>
  );
}
