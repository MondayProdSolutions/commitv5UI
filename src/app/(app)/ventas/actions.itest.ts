import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import { db } from '@/lib/db';
import { hashPassword } from '@/lib/auth/password';
import { createSession } from '@/lib/auth/session';
import { createSale } from '@/lib/sales/sales';
import { seedVariant, cleanupSales, conCajaAbierta } from '@/lib/sales/__testutil';

const cookieStore = { value: undefined as string | undefined };
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: () => (cookieStore.value ? { value: cookieStore.value } : undefined) }),
  headers: async () => new Headers(),
}));
vi.mock('next/cache', () => ({ revalidatePath: () => {} }));
const redirectMock = vi.fn((url: string) => {
  throw new Error(`REDIRECT:${url}`);
});
vi.mock('next/navigation', () => ({ redirect: (u: string) => redirectMock(u) }));

import { crearVentaAction, cancelarVentaAction, crearDevolucionAction } from './actions';

const EMPLEADO = 't10-empleado@pos.com';
const CAJERO = 't10-cajero@pos.com';
const GERENTE = 't10-gerente@pos.com';
const CAJA_SEED = 't10-caja-seed@pos.com';
const EMAILS = [EMPLEADO, CAJERO, GERENTE, CAJA_SEED];

async function sesionRol(nombre: string, email: string) {
  const role = await db.role.findFirstOrThrow({ where: { nombre } });
  const u = await db.user.create({
    data: { nombre: email, email, passwordHash: await hashPassword('xxxxxxxxxx'), roleId: role.id },
  });
  cookieStore.value = (await createSession(u.id, {})).token;
  return u;
}

function payloadFd(payload: unknown): FormData {
  const f = new FormData();
  f.set('payload', JSON.stringify(payload));
  return f;
}

function fd(obj: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(obj)) f.set(k, v);
  return f;
}

/** Crea una venta previa directamente (sin pasar por la acción) y devuelve id + saleLineId. */
async function ventaPrevia(actorId: string, cantidad = 2) {
  const { variantId } = await seedVariant({ precioVenta: 100, stock: 50 });
  const { id } = await createSale(
    actorId,
    {
      customerId: null,
      lineas: [{ variantId, cantidad }],
      descuentoTicket: null,
      pagos: [{ metodo: 'EFECTIVO', monto: 100_000 }],
      requiereFactura: false,
    },
    null,
  );
  const sale = await db.sale.findUniqueOrThrow({ where: { id }, include: { lines: true } });
  return { id, saleLineId: sale.lines[0]!.id };
}

beforeEach(async () => {
  await db.session.deleteMany();
  await cleanupSales(EMAILS);
  cookieStore.value = undefined;
  redirectMock.mockClear();
  // Ventas/devoluciones exigen una caja abierta: sembrar un cajero dedicado y abrirla.
  const cajaRole = await db.role.findFirstOrThrow({ where: { nombre: 'Cajero' } });
  const cajaUser = await db.user.create({
    data: {
      nombre: CAJA_SEED,
      email: CAJA_SEED,
      passwordHash: await hashPassword('xxxxxxxxxx'),
      roleId: cajaRole.id,
    },
  });
  await conCajaAbierta(cajaUser.id);
});

afterAll(async () => {
  await db.session.deleteMany();
  await cleanupSales(EMAILS);
});

