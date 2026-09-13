'use client';

import Link from 'next/link';
import { useActionState, useState } from 'react';
import { Field } from '@/components/forms/Field';
import { Button } from '@/components/ui/Button';
import { inputClass } from '@/app/(app)/ventas/types';
import { PasswordStrengthMeter } from '@/components/PasswordStrengthMeter';
import { changePasswordAction } from './actions';
import type { FormState } from '@/app/(auth)/setup/actions';

const INITIAL: FormState = { ok: false };

export function ChangePasswordForm({ forced }: { forced: boolean }) {
  const [state, formAction, pending] = useActionState(changePasswordAction, INITIAL);
  const [newPassword, setNewPassword] = useState('');
  const errors = state.fieldErrors ?? {};

  if (state.ok) {
    return (
      <div className="space-y-4">
        <p className="rounded-control bg-success-soft px-3 py-2 text-sm text-on-success-soft">
          Contraseña actualizada
        </p>
        <Link
          href="/dashboard"
          className="inline-flex items-center justify-center gap-1.5 rounded-control bg-primary px-4 py-2.5 text-sm font-medium text-on-primary shadow-sm transition-colors hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 w-full text-center"
        >
          Ir al inicio
        </Link>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-ink">Cambiar contraseña</h1>
        <p className="mt-1 text-sm text-ink-subtle">
          {forced
            ? 'Debes establecer una contraseña nueva antes de continuar.'
            : 'Introduce tu contraseña actual y elige una nueva.'}
        </p>
      </div>

      {state.formError ? (
        <p className="rounded-control bg-danger-soft px-3 py-2 text-sm text-on-danger-soft">{state.formError}</p>
      ) : null}

      {!forced ? (
        <Field label="Contraseña actual" error={errors.currentPassword}>
          <input
            name="currentPassword"
            type="password"
            autoComplete="current-password"
            required
            className={inputClass}
          />
        </Field>
      ) : null}

      <Field label="Contraseña nueva" error={errors.newPassword}>
        <input
          name="newPassword"
          type="password"
          autoComplete="new-password"
          required
          className={inputClass}
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
        />
      </Field>
      <PasswordStrengthMeter password={newPassword} />

      <Field label="Confirmar contraseña nueva" error={errors.confirm}>
        <input
          name="confirm"
          type="password"
          autoComplete="new-password"
          required
          className={inputClass}
        />
      </Field>

      <Button
        type="submit"
        variant="primary"
        className="w-full"
        pending={pending}
        pendingLabel="Guardando…"
      >
        Cambiar contraseña
      </Button>
    </form>
  );
}
