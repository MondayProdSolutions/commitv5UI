import EmbeddedPostgres from 'embedded-postgres';
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const DATA_DIR = join(process.cwd(), '.pgdata');
const PID_FILE = join(DATA_DIR, 'pg.pid');
const POSTMASTER_PID = join(DATA_DIR, 'postmaster.pid');
const PORT = 54329;
const cmd = process.argv[2];

function makePg() {
  return new EmbeddedPostgres({
    databaseDir: DATA_DIR,
    user: 'postgres',
    password: 'postgres',
    port: PORT,
    persistent: true,
  });
}

/** ¿El proceso `pid` sigue vivo? `kill(pid, 0)` no envía señal, solo comprueba. */
function isAlive(pid) {
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
function readPostmasterPid() {
  if (!existsSync(POSTMASTER_PID)) return null;
  const first = readFileSync(POSTMASTER_PID, 'utf8').split('\n')[0].trim();
  const pid = Number(first);
  return Number.isInteger(pid) && pid > 0 ? pid : null;
}

/** Borra un postmaster.pid huérfano (hard kill previo) para no bloquear el próximo start. */
function clearStalePostmasterPid() {
  const pmPid = readPostmasterPid();
  if (pmPid !== null && !isAlive(pmPid)) {
    rmSync(POSTMASTER_PID, { force: true });
    return true;
  }
  return false;
}

if (cmd === 'start') {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  const fresh = !existsSync(join(DATA_DIR, 'PG_VERSION'));
  if (clearStalePostmasterPid()) {
    console.log('Aviso: postmaster.pid huérfano eliminado (arranque previo terminado en seco).');
  }
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
  console.log(
    `PostgreSQL en localhost:${PORT} (pos_dev). Deja esta terminal abierta; Ctrl+C para parar.`,
  );
  process.on('SIGINT', async () => {
    try {
      await pg.stop();
    } catch {
      /* ya estaba parado */
    }
    rmSync(PID_FILE, { force: true });
    process.exit(0);
  });
  await new Promise(() => {}); // mantener vivo
} else if (cmd === 'stop') {
  if (existsSync(PID_FILE)) {
    const pid = Number(readFileSync(PID_FILE, 'utf8'));
    try {
      process.kill(pid);
      console.log('Parado.');
    } catch (err) {
      // ESRCH = el proceso ya no existe; cualquier otro fallo: seguimos limpiando.
      console.log('Parado (proceso ya no existía).');
      void err;
    }
    rmSync(PID_FILE, { force: true });
    // Tras un kill duro el postmaster.pid puede quedar; si nadie vivo lo posee, lo borramos.
    if (clearStalePostmasterPid()) {
      console.log('postmaster.pid huérfano eliminado.');
    }
  } else {
    console.log('No hay PID registrado.');
  }
} else if (cmd === 'status') {
  let running = false;
  if (existsSync(PID_FILE)) {
    const pid = Number(readFileSync(PID_FILE, 'utf8'));
    if (isAlive(pid)) {
      running = true;
      console.log(`Corriendo (pid ${pid})`);
    } else {
      // PID file rancio (hard kill / crash): límpialo para no confundir al próximo comando.
      rmSync(PID_FILE, { force: true });
      clearStalePostmasterPid();
    }
  }
  if (!running) console.log('Parado');
} else {
  console.log('Uso: node scripts/db.mjs <start|stop|status>');
  process.exit(1);
}
