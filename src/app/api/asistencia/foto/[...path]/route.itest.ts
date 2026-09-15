import { describe, it, expect, beforeEach, beforeAll, afterAll, vi } from 'vitest';
import { db, withPlatformAdmin, withTenant } from '@/lib/db';
import { createSession } from '@/lib/auth/session';
import { hashPassword } from '@/lib/auth/password';
import { savePhoto } from '@/lib/attendance/photos';
import { seedUser, cleanupAttendance } from '@/lib/attendance/__testutil';

const cookieStore = { value: undefined as string | undefined };
const tenantHeader = { id: '' };
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: () => (cookieStore.value ? { value: cookieStore.value } : undefined) }),
  headers: async () => new Headers({ 'x-tenant-id': tenantHeader.id }),
}));
import { GET } from './route';

const SLUG_OTRO_TENANT = 't7-foto-otro-tenant';

beforeAll(async () => {
  tenantHeader.id = (await db.tenant.findFirstOrThrow({ where: { slug: 'default' } })).id;
});

/** Crea (o reutiliza) un segundo tenant, con su propio rol "Gerente de fotos"
 *  (permiso asistencia.ver) y un usuario dueño de ese tenant. Devuelve la ruta
 *  relativa de una foto guardada para ese usuario, con su AttendanceRecord
 *  creado SOLO en el tenant B — nunca en el tenant "default" que usa el resto
 *  del archivo. Las fotos viven en un directorio plano agnóstico de tenant
 *  (ver src/lib/attendance/photos.ts): el mismo archivo en disco es
 *  "visible" para cualquier tenant que conozca la ruta — la única protección
 *  real es que el AttendanceRecord que la referencia sólo existe, bajo RLS,
 *  dentro del tenant B. */
async function seedFotoDeOtroTenant() {
  const otroTenant = await withPlatformAdmin(async () => {
    const plan = await db.plan.upsert({
      where: { nombre: 'Estándar' },
      update: {},
      create: { nombre: 'Estándar', maxUsuarios: 10, maxSucursales: 3 },
    });
    return db.tenant.upsert({
      where: { slug: SLUG_OTRO_TENANT },
      update: {},
      create: { slug: SLUG_OTRO_TENANT, nombre: SLUG_OTRO_TENANT, estado: 'ACTIVO', planId: plan.id },
    });
  });

  return withTenant(otroTenant.id, async () => {
    await db.user.deleteMany({ where: { email: 't7-foto-dueno-otro-tenant@pos.com' } });
    const role = await db.role.upsert({
      where: { tenantId_nombre: { tenantId: otroTenant.id, nombre: 'GerenteFotoOtroTenant' } },
      update: {},
      create: { tenantId: otroTenant.id, nombre: 'GerenteFotoOtroTenant', descripcion: 'x' },
    });
    await db.rolePermission.upsert({
      where: { roleId_permiso: { roleId: role.id, permiso: 'asistencia.ver' } },
      update: {},
      create: { tenantId: otroTenant.id, roleId: role.id, permiso: 'asistencia.ver' },
    });
    const dueno = await db.user.create({
      data: {
        tenantId: otroTenant.id, nombre: 'Dueño Otro Tenant',
        email: 't7-foto-dueno-otro-tenant@pos.com',
        passwordHash: await hashPassword('xxxxxxxxxx'), roleId: role.id,
      },
    });
    const rel = await savePhoto(Buffer.from('foto-otro-tenant'), {
      userId: dueno.id, tipo: 'checkin', fecha: '2026-09-13',
    });
    await db.attendanceRecord.create({
      data: { userId: dueno.id, fecha: '2026-09-13', checkInAt: new Date(), checkInFotoPath: rel },
    });
    return rel;
  });
}

const EMAIL_DUENO = 't7-foto-dueno@pos.com';
const EMAIL_OTRO = 't7-foto-otro@pos.com';
const EMAIL_GERENTE = 't7-foto-gerente@pos.com';
const EMAILS = [EMAIL_DUENO, EMAIL_OTRO, EMAIL_GERENTE];

function paramsFor(relativePath: string) {
  return { params: Promise.resolve({ path: relativePath.split('/') }) };
}

async function cleanupOtroTenant() {
  const otroTenant = await withPlatformAdmin(() => db.tenant.findUnique({ where: { slug: SLUG_OTRO_TENANT } }));
  if (!otroTenant) return;
  await withTenant(otroTenant.id, async () => {
    await db.attendanceRecord.deleteMany({ where: { tenantId: otroTenant.id } });
    await db.user.deleteMany({ where: { tenantId: otroTenant.id } });
  });
}

beforeEach(async () => {
  await db.session.deleteMany();
  await cleanupAttendance(EMAILS);
  await cleanupOtroTenant();
});
afterAll(async () => {
  await db.session.deleteMany();
  await cleanupAttendance(EMAILS);
  await cleanupOtroTenant();
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

  // Fix 3 (revisión final de rama, importante): antes de este fix, un
  // Administrador (asistencia.ver) que conociera la ruta de una foto de OTRO
  // tenant la leía sin problema — el chequeo de dueño/tenant se saltaba por
  // completo para quien tuviera el permiso. Reproduce el escenario con dos
  // tenants reales: la foto y su AttendanceRecord existen SOLO en el tenant
  // "otro" (creado por seedFotoDeOtroTenant); quien pide la foto es un
  // Gerente CON asistencia.ver pero del tenant "default" (tenantHeader.id).
  it('404 para alguien con asistencia.ver si la foto es de OTRO tenant', async () => {
    const relOtroTenant = await seedFotoDeOtroTenant();
    const gerente = await seedUser(EMAIL_GERENTE, 'Gerente');

    cookieStore.value = (await createSession(gerente, {})).token;
    const res = await GET(
      new Request(`http://x/api/asistencia/foto/${relOtroTenant}`),
      paramsFor(relOtroTenant),
    );
    expect(res.status).toBe(404);
  });
});
