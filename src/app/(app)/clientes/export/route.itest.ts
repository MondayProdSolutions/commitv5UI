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
import { GET } from './route';

beforeAll(async () => {
  tenantHeader.id = (await db.tenant.findFirstOrThrow({ where: { slug: 'default' } })).id;
});

async function makeUser(roleId: string, email: string) {
  return db.user.create({
    data: { nombre: email, email, passwordHash: await hashPassword('xxxxxxxxxx'), roleId },
  });
}

beforeEach(async () => {
  await db.activityLog.deleteMany();
  await db.session.deleteMany();
  await db.customer.deleteMany({ where: { esGenerico: false } });
  await db.user.deleteMany();
  await db.role.deleteMany({ where: { nombre: 'SinAccesoClientes' } });
});
afterAll(async () => {
  await db.customer.deleteMany({ where: { esGenerico: false } });
  await db.user.deleteMany();
  await db.role.deleteMany({ where: { nombre: 'SinAccesoClientes' } });
});

describe('GET /clientes/export', () => {
  it('403 sin permiso clientes.ver', async () => {
    const role = await db.role.create({ data: { nombre: 'SinAccesoClientes', descripcion: 'test' } });
    const u = await makeUser(role.id, 'noaccess@pos.com');
    cookieStore.value = (await createSession(u.id, {})).token;

    const res = await GET(new Request('http://x/clientes/export'));
    expect(res.status).toBe(403);
  });

  it('200 text/csv con permiso; RFC completo en el cuerpo', async () => {
    const gerente = await db.role.findFirstOrThrow({ where: { nombre: 'Gerente' } });
    const u = await makeUser(gerente.id, 'gerente@pos.com');
    cookieStore.value = (await createSession(u.id, {})).token;

    await db.customer.create({
      data: {
        nombre: 'Cliente Export', rfc: 'ABC010101XYZ', razonSocial: 'ACME',
        regimenFiscalCode: '601', usoCfdiCode: 'G03', cpFiscal: '06000',
      },
    });

    const res = await GET(new Request('http://x/clientes/export?estado=todos'));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/csv');
    const body = await res.text();
    expect(body).toContain('Cliente Export');
    expect(body).toContain('ABC010101XYZ'); // RFC completo, no enmascarado
  });
});
