import { describe, it, expect, beforeEach, beforeAll, vi } from 'vitest';
import { db } from '@/lib/db';
import { hashPassword } from '@/lib/auth/password';
import { createSession } from '@/lib/auth/session';
import { logActivity } from '@/lib/audit';

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

beforeEach(async () => {
  await db.activityLog.deleteMany();
  await db.session.deleteMany();
  await db.user.deleteMany();
});

describe('GET /admin/auditoria/export', () => {
  it('403 sin permiso', async () => {
    const cajero = await db.role.findFirstOrThrow({ where: { nombre: 'Cajero' } });
    const u = await db.user.create({
      data: {
        nombre: 'C',
        email: 'c@pos.com',
        passwordHash: await hashPassword('xxxxxxxxxx'),
        roleId: cajero.id,
      },
    });
    cookieStore.value = (await createSession(u.id, {})).token;
    const res = await GET(new Request('http://x/admin/auditoria/export'));
    expect(res.status).toBe(403);
  });

  it('devuelve CSV con permiso auditoria.ver', async () => {
    const admin = await db.role.findFirstOrThrow({ where: { nombre: 'Administrador' } });
    const u = await db.user.create({
      data: {
        nombre: 'A',
        email: 'a@pos.com',
        passwordHash: await hashPassword('xxxxxxxxxx'),
        roleId: admin.id,
      },
    });
    cookieStore.value = (await createSession(u.id, {})).token;
    await logActivity({ actorId: u.id, accion: 'auth.login' });
    const res = await GET(new Request('http://x/admin/auditoria/export'));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/csv');
    const body = await res.text();
    expect(body).toContain('Inicio de sesión');
  });
});
