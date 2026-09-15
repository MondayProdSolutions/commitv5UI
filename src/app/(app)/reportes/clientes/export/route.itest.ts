import { describe, it, expect, beforeEach, beforeAll, afterAll, vi } from 'vitest';
import { db } from '@/lib/db';
import { hashPassword } from '@/lib/auth/password';
import { createSession } from '@/lib/auth/session';
import { createSale } from '@/lib/sales/sales';
import { seedVariant, cleanupSales, conCajaAbierta } from '@/lib/sales/__testutil';

const cookieStore = { value: undefined as string | undefined };
const tenantHeader = { id: '' };
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: () => (cookieStore.value ? { value: cookieStore.value } : undefined) }),
  headers: async () => new Headers({ 'x-tenant-id': tenantHeader.id }),
}));

import { GET } from './route';

beforeAll(async () => {
  tenantHeader.id = (await db.tenant.findFirstOrThrow({ where: { slug: 'default' } })).id;
});

const EMPLEADO = 't8-reportes-clientes-export-empleado@pos.com';
const CAJERO = 't8-reportes-clientes-export-cajero@pos.com';
const EMAILS = [EMPLEADO, CAJERO];

async function sesionRol(nombre: string, email: string) {
  const role = await db.role.findFirstOrThrow({ where: { nombre } });
  const u = await db.user.create({
    data: { nombre: email, email, passwordHash: await hashPassword('xxxxxxxxxx'), roleId: role.id },
  });
  cookieStore.value = (await createSession(u.id, {})).token;
  return u;
}

async function limpiarClientes() {
  await db.customer.deleteMany({ where: { nombre: { startsWith: 'T8ReportesClienteExport' } } });
}

beforeEach(async () => {
  await db.session.deleteMany();
  await cleanupSales(EMAILS);
  await limpiarClientes();
  cookieStore.value = undefined;
});

afterAll(async () => {
  await db.session.deleteMany();
  await cleanupSales(EMAILS);
  await limpiarClientes();
});

describe('GET /reportes/clientes/export', () => {
  it('403 sin permiso reportes.ver (Empleado)', async () => {
    await sesionRol('Empleado', EMPLEADO);
    const res = await GET(new Request('http://x/reportes/clientes/export'));
    expect(res.status).toBe(403);
  });

  it('200 text/csv con un cliente+venta sembrados (cabecera y nombre en el cuerpo, sin Público en general)', async () => {
    const u = await sesionRol('Cajero', CAJERO);
    await conCajaAbierta(u.id);
    const cliente = await db.customer.create({ data: { nombre: 'T8ReportesClienteExport Ana' } });
    const generico = await db.customer.findFirstOrThrow({ where: { esGenerico: true } });
    const { variantId } = await seedVariant({ precioVenta: 100, stock: 10, tasa: 'default' });

    await createSale(
      u.id,
      {
        customerId: cliente.id,
        lineas: [{ variantId, cantidad: 2 }],
        descuentoTicket: null,
        pagos: [{ metodo: 'EFECTIVO', monto: 232 }],
        requiereFactura: false,
      },
      null,
    );
    await createSale(
      u.id,
      {
        customerId: generico.id,
        lineas: [{ variantId, cantidad: 1 }],
        descuentoTicket: null,
        pagos: [{ metodo: 'EFECTIVO', monto: 116 }],
        requiereFactura: false,
      },
      null,
    );

    const res = await GET(new Request('http://x/reportes/clientes/export'));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/csv');

    const body = await res.text();
    expect(body).toContain('Cliente,Compras,Monto neto,Ticket promedio,Última compra');
    expect(body).toContain('T8ReportesClienteExport Ana');
    expect(body).not.toContain('Público en General');
  });
});
