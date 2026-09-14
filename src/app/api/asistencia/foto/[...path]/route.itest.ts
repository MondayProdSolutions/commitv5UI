import { describe, it, expect, beforeEach, beforeAll, afterAll, vi } from 'vitest';
import { db } from '@/lib/db';
import { createSession } from '@/lib/auth/session';
import { savePhoto } from '@/lib/attendance/photos';
import { seedUser, cleanupAttendance } from '@/lib/attendance/__testutil';

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

const EMAIL_DUENO = 't7-foto-dueno@pos.com';
const EMAIL_OTRO = 't7-foto-otro@pos.com';
const EMAIL_GERENTE = 't7-foto-gerente@pos.com';
const EMAILS = [EMAIL_DUENO, EMAIL_OTRO, EMAIL_GERENTE];

function paramsFor(relativePath: string) {
  return { params: Promise.resolve({ path: relativePath.split('/') }) };
}

beforeEach(async () => {
  await db.session.deleteMany();
  await cleanupAttendance(EMAILS);
});
afterAll(async () => {
  await db.session.deleteMany();
  await cleanupAttendance(EMAILS);
});

describe('GET /api/asistencia/foto/[...path]', () => {
  it('403 sin sesión', async () => {
    cookieStore.value = undefined;
    const res = await GET(new Request('http://x/api/asistencia/foto/2026-09-13/x.jpg'), paramsFor('2026-09-13/x.jpg'));
    expect(res.status).toBe(403);
  });

  it('404 con ruta fuera de ATTENDANCE_PHOTOS_DIR', async () => {
    const dueno = await seedUser(EMAIL_DUENO, 'Empleado');
    cookieStore.value = (await createSession(dueno, {})).token;

    const res = await GET(new Request('http://x/api/asistencia/foto/x'), paramsFor('../../etc/passwd'));
    expect(res.status).toBe(404);
  });

  it('403 si no es el dueño de la foto y no tiene asistencia.ver', async () => {
    const dueno = await seedUser(EMAIL_DUENO, 'Empleado');
    const otro = await seedUser(EMAIL_OTRO, 'Empleado');
    const rel = await savePhoto(Buffer.from('foto'), { userId: dueno, tipo: 'checkin', fecha: '2026-09-13' });
    await db.attendanceRecord.create({
      data: { userId: dueno, fecha: '2026-09-13', checkInAt: new Date(), checkInFotoPath: rel },
    });

    cookieStore.value = (await createSession(otro, {})).token;
    const res = await GET(new Request(`http://x/api/asistencia/foto/${rel}`), paramsFor(rel));
    expect(res.status).toBe(403);
  });

  it('200 para el dueño de la foto', async () => {
    const dueno = await seedUser(EMAIL_DUENO, 'Empleado');
    const rel = await savePhoto(Buffer.from('foto'), { userId: dueno, tipo: 'checkin', fecha: '2026-09-13' });
    await db.attendanceRecord.create({
      data: { userId: dueno, fecha: '2026-09-13', checkInAt: new Date(), checkInFotoPath: rel },
    });

    cookieStore.value = (await createSession(dueno, {})).token;
    const res = await GET(new Request(`http://x/api/asistencia/foto/${rel}`), paramsFor(rel));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/jpeg');
  });

  it('200 para alguien con asistencia.ver aunque no sea el dueño', async () => {
    const dueno = await seedUser(EMAIL_DUENO, 'Empleado');
    const gerente = await seedUser(EMAIL_GERENTE, 'Gerente');
    const rel = await savePhoto(Buffer.from('foto'), { userId: dueno, tipo: 'checkin', fecha: '2026-09-13' });
    await db.attendanceRecord.create({
      data: { userId: dueno, fecha: '2026-09-13', checkInAt: new Date(), checkInFotoPath: rel },
    });

    cookieStore.value = (await createSession(gerente, {})).token;
    const res = await GET(new Request(`http://x/api/asistencia/foto/${rel}`), paramsFor(rel));
    expect(res.status).toBe(200);
  });
});
