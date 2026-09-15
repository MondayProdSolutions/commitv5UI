const DEFAULT_MODEL = 'gemini-flash-latest';
const ATTEMPT_TIMEOUT_MS = 12_000;
const MAX_ATTEMPTS = 2;
const RETRY_DELAY_MS = 600;
const MAX_OUTPUT_TOKENS = 800;

// Códigos que Gemini devuelve por saturación/cuota transitoria: vale la pena
// reintentar una vez. Cualquier otro 4xx/5xx es un fallo real (key inválida,
// payload inválido, etc.) y se propaga de inmediato.
const RETRYABLE_STATUS = new Set([429, 503]);

export class GeminiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GeminiError';
  }
}

export type ChatTurn = { role: 'user' | 'model'; text: string };

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function attempt(url: string, body: string): Promise<{ ok: true; text: string } | { ok: false; retryable: boolean; error: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ATTEMPT_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      signal: controller.signal,
      body,
    });
  } catch (err) {
    // Timeout (AbortError) o falla de red: ambas son transitorias, vale reintentar.
    return { ok: false, retryable: true, error: `Fallo de red hacia Gemini: ${(err as Error).message}` };
  } finally {
    clearTimeout(timeout);
  }

  if (!res.ok) {
    return { ok: false, retryable: RETRYABLE_STATUS.has(res.status), error: `Gemini respondió ${res.status}` };
  }

  const data = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('');
  if (!text) return { ok: false, retryable: false, error: 'Respuesta de Gemini sin texto' };

  return { ok: true, text };
}

export async function askGemini(opts: {
  systemInstruction: string;
  history: ChatTurn[];
  message: string;
}): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new GeminiError('GEMINI_API_KEY no configurada');

  const model = process.env.GEMINI_MODEL || DEFAULT_MODEL;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const contents = [
    ...opts.history.map((t) => ({ role: t.role, parts: [{ text: t.text }] })),
    { role: 'user', parts: [{ text: opts.message }] },
  ];
  const body = JSON.stringify({
    systemInstruction: { parts: [{ text: opts.systemInstruction }] },
    contents,
    generationConfig: {
      temperature: 0.3,
      maxOutputTokens: MAX_OUTPUT_TOKENS,
      // Respuestas de soporte cortas no necesitan razonamiento profundo; el modo
      // "thinking" (activo por default en 2.5/3.x) añadía varios segundos de latencia.
      thinkingConfig: { thinkingBudget: 0 },
    },
  });

  let lastError = 'Gemini no respondió';
  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    const result = await attempt(url, body);
    if (result.ok) return result.text;
    lastError = result.error;
    if (!result.retryable || i === MAX_ATTEMPTS - 1) break;
    await sleep(RETRY_DELAY_MS);
  }

  throw new GeminiError(lastError);
}
