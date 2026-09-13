import { Prisma } from '@prisma/client';
import type { AttendanceRecord } from '@prisma/client';
import { db } from '@/lib/db';
import { diaKeyMX } from '@/lib/reports/period';
import { NotFoundError, ValidationError } from '@/lib/errors';

export async function getTodayRecord(userId: string): Promise<AttendanceRecord | null> {
  return db.attendanceRecord.findUnique({
    where: { userId_fecha: { userId, fecha: diaKeyMX(new Date()) } },
  });
}

export async function checkIn(params: {
  userId: string;
  fotoPath: string | null;
}): Promise<AttendanceRecord> {
  const fecha = diaKeyMX(new Date());
  const existente = await db.attendanceRecord.findUnique({
    where: { userId_fecha: { userId: params.userId, fecha } },
  });
  if (existente) throw new ValidationError({ checkIn: 'Ya registraste tu entrada hoy.' });

  try {
    return await db.attendanceRecord.create({
      data: { userId: params.userId, fecha, checkInAt: new Date(), checkInFotoPath: params.fotoPath },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      throw new ValidationError({ checkIn: 'Ya registraste tu entrada hoy.' });
    }
    throw e;
  }
}

export async function checkOut(params: {
  userId: string;
  fotoPath: string | null;
}): Promise<AttendanceRecord> {
  const fecha = diaKeyMX(new Date());
  const existente = await db.attendanceRecord.findUnique({
    where: { userId_fecha: { userId: params.userId, fecha } },
  });
  if (!existente) throw new ValidationError({ checkOut: 'No has registrado tu entrada hoy.' });
  if (existente.checkOutAt) throw new ValidationError({ checkOut: 'Ya registraste tu salida hoy.' });

  const checkOutAt = new Date();
  const minutosTrabajados = Math.round((checkOutAt.getTime() - existente.checkInAt.getTime()) / 60000);
  return db.attendanceRecord.update({
    where: { id: existente.id },
    data: { checkOutAt, checkOutFotoPath: params.fotoPath, minutosTrabajados },
  });
}

export async function corregirRegistro(params: {
  id: string;
  checkOutAt: Date;
  actorId: string;
}): Promise<AttendanceRecord> {
  const record = await db.attendanceRecord.findUnique({ where: { id: params.id } });
  if (!record) throw new NotFoundError('Registro de asistencia no encontrado');
  if (params.checkOutAt.getTime() <= record.checkInAt.getTime()) {
    throw new ValidationError({ checkOutAt: 'La salida debe ser posterior a la entrada.' });
  }
  const minutosTrabajados = Math.round(
    (params.checkOutAt.getTime() - record.checkInAt.getTime()) / 60000,
  );
  return db.attendanceRecord.update({
    where: { id: params.id },
    data: { checkOutAt: params.checkOutAt, minutosTrabajados, corregidoPorId: params.actorId },
  });
}
