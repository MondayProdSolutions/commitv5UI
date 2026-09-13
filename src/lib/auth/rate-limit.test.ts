import { describe, it, expect, beforeEach } from 'vitest';
import { checkLoginRateLimit, recordLoginFailure, clearLoginFailures } from './rate-limit';

const KEY = 'user@pos.com|1.2.3.4';
beforeEach(() => clearLoginFailures(KEY));

describe('rate limit de login', () => {
  it('no bloquea por debajo del umbral', () => {
    for (let i = 0; i < 4; i++) recordLoginFailure(KEY);
    expect(checkLoginRateLimit(KEY).blocked).toBe(false);
  });
  it('bloquea al quinto fallo', () => {
    for (let i = 0; i < 5; i++) recordLoginFailure(KEY);
    const r = checkLoginRateLimit(KEY);
    expect(r.blocked).toBe(true);
    expect(r.retryAfterSec).toBeGreaterThan(0);
  });
  it('clearLoginFailures resetea', () => {
    for (let i = 0; i < 5; i++) recordLoginFailure(KEY);
    clearLoginFailures(KEY);
    expect(checkLoginRateLimit(KEY).blocked).toBe(false);
  });
});
