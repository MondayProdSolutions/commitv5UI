import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { db } from '@/lib/db';
import { seedUser, cleanupAttendance } from './__testutil';

const EMAIL = 't7-schema@pos.com';
const EMAIL_ADMIN = 't7-schema-admin@pos.com';
const EMAILS = [EMAIL, EMAIL_ADMIN];

beforeEach(async () => {
  await cleanupAttendance(EMAILS);
});
afterAll(async () => {
  await cleanupAttendance(EMAILS);
});

describe('modelo AttendanceRecord', () => {
  it('crea un registro y respeta @@unique([userId, fecha])', async () => {
    const userId = await seedUser(EMAIL, 'Empleado');
    await db.attendanceRecord.create({ data: { userId, fecha: '2026-09-13', checkInAt: new Date() } });

    await expect(
      db.attendanceRecord.create({ data: { userId, fecha: '2026-09-13', checkInAt: new Date() } }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });

  it('permite el mismo usuario en días distintos, y corregidoPorId apuntando a otro usuario', async () => {
    const userId = await seedUser(EMAIL, 'Empleado');
    const adminId = await seedUser(EMAIL_ADMIN, 'Administrador');

    await db.attendanceRecord.create({ data: { userId, fecha: '2026-09-13', checkInAt: new Date() } });
    const dia2 = await db.attendanceRecord.create({
      data: {
        userId,
        fecha: '2026-09-14',
        checkInAt: new Date(),
        checkOutAt: new Date(),
        minutosTrabajados: 60,
        corregidoPorId: adminId,
      },
    });

    expect(dia2.corregidoPorId).toBe(adminId);
  });
});
