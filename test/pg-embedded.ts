import EmbeddedPostgres from 'embedded-postgres';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

let pg: EmbeddedPostgres | null = null;
let dataDir = '';

// Resolve the CLI entry points and run them with the current Node binary. This
// avoids spawning `npx` (which is `npx.cmd` on Windows and, since Node 20.12,
// cannot be launched via execFileSync without `shell: true`).
const require = createRequire(import.meta.url);
const prismaBin = join(dirname(require.resolve('prisma/package.json')), 'build', 'index.js');
const tsxBin = require.resolve('tsx/cli');

export async function startEphemeralPg(
  port: number,
  dbNames: string[],
): Promise<Record<string, string>> {
  dataDir = mkdtempSync(join(tmpdir(), 'pos-pg-'));
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
    // Prisma schema + seed land in Task 2; skip the migrate/seed pass until then.
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
    if (pg) {
      // If start() never fully succeeded, stop() may throw — swallow it so the
      // data dir still gets removed and a later run can start clean.
      await pg.stop();
    }
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
