import { randomBytes } from 'node:crypto';
import { db, withPlatformAdmin } from '@/lib/db';
import { verifyPassword, hashPassword } from './password';
import { createPlatformSession } from './session';
import { checkLoginRateLimit, recordLoginFailure, clearLoginFailures } from '@/lib/auth/rate-limit';

type Ctx = { email: string; password: string; ip: string | null; userAgent: string | null };
type Result =
  | { ok: true; token: string }
  | { ok: false; reason: 'invalid' | 'rate_limited'; retryAfterSec?: number };

// Mismo razonamiento que attemptLogin (src/lib/auth/login.ts): verifyPassword debe
// correr trabajo real de argon2 en cada intento para que el tiempo de respuesta
// nunca filtre si el correo existe.
let dummyHashPromise: Promise<string> | null = null;
function getDummyHash(): Promise<string> {
  dummyHashPromise ??= hashPassword(randomBytes(16).toString('hex'));
  return dummyHashPromise;
}

export async function attemptPlatformLogin(input: Ctx): Promise<Result> {
  const email = input.email.trim().toLowerCase();
  // Prefijo "platform|" para que el conteo de intentos de Super Admin nunca
  // comparta cubeta con el de un usuario de tenant que tuviera el mismo correo.
  const key = `platform|${email}|${input.ip ?? 'sin-ip'}`;

  const rl = checkLoginRateLimit(key);
  if (rl.blocked) return { ok: false, reason: 'rate_limited', retryAfterSec: rl.retryAfterSec };

  const admin = await withPlatformAdmin(() => db.platformAdmin.findUnique({ where: { email } }));
  const hash = admin?.passwordHash ?? (await getDummyHash());
  const passwordOk = await verifyPassword(hash, input.password); // se ejecuta siempre (timing)

  if (!admin || !passwordOk) {
    recordLoginFailure(key);
    return { ok: false, reason: 'invalid' };
  }

  clearLoginFailures(key);
  const { token } = await createPlatformSession(admin.id, { ip: input.ip, userAgent: input.userAgent });
  return { ok: true, token };
}
