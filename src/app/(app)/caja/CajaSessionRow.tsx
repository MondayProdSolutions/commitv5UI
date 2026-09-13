'use client';

import { useRouter } from 'next/navigation';
import type { KeyboardEvent } from 'react';
import type { DataTableRowProps } from '@/components/DataTable';

/**
 * Fila de la tabla de historial de sesiones de caja: navega al detalle al
 * hacer clic o con Enter (mismo contrato que `SaleRow` del Bloque 4).
 */
export function CajaSessionRow({ href, children }: DataTableRowProps) {
  const router = useRouter();

  function go() {
    if (href) router.push(href);
  }
  function onKeyDown(e: KeyboardEvent<HTMLTableRowElement>) {
    if (href && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      router.push(href);
    }
  }

  return (
    <tr
      onClick={go}
      onKeyDown={onKeyDown}
      tabIndex={href ? 0 : undefined}
      role={href ? 'link' : undefined}
      className={
        'hover:bg-surface-raised focus:bg-surface-raised focus:outline-none' + (href ? ' cursor-pointer' : '')
      }
    >
      {children}
    </tr>
  );
}
