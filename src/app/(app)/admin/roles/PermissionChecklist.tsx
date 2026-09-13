'use client';

import { PERMISSIONS } from '@/lib/auth/rbac';
import { Card } from '@/components/ui/Card';

export function PermissionChecklist({
  checked,
  lockedKeys = [],
  disabled = false,
}: {
  checked: string[];
  lockedKeys?: readonly string[];
  disabled?: boolean;
}) {
  const checkedSet = new Set(checked);
  const lockedSet = new Set(lockedKeys);

  return (
    <fieldset className="space-y-4">
      <legend className="text-sm font-medium text-ink-muted">Permisos</legend>
      <div className="grid gap-4 sm:grid-cols-2">
        {PERMISSIONS.map((grupo) => (
          <Card key={grupo.modulo}>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-subtle">
              {grupo.label}
            </p>
            <ul className="space-y-2">
              {grupo.permisos.map((permiso) => {
                const isLocked = lockedSet.has(permiso.key);
                const isChecked = isLocked || checkedSet.has(permiso.key);
                return (
                  <li key={permiso.key} className="flex items-start gap-2">
                    <input
                      type="checkbox"
                      id={`perm-${permiso.key}`}
                      name="permisos"
                      value={permiso.key}
                      defaultChecked={isChecked}
                      disabled={disabled || isLocked}
                      className="mt-0.5 h-4 w-4 rounded border-line-strong text-primary focus:ring-ring"
                    />
                    <label htmlFor={`perm-${permiso.key}`} className="text-sm text-ink-muted">
                      {permiso.label}
                      {isLocked ? (
                        <span className="ml-1 text-xs text-ink-subtle">(obligatorio)</span>
                      ) : null}
                    </label>
                  </li>
                );
              })}
            </ul>
          </Card>
        ))}
      </div>
    </fieldset>
  );
}
