import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { db } from '@/lib/db';
import { seedUser, cleanupAttendance } from './__testutil';
import { getAttendanceDashboard } from './dashboard';
import { diaKeyMX, type ReportPeriod } from '@/lib/reports/period';

const EMAIL_A = 't7-dash-a@pos.com';
const EMAIL_B = 't7-dash-b@pos.com';
const EMAILS = [EMAIL_A, EMAIL_B];

const PERIODO_AMPLIO: ReportPeriod = {
  desde: new Date('2000-01-01T00:00:00Z'),
  hasta: new Date('2100-01-01T00:00:00Z'),
  etiqueta: 'test',
};

let userA: string;
let userB: string;

beforeEach(async () => {
  await cleanupAttendance(EMAILS);
  userA = await seedUser(EMAIL_A, 'Empleado');
  userB = await seedUser(EMAIL_B, 'Gerente');
});
afterAll(async () => {
  await cleanupAttendance(EMAILS);
});

describe('getAttendanceDashboard', () => {
  it('agrupa llegadas por hora MX y horas trabajadas por empleado (turnos abiertos no cuentan)', async () => {
    // 14:05Z y 14:40Z son 08:05 y 08:40 en America/Mexico_City (UTC-6) — misma hora "08".
    await db.attendanceRecord.create({
      data: {
        userId: userA, fecha: '2026-09-13',
        checkInAt: new Date('2026-09-13T14:05:00Z'), checkOutAt: new Date('2026-09-13T22:05:00Z'),
        minutosTrabajados: 480,
      },
    });
    await db.attendanceRecord.create({
      data: { userId: userB, fecha: '2026-09-13', checkInAt: new Date('2026-09-13T14:40:00Z') },
    });

    const r = await getAttendanceDashboard(PERIODO_AMPLIO);
    expect(r.llegadasPorHora).toEqual([{ label: '08:00', value: 2 }]);
    expect(r.horasPorEmpleado).toEqual([
      { userId: userA, nombre: 'Test Empleado', roleName: 'Empleado', minutos: 480 },
    ]);
  });

  it('registrosDeHoy solo incluye la fecha de hoy', async () => {
    const hoy = diaKeyMX(new Date());
    await db.attendanceRecord.create({
      data: { userId: userA, fecha: hoy, checkInAt: new Date() },
    });
    await db.attendanceRecord.create({
      data: {
        userId: userB, fecha: '2020-01-01',
        checkInAt: new Date('2020-01-01T14:00:00Z'), checkOutAt: new Date('2020-01-01T20:00:00Z'),
        minutosTrabajados: 360,
      },
    });

    const r = await getAttendanceDashboard(PERIODO_AMPLIO);
    expect(r.registrosDeHoy).toHaveLength(1);
    expect(r.registrosDeHoy[0].userId).toBe(userA);
  });

  it('filtra por userId y por roleId', async () => {
    await db.attendanceRecord.create({
      data: { userId: userA, fecha: '2026-09-13', checkInAt: new Date('2026-09-13T14:00:00Z') },
    });
    await db.attendanceRecord.create({
      data: { userId: userB, fecha: '2026-09-13', checkInAt: new Date('2026-09-13T15:00:00Z') },
    });

    const porUsuario = await getAttendanceDashboard(PERIODO_AMPLIO, { userId: userA });
    expect(porUsuario.llegadasPorHora.reduce((s, h) => s + h.value, 0)).toBe(1);

    const rolGerente = await db.role.findFirstOrThrow({ where: { nombre: 'Gerente' } });
    const porRol = await getAttendanceDashboard(PERIODO_AMPLIO, { roleId: rolGerente.id });
    expect(porRol.llegadasPorHora.reduce((s, h) => s + h.value, 0)).toBe(1);
  });

  it('un registro fuera del período no se cuenta', async () => {
    await db.attendanceRecord.create({
      data: { userId: userA, fecha: '1990-01-01', checkInAt: new Date('1990-01-01T14:00:00Z') },
    });
    const periodoActual: ReportPeriod = { desde: new Date(), hasta: new Date(), etiqueta: 'test' };
    const r = await getAttendanceDashboard(periodoActual);
    expect(r.llegadasPorHora).toEqual([]);
  });
});
