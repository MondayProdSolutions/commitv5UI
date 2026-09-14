import { db } from '@/lib/db';
import { hashPassword } from '@/lib/auth/password';

/** Crea (o recrea) un usuario con el rol indicado y devuelve su id. */
export async function seedUser(email: string, roleName: string): Promise<string> {
  await db.user.deleteMany({ where: { email } });
  const rol = await db.role.findFirstOrThrow({ where: { nombre: roleName } });
  const user = await db.user.create({
    data: {
      nombre: `Test ${roleName}`,
      email,
      passwordHash: await hashPassword('xxxxxxxxxx'),
      roleId: rol.id,
    },
  });
  return user.id;
}

/** Limpieza FK-segura: borra los AttendanceRecord y luego los usuarios de los emails dados. */
export async function cleanupAttendance(emails: string[]): Promise<void> {
  const users = await db.user.findMany({ where: { email: { in: emails } }, select: { id: true } });
  const ids = users.map((u) => u.id);
  if (ids.length) await db.attendanceRecord.deleteMany({ where: { userId: { in: ids } } });
  if (emails.length) await db.user.deleteMany({ where: { email: { in: emails } } });
}
