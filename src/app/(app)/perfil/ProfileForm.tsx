'use client';

import { useActionState } from 'react';
import { updateProfileAction } from './actions';
import type { FormState } from '@/app/(auth)/setup/actions';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/forms/Field';
import { inputClass } from '@/app/(app)/ventas/types';

interface ProfileFormProps {
  defaultValues: {
    nombre: string;
    email: string | null;
    telefono: string | null;
  };
}

export default function ProfileForm({ defaultValues }: ProfileFormProps) {
  const [state, formAction, isPending] = useActionState<FormState, FormData>(updateProfileAction, {
    ok: false,
  });

  const initials = defaultValues.nombre
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  return (
    <form action={formAction} className="space-y-4">
      {state.formError && (
        <div className="rounded-control bg-danger-soft p-4">
          <p className="text-sm font-medium text-on-danger-soft">{state.formError}</p>
        </div>
      )}

      {state.ok && !isPending && (
        <div className="rounded-control bg-success-soft p-4">
          <p className="text-sm font-medium text-on-success-soft">Perfil actualizado correctamente</p>
        </div>
      )}

      <div className="flex items-center gap-4">
        <div className="flex h-16 w-16 items-center justify-center rounded-pill bg-accent-blue-soft text-xl font-bold text-on-accent-blue-soft">
          {initials}
        </div>
        <div>
          <p className="text-sm text-ink-subtle">Avatar</p>
          <p className="font-medium text-ink">{initials}</p>
        </div>
      </div>

      <Field label="Nombre" error={state.fieldErrors?.nombre}>
        <input
          type="text"
          id="nombre"
          name="nombre"
          defaultValue={defaultValues.nombre}
          required
          disabled={isPending}
          className={
            inputClass + (state.fieldErrors?.nombre ? ' border-danger focus:border-danger' : '')
          }
        />
      </Field>

      <Field label="Correo electrónico">
        <input
          type="email"
          id="email"
          name="email"
          defaultValue={defaultValues.email ?? ''}
          readOnly
          className={inputClass + ' bg-surface-raised text-ink-muted'}
        />
        <span className="mt-1 block text-xs text-ink-subtle">
          No se puede cambiar el correo electrónico
        </span>
      </Field>

      <Field label="Teléfono (opcional)" error={state.fieldErrors?.telefono}>
        <input
          type="tel"
          id="telefono"
          name="telefono"
          defaultValue={defaultValues.telefono ?? ''}
          disabled={isPending}
          className={
            inputClass + (state.fieldErrors?.telefono ? ' border-danger focus:border-danger' : '')
          }
        />
      </Field>

      <Button
        type="submit"
        variant="primary"
        className="w-full"
        pending={isPending}
        pendingLabel="Guardando…"
      >
        Guardar cambios
      </Button>
    </form>
  );
}
