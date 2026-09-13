import { mkdir, writeFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { ValidationError } from '@/lib/errors';

const MAX_BYTES = 5 * 1024 * 1024;

function photosRoot(): string {
  return path.resolve(process.cwd(), process.env.ATTENDANCE_PHOTOS_DIR ?? '.attendance-photos');
}

/** Escribe la foto en `<root>/<fecha>/<userId>-<tipo>-<timestamp>.jpg` y devuelve la ruta relativa. */
export async function savePhoto(
  buffer: Buffer,
  opts: { userId: string; tipo: 'checkin' | 'checkout'; fecha: string },
): Promise<string> {
  if (buffer.length === 0 || buffer.length > MAX_BYTES) {
    throw new ValidationError({ foto: 'La foto está vacía o excede el tamaño máximo (5MB).' });
  }
  const dir = path.join(photosRoot(), opts.fecha);
  await mkdir(dir, { recursive: true });
  const filename = `${opts.userId}-${opts.tipo}-${Date.now()}.jpg`;
  await writeFile(path.join(dir, filename), buffer);
  return `${opts.fecha}/${filename}`;
}

/**
 * Resuelve una ruta relativa guardada en BD (`YYYY-MM-DD/archivo.jpg`) a una
 * ruta absoluta dentro de `ATTENDANCE_PHOTOS_DIR`, o `null` si el formato es
 * inválido o intenta salir del directorio base (path traversal).
 */
export function resolvePhotoAbsolutePath(relativePath: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}\/[\w-]+\.jpg$/.test(relativePath)) return null;
  const root = photosRoot();
  const abs = path.join(root, relativePath);
  if (!abs.startsWith(root + path.sep)) return null;
  return abs;
}

export async function photoExists(absolutePath: string): Promise<boolean> {
  try {
    await stat(absolutePath);
    return true;
  } catch {
    return false;
  }
}
