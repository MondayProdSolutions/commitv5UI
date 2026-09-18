// Uso manual, una sola vez, para crear tu primer Super Admin local:
//   npx tsx scripts/create-platform-admin.ts admin@tuapp.com "unaClaveSegura123"
import 'dotenv/config';
import { db, withPlatformAdmin } from '../src/lib/db';
import { hashPassword } from '../src/lib/platform-auth/password';

async function main() {
  const [email, password] = process.argv.slice(2);
  if (!email || !password) {
    console.error('Uso: npx tsx scripts/create-platform-admin.ts <email> <password>');
    process.exit(1);
  }
  const passwordHash = await hashPassword(password);
  const admin = await withPlatformAdmin(() =>
    db.platformAdmin.create({ data: { nombre: 'Super Admin', email, passwordHash } }),
  );
  console.log('Creado:', admin.email);
  process.exit(0);
}

main();
