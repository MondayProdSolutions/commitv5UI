import { NextResponse } from 'next/server';
import { SESSION_COOKIE, touchSession, validateSession } from '@/lib/auth/session';
import { getIdleTimeoutMinutes } from '@/lib/settings';
import { assertSameOrigin } from '@/lib/http';
import { ForbiddenError } from '@/lib/errors';

export const runtime = 'nodejs';

const COOKIE_RE = new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([^;]+)`);

export async function POST(req: Request) {
  try {
    assertSameOrigin(req);
  } catch (e) {
    if (e instanceof ForbiddenError) return NextResponse.json({ ok: false }, { status: 403 });
    throw e;
  }
  const token = req.headers.get('cookie')?.match(COOKIE_RE)?.[1];
  const idleTimeoutMinutes = await getIdleTimeoutMinutes();
  const vs = await validateSession(token, idleTimeoutMinutes);
  if (vs.status !== 'ok') {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  await touchSession(token!);
  return NextResponse.json({ ok: true, idleTimeoutMinutes });
}
