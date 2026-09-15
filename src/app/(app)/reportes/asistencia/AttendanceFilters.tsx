import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { inputClass } from '@/app/(app)/ventas/types';

export function AttendanceFilters({
  usuarios,
  roles,
  current,
}: {
  usuarios: { id: string; nombre: string }[];
  roles: { id: string; nombre: string }[];
  current: { atajo?: string; desde?: string; hasta?: string; userId?: string; roleId?: string };
}) {
  const hayFiltro = Boolean(current.userId || current.roleId);

  return (
    <form
      method="get"
      action="/reportes/asistencia"
      className="flex flex-wrap items-end gap-3 rounded-card border border-line bg-surface p-4"
    >
      {current.atajo ? <input type="hidden" name="atajo" value={current.atajo} /> : null}
      {current.desde ? <input type="hidden" name="desde" value={current.desde} /> : null}
      {current.hasta ? <input type="hidden" name="hasta" value={current.hasta} /> : null}

      <label className="block space-y-1">
        <span className="text-sm font-medium text-ink-muted">Empleado</span>
        <select name="userId" defaultValue={current.userId ?? ''} className={inputClass}>
          <option value="">Todos</option>
          {usuarios.map((u) => (
            <option key={u.id} value={u.id}>{u.nombre}</option>
          ))}
        </select>
      </label>

      <label className="block space-y-1">
        <span className="text-sm font-medium text-ink-muted">Rol</span>
        <select name="roleId" defaultValue={current.roleId ?? ''} className={inputClass}>
          <option value="">Todos</option>
          {roles.map((r) => (
            <option key={r.id} value={r.id}>{r.nombre}</option>
          ))}
        </select>
      </label>

      <Button type="submit" variant="primary">Filtrar</Button>
      {hayFiltro ? (
        <Link
          href={(() => {
            const params = new URLSearchParams();
            if (current.atajo) params.set('atajo', current.atajo);
            if (current.desde) params.set('desde', current.desde);
            if (current.hasta) params.set('hasta', current.hasta);
            const qs = params.toString();
            return `/reportes/asistencia${qs ? `?${qs}` : ''}`;
          })()}
          className="px-2 py-2 text-sm text-ink-subtle hover:text-ink"
        >
          Quitar filtros
        </Link>
      ) : null}
    </form>
  );
}
