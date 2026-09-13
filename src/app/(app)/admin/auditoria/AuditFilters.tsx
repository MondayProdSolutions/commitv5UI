'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { inputClass } from '@/app/(app)/ventas/types';

type User = { id: string; nombre: string };
type AuditAction = { value: string; label: string };

export function AuditFilters({
  users,
  actions,
  defaultActor,
  defaultAccion,
  defaultDesde,
  defaultHasta,
}: {
  users: User[];
  actions: AuditAction[];
  defaultActor?: string;
  defaultAccion?: string;
  defaultDesde?: string;
  defaultHasta?: string;
}) {
  return (
    <form method="get" className="flex flex-wrap items-end gap-3 rounded-card border border-line bg-surface p-4">
      <label className="block space-y-1">
        <span className="text-sm font-medium text-ink-muted">Usuario</span>
        <select
          name="actor"
          defaultValue={defaultActor ?? ''}
          className={inputClass}
        >
          <option value="">Todos</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.nombre}
            </option>
          ))}
        </select>
      </label>

      <label className="block space-y-1">
        <span className="text-sm font-medium text-ink-muted">Acción</span>
        <select
          name="accion"
          defaultValue={defaultAccion ?? ''}
          className={inputClass}
        >
          <option value="">Todas</option>
          {actions.map((action) => (
            <option key={action.value} value={action.value}>
              {action.label}
            </option>
          ))}
        </select>
      </label>

      <label className="block space-y-1">
        <span className="text-sm font-medium text-ink-muted">Desde</span>
        <input
          type="date"
          name="desde"
          defaultValue={defaultDesde ?? ''}
          className={inputClass}
        />
      </label>

      <label className="block space-y-1">
        <span className="text-sm font-medium text-ink-muted">Hasta</span>
        <input
          type="date"
          name="hasta"
          defaultValue={defaultHasta ?? ''}
          className={inputClass}
        />
      </label>

      <Button type="submit" variant="primary">
        Filtrar
      </Button>
      <Link href="/admin/auditoria" className="px-2 py-2 text-sm text-ink-subtle hover:text-ink">
        Limpiar
      </Link>
    </form>
  );
}
