'use client';

import { useActionState } from 'react';
import { Field } from '@/components/forms/Field';
import { Button } from '@/components/ui/Button';
import { inputClass } from '@/app/(app)/ventas/types';
import { loginAction } from './actions';
import type { FormState } from '@/app/(auth)/setup/actions';

const INITIAL: FormState = { ok: false };

export function LoginForm() {
  const [state, formAction, pending] = useActionState(loginAction, INITIAL);
  const errors = state.fieldErrors ?? {};

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <h1 className="text-lg font-bold text-ink">Iniciar sesión</h1>
        <p className="mt-1 text-sm text-ink-subtle">Accede con tu correo y contraseña.</p>
      </div>

      {state.formError ? (
        <p className="rounded-control bg-danger-soft px-3 py-2 text-sm text-on-danger-soft">{state.formError}</p>
      ) : null}

      <Field label="Correo electrónico" error={errors.email}>
        <input name="email" type="email" autoComplete="username" required className={inputClass} />
      </Field>

      <Field label="Contraseña" error={errors.password}>
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className={inputClass}
        />
      </Field>

      <Button
        type="submit"
        variant="primary"
        className="w-full"
        pending={pending}
        pendingLabel="Entrando…"
      >
        Entrar
      </Button>
    </form>
  );
}
