import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { ALL_PERMISSION_KEYS } from '../src/lib/auth/rbac';
import { ROLE_PERMISSIONS } from '../src/lib/auth/role-permissions';

// Prisma 7 requires a driver adapter on the client.
const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

async function main() {
  for (const [nombre, permisos] of Object.entries(ROLE_PERMISSIONS)) {
    const role = await db.role.upsert({
      where: { nombre },
      update: { esSistema: true },
      create: { nombre, esSistema: true, descripcion: `Rol de sistema: ${nombre}` },
    });
    await db.rolePermission.deleteMany({ where: { roleId: role.id } });
    if (permisos.length) {
      await db.rolePermission.createMany({
        data: permisos.map((permiso) => ({ roleId: role.id, permiso })),
      });
    }
  }

  await db.appSetting.upsert({
    where: { clave: 'session.idleTimeoutMinutes' },
    update: {},
    create: { clave: 'session.idleTimeoutMinutes', valor: 15 },
  });

  // --- Bloque 2: tasas de impuesto ---
  const taxRates = [
    { nombre: 'IVA 16%', tasa: 0.16, esDefault: true },
    { nombre: 'Exento', tasa: 0, esDefault: false },
  ];
  for (const t of taxRates) {
    await db.taxRate.upsert({
      where: { nombre: t.nombre },
      update: { tasa: t.tasa, esDefault: t.esDefault, activa: true },
      create: { nombre: t.nombre, tasa: t.tasa, esDefault: t.esDefault },
    });
  }

  // --- Bloque 3: cliente genérico ---
  const generico = await db.customer.findFirst({ where: { esGenerico: true } });
  if (generico) {
    await db.customer.update({
      where: { id: generico.id },
      data: { nombre: 'Público en General', rfc: 'XAXX010101000', archivado: false },
    });
  } else {
    await db.customer.create({
      data: { nombre: 'Público en General', rfc: 'XAXX010101000', esGenerico: true },
    });
  }

  // --- Bloque 4: contadores de folio ---
  for (const serie of ['V', 'D', 'C']) {
    await db.folioCounter.upsert({
      where: { serie },
      update: {},
      create: { serie, valor: 0 },
    });
  }

  console.log('Seed completado. Permisos en catálogo:', ALL_PERMISSION_KEYS.length);
}

main()
  .then(() => db.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await db.$disconnect();
    process.exitCode = 1;
  });
