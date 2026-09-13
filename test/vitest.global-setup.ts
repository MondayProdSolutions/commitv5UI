import type { TestProject } from 'vitest/node';
import { startEphemeralPg, stopEphemeralPg } from './pg-embedded';

declare module 'vitest' {
  export interface ProvidedContext {
    databaseUrl: string;
  }
}

export async function setup({ provide }: TestProject) {
  const urls = await startEphemeralPg(54330, ['pos_test']);
  const url = urls['pos_test'];
  process.env.DATABASE_URL = url;
  process.env.DATABASE_URL_TEST = url;
  // globalSetup runs in its own process; thread the URL to the test workers.
  provide('databaseUrl', url);
}

export async function teardown() {
  await stopEphemeralPg();
}
