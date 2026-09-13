import { rmSync } from 'node:fs';
import { stopEphemeralPg } from './e2e-pg';

export default async function globalTeardown(): Promise<void> {
  await stopEphemeralPg();
  rmSync('.e2e-db-url', { force: true });
}
