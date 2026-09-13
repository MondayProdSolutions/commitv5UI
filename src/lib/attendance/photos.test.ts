import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { ValidationError } from '@/lib/errors';
import { savePhoto, resolvePhotoAbsolutePath, photoExists } from './photos';

let dir: string;
const ORIGINAL_ENV = process.env.ATTENDANCE_PHOTOS_DIR;

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'asistencia-'));
  process.env.ATTENDANCE_PHOTOS_DIR = dir;
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
  process.env.ATTENDANCE_PHOTOS_DIR = ORIGINAL_ENV;
});

describe('savePhoto', () => {
  it('escribe el archivo y devuelve la ruta relativa fecha/archivo.jpg', async () => {
    const rel = await savePhoto(Buffer.from('foto'), { userId: 'u1', tipo: 'checkin', fecha: '2026-09-13' });
    expect(rel).toMatch(/^2026-09-13\/u1-checkin-\d+\.jpg$/);
    const abs = resolvePhotoAbsolutePath(rel);
    expect(abs).not.toBeNull();
    expect(await photoExists(abs as string)).toBe(true);
  });

  it('rechaza un buffer vacío', async () => {
    await expect(
      savePhoto(Buffer.alloc(0), { userId: 'u1', tipo: 'checkin', fecha: '2026-09-13' }),
    ).rejects.toThrow(ValidationError);
  });

  it('rechaza un buffer mayor a 5MB', async () => {
    await expect(
      savePhoto(Buffer.alloc(5 * 1024 * 1024 + 1), { userId: 'u1', tipo: 'checkin', fecha: '2026-09-13' }),
    ).rejects.toThrow(ValidationError);
  });
});

describe('resolvePhotoAbsolutePath', () => {
  it('rechaza intentos de path traversal', () => {
    expect(resolvePhotoAbsolutePath('../../etc/passwd')).toBeNull();
    expect(resolvePhotoAbsolutePath('2026-09-13/../../etc/passwd')).toBeNull();
  });

  it('rechaza formatos que no son fecha/archivo.jpg', () => {
    expect(resolvePhotoAbsolutePath('archivo.jpg')).toBeNull();
    expect(resolvePhotoAbsolutePath('2026-09-13/archivo.png')).toBeNull();
  });

  it('acepta el formato válido', () => {
    expect(resolvePhotoAbsolutePath('2026-09-13/u1-checkin-123.jpg')).not.toBeNull();
  });
});