describe('crearVentaAction', () => {
  it('Empleado no puede crear ventas (ForbiddenError), nada creado', async () => {
    await sesionRol('Empleado', EMPLEADO);
    const { variantId } = await seedVariant({ precioVenta: 100, stock: 10 });

    await expect(
      crearVentaAction(
        { ok: false },
        payloadFd({
          lineas: [{ variantId, cantidad: 1 }],
          pagos: [{ metodo: 'EFECTIVO', monto: 500 }],
        }),
      ),
    ).rejects.toMatchObject({ name: 'ForbiddenError' });

    expect(await db.sale.count()).toBe(0);
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it('Cajero: venta sin descuento → REDIRECT a /ventas/<id>', async () => {
    await sesionRol('Cajero', CAJERO);
    const { variantId } = await seedVariant({ precioVenta: 100, stock: 10 });

    await expect(
      crearVentaAction(
        { ok: false },
        payloadFd({
          lineas: [{ variantId, cantidad: 2 }],
          pagos: [{ metodo: 'EFECTIVO', monto: 500 }],
        }),
      ),
    ).rejects.toThrow(/REDIRECT:\/ventas\//);

    expect(await db.sale.count()).toBe(1);
  });

  it('Cajero: descuento de línea sin permiso → formError, nada creado', async () => {
    await sesionRol('Cajero', CAJERO);
    const { variantId } = await seedVariant({ precioVenta: 100, stock: 10 });

    const res = await crearVentaAction(
      { ok: false },
      payloadFd({
        lineas: [{ variantId, cantidad: 2, descuento: { tipo: 'monto', valor: 10 } }],
        pagos: [{ metodo: 'EFECTIVO', monto: 500 }],
      }),
    );

    expect(res).toEqual({ ok: false, formError: 'No tienes permiso para aplicar descuentos.' });
    expect(await db.sale.count()).toBe(0);
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it('Cajero: descuento de ticket sin permiso → mismo formError, nada creado', async () => {
    await sesionRol('Cajero', CAJERO);
    const { variantId } = await seedVariant({ precioVenta: 100, stock: 10 });

    const res = await crearVentaAction(
      { ok: false },
      payloadFd({
        lineas: [{ variantId, cantidad: 2 }],
        descuentoTicket: { tipo: 'porcentaje', valor: 5 },
        pagos: [{ metodo: 'EFECTIVO', monto: 500 }],
      }),
    );

    expect(res).toEqual({ ok: false, formError: 'No tienes permiso para aplicar descuentos.' });
    expect(await db.sale.count()).toBe(0);
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it('payload con lineas vacías → fieldErrors.lineas, sin redirect', async () => {
    await sesionRol('Cajero', CAJERO);

    const res = await crearVentaAction(
      { ok: false },
      payloadFd({ lineas: [], pagos: [{ metodo: 'EFECTIVO', monto: 10 }] }),
    );

    expect(res.ok).toBe(false);
    expect(res.fieldErrors?.lineas).toBeTruthy();
    expect(redirectMock).not.toHaveBeenCalled();
    expect(await db.sale.count()).toBe(0);
  });

  it('payload no-JSON → fieldErrors.payload, sin redirect', async () => {
    await sesionRol('Cajero', CAJERO);

    const f = new FormData();
    f.set('payload', 'no-es-json{');
    const res = await crearVentaAction({ ok: false }, f);

    expect(res).toEqual({ ok: false, fieldErrors: { payload: 'Datos de venta inválidos.' } });
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it('pago que no cubre el total → formError de createSale, sin redirect, FolioCounter.V intacto', async () => {
    await sesionRol('Cajero', CAJERO);
    const { variantId } = await seedVariant({ precioVenta: 100, stock: 10 });
    const before = (await db.folioCounter.findUniqueOrThrow({ where: { serie: 'V' } })).valor;

    const res = await crearVentaAction(
      { ok: false },
      payloadFd({
        lineas: [{ variantId, cantidad: 2 }],
        pagos: [{ metodo: 'EFECTIVO', monto: 50 }],
      }),
    );

    expect(res.ok).toBe(false);
    expect(res.formError).toBeTruthy();
    expect(redirectMock).not.toHaveBeenCalled();
    expect(await db.sale.count()).toBe(0);
    const after = (await db.folioCounter.findUniqueOrThrow({ where: { serie: 'V' } })).valor;
    expect(after).toBe(before);
  });
});

describe('cancelarVentaAction', () => {
  it('Cajero no puede cancelar (ForbiddenError)', async () => {
    const u = await sesionRol('Cajero', CAJERO);
    const { id } = await ventaPrevia(u.id);

    await expect(
      cancelarVentaAction({ ok: false }, fd({ saleId: id, motivo: 'prueba' })),
    ).rejects.toMatchObject({ name: 'ForbiddenError' });

    expect((await db.sale.findUniqueOrThrow({ where: { id } })).estado).toBe('COMPLETADA');
  });

  it('saleId vacío → formError sin tocar la base', async () => {
    await sesionRol('Gerente', GERENTE);
    const res = await cancelarVentaAction({ ok: false }, fd({ saleId: '', motivo: 'x' }));
    expect(res).toEqual({ ok: false, formError: 'Venta no válida.' });
  });
});

describe('crearDevolucionAction', () => {
  it('Cajero puede devolver sobre una venta previa → REDIRECT a /ventas/devoluciones/<id>', async () => {
    const u = await sesionRol('Cajero', CAJERO);
    const { id, saleLineId } = await ventaPrevia(u.id, 2);

    await expect(
      crearDevolucionAction(
        { ok: false },
        payloadFd({
          saleId: id,
          lineas: [{ saleLineId, cantidad: 1 }],
          metodoReembolso: 'EFECTIVO',
          motivo: 'Producto defectuoso',
        }),
      ),
    ).rejects.toThrow(/REDIRECT:\/ventas\/devoluciones\//);

    expect(await db.return.count()).toBe(1);
  });
});

describe('Gerente: crear con descuento, cancelar y devolver', () => {
  it('las tres acciones proceden', async () => {
    const u = await sesionRol('Gerente', GERENTE);

    // 1. Crear con descuento de línea → REDIRECT
    const a = await seedVariant({ precioVenta: 100, stock: 50 });
    await expect(
      crearVentaAction(
        { ok: false },
        payloadFd({
          lineas: [{ variantId: a.variantId, cantidad: 2, descuento: { tipo: 'monto', valor: 10 } }],
          descuentoTicket: { tipo: 'porcentaje', valor: 5 },
          pagos: [{ metodo: 'EFECTIVO', monto: 1000 }],
        }),
      ),
    ).rejects.toThrow(/REDIRECT:\/ventas\//);

    // 2. Cancelar una venta cuya caja sigue abierta → { ok: true }
    const previa = await ventaPrevia(u.id);
    const cancel = await cancelarVentaAction(
      { ok: false },
      fd({ saleId: previa.id, motivo: 'Error de captura' }),
    );
    expect(cancel).toEqual({ ok: true });
    expect((await db.sale.findUniqueOrThrow({ where: { id: previa.id } })).estado).toBe('CANCELADA');

    // 3. Devolver otra venta → REDIRECT
    const otra = await ventaPrevia(u.id);
    await expect(
      crearDevolucionAction(
        { ok: false },
        payloadFd({
          saleId: otra.id,
          lineas: [{ saleLineId: otra.saleLineId, cantidad: 1 }],
          metodoReembolso: 'EFECTIVO',
          motivo: 'Producto defectuoso',
        }),
      ),
    ).rejects.toThrow(/REDIRECT:\/ventas\/devoluciones\//);
  });
});
