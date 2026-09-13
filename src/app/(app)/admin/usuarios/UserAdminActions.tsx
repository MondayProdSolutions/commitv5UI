'use client';

import { useActionState, useRef, useState } from 'react';
import { Field } from '@/components/forms/Field';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { inputClass } from '@/app/(app)/ventas/types';
import {
  resetPasswordAction,
  setUserActiveAction,
  revokeUserSessionsAction,
  type UserActionState,
} from './actions';
import { TempPasswordPanel } from './UserFormDialog';

const INITIAL: UserActionState = { ok: false };

export function ActivateToggleForm({ targetId, activo }: { targetId: string; activo: boolean }) {
  const [state, formAction, pending] = useActionState<UserActionState, FormData>(
    setUserActiveAction,
    INITIAL,
  );
  const [confirmOpen, setConfirmOpen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form ref={formRef} action={formAction} className="space-y-2">
      <input type="hidden" name="targetId" value={targetId} />
      <input type="hidden" name="activo" value={activo ? 'false' : 'true'} />
      {state.formError ? (
        <p className="rounded-control bg-danger-soft px-3 py-2 text-sm text-on-danger-soft">{state.formError}</p>
      ) : null}
      <Button
        type="button"
        variant={activo ? 'danger-solid' : 'primary'}
        pending={pending}
        pendingLabel="Aplicando…"
        onClick={
          activo
            ? () => setConfirmOpen(true)
            : () => formRef.current?.requestSubmit()
        }
      >
        {activo ? 'Desactivar usuario' : 'Reactivar usuario'}
      </Button>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="¿Desactivar este usuario?"
        description="No podrá iniciar sesión hasta que se le reactive. Sus sesiones activas seguirán hasta su próxima acción — usa «Cerrar todas las sesiones» si necesitas cortarlas ahora."
        confirmLabel="Desactivar usuario"
        onConfirm={() => {
          setConfirmOpen(false);
          formRef.current?.requestSubmit();
        }}
        pending={pending}
      />
    </form>
  );
}

export function RevokeSessionsForm({ targetId }: { targetId: string }) {
  const [state, formAction, pending] = useActionState<UserActionState, FormData>(
    revokeUserSessionsAction,
    INITIAL,
  );
  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="targetId" value={targetId} />
      {state.ok && typeof state.revokedCount === 'number' ? (
        <p className="rounded-control bg-success-soft px-3 py-2 text-sm text-on-success-soft">
          {state.revokedCount} sesión(es) cerradas.
        </p>
      ) : null}
      <Button type="submit" variant="secondary" pending={pending} pendingLabel="Cerrando…">
        Cerrar todas las sesiones
      </Button>
    </form>
  );
}

export function ResetPasswordForm({ targetId }: { targetId: string }) {
  const [state, formAction, pending] = useActionState<UserActionState, FormData>(
    resetPasswordAction,
    INITIAL,
  );
  const errors = state.fieldErrors ?? {};

  if (state.ok && state.tempPassword) {
    return (
      <div className="space-y-2">
        <p className="text-sm text-ink-muted">Contraseña restablecida.</p>
        <TempPasswordPanel value={state.tempPassword} />
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="targetId" value={targetId} />
      {state.formError ? (
        <p className="rounded-control bg-danger-soft px-3 py-2 text-sm text-on-danger-soft">{state.formError}</p>
      ) : null}
      <Field label="Motivo del restablecimiento" error={errors.motivo}>
        <input
          name="motivo"
          required
          placeholder="Ej.: el usuario olvidó su contraseña"
          className={inputClass}
        />
      </Field>
      <Button type="submit" variant="primary" pending={pending} pendingLabel="Restableciendo…">
        Restablecer contraseña
      </Button>
    </form>
  );
}
