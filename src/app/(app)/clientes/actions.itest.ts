import { describe, it, expect, beforeEach, beforeAll, afterAll, vi } from 'vitest';
import { db } from '@/lib/db';
import { hashPassword } from '@/lib/auth/password';
import { createSession } from '@/lib/auth/session';

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

import { crearClienteAction, editarClienteAction, archivarClienteAction } from './actions';

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

beforeEach(async () => {
  await db.activityLog.deleteMany();
  await db.customer.deleteMany({ where: { esGenerico: false } });
  await db.session.deleteMany();
  await db.user.deleteMany();
  cookieStore.value = undefined;
  redirectMock.mockClear();
});
afterAll(async () => {
  await db.activityLog.deleteMany();
  await db.customer.deleteMany({ where: { esGenerico: false } });
  await db.session.deleteMany();
  await db.user.deleteMany();
});

describe('RBAC de las acciones de clientes', () => {
  it('Empleado no puede crear (ForbiddenError)', async () => {
    await userConRol('Empleado', 'empleado@pos.com');
    await expect(
      crearClienteAction({ ok: false }, fd({ nombre: 'Nuevo Cliente' })),
    ).rejects.toMatchObject({ name: 'ForbiddenError' });
    expect(await db.customer.count({ where: { esGenerico: false } })).toBe(0);
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it('Cajero puede crear pero no editar ni archivar', async () => {
    await userConRol('Cajero', 'cajero@pos.com');
    await expect(
      crearClienteAction({ ok: false }, fd({ nombre: 'Cliente del Cajero' })),
    ).rejects.toThrow(/REDIRECT:\/clientes\//);
    const creado = await db.customer.findFirstOrThrow({ where: { nombre: 'Cliente del Cajero' } });

    await expect(
      editarClienteAction({ ok: false }, fd({ id: creado.id, nombre: 'Cambiado' })),
    ).rejects.toMatchObject({ name: 'ForbiddenError' });
    await expect(
      archivarClienteAction({ ok: false }, fd({ id: creado.id })),
    ).rejects.toMatchObject({ name: 'ForbiddenError' });

    // Nada mutado por los intentos denegados.
    const sinTocar = await db.customer.findUniqueOrThrow({ where: { id: creado.id } });
    expect(sinTocar.nombre).toBe('Cliente del Cajero');
    expect(sinTocar.archivado).toBe(false);
  });

  it('Gerente puede crear, editar y archivar', async () => {
    await userConRol('Gerente', 'gerente@pos.com');
    await expect(
      crearClienteAction({ ok: false }, fd({ nombre: 'Cliente Gerente' })),
    ).rejects.toThrow(/REDIRECT:/);
    const creado = await db.customer.findFirstOrThrow({ where: { nombre: 'Cliente Gerente' } });

    const edit = await editarClienteAction(
      { ok: false },
      fd({ id: creado.id, nombre: 'Cliente Gerente 2' }),
    );
    expect(edit.ok).toBe(true);
    expect((await db.customer.findUniqueOrThrow({ where: { id: creado.id } })).nombre).toBe(
      'Cliente Gerente 2',
    );

    const arch = await archivarClienteAction({ ok: false }, fd({ id: creado.id }));
    expect(arch.ok).toBe(true);
    expect((await db.customer.findUniqueOrThrow({ where: { id: creado.id } })).archivado).toBe(true);
  });

  it('validación: nombre corto devuelve fieldErrors, sin redirect', async () => {
    await userConRol('Gerente', 'g2@pos.com');
    const res = await crearClienteAction({ ok: false }, fd({ nombre: 'A' }));
    expect(res.ok).toBe(false);
    expect(res.fieldErrors?.nombre).toBeTruthy();
    expect(redirectMock).not.toHaveBeenCalled();
    expect(await db.customer.count({ where: { esGenerico: false } })).toBe(0);
  });
});
