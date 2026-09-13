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

const CAJERO = 't7-reportes-margen-export-cajero@pos.com';
const GERENTE = 't7-reportes-margen-export-gerente@pos.com';
const EMAILS = [CAJERO, GERENTE];

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

describe('GET /reportes/margen/export', () => {
  it('403 con reportes.ver pero sin reportes.margen (Cajero)', async () => {
    await sesionRol('Cajero', CAJERO);
    const res = await GET(new Request('http://x/reportes/margen/export'));
    expect(res.status).toBe(403);
  });

  it('200 text/csv con Gerente y una venta+costo sembrados (cabecera y utilidad en el cuerpo)', async () => {
    const u = await sesionRol('Gerente', GERENTE);
    await conCajaAbierta(u.id);
    const { variantId } = await seedVariant({ precioVenta: 100, stock: 10, tasa: 'default' });
    await db.productVariant.update({ where: { id: variantId }, data: { precioCompra: 60 } });

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

    const res = await GET(new Request('http://x/reportes/margen/export'));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/csv');

    const body = await res.text();
    expect(body).toContain('Producto,Unidades,Ingreso,Costo,Utilidad,% Margen');
    // ingreso neto = 2×100=200; costo = 2×60=120; utilidad = 80.
    expect(body).toContain('80.00');
  });
});
