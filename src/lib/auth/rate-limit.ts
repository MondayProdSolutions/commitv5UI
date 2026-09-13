const WINDOW_MS = 15 * 60_000;
const THRESHOLD = 5;
const BLOCK_MS = 15 * 60_000;

type Entry = { fails: number[]; blockedUntil: number };
const store = new Map<string, Entry>();

function prune(e: Entry, now: number) {
  e.fails = e.fails.filter((t) => now - t < WINDOW_MS);
}

export function checkLoginRateLimit(key: string): { blocked: boolean; retryAfterSec: number } {
  const now = Date.now();
  const e = store.get(key);
  if (!e) return { blocked: false, retryAfterSec: 0 };
  if (e.blockedUntil > now) return { blocked: true, retryAfterSec: Math.ceil((e.blockedUntil - now) / 1000) };
  prune(e, now);
  return { blocked: false, retryAfterSec: 0 };
}

export function recordLoginFailure(key: string): void {
  const now = Date.now();
  const e = store.get(key) ?? { fails: [], blockedUntil: 0 };
  prune(e, now);
  e.fails.push(now);
  if (e.fails.length >= THRESHOLD) { e.blockedUntil = now + BLOCK_MS; e.fails = []; }
  store.set(key, e);
}

export function clearLoginFailures(key: string): void {
  store.delete(key);
}
