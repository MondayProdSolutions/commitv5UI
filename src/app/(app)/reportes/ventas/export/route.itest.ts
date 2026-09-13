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

import { GET } from './route';

const EMPLEADO = 't6-reportes-ventas-export-empleado@pos.com';
const CAJERO = 't6-reportes-ventas-export-cajero@pos.com';
const EMAILS = [EMPLEADO, CAJERO];

async function sesionRol(nombre: string, email: string) {
  const role = await db.role.findFirstOrThrow({ where: { nombre } });
  const u = await db.user.create({
    data: { nombre: email, email, passwordHash: await hashPassword('xxxxxxxxxx'), roleId: role.id },
  });
  cookieStore.value = (await createSession(u.id, {})).token;
  return u;
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

describe('GET /reportes/ventas/export', () => {
  it('403 sin permiso reportes.ver (Empleado)', async () => {
    await sesionRol('Empleado', EMPLEADO);
    const res = await GET(new Request('http://x/reportes/ventas/export'));
    expect(res.status).toBe(403);
  });

  it('200 text/csv con la venta sembrada (cabecera y monto en el cuerpo)', async () => {
    const u = await sesionRol('Cajero', CAJERO);
    await conCajaAbierta(u.id);
    const { variantId } = await seedVariant({ precioVenta: 100, stock: 10, tasa: 'default' });

    await createSale(
      u.id,
      {
        customerId: null,
        lineas: [{ variantId, cantidad: 2 }],
        descuentoTicket: null,
        pagos: [{ metodo: 'EFECTIVO', monto: 232 }],
        requiereFactura: false,
      },
      null,
    );

    const res = await GET(new Request('http://x/reportes/ventas/export'));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/csv');

    const body = await res.text();
    expect(body).toContain('Fecha,Ventas,Ingreso bruto,Devoluciones,Ingreso neto,IVA');
    expect(body).toContain('232.00');
  });
});
