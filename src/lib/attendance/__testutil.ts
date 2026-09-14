import { db, getCurrentTenantId } from '@/lib/db';
import { hashPassword } from '@/lib/auth/password';

/** Crea (o recrea) un usuario con el rol indicado y devuelve su id.
 *  Pasa `tenantId` explícito en vez de depender del DEFAULT de columna: un test
 *  anterior de este archivo dispara a propósito un P2002 real contra Postgres
 *  (ver schema.itest.ts), y `@prisma/adapter-pg` descarta la conexión pooleada tras
 *  cualquier error de consulta — la siguiente consulta abre una conexión nueva sin
 *  `app.tenant_id` fijado en la sesión. */
export async function seedUser(email: string, roleName: string): Promise<string> {
  await db.user.deleteMany({ where: { email } });
  const rol = await db.role.findFirstOrThrow({ where: { nombre: roleName } });
  const user = await db.user.create({
    data: {
      tenantId: getCurrentTenantId(),
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
