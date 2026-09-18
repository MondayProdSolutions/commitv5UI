import EmbeddedPostgres from 'embedded-postgres';
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

export const DATA_DIR = join(process.cwd(), '.pgdata');
export const PID_FILE = join(DATA_DIR, 'pg.pid');
export const POSTMASTER_PID = join(DATA_DIR, 'postmaster.pid');
export const PORT = 54329;

export function makePg() {
  return new EmbeddedPostgres({
    databaseDir: DATA_DIR,
    user: 'postgres',
    password: 'postgres',
    port: PORT,
    persistent: true,
  });
}

/** ¿El proceso `pid` sigue vivo? `kill(pid, 0)` no envía señal, solo comprueba. */
export function isAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    // EPERM = existe pero sin permiso para señalarlo => sigue vivo.
    return err.code === 'EPERM';
  }
}

/** Lee el PID del postmaster.pid de Postgres (primera línea). */
export function readPostmasterPid() {
  if (!existsSync(POSTMASTER_PID)) return null;
  const first = readFileSync(POSTMASTER_PID, 'utf8').split('\n')[0].trim();
  const pid = Number(first);
  return Number.isInteger(pid) && pid > 0 ? pid : null;
}

/** Borra un postmaster.pid huérfano (hard kill previo) para no bloquear el próximo start. */
export function clearStalePostmasterPid() {
  const pmPid = readPostmasterPid();
  if (pmPid !== null && !isAlive(pmPid)) {
    rmSync(POSTMASTER_PID, { force: true });
    return true;
  }
  return false;
}

/** ¿Hay un `pg.mjs start` (o equivalente) vivo administrando esta BD ahora mismo?
 *  Limpia el PID file si está rancio, igual que hacía `db.mjs status`. */
export function isRunning() {
  if (!existsSync(PID_FILE)) return false;
  const pid = Number(readFileSync(PID_FILE, 'utf8'));
  if (isAlive(pid)) return true;
  rmSync(PID_FILE, { force: true });
  clearStalePostmasterPid();
  return false;
}

/** Arranca (o inicializa si es la primera vez) el Postgres embebido y registra
 *  el PID del proceso llamador como dueño — igual que hacía `db.mjs start`,
 *  factorizado para que también lo use el orquestador de un solo comando. */
export async function startEmbeddedDb() {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  const fresh = !existsSync(join(DATA_DIR, 'PG_VERSION'));
  clearStalePostmasterPid();
  const pg = makePg();
  if (fresh) await pg.initialise();
  await pg.start();
  for (const name of ['pos_dev']) {
    try {
      await pg.createDatabase(name);
    } catch {
      /* ya existe */
    }
  }
  writeFileSync(PID_FILE, String(process.pid));
  return pg;
}

/** Limpia el PID file tras detener la BD (start/stop ya llamaron a pg.stop()). */
export function markStopped() {
  rmSync(PID_FILE, { force: true });
}
