import { writeFileSync } from 'node:fs';
import { startEphemeralPg } from './e2e-pg';

/**
 * Boots an ephemeral Postgres for the E2E run (migrate + seed included) and
 * hands the connection string to the `webServer` child process via a file:
 * `globalSetup` runs after Playwright has already snapshotted `webServer.env`,
 * so `playwright.config.ts` reads `.e2e-db-url` synchronously at load time.
 */
export default async function globalSetup(): Promise<void> {
  const urls = await startEphemeralPg(54330, ['pos_e2e']);
  const url = urls['pos_e2e'];
  writeFileSync('.e2e-db-url', url);
  process.env.DATABASE_URL = url;
}
