import { randomBytes } from 'node:crypto';
import { db } from '@/lib/db';
import { verifyPassword, hashPassword } from './password';
import { createSession } from './session';
import { checkLoginRateLimit, recordLoginFailure, clearLoginFailures } from './rate-limit';
import { logActivity } from '@/lib/audit';

type Ctx = { email: string; password: string; ip: string | null; userAgent: string | null };
type Result =
  | { ok: true; token: string; mustChangePassword: boolean }
  | { ok: false; reason: 'invalid' | 'rate_limited'; retryAfterSec?: number };

// Controller ruling R3: `verifyPassword` must run real argon2 work on every
// attempt so the response time never leaks whether the email exists. Instead of
// a hard-coded literal that could rot into an unparseable hash, we derive a
// throwaway argon2id hash once (memoised) from random bytes; `verify` against it
// always returns `false` and never throws on parse.
let dummyHashPromise: Promise<string> | null = null;
function getDummyHash(): Promise<string> {
  dummyHashPromise ??= hashPassword(randomBytes(16).toString('hex'));
  return dummyHashPromise;
}

export async function attemptLogin(input: Ctx): Promise<Result> {
  const email = input.email.trim().toLowerCase();
  const key = `${email}|${input.ip ?? 'sin-ip'}`;

  const rl = checkLoginRateLimit(key);
  if (rl.blocked) return { ok: false, reason: 'rate_limited', retryAfterSec: rl.retryAfterSec };

  const user = await db.user.findUnique({ where: { email } });
  const hash = user?.passwordHash ?? (await getDummyHash());
  const passwordOk = await verifyPassword(hash, input.password); // se ejecuta siempre (timing)

  if (!user || !user.activo || !passwordOk) {
    recordLoginFailure(key);
    await logActivity({ actorId: null, accion: 'auth.login_failed', ip: input.ip, metadata: { email } });
    return { ok: false, reason: 'invalid' };
  }

  clearLoginFailures(key);
  const { token } = await createSession(user.id, { ip: input.ip, userAgent: input.userAgent });
  await db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  await logActivity({ actorId: user.id, accion: 'auth.login', ip: input.ip });
  return { ok: true, token, mustChangePassword: user.mustChangePassword };
}
