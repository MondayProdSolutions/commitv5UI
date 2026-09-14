import { describe, it, expect, beforeEach, beforeAll, vi } from 'vitest';
import { db } from '@/lib/db';
import { hashPassword } from '@/lib/auth/password';
import { createSession } from '@/lib/auth/session';
import { recordMovement } from '@/lib/inventory/movements';

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

async function makeUser(roleId: string, email: string) {
  return db.user.create({
    data: {
      nombre: email,
      email,
      passwordHash: await hashPassword('xxxxxxxxxx'),
      roleId,
    },
  });
}

async function seedVariant(stock = 0) {
  const tax = await db.taxRate.findFirstOrThrow({ where: { esDefault: true } });
  const p = await db.product.create({
    data: {
      nombre: `P-${Math.random()}`,
      taxRateId: tax.id,
      tipo: 'SIMPLE',
      variants: { create: { esDefault: true, precioVenta: 10, precioCompra: 0, stock } },
    },
    include: { variants: true },
  });
  return p.variants[0]!;
}

beforeEach(async () => {
  await db.activityLog.deleteMany();
  await db.inventoryMovement.deleteMany();
  await db.session.deleteMany();
  await db.productVariant.deleteMany();
  await db.product.deleteMany();
  await db.user.deleteMany();
  await db.role.deleteMany({ where: { nombre: 'SinAccesoInventario' } });
});

describe('GET /inventario/movimientos/export', () => {
  it('403 sin permiso inventario.ver', async () => {
    const role = await db.role.create({
      data: { nombre: 'SinAccesoInventario', descripcion: 'Rol de prueba sin permisos' },
    });
    const u = await makeUser(role.id, 'noaccess@pos.com');
    cookieStore.value = (await createSession(u.id, {})).token;

    const res = await GET(new Request('http://x/inventario/movimientos/export'));
    expect(res.status).toBe(403);
  });

  it('devuelve CSV con permiso inventario.ver (Gerente)', async () => {
    const gerente = await db.role.findFirstOrThrow({ where: { nombre: 'Gerente' } });
    const u = await makeUser(gerente.id, 'gerente@pos.com');
    cookieStore.value = (await createSession(u.id, {})).token;

    const v = await seedVariant(0);
    await recordMovement({
      variantId: v.id,
      tipo: 'ENTRADA',
      valor: 7,
      motivo: 'compra inicial',
      actorId: u.id,
    });

    const res = await GET(new Request('http://x/inventario/movimientos/export'));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/csv');
    const body = await res.text();
    expect(body).toContain('Entrada');
    expect(body).toContain('compra inicial');
  });
});
