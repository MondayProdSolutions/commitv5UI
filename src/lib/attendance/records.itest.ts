import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import { ValidationError } from '@/lib/errors';
import { seedUser, cleanupAttendance } from './__testutil';
import { checkIn, checkOut, getTodayRecord, corregirRegistro } from './records';

const EMAIL_A = 't7-records-a@pos.com';
const EMAIL_ADMIN = 't7-records-admin@pos.com';
const EMAILS = [EMAIL_A, EMAIL_ADMIN];

let userA: string;
let admin: string;

beforeEach(async () => {
  await cleanupAttendance(EMAILS);
  userA = await seedUser(EMAIL_A, 'Empleado');
  admin = await seedUser(EMAIL_ADMIN, 'Administrador');
});

afterAll(async () => {
  await cleanupAttendance(EMAILS);
});

describe('checkIn', () => {
  it('crea el registro del día con checkInAt y sin checkOutAt', async () => {
    const r = await checkIn({ userId: userA, fotoPath: '2026-09-13/x-checkin-1.jpg' });
    expect(r.userId).toBe(userA);
    expect(r.checkOutAt).toBeNull();
    expect(r.checkInFotoPath).toBe('2026-09-13/x-checkin-1.jpg');
  });

  it('rechaza un segundo check-in el mismo día', async () => {
    await checkIn({ userId: userA, fotoPath: null });
    await expect(checkIn({ userId: userA, fotoPath: null })).rejects.toThrow(ValidationError);
  });
});

describe('checkOut', () => {
  it('rechaza checkout sin checkin previo', async () => {
    await expect(checkOut({ userId: userA, fotoPath: null })).rejects.toThrow(ValidationError);
  });

  it('calcula minutosTrabajados y rechaza un segundo checkout', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-13T14:00:00Z'));
    await checkIn({ userId: userA, fotoPath: null });
    vi.setSystemTime(new Date('2026-09-13T14:30:00Z'));
    const r = await checkOut({ userId: userA, fotoPath: null });
    vi.useRealTimers();

    expect(r.minutosTrabajados).toBe(30);
    await expect(checkOut({ userId: userA, fotoPath: null })).rejects.toThrow(ValidationError);
  });
});

describe('getTodayRecord', () => {
  it('devuelve null si no hay registro hoy', async () => {
    expect(await getTodayRecord(userA)).toBeNull();
  });
});

describe('corregirRegistro', () => {
  it('cierra un turno abierto, calcula minutos y marca quién corrigió', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-13T14:00:00Z'));
    const abierto = await checkIn({ userId: userA, fotoPath: null });
    vi.useRealTimers();

    const cierre = new Date('2026-09-13T22:00:00Z');
    const r = await corregirRegistro({ id: abierto.id, checkOutAt: cierre, actorId: admin });
    expect(r.checkOutAt?.toISOString()).toBe(cierre.toISOString());
    expect(r.minutosTrabajados).toBe(480);
    expect(r.corregidoPorId).toBe(admin);
  });

  it('rechaza una salida anterior o igual a la entrada', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-13T14:00:00Z'));
    const abierto = await checkIn({ userId: userA, fotoPath: null });
    vi.useRealTimers();

    await expect(
      corregirRegistro({ id: abierto.id, checkOutAt: new Date('2026-09-13T10:00:00Z'), actorId: admin }),
    ).rejects.toThrow(ValidationError);
  });
});
