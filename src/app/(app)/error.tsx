'use client';

import Link from 'next/link';
import { useEffect } from 'react';

/**
 * Error boundary for the authenticated shell. `requirePermission` throws a
 * `ForbiddenError` tagged with `digest = 'FORBIDDEN'` (the only detail that
 * survives to the client in production); render a friendly "sin permiso" screen
 * for it instead of leaking the default 500 page.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const forbidden = error.digest === 'FORBIDDEN';

  useEffect(() => {
    if (!forbidden) console.error(error);
  }, [error, forbidden]);

  if (forbidden) {
    return (
      <div className="mx-auto max-w-md space-y-4 py-16 text-center">
        <h1 className="text-xl font-semibold text-ink">
          No tienes permiso para ver esta página
        </h1>
        <p className="text-sm text-ink-muted">
          Si crees que se trata de un error, contacta con un administrador.
        </p>
        <Link
          href="/dashboard"
          className="inline-block rounded-control bg-primary px-4 py-2 text-sm font-medium text-on-primary hover:bg-primary-hover"
        >
          Volver al inicio
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md space-y-4 py-16 text-center">
      <h1 className="text-xl font-semibold text-ink">Algo salió mal</h1>
      <p className="text-sm text-ink-muted">No se pudo cargar esta página.</p>
      <button
        type="button"
        onClick={reset}
        className="inline-block rounded-control bg-primary px-4 py-2 text-sm font-medium text-on-primary hover:bg-primary-hover"
      >
        Reintentar
      </button>
    </div>
  );
}
