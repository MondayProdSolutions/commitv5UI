'use client';

import { useActionState, useState } from 'react';
import { Field } from '@/components/forms/Field';
import { Button } from '@/components/ui/Button';
import { inputClass } from '@/app/(app)/ventas/types';
import { PasswordStrengthMeter } from '@/components/PasswordStrengthMeter';
import { createTenantAction, type CreateTenantState } from './actions';
import type { PlanSummary } from '@/lib/platform/plans';

const INITIAL: CreateTenantState = { ok: false };

export function TenantForm({ plans }: { plans: PlanSummary[] }) {
  const [state, formAction, pending] = useActionState(createTenantAction, INITIAL);
  const [password, setPassword] = useState('');

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-ink">Crear negocio</h1>
        <p className="mt-1 text-sm text-ink-subtle">
          Da de alta un nuevo negocio y su primer usuario Administrador.
        </p>
      </div>

      {state.error ? (
        <p className="rounded-control bg-danger-soft px-3 py-2 text-sm text-on-danger-soft">{state.error}</p>
      ) : null}

      <Field label="Identificador de empresa (subdominio)">
        <input name="slug" type="text" required className={inputClass} />
      </Field>

      <Field label="Nombre del negocio">
        <input name="nombre" type="text" required className={inputClass} />
      </Field>

      <Field label="Plan">
        <select name="planId" required defaultValue="" className={inputClass}>
          <option value="" disabled>
            Selecciona un plan
          </option>
          {plans.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nombre}
            </option>
          ))}
        </select>
      </Field>

      <div className="border-t border-line pt-4">
        <p className="text-sm font-semibold text-ink">Primer Administrador</p>

        <div className="mt-3 space-y-4">
          <Field label="Nombre">
            <input name="adminNombre" type="text" autoComplete="name" required className={inputClass} />
          </Field>

          <Field label="Correo electrónico">
            <input name="adminEmail" type="email" autoComplete="username" required className={inputClass} />
          </Field>

          <Field label="Contraseña">
            <input
              name="adminPassword"
              type="password"
              autoComplete="new-password"
              required
              className={inputClass}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>
          <PasswordStrengthMeter password={password} />
        </div>
      </div>

      <Button type="submit" variant="primary" className="w-full" pending={pending} pendingLabel="Creando…">
        Crear negocio
      </Button>
    </form>
  );
}
