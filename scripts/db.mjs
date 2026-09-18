import { existsSync, readFileSync, rmSync } from 'node:fs';
import {
  PID_FILE,
  PORT,
  isAlive,
  clearStalePostmasterPid,
  startEmbeddedDb,
  markStopped,
} from './lib/embedded-db.mjs';

const cmd = process.argv[2];

if (cmd === 'start') {
  if (clearStalePostmasterPid()) {
    console.log('Aviso: postmaster.pid huérfano eliminado (arranque previo terminado en seco).');
  }
  const pg = await startEmbeddedDb();
  console.log(
    `PostgreSQL en localhost:${PORT} (pos_dev). Deja esta terminal abierta; Ctrl+C para parar.`,
  );
  process.on('SIGINT', async () => {
    try {
      await pg.stop();
    } catch {
      /* ya estaba parado */
    }
    markStopped();
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
