import EmbeddedPostgres from 'embedded-postgres';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

// Same behaviour as `test/pg-embedded.ts`, but without `createRequire(import.meta.url)`:
// Playwright transpiles config/globalSetup files (and their imports) to CommonJS,
// where `import.meta` is a syntax error. Here `require` is available directly.
let pg: EmbeddedPostgres | null = null;
let dataDir = '';

const prismaBin = join(dirname(require.resolve('prisma/package.json')), 'build', 'index.js');
const tsxBin = require.resolve('tsx/cli');

export async function startEphemeralPg(
  port: number,
  dbNames: string[],
): Promise<Record<string, string>> {
  dataDir = mkdtempSync(join(tmpdir(), 'pos-e2e-pg-'));
  pg = new EmbeddedPostgres({
    databaseDir: dataDir,
    user: 'postgres',
    password: 'postgres',
    port,
    persistent: false,
  });
  await pg.initialise();
  await pg.start();
  const urls: Record<string, string> = {};
  const hasPrisma = existsSync(join(process.cwd(), 'prisma', 'schema.prisma'));
  for (const name of dbNames) {
    await pg.createDatabase(name);
    const url = `postgresql://postgres:postgres@localhost:${port}/${name}?schema=public`;
    urls[name] = url;
    if (hasPrisma) {
      execFileSync(process.execPath, [prismaBin, 'migrate', 'deploy'], {
        stdio: 'inherit',
        env: { ...process.env, DATABASE_URL: url },
      });
      execFileSync(process.execPath, [tsxBin, 'prisma/seed.ts'], {
        stdio: 'inherit',
        env: { ...process.env, DATABASE_URL: url },
      });
    }
  }
  return urls;
}

export async function stopEphemeralPg(): Promise<void> {
  try {
    if (pg) await pg.stop();
  } catch {
    /* ya estaba parado o el arranque no llegó a completarse */
  } finally {
    pg = null;
    if (dataDir) {
      rmSync(dataDir, { recursive: true, force: true });
      dataDir = '';
    }
  }
}
