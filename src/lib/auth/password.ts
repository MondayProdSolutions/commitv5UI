import { hash, verify } from '@node-rs/argon2';
import { randomInt } from 'node:crypto';

const ARGON_OPTS = { memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;
const TEMP_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz';

export const COMMON_PASSWORDS: ReadonlySet<string> = new Set([
  'password', 'password1', 'password123', '12345678', '123456789', '1234567890',
  'qwertyuiop', 'contraseña', 'contrasena', 'admin1234', 'iloveyou1', 'welcome123',
  'pos123456', 'cajero1234', 'letmein123',
]);

export async function hashPassword(plain: string): Promise<string> {
  return hash(plain, ARGON_OPTS);
}

export async function verifyPassword(hashStr: string, plain: string): Promise<boolean> {
  try {
    return await verify(hashStr, plain, ARGON_OPTS);
  } catch {
    return false;
  }
}

export function generateTempPassword(): string {
  let out = '';
  for (let i = 0; i < 12; i++) out += TEMP_ALPHABET[randomInt(TEMP_ALPHABET.length)];
  return out;
}

export function passwordPolicyError(plain: string, email: string): string | null {
  if (plain.length < 10) return 'La contraseña debe tener al menos 10 caracteres.';
  if (plain.trim().toLowerCase() === email.trim().toLowerCase())
    return 'La contraseña no puede ser igual al correo.';
  if (COMMON_PASSWORDS.has(plain.toLowerCase()))
    return 'Esa contraseña es demasiado común. Elige otra.';
  return null;
}
