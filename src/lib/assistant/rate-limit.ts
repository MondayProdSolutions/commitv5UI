const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 8;

const hits = new Map<string, number[]>();

/** Límite fijo por usuario (protege el costo de la API de Gemini, no es seguridad de acceso). */
export function checkAssistantRateLimit(userId: string): { allowed: boolean; retryAfterSec: number } {
  const now = Date.now();
  const prev = (hits.get(userId) ?? []).filter((t) => now - t < WINDOW_MS);

  if (prev.length >= MAX_PER_WINDOW) {
    const retryAfterSec = Math.ceil((WINDOW_MS - (now - prev[0]!)) / 1000);
    return { allowed: false, retryAfterSec };
  }

  prev.push(now);
  hits.set(userId, prev);
  return { allowed: true, retryAfterSec: 0 };
}
