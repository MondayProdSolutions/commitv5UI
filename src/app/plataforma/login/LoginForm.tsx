'use client';

import { useActionState } from 'react';
import { Field } from '@/components/forms/Field';
import { Button } from '@/components/ui/Button';
import { inputClass } from '@/app/(app)/ventas/types';
import { platformLoginAction } from './actions';
import type { PlatformLoginState } from './actions';

const INITIAL: PlatformLoginState = { ok: false };

export function LoginForm() {
  const [state, formAction, pending] = useActionState(platformLoginAction, INITIAL);

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <h1 className="text-lg font-bold text-ink">Acceso de plataforma</h1>
        <p className="mt-1 text-sm text-ink-subtle">Inicia sesión con tu correo y contraseña de Super Admin.</p>
      </div>

      {state.error ? (
        <p className="rounded-control bg-danger-soft px-3 py-2 text-sm text-on-danger-soft">{state.error}</p>
      ) : null}

      <Field label="Correo electrónico">
        <input name="email" type="email" autoComplete="username" required className={inputClass} />
      </Field>

      <Field label="Contraseña">
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
