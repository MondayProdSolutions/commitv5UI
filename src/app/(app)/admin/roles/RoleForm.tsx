'use client';

import { useActionState, useRef, useState } from 'react';
import Link from 'next/link';
import { Field } from '@/components/forms/Field';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { ADMIN_LOCKED_PERMISSIONS } from '@/lib/auth/rbac';
import type { RoleRow } from '@/lib/roles/admin';
import { PermissionChecklist } from './PermissionChecklist';
import {
  createRoleAction,
  updateRoleAction,
  deleteRoleAction,
  type RoleActionState,
} from './actions';

const INITIAL: RoleActionState = { ok: false };

// Local: los inputs de este form usan `disabled` (nombre bloqueado en roles de
// sistema / sin permiso de gestión) y dependen de los estados `disabled:` para
// verse atenuados. Solo el foco se alinea al acento teal del sistema.
const inputClass =
  'block w-full min-h-11 rounded-control border border-line-strong bg-surface px-3 py-2 text-sm text-ink outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-ring/40 disabled:bg-surface-raised disabled:text-ink-subtle';

export function RoleForm({ role, canManage }: { role: RoleRow | null; canManage: boolean }) {
  const isNew = role === null;
  const isAdmin = role?.nombre === 'Administrador';
  const isSystemRole = role?.esSistema === true;
  const lockedKeys = isAdmin ? ADMIN_LOCKED_PERMISSIONS : [];

  const [state, formAction, pending] = useActionState<RoleActionState, FormData>(
    isNew ? createRoleAction : updateRoleAction,
    INITIAL,
  );
  const [delState, delAction, delPending] = useActionState<RoleActionState, FormData>(
    deleteRoleAction,
    INITIAL,
  );
  const errors = state.fieldErrors ?? {};

  const [confirmOpen, setConfirmOpen] = useState(false);
  const delFormRef = useRef<HTMLFormElement>(null);

  const showDelete = !isNew && !role.esSistema && role.usuarios === 0 && canManage;
  const usuarios = role?.usuarios ?? 0;

  return (
    <div className="space-y-6">
      {delState.ok ? (
        <p className="rounded-control bg-success-soft px-3 py-2 text-sm text-on-success-soft">
          Rol eliminado. <Link href="/admin/roles" className="underline">Volver a la lista</Link>.
        </p>
      ) : null}
      {delState.formError ? (
        <p className="rounded-control bg-danger-soft px-3 py-2 text-sm text-on-danger-soft">{delState.formError}</p>
      ) : null}

      <form action={formAction} className="space-y-5">
        {!isNew ? <input type="hidden" name="id" value={role.id} /> : null}

        {state.ok ? (
          <p className="rounded-control bg-success-soft px-3 py-2 text-sm text-on-success-soft">
            {isNew ? 'Rol creado correctamente.' : 'Cambios guardados correctamente.'}
          </p>
        ) : null}
        {state.formError ? (
          <p className="rounded-control bg-danger-soft px-3 py-2 text-sm text-on-danger-soft">{state.formError}</p>
        ) : null}

        <Field label="Nombre" error={errors.nombre}>
          <input
            name={isSystemRole && canManage ? undefined : 'nombre'}
            defaultValue={role?.nombre ?? ''}
            required={!isSystemRole}
            disabled={!canManage || isSystemRole}
            className={inputClass}
          />
          {/* Un input `disabled` no se envía; para roles de sistema (nombre bloqueado
              pero permisos/descripción editables) reenviamos el nombre actual. */}
          {isSystemRole && canManage ? (
            <input type="hidden" name="nombre" value={role.nombre} />
          ) : null}
        </Field>

        <Field label="Descripción (opcional)" error={errors.descripcion}>
          <textarea
            name="descripcion"
            defaultValue={role?.descripcion ?? ''}
            rows={2}
            maxLength={200}
            disabled={!canManage}
            className={inputClass}
          />
        </Field>

        {usuarios > 0 ? (
          <p className="rounded-control bg-warning-soft px-3 py-2 text-sm text-on-warning-soft">
            Cambiar estos permisos afecta a {usuarios} usuario{usuarios === 1 ? '' : 's'}; se aplicará
            en su próxima acción.
          </p>
        ) : null}

        <PermissionChecklist
          checked={role?.permisos ?? []}
          lockedKeys={lockedKeys}
          disabled={!canManage}
        />

        {canManage ? (
          <div className="flex gap-2">
            <Button type="submit" variant="primary" pending={pending} pendingLabel="Guardando…">
              Guardar
            </Button>
            <Link
              href="/admin/roles"
              className="inline-flex items-center justify-center gap-1.5 rounded-control border border-line-strong bg-surface px-4 py-2.5 text-sm font-medium text-ink-muted transition-colors hover:bg-surface-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
            >
              Cancelar
            </Link>
          </div>
        ) : (
          <p className="text-sm text-ink-subtle">No tienes permiso para modificar roles.</p>
        )}
      </form>

      {showDelete ? (
        <form ref={delFormRef} action={delAction} className="border-t border-line pt-5">
          <input type="hidden" name="id" value={role.id} />
          <Button
            type="button"
            variant="danger"
            pending={delPending}
            pendingLabel="Eliminando…"
            onClick={() => setConfirmOpen(true)}
          >
            Eliminar rol
          </Button>

          <ConfirmDialog
            open={confirmOpen}
            onOpenChange={setConfirmOpen}
            title="¿Eliminar este rol?"
            description="Esta acción no se puede deshacer. Solo se pueden eliminar roles sin usuarios asignados."
            confirmLabel="Eliminar rol"
            onConfirm={() => {
              setConfirmOpen(false);
              delFormRef.current?.requestSubmit();
            }}
            pending={delPending}
          />
        </form>
      ) : null}
    </div>
  );
}
