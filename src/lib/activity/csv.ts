import type { ActivityRow } from '@/lib/activity/query';

const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

const fmtFecha = (d: Date) =>
  new Intl.DateTimeFormat('es-MX', { dateStyle: 'short', timeStyle: 'medium' }).format(d);

export function toCsv(rows: ActivityRow[]): string {
  const header = 'Fecha,Acción,Usuario,Entidad,ID entidad,IP,Detalle';
  const lines = rows.map((r) =>
    [
      fmtFecha(r.createdAt),
      r.accionLabel,
      r.actorNombre ?? 'Sistema',
      r.entidad ?? '',
      r.entidadId ?? '',
      r.ip ?? '',
      JSON.stringify(r.metadata ?? {}),
    ].map(esc).join(','),
  );
  return [header, ...lines].join('\n') + '\n';
}
