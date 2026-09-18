import { defineConfig } from '@playwright/test';
import { readFileSync, existsSync } from 'node:fs';

// `globalSetup` runs *after* Playwright reads `webServer.env`, so the ephemeral
// DB URL is passed to the built server through `.e2e-db-url` (gitignored). On the
// very first run the file does not exist yet at config-load time; fall back to
// the exact URL that `playwright.global-setup.ts` will create (same port / db /
// credentials as `startEphemeralPg`).
const FALLBACK_DB_URL =
  'postgresql://postgres:postgres@localhost:54330/pos_e2e?schema=public';
const dbUrl = existsSync('.e2e-db-url')
  ? readFileSync('.e2e-db-url', 'utf8').trim()
  : FALLBACK_DB_URL;

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  reporter: [['list']],
  globalSetup: './test/playwright.global-setup.ts',
  globalTeardown: './test/playwright.global-teardown.ts',
  use: {
    // Subdominio del tenant sembrado por `prisma/seed.ts` (slug 'default').
    // `*.localhost` resuelve a loopback sin configuración extra (RFC 6761); un
    // host sin subdominio nunca resuelve tenant bajo el proxy multi-tenant
    // (`resolveTenantSlug`), así que `/login`/`/setup` tirarían NO_TENANT.
    baseURL: 'http://default.localhost:3100',
    trace: 'on-first-retry',
  },
  webServer: {
    command: 'npm run build && npm run start -- -p 3100',
    url: 'http://default.localhost:3100/login',
    reuseExistingServer: false,
    timeout: 240_000,
    env: {
      DATABASE_URL: dbUrl,
      NODE_ENV: 'production',
    },
  },
});
