import { describe, it, expect } from 'vitest';
import { idleTimeoutSchema } from './settings';

describe('idleTimeoutSchema', () => {
  it('coerce string a número', () => {
    expect(idleTimeoutSchema.parse({ minutes: '20' })).toEqual({ minutes: 20 });
  });
  it('rechaza < 1', () => {
    expect(idleTimeoutSchema.safeParse({ minutes: 0 }).success).toBe(false);
  });
  it('rechaza > 240', () => {
    expect(idleTimeoutSchema.safeParse({ minutes: 999 }).success).toBe(false);
  });
});
