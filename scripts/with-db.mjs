// Un solo comando para dev/producción: levanta el Postgres embebido (si no
// está corriendo ya) en este mismo proceso y luego lanza el script de npm
// pedido ('dev' o 'start'), sin necesitar una segunda terminal para la BD.
// Si la BD ya estaba corriendo (p. ej. alguien dejó `npm run db:start`
// abierto aparte), la reutiliza y no la detiene al salir — solo apaga lo que
// él mismo encendió.
import { spawn } from 'node:child_process';
import { PORT, isRunning, startEmbeddedDb, markStopped } from './lib/embedded-db.mjs';

const npmScript = process.argv[2];
if (npmScript !== 'dev' && npmScript !== 'start') {
  console.log('Uso: node scripts/with-db.mjs <dev|start>');
  process.exit(1);
}

let pg = null;
if (isRunning()) {
  console.log(`PostgreSQL ya estaba corriendo en localhost:${PORT}; se reutiliza.`);
} else {
  console.log('Iniciando PostgreSQL embebido...');
  pg = await startEmbeddedDb();
  console.log(`PostgreSQL listo en localhost:${PORT} (pos_dev).`);
}

const child = spawn('npm', ['run', npmScript], { stdio: 'inherit', shell: true });

let shuttingDown = false;
async function shutdown(code) {
  if (shuttingDown) return;
  shuttingDown = true;
  if (pg) {
    try {
      await pg.stop();
    } catch {
      /* ya estaba parado */
    }
    markStopped();
  }
  process.exit(code);
}

child.on('exit', (code) => {
  void shutdown(code ?? 0);
});
process.on('SIGINT', () => child.kill('SIGINT'));
process.on('SIGTERM', () => child.kill('SIGTERM'));
