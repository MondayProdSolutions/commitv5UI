import { describe, it, expect, beforeEach, beforeAll, afterAll, vi } from 'vitest';
import { db } from '@/lib/db';
import { hashPassword } from '@/lib/auth/password';
import { createSession } from '@/lib/auth/session';
import { computeSale } from '@/lib/sales/compute';
import { seedVariant, cleanupSales } from '@/lib/sales/__testutil';

const cookieStore = { value: undefined as string | undefined };
const tenantHeader = { id: '' };
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: () => (cookieStore.value ? { value: cookieStore.value } : undefined) }),
  headers: async () => new Headers({ 'x-tenant-id': tenantHeader.id }),
}));

import { POST } from './route';

beforeAll(async () => {
  tenantHeader.id = (await db.tenant.findFirstOrThrow({ where: { slug: 'default' } })).id;
});

const EMPLEADO = 't10-quote-empleado@pos.com';
const CAJERO = 't10-quote-cajero@pos.com';
const EMAILS = [EMPLEADO, CAJERO];

async function sesionRol(nombre: string, email: string) {
  const role = await db.role.findFirstOrThrow({ where: { nombre } });
  const u = await db.user.create({
    data: { nombre: email, email, passwordHash: await hashPassword('xxxxxxxxxx'), roleId: role.id },
  });
  cookieStore.value = (await createSession(u.id, {})).token;
  return u;
}

function req(body: unknown): Request {
  return new Request('http://x/ventas/quote', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(async () => {
  await db.session.deleteMany();
  await cleanupSales(EMAILS);
  cookieStore.value = undefined;
});

afterAll(async () => {
  await db.session.deleteMany();
  await cleanupSales(EMAILS);
});

describe('POST /ventas/quote', () => {
  it('403 sin permiso ventas.crear (Empleado)', async () => {
    await sesionRol('Empleado', EMPLEADO);
    const res = await POST(req({ lineas: [{ variantId: 'x', cantidad: 1 }] }));
    expect(res.status).toBe(403);
  });

  it('200 con desglose correcto para 2 líneas de tasas mixtas + descuento de ticket', async () => {
    await sesionRol('Cajero', CAJERO);
    const a = await seedVariant({ precioVenta: 100, stock: 10, tasa: 'default' });
    const b = await seedVariant({ precioVenta: 50, stock: 10, tasa: 'exento' });

    const descuentoTicket = { tipo: 'porcentaje' as const, valor: 5 };
    const res = await POST(
      req({
        lineas: [
          { variantId: a.variantId, cantidad: 2 },
          { variantId: b.variantId, cantidad: 3 },
        ],
        descuentoTicket,
      }),
    );
    expect(res.status).toBe(200);

    const json = await res.json();
    const expected = computeSale({
      lineas: [
        { variantId: a.variantId, cantidad: 2, precioUnitario: 100, tasaImpuesto: a.tasa, descuento: null },
        { variantId: b.variantId, cantidad: 3, precioUnitario: 50, tasaImpuesto: b.tasa, descuento: null },
      ],
      descuentoTicket,
    });

    expect(json.subtotal).toBe(expected.subtotal);
    expect(json.impuestos).toBe(expected.impuestos);
    expect(json.total).toBe(expected.total);
    expect(json.descuentoTicket).toBe(expected.descuentoTicket);
    expect(json.lineas).toHaveLength(2);
  });

  it('variante inexistente → 400 con campo que nombra la línea', async () => {
    await sesionRol('Cajero', CAJERO);
    const res = await POST(req({ lineas: [{ variantId: 'no-existe', cantidad: 1 }] }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.campo).toBe('lineas.0.variantId');
  });

  it('cuerpo sin líneas → 400 "Cuerpo inválido."', async () => {
    await sesionRol('Cajero', CAJERO);
    const res = await POST(req({ lineas: [] }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('Cuerpo inválido.');
  });
});
