'use server';

import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requirePermission } from '@/lib/auth/context';
import { getClientIp } from '@/lib/http';
import { ValidationError } from '@/lib/errors';
import { roleSchema } from '@/lib/validation/role';
import { createRole, updateRole, deleteRole } from '@/lib/roles/admin';
import type { FormState } from '@/app/(auth)/setup/actions';

export type RoleActionState = FormState & { id?: string };

const ROLES_PATH = '/admin/roles';

function fieldErrorsFrom(error: z.ZodError): Record<string, string> {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? '');
    if (key && !(key in fieldErrors)) fieldErrors[key] = issue.message;
  }
  return fieldErrors;
}

function parseRole(formData: FormData) {
  return roleSchema.safeParse({
    nombre: formData.get('nombre'),
    descripcion: formData.get('descripcion') ?? undefined,
    permisos: formData.getAll('permisos').map(String),
  });
}

function fromValidationError(e: ValidationError): RoleActionState {
  const { _form, ...fieldErrors } = e.fields;
  return { ok: false, formError: _form || undefined, fieldErrors };
}

export async function createRoleAction(
  _prev: RoleActionState,
  formData: FormData,
): Promise<RoleActionState> {
  const actor = await requirePermission('roles.gestionar');

  const parsed = parseRole(formData);
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsFrom(parsed.error) };

  try {
    const ip = getClientIp(await headers());
    const { id } = await createRole(actor.id, parsed.data, ip);
    revalidatePath(ROLES_PATH);
    return { ok: true, id };
  } catch (e) {
    if (e instanceof ValidationError) return fromValidationError(e);
    throw e;
  }
}

export async function updateRoleAction(
  _prev: RoleActionState,
  formData: FormData,
): Promise<RoleActionState> {
  const actor = await requirePermission('roles.gestionar');

  const id = String(formData.get('id') ?? '');
  if (!id) return { ok: false, formError: 'Rol no válido.' };

  const parsed = parseRole(formData);
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsFrom(parsed.error) };

  try {
    const ip = getClientIp(await headers());
    await updateRole(actor.id, id, parsed.data, ip);
    revalidatePath(ROLES_PATH);
    revalidatePath(`${ROLES_PATH}/${id}`);
    return { ok: true, id };
  } catch (e) {
    if (e instanceof ValidationError) return fromValidationError(e);
    throw e;
  }
}

export async function deleteRoleAction(
  _prev: RoleActionState,
  formData: FormData,
): Promise<RoleActionState> {
  const actor = await requirePermission('roles.gestionar');

  const id = String(formData.get('id') ?? '');
  if (!id) return { ok: false, formError: 'Rol no válido.' };

  try {
    const ip = getClientIp(await headers());
    await deleteRole(actor.id, id, ip);
    revalidatePath(ROLES_PATH);
    return { ok: true };
  } catch (e) {
    if (e instanceof ValidationError) return fromValidationError(e);
    throw e;
  }
}
