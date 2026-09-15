import { NextResponse } from 'next/server';
import { readFile } from 'node:fs/promises';
import { getCurrentUser } from '@/lib/auth/context';
import { can } from '@/lib/auth/rbac';
import { db, withTenant } from '@/lib/db';
import { resolvePhotoAbsolutePath, photoExists } from '@/lib/attendance/photos';
import { requireRequestTenantId } from '@/lib/tenant/with-request-tenant';

export const runtime = 'nodejs';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const tenantId = await requireRequestTenantId();
  return withTenant(tenantId, async () => {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Sesión requerida' }, { status: 403 });

    const relativePath = (await params).path.join('/');
    const abs = resolvePhotoAbsolutePath(relativePath);
    if (!abs) return NextResponse.json({ error: 'Ruta inválida' }, { status: 404 });

    // Antes, quien tuviera `asistencia.ver` (cualquier Administrador) se
    // saltaba por completo esta consulta y pasaba directo a leer el archivo,
    // sin ninguna verificación de tenant. Las fotos se guardan en un
    // directorio plano y agnóstico de tenant (ver src/lib/attendance/photos.ts),
    // así que sin este chequeo un Administrador de un tenant podía leer la
    // foto de otro tenant si llegaba a conocer su ruta. El fix: quien tiene
    // `asistencia.ver` ahora también pasa por un `findFirst` — sin filtrar por
    // dueño, porque ese permiso sí debe dejar ver las fotos de cualquier
    // empleado del MISMO tenant — pero esa consulta corre bajo el `db`
    // tenant-scoped (RLS), así que una ruta de OTRO tenant nunca hace match
    // ahí y cae en 404. Quien no tiene el permiso conserva el chequeo de
    // dueño de siempre (403 si la foto no es suya).
    if (can(user, 'asistencia.ver')) {
      const registro = await db.attendanceRecord.findFirst({
        where: { OR: [{ checkInFotoPath: relativePath }, { checkOutFotoPath: relativePath }] },
        select: { id: true },
      });
      if (!registro) return NextResponse.json({ error: 'Foto no encontrada' }, { status: 404 });
    } else {
      const esDueno = await db.attendanceRecord.findFirst({
        where: {
          userId: user.id,
          OR: [{ checkInFotoPath: relativePath }, { checkOutFotoPath: relativePath }],
        },
        select: { id: true },
      });
      if (!esDueno) return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
    }

    if (!(await photoExists(abs))) {
      return NextResponse.json({ error: 'Foto no encontrada' }, { status: 404 });
    }

    const buffer = await readFile(abs);
    return new NextResponse(new Uint8Array(buffer), {
      headers: { 'content-type': 'image/jpeg', 'cache-control': 'no-store' },
    });
  });
}
