import { db } from '@/lib/db';
import { diaKeyMX } from '@/lib/reports/period';
import type { ReportPeriod } from '@/lib/reports/period';
import type { ChartDatum } from '@/components/charts/BarChart';

function horaKeyMX(d: Date): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Mexico_City',
    hour: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(d);
  return (parts.find((p) => p.type === 'hour')?.value ?? '00').padStart(2, '0');
}

export type AttendanceDashboard = {
  periodo: ReportPeriod;
  llegadasPorHora: ChartDatum[];
  horasPorEmpleado: { userId: string; nombre: string; roleName: string; minutos: number }[];
  registrosDeHoy: {
    id: string;
    userId: string;
    nombre: string;
    checkInAt: Date;
    checkInFotoPath: string | null;
    checkOutAt: Date | null;
    checkOutFotoPath: string | null;
  }[];
};

export async function getAttendanceDashboard(
  periodo: ReportPeriod,
  filtros: { userId?: string; roleId?: string } = {},
): Promise<AttendanceDashboard> {
  const fechaDesde = diaKeyMX(periodo.desde);
  const fechaHasta = diaKeyMX(periodo.hasta);
  const hoy = diaKeyMX(new Date());

  const registros = await db.attendanceRecord.findMany({
    where: {
      fecha: { gte: fechaDesde, lte: fechaHasta },
      ...(filtros.userId ? { userId: filtros.userId } : {}),
      ...(filtros.roleId ? { user: { roleId: filtros.roleId } } : {}),
    },
    select: {
      id: true, userId: true, fecha: true,
      checkInAt: true, checkInFotoPath: true,
      checkOutAt: true, checkOutFotoPath: true,
      minutosTrabajados: true,
      user: { select: { nombre: true, role: { select: { nombre: true } } } },
    },
    orderBy: { checkInAt: 'desc' },
  });

  const porHora = new Map<string, number>();
  for (const r of registros) {
    const key = horaKeyMX(r.checkInAt);
    porHora.set(key, (porHora.get(key) ?? 0) + 1);
  }
  const llegadasPorHora = [...porHora.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([label, value]) => ({ label: `${label}:00`, value }));

  const porEmpleado = new Map<string, { nombre: string; roleName: string; minutos: number }>();
  for (const r of registros) {
    if (r.minutosTrabajados == null) continue;
    const acc = porEmpleado.get(r.userId) ?? {
      nombre: r.user.nombre,
      roleName: r.user.role.nombre,
      minutos: 0,
    };
    acc.minutos += r.minutosTrabajados;
    porEmpleado.set(r.userId, acc);
  }
  const horasPorEmpleado = [...porEmpleado.entries()]
    .map(([userId, v]) => ({ userId, ...v }))
    .sort((a, b) => b.minutos - a.minutos);

  const registrosDeHoy = registros
    .filter((r) => r.fecha === hoy)
    .map((r) => ({
      id: r.id,
      userId: r.userId,
      nombre: r.user.nombre,
      checkInAt: r.checkInAt,
      checkInFotoPath: r.checkInFotoPath,
      checkOutAt: r.checkOutAt,
      checkOutFotoPath: r.checkOutFotoPath,
    }));

  return { periodo, llegadasPorHora, horasPorEmpleado, registrosDeHoy };
}
