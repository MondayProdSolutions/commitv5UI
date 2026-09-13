'use server';

import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { requirePermission } from '@/lib/auth/context';
import { getClientIp } from '@/lib/http';
import { ValidationError } from '@/lib/errors';
import { createUserSchema, editUserSchema } from '@/lib/validation/user';
import {
  createUser,
  updateUser,
  setUserActive,
  resetUserPassword,
  adminRevokeUserSessions,
} from '@/lib/users/admin';
import { z } from 'zod';
import type { FormState } from '@/app/(auth)/setup/actions';

export type UserActionState = FormState & { tempPassword?: string; revokedCount?: number };

const ADMIN_PATH = '/admin/usuarios';

function fieldErrorsFrom(error: z.ZodError): Record<string, string> {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? '');
    if (key && !(key in fieldErrors)) fieldErrors[key] = issue.message;
  }
  return fieldErrors;
}

export async function createUserAction(
  _prev: UserActionState,
  formData: FormData,
): Promise<UserActionState> {
  const actor = await requirePermission('usuarios.crear');

  const parsed = createUserSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsFrom(parsed.error) };

  try {
    const ip = getClientIp(await headers());
    const { tempPassword } = await createUser(actor.id, parsed.data, ip);
    revalidatePath(ADMIN_PATH);
    return { ok: true, tempPassword };
  } catch (e) {
    if (e instanceof ValidationError) return { ok: false, fieldErrors: e.fields };
    throw e;
  }
}

export async function updateUserAction(
  _prev: UserActionState,
  formData: FormData,
): Promise<UserActionState> {
  const actor = await requirePermission('usuarios.editar');

  const parsed = editUserSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsFrom(parsed.error) };

  try {
    const ip = getClientIp(await headers());
    await updateUser(actor.id, parsed.data, ip);
    revalidatePath(ADMIN_PATH);
    revalidatePath(`${ADMIN_PATH}/${parsed.data.id}`);
    return { ok: true };
  } catch (e) {
    if (e instanceof ValidationError) {
      return { ok: false, fieldErrors: e.fields, formError: e.fields._form || undefined };
    }
    throw e;
  }
}

export async function setUserActiveAction(
  _prev: UserActionState,
  formData: FormData,
): Promise<UserActionState> {
  const actor = await requirePermission('usuarios.desactivar');

  const targetId = String(formData.get('targetId') ?? '');
  const activo = String(formData.get('activo') ?? '') === 'true';
  if (!targetId) return { ok: false, formError: 'Usuario no válido.' };

  try {
    const ip = getClientIp(await headers());
    await setUserActive(actor.id, targetId, activo, ip);
    revalidatePath(ADMIN_PATH);
    revalidatePath(`${ADMIN_PATH}/${targetId}`);
    return { ok: true };
  } catch (e) {
    if (e instanceof ValidationError) {
      return { ok: false, formError: e.fields._form || e.message, fieldErrors: e.fields };
    }
    throw e;
  }
}

export async function resetPasswordAction(
  _prev: UserActionState,
  formData: FormData,
): Promise<UserActionState> {
  const actor = await requirePermission('usuarios.reset_password');

  const targetId = String(formData.get('targetId') ?? '');
  const motivo = String(formData.get('motivo') ?? '');
  if (!targetId) return { ok: false, formError: 'Usuario no válido.' };
  if (!motivo.trim()) return { ok: false, fieldErrors: { motivo: 'Indica el motivo del restablecimiento.' } };

  try {
    const ip = getClientIp(await headers());
    const { tempPassword } = await resetUserPassword(actor.id, targetId, motivo, ip);
    revalidatePath(ADMIN_PATH);
    revalidatePath(`${ADMIN_PATH}/${targetId}`);
    return { ok: true, tempPassword };
  } catch (e) {
    if (e instanceof ValidationError) {
      return { ok: false, fieldErrors: e.fields, formError: e.fields._form || undefined };
    }
    throw e;
  }
}

export async function revokeUserSessionsAction(
  _prev: UserActionState,
  formData: FormData,
): Promise<UserActionState> {
  const actor = await requirePermission('usuarios.editar');

  const targetId = String(formData.get('targetId') ?? '');
  if (!targetId) return { ok: false, formError: 'Usuario no válido.' };

  const ip = getClientIp(await headers());
  const cantidad = await adminRevokeUserSessions(actor.id, targetId, ip);
  revalidatePath(`${ADMIN_PATH}/${targetId}`);
  return { ok: true, revokedCount: cantidad };
}
