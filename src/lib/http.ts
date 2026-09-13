import { ForbiddenError } from '@/lib/errors';

export function getClientIp(headers: Headers): string | null {
  const xff = headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0]!.trim();
  return headers.get('x-real-ip')?.trim() ?? null;
}

export function assertSameOrigin(req: Request): void {
  const host = req.headers.get('host');
  const origin = req.headers.get('origin') ?? req.headers.get('referer');
  if (!host || !origin) return; // navegación same-origin sin Origin (GET) — Server Actions ya lo cubren
  try {
    if (new URL(origin).host !== host) throw new Error('cross-origin');
  } catch {
    throw new ForbiddenError('BAD_ORIGIN', 'Origen no permitido');
  }
}
