import { describe, it, expect, beforeEach, beforeAll, afterAll, vi } from 'vitest';
import { db } from '@/lib/db';
import { hashPassword } from '@/lib/auth/password';
import { createSession } from '@/lib/auth/session';
import { ForbiddenError } from '@/lib/errors';

const cookieStore = { value: undefined as string | undefined };
const tenantHeader = { id: '' };
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: () => (cookieStore.value ? { value: cookieStore.value } : undefined) }),
  headers: async () => new Headers({ 'x-tenant-id': tenantHeader.id }),
}));
vi.mock('next/cache', () => ({ revalidatePath: () => {} }));
const redirectMock = vi.fn((url: string) => {
  throw new Error(`REDIRECT:${url}`);
});
vi.mock('next/navigation', () => ({ redirect: (u: string) => redirectMock(u) }));

import { abrirCajaAction, registrarMovimientoCajaAction, cerrarCajaAction } from './actions';

beforeAll(async () => {
  tenantHeader.id = (await db.tenant.findFirstOrThrow({ where: { slug: 'default' } })).id;
});

async function userConRol(nombre: string, email: string) {
  const role = await db.role.findFirstOrThrow({ where: { nombre } });
  const u = await db.user.create({
    data: { nombre: email, email, passwordHash: await hashPassword('xxxxxxxxxx'), roleId: role.id },
  });
  cookieStore.value = (await createSession(u.id, {})).token;
  return u;
}

function fd(obj: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(obj)) f.set(k, v);
  return f;
}

async function limpiar() {
  await db.activityLog.deleteMany();
  await db.cashMovement.deleteMany();
  await db.cashSession.deleteMany();
  await db.session.deleteMany();
  await db.user.deleteMany();
}

beforeEach(async () => {
  await limpiar();
  cookieStore.value = undefined;
  redirectMock.mockClear();
});
afterAll(async () => {
  await limpiar();
});

describe('acciones de caja', () => {
  it('Empleado no puede abrir caja (ForbiddenError), nada creado', async () => {
    await userConRol('Empleado', 'empleado@pos.com');
    await expect(
      abrirCajaAction({ ok: false }, fd({ fondoApertura: '500' })),
    ).rejects.toThrow(ForbiddenError);
    expect(await db.cashSession.count()).toBe(0);
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it('Cajero abre caja (redirect), segunda apertura falla con formError', async () => {
    await userConRol('Cajero', 'cajero@pos.com');

    await expect(
      abrirCajaAction({ ok: false }, fd({ fondoApertura: '500' })),
    ).rejects.toThrow(/REDIRECT:\/caja/);
    expect(await db.cashSession.count()).toBe(1);

    const res = await abrirCajaAction({ ok: false }, fd({ fondoApertura: '500' }));
    expect(res).toEqual({ ok: false, formError: 'Ya hay una caja abierta.', fieldErrors: {} });
    expect(await db.cashSession.count()).toBe(1);
  });

  it('registra movimiento de caja válido e inválido', async () => {
    await userConRol('Cajero', 'cajero@pos.com');
    await expect(
      abrirCajaAction({ ok: false }, fd({ fondoApertura: '500' })),
    ).rejects.toThrow(/REDIRECT:\/caja/);
    redirectMock.mockClear();

    const ok = await registrarMovimientoCajaAction(
      { ok: false },
      fd({ tipo: 'RETIRO', monto: '200', motivo: 'banco' }),
    );
    expect(ok).toEqual({ ok: true });
    expect(await db.cashMovement.count()).toBe(1);

    const bad = await registrarMovimientoCajaAction(
      { ok: false },
      fd({ tipo: 'RETIRO', monto: '0', motivo: 'banco' }),
    );
    expect(bad.ok).toBe(false);
    expect(bad.fieldErrors?.monto).toBeTruthy();
    expect(redirectMock).not.toHaveBeenCalled();
    expect(await db.cashMovement.count()).toBe(1);
  });

  it('cierra caja (redirect), segundo cierre sin sesión abierta falla con formError', async () => {
    await userConRol('Cajero', 'cajero@pos.com');
    await expect(
      abrirCajaAction({ ok: false }, fd({ fondoApertura: '500' })),
    ).rejects.toThrow(/REDIRECT:\/caja/);

    await expect(
      cerrarCajaAction({ ok: false }, fd({ efectivoContado: '700' })),
    ).rejects.toThrow(/REDIRECT:\/caja\/sesiones\//);
    expect((await db.cashSession.findFirstOrThrow()).estado).toBe('CERRADA');

    const res = await cerrarCajaAction({ ok: false }, fd({ efectivoContado: '700' }));
    expect(res.ok).toBe(false);
    expect(res.formError).toBeTruthy();
  });

  it('validación zod: fondoApertura negativo devuelve fieldErrors sin redirect', async () => {
    await userConRol('Cajero', 'cajero@pos.com');
    const res = await abrirCajaAction({ ok: false }, fd({ fondoApertura: '-1' }));
    expect(res.ok).toBe(false);
    expect(res.fieldErrors?.fondoApertura).toBeTruthy();
    expect(redirectMock).not.toHaveBeenCalled();
    expect(await db.cashSession.count()).toBe(0);
  });
});
