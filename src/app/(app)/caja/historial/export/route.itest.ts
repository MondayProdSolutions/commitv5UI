import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import { db } from '@/lib/db';
import { hashPassword } from '@/lib/auth/password';
import { createSession } from '@/lib/auth/session';
import { openCashSession, closeCashSession } from '@/lib/cash/sessions';

const cookieStore = { value: undefined as string | undefined };
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: () => (cookieStore.value ? { value: cookieStore.value } : undefined) }),
  headers: async () => new Headers(),
}));

import { GET } from './route';

const EMPLEADO = 't10-caja-export-empleado@pos.com';
const GESTOR = 't10-caja-export-gestor@pos.com';
const EMAILS = [EMPLEADO, GESTOR];

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
  await db.activityLog.deleteMany();
  await db.cashMovement.deleteMany();
  await db.cashSession.deleteMany();
  await db.user.deleteMany({ where: { email: { in: EMAILS } } });
}

beforeEach(limpiar);
afterAll(limpiar);

describe('GET /caja/historial/export', () => {
  it('403 sin permiso caja.gestionar (Empleado)', async () => {
    await sesionRol('Empleado', EMPLEADO);
    const res = await GET(new Request('http://x/caja/historial/export'));
    expect(res.status).toBe(403);
  });

  it('200 text/csv con una sesión cerrada sembrada (folio y diferencia en el cuerpo)', async () => {
    const u = await sesionRol('Gerente', GESTOR);

    const { folio } = await openCashSession(u.id, 1000, null);
    const { diferencia } = await closeCashSession(u.id, 1022, null, null);
    expect(diferencia).toBe(22);

    const res = await GET(new Request('http://x/caja/historial/export'));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/csv');

    const body = await res.text();
    expect(body).toContain(
      'Folio,Estado,Apertura,Cierre,Abrió,Cerró,Fondo,Efectivo ventas,Tarjeta,Transferencia,Reembolsos efectivo,Retiros,Ingresos,Esperado,Contado,Diferencia,Nº ventas',
    );
    expect(body).toContain(folio);
    expect(body).toContain('22.00');
  });
});
