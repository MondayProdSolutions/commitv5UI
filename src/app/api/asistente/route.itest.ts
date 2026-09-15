import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import { db } from '@/lib/db';
import { createSession } from '@/lib/auth/session';
import { seedUser } from '@/lib/attendance/__testutil';

const cookieStore = { value: undefined as string | undefined };
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: () => (cookieStore.value ? { value: cookieStore.value } : undefined) }),
  headers: async () => new Headers(),
}));

import { POST } from './route';

const EMAIL = 't-asistente-cajero@pos.com';

function req(body: unknown) {
  return new Request('http://x/api/asistente', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function mockGeminiReply(text: string) {
  return vi.fn().mockResolvedValue(
    new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }), { status: 200 }),
  );
}

beforeEach(async () => {
  await db.session.deleteMany();
  await db.user.deleteMany({ where: { email: EMAIL } });
});
afterAll(async () => {
  await db.session.deleteMany();
  await db.user.deleteMany({ where: { email: EMAIL } });
  vi.unstubAllGlobals();
});

describe('POST /api/asistente', () => {
  it('403 sin sesión', async () => {
    cookieStore.value = undefined;
    const res = await POST(req({ mensaje: 'hola', pathname: '/ventas' }));
    expect(res.status).toBe(403);
  });

  it('400 con body inválido (mensaje vacío)', async () => {
    const userId = await seedUser(EMAIL, 'Cajero');
    cookieStore.value = (await createSession(userId, {})).token;

    const res = await POST(req({ mensaje: '', pathname: '/ventas' }));
    expect(res.status).toBe(400);
  });

  it('200 con respuesta de Gemini y detecta el marcador de escalamiento', async () => {
    const userId = await seedUser(EMAIL, 'Cajero');
    cookieStore.value = (await createSession(userId, {})).token;
    vi.stubGlobal('fetch', mockGeminiReply('Sigue estos pasos para cerrar caja. [[ESCALAR_SOPORTE]]'));

    const res = await POST(req({ mensaje: '¿Cómo cierro caja?', pathname: '/caja' }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.modulo).toBe('Caja');
    expect(data.escalate).toBe(true);
    expect(data.reply).not.toContain('[[ESCALAR_SOPORTE]]');
  });

  it('200 con respuesta amable de respaldo si Gemini falla', async () => {
    const userId = await seedUser(EMAIL, 'Cajero');
    cookieStore.value = (await createSession(userId, {})).token;
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));

    const res = await POST(req({ mensaje: 'no imprime el ticket', pathname: '/ventas' }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.escalate).toBe(true);
    expect(typeof data.reply).toBe('string');
    expect(data.reply.length).toBeGreaterThan(0);
  });

  it('429 al superar el límite de preguntas por minuto', async () => {
    const userId = await seedUser(EMAIL, 'Cajero');
    cookieStore.value = (await createSession(userId, {})).token;
    vi.stubGlobal('fetch', mockGeminiReply('ok'));

    let last: Response | undefined;
    for (let i = 0; i < 9; i++) {
      last = await POST(req({ mensaje: `pregunta ${i}`, pathname: '/ventas' }));
    }
    expect(last!.status).toBe(429);
  });
});
