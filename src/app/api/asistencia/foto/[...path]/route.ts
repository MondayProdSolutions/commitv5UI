import { NextResponse } from 'next/server';
import { readFile } from 'node:fs/promises';
import { getCurrentUser } from '@/lib/auth/context';
import { can } from '@/lib/auth/rbac';
import { db } from '@/lib/db';
import { resolvePhotoAbsolutePath, photoExists } from '@/lib/attendance/photos';

export const runtime = 'nodejs';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Sesión requerida' }, { status: 403 });

  const relativePath = (await params).path.join('/');
  const abs = resolvePhotoAbsolutePath(relativePath);
  if (!abs) return NextResponse.json({ error: 'Ruta inválida' }, { status: 404 });

  if (!can(user, 'asistencia.ver')) {
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
}
