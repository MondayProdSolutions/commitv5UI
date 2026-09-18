import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/context';
import { assertSameOrigin } from '@/lib/http';
import { ForbiddenError } from '@/lib/errors';
import { checkAssistantRateLimit } from '@/lib/assistant/rate-limit';
import { assistantChatSchema } from '@/lib/validation/assistant';
import { getModuleContext } from '@/lib/assistant/knowledge';
import { buildSystemInstruction, ESCALATE_MARKER } from '@/lib/assistant/prompt';
import { askGemini, GeminiError } from '@/lib/assistant/gemini';
import { withTenant } from '@/lib/db';
import { requireRequestTenantId } from '@/lib/tenant/with-request-tenant';

export const runtime = 'nodejs';

const FALLBACK_REPLY = 'No pude procesar tu pregunta en este momento.';

export async function POST(req: Request) {
  // getCurrentUser() lee User/Session bajo RLS (ver src/lib/db.ts): necesita
  // contexto de tenant activo igual que cualquier otro punto de entrada. Esta
  // ruta lo omitía y por eso fallaba siempre con "No hay contexto de tenant
  // activo." — nunca llegaba a llamar a Gemini. El resto del handler (rate
  // limit en memoria, llamada HTTP a Gemini) queda fuera de la transacción a
  // propósito: no son operaciones de base de datos ni deben bloquear una
  // conexión del pool mientras esperan la red.
  const tenantId = await requireRequestTenantId();
  const user = await withTenant(tenantId, () => getCurrentUser());
  if (!user) return NextResponse.json({ error: 'Sesión requerida' }, { status: 403 });

  try {
    assertSameOrigin(req);
  } catch (err) {
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    throw err;
  }

  const limit = checkAssistantRateLimit(user.id);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: 'Demasiadas preguntas seguidas. Espera un momento.', retryAfterSec: limit.retryAfterSec },
      { status: 429 },
    );
  }

  const body = await req.json().catch(() => null);
  const parsed = assistantChatSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 });

  const { mensaje, pathname, errorVisible, historial } = parsed.data;
  const moduleCtx = getModuleContext(pathname);
  const systemInstruction = buildSystemInstruction({ ...moduleCtx, errorVisible });

  try {
    const raw = await askGemini({
      systemInstruction,
      history: historial ?? [],
      message: mensaje,
    });
    const escalate = raw.includes(ESCALATE_MARKER);
    const reply = raw.replace(ESCALATE_MARKER, '').trim();
    return NextResponse.json({ reply, escalate, modulo: moduleCtx.modulo });
  } catch (err) {
    if (err instanceof GeminiError) {
      return NextResponse.json({ reply: FALLBACK_REPLY, escalate: true, modulo: moduleCtx.modulo });
    }
    throw err;
  }
}
