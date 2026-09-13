'use client';

import { useActionState, useState } from 'react';
import { Field } from '@/components/forms/Field';
import { Button } from '@/components/ui/Button';
import { inputClass } from '@/app/(app)/ventas/types';
import { PasswordStrengthMeter } from '@/components/PasswordStrengthMeter';
import { setupAction, type FormState } from './actions';

const INITIAL: FormState = { ok: false };

export function SetupForm() {
  const [state, formAction, pending] = useActionState(setupAction, INITIAL);
  const [password, setPassword] = useState('');
  const errors = state.fieldErrors ?? {};

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-ink">Configuración inicial</h1>
        <p className="mt-1 text-sm text-ink-subtle">
          Crea la cuenta de administrador para empezar a usar el sistema.
        </p>
      </div>

      {state.formError ? (
        <p className="rounded-control bg-danger-soft px-3 py-2 text-sm text-on-danger-soft">{state.formError}</p>
      ) : null}

      <Field label="Nombre" error={errors.nombre}>
        <input name="nombre" type="text" autoComplete="name" required className={inputClass} />
      </Field>

      <Field label="Correo electrónico" error={errors.email}>
        <input name="email" type="email" autoComplete="username" required className={inputClass} />
      </Field>

      <Field label="Contraseña" error={errors.password}>
        <input
          name="password"
          type="password"
          autoComplete="new-password"
          required
          className={inputClass}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </Field>
      <PasswordStrengthMeter password={password} />

      <Field label="Confirmar contraseña" error={errors.confirm}>
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
        pendingLabel="Creando…"
      >
        Crear administrador
      </Button>
    </form>
  );
}
