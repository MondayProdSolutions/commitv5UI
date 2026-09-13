import { describe, it, expect } from 'vitest';

// Task 1 boundary check: the embedded Postgres globalSetup booted and threaded
// DATABASE_URL into this worker via provide/inject. Real Prisma connect + migrate
// + seed wiring is Task 2's job.
describe('integration tooling', () => {
  it('recibe DATABASE_URL desde el globalSetup', () => {
    expect(process.env.DATABASE_URL).toBeTruthy();
    expect(process.env.DATABASE_URL).toContain('54330');
  });
});
