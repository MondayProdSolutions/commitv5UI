'use client';

import { useActionState } from 'react';
import { Button } from '@/components/ui/Button';
import type { FormState } from '@/app/(auth)/setup/actions';
import { corregirRegistroAction } from './actions';

const INITIAL: FormState = { ok: false };

export function CorregirTurnoForm({ recordId }: { recordId: string }) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(corregirRegistroAction, INITIAL);

  return (
    <form action={formAction} className="mt-2 flex flex-wrap items-end gap-2">
      <input type="hidden" name="id" value={recordId} />
      <label className="block space-y-1">
        <span className="text-xs text-ink-muted">Cerrar turno — hora de salida</span>
        <input
          type="datetime-local"
          name="checkOutAt"
          required
          className="rounded-control border border-line px-2 py-1 text-xs"
        />
      </label>
      <Button type="submit" size="sm" variant="secondary" pending={pending} pendingLabel="Cerrando…">
        Cerrar turno
      </Button>
      {state.formError ? <span className="text-xs text-danger">{state.formError}</span> : null}
      {state.fieldErrors && Object.keys(state.fieldErrors).length > 0
        ? Object.values(state.fieldErrors).map((msg, i) => (
            <span key={i} className="text-xs text-danger">{msg}</span>
          ))
        : null}
    </form>
  );
}
