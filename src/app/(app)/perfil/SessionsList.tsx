'use client';

import { useActionState } from 'react';
import { revokeMySessionAction, revokeMyOtherSessionsAction } from './actions';
import type { FormState } from '@/app/(auth)/setup/actions';

interface SessionRow {
  id: string;
  ip: string | null;
  userAgent: string | null;
  lastActivityAt: Date;
  createdAt: Date;
  actual: boolean;
}

interface SessionsListProps {
  sessions: SessionRow[];
  currentSessionId: string | null;
}

function formatDate(date: Date): string {
  return new Date(date).toLocaleString('es-ES', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function RevokeSessionForm({ sessionId }: { sessionId: string }) {
  const [state, formAction, isPending] = useActionState<FormState, FormData>(
    async (_prev: FormState) => {
      return revokeMySessionAction(_prev, sessionId);
    },
    { ok: false }
  );

  return (
    <form action={formAction}>
      {state.formError && (
        <p className="text-sm text-danger mb-2">{state.formError}</p>
      )}
      <button
        type="submit"
        disabled={isPending}
        className="text-danger hover:text-danger-solid-hover font-semibold text-sm disabled:text-ink-subtle disabled:cursor-not-allowed"
      >
        {isPending ? 'Revocando...' : 'Revocar'}
      </button>
    </form>
  );
}

function RevokeOtherSessionsForm({ currentSessionId }: { currentSessionId: string | null }) {
  const [state, formAction, isPending] = useActionState<FormState, FormData>(
    async (_prev: FormState) => {
      return revokeMyOtherSessionsAction(_prev, currentSessionId);
    },
    { ok: false }
  );

  return (
    <form action={formAction}>
      {state.formError && (
        <p className="text-sm text-danger mb-2">{state.formError}</p>
      )}
      <button
        type="submit"
        disabled={isPending}
        className="text-danger hover:text-danger-solid-hover font-semibold text-sm disabled:text-ink-subtle disabled:cursor-not-allowed"
      >
        {isPending ? 'Revocando...' : 'Cerrar todas las demás'}
      </button>
    </form>
  );
}

export default function SessionsList({ sessions, currentSessionId }: SessionsListProps) {
  if (!sessions || sessions.length === 0) {
    return <p className="text-ink-muted">No hay sesiones activas</p>;
  }

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto">
        <table className="min-w-full border-collapse">
          <thead>
            <tr className="border-b border-line">
              <th className="text-left py-2 px-2 font-medium text-ink">IP</th>
              <th className="text-left py-2 px-2 font-medium text-ink">Navegador/Dispositivo</th>
              <th className="text-left py-2 px-2 font-medium text-ink">Última actividad</th>
              <th className="text-left py-2 px-2 font-medium text-ink">Creada</th>
              <th className="text-right py-2 px-2 font-medium text-ink">Acción</th>
            </tr>
          </thead>
          <tbody>
            {sessions.map((session) => (
              <tr key={session.id} className="border-b border-line hover:bg-surface-raised">
                <td className="py-3 px-2 text-sm">{session.ip || 'Desconocida'}</td>
                <td className="py-3 px-2 text-sm">{session.userAgent || 'Desconocido'}</td>
                <td className="py-3 px-2 text-sm">{formatDate(session.lastActivityAt)}</td>
                <td className="py-3 px-2 text-sm">{formatDate(session.createdAt)}</td>
                <td className="py-3 px-2 text-right">
                  {session.actual ? (
                    <span className="inline-flex items-center rounded-pill bg-accent-blue-soft px-3 py-1 text-sm font-medium text-on-accent-blue-soft">
                      Sesión actual
                    </span>
                  ) : (
                    <RevokeSessionForm sessionId={session.id} />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {sessions.some((s) => !s.actual) && (
        <div className="pt-4 border-t border-line">
          <RevokeOtherSessionsForm currentSessionId={currentSessionId} />
        </div>
      )}
    </div>
  );
}
