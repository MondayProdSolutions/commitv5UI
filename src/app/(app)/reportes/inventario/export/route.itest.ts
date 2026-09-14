import { describe, it, expect, beforeEach, beforeAll, afterAll, vi } from 'vitest';
import { db } from '@/lib/db';
import { hashPassword } from '@/lib/auth/password';
import { createSession } from '@/lib/auth/session';
import { seedVariant } from '@/lib/sales/__testutil';

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

const EMPLEADO = 't6-reportes-inv-export-empleado@pos.com';
const CAJERO = 't6-reportes-inv-export-cajero@pos.com';
const EMAILS = [EMPLEADO, CAJERO];

async function sesionRol(nombre: string, email: string) {
  const role = await db.role.findFirstOrThrow({ where: { nombre } });
  const u = await db.user.create({
    data: { nombre: email, email, passwordHash: await hashPassword('xxxxxxxxxx'), roleId: role.id },
  });
  cookieStore.value = (await createSession(u.id, {})).token;
  return u;
}

async function limpiar() {
  await db.session.deleteMany();
  await db.inventoryMovement.deleteMany({ where: { motivo: { startsWith: 't6-reportes-inv-export' } } });
  await db.productVariant.deleteMany({ where: { product: { nombre: { startsWith: 'T6ReportesInvExport' } } } });
  await db.product.deleteMany({ where: { nombre: { startsWith: 'T6ReportesInvExport' } } });
  await db.user.deleteMany({ where: { email: { in: EMAILS } } });
  cookieStore.value = undefined;
}

beforeEach(limpiar);
afterAll(limpiar);

describe('GET /reportes/inventario/export', () => {
  it('403 sin permiso reportes.ver (Empleado)', async () => {
    await sesionRol('Empleado', EMPLEADO);
    const res = await GET(new Request('http://x/reportes/inventario/export'));
    expect(res.status).toBe(403);
  });

  it('200 text/csv con el movimiento sembrado (cabecera y producto en el cuerpo)', async () => {
    await sesionRol('Cajero', CAJERO);
    const { variantId } = await seedVariant({
      precioVenta: 100,
      stock: 7,
      nombreProducto: 'T6ReportesInvExport Uno',
    });
    await db.inventoryMovement.create({
      data: {
        variantId,
        tipo: 'ENTRADA',
        cantidad: 7,
        stockPrevio: 0,
        stockNuevo: 7,
        motivo: 't6-reportes-inv-export entrada',
      },
    });

    const res = await GET(new Request('http://x/reportes/inventario/export'));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/csv');

    const body = await res.text();
    expect(body).toContain('Fecha,Producto,Tipo,Cantidad,Usuario');
    expect(body).toContain('T6ReportesInvExport Uno');
  });
});
