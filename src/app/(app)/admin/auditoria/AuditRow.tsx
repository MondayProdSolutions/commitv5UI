'use client';

import type { ActivityRow } from '@/lib/activity/query';

export function AuditRow({ row }: { row: ActivityRow }) {
  const fecha = new Intl.DateTimeFormat('es-MX', { dateStyle: 'short', timeStyle: 'medium' }).format(row.createdAt);

  return (
    <tr className="border-b border-line hover:bg-surface-raised">
      <td className="px-6 py-4 text-sm text-ink">{fecha}</td>
      <td className="px-6 py-4 text-sm text-ink">{row.accionLabel}</td>
      <td className="px-6 py-4 text-sm text-ink">{row.actorNombre ?? 'Sistema'}</td>
      <td className="px-6 py-4 text-sm text-ink">{row.entidad ?? '-'}</td>
      <td className="px-6 py-4 text-sm text-ink">{row.ip ?? '-'}</td>
      <td className="px-6 py-4 text-sm text-ink">
        <details className="cursor-pointer">
          <summary className="text-primary hover:underline">Ver</summary>
          <pre className="mt-2 max-h-64 overflow-auto rounded-control bg-surface-raised p-2 text-xs">
            {JSON.stringify(row.metadata ?? {}, null, 2)}
          </pre>
        </details>
      </td>
    </tr>
  );
}
