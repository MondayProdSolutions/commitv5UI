'use client';

import { useActionState, useState } from 'react';
import { Field } from '@/components/forms/Field';
import { Button } from '@/components/ui/Button';
import { inputClass } from '@/app/(app)/ventas/types';
import { createUserAction, updateUserAction, type UserActionState } from './actions';

const INITIAL: UserActionState = { ok: false };

type RoleOption = { id: string; nombre: string };

type UserDefaults = {
  id: string;
  nombre: string;
  email: string;
  telefono: string | null;
  roleId: string;
};

export function TempPasswordPanel({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="rounded-control border border-warning/40 bg-warning-soft p-3 text-sm">
      <p className="font-medium text-on-warning-soft">Contraseña temporal (se muestra una sola vez)</p>
      <div className="mt-2 flex items-center gap-2">
        <code
          data-testid="temp-password"
          className="rounded bg-surface px-2 py-1 font-mono text-base text-ink ring-1 ring-line"
        >
          {value}
        </code>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => {
            void navigator.clipboard?.writeText(value).then(() => setCopied(true));
          }}
        >
          {copied ? 'Copiado' : 'Copiar'}
        </Button>
      </div>
      <p className="mt-2 text-on-warning-soft">
        El usuario deberá cambiarla en su primer inicio de sesión.
      </p>
    </div>
  );
}

export function UserFormDialog({
  roles,
  user,
}: {
  roles: RoleOption[];
  user?: UserDefaults;
}) {
  const isEdit = Boolean(user);
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<UserActionState, FormData>(
    isEdit ? updateUserAction : createUserAction,
    INITIAL,
  );
  const errors = state.fieldErrors ?? {};
  const editDone = state.ok && isEdit;

  return (
    <div>
      <Button type="button" variant="primary" onClick={() => setOpen(true)}>
        {isEdit ? 'Editar' : 'Crear usuario'}
      </Button>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-card bg-surface p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold">
                {isEdit ? 'Editar usuario' : 'Nuevo usuario'}
              </h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-ink-subtle hover:text-ink"
                aria-label="Cerrar"
              >
                ✕
              </button>
            </div>

            {state.ok && state.tempPassword ? (
              <div className="space-y-4">
                <p className="text-sm text-ink-muted">Usuario creado correctamente.</p>
                <TempPasswordPanel value={state.tempPassword} />
                <Button
                  type="button"
                  variant="primary"
                  className="w-full"
                  onClick={() => setOpen(false)}
                >
                  Entendido
                </Button>
              </div>
            ) : editDone ? (
              <div className="space-y-4">
                <p className="rounded-control bg-success-soft px-3 py-2 text-sm text-on-success-soft">
                  Cambios guardados correctamente.
                </p>
                <Button
                  type="button"
                  variant="primary"
                  className="w-full"
                  onClick={() => setOpen(false)}
                >
                  Cerrar
                </Button>
              </div>
            ) : (
              <form action={formAction} className="space-y-4">
                {isEdit ? <input type="hidden" name="id" value={user!.id} /> : null}
                {state.formError ? (
                  <p className="rounded-control bg-danger-soft px-3 py-2 text-sm text-on-danger-soft">{state.formError}</p>
                ) : null}

                <Field label="Nombre" error={errors.nombre}>
                  <input name="nombre" defaultValue={user?.nombre ?? ''} required className={inputClass} />
                </Field>
                <Field label="Correo electrónico" error={errors.email}>
                  <input
                    name="email"
                    type="email"
                    defaultValue={user?.email ?? ''}
                    required
                    className={inputClass}
                  />
                </Field>
                <Field label="Teléfono (opcional)" error={errors.telefono}>
                  <input name="telefono" defaultValue={user?.telefono ?? ''} className={inputClass} />
                </Field>
                <Field label="Rol" error={errors.roleId}>
                  <select name="roleId" defaultValue={user?.roleId ?? ''} required className={inputClass}>
                    <option value="" disabled>
                      Selecciona un rol
                    </option>
                    {roles.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.nombre}
                      </option>
                    ))}
                  </select>
                </Field>

                <div className="flex justify-end gap-2 pt-2">
                  <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
                    Cancelar
                  </Button>
                  <Button
                    type="submit"
                    variant="primary"
                    pending={pending}
                    pendingLabel="Guardando…"
                  >
                    {isEdit ? 'Guardar cambios' : 'Crear'}
                  </Button>
                </div>
              </form>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
