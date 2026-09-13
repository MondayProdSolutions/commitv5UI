'use client';

import { useEffect } from 'react';

/**
 * Lanza el diálogo de impresión al montar la vista de ticket y deja un botón
 * de respaldo (clase `no-print`, oculto al imprimir) por si el navegador
 * bloquea el `window.print()` automático.
 */
export function PrintOnMount() {
  useEffect(() => {
    window.print();
  }, []);

  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="no-print mt-4 w-full rounded-control border border-line-strong bg-surface px-4 py-2 text-sm font-medium text-ink-muted hover:bg-surface-raised"
    >
      Imprimir
    </button>
  );
}
