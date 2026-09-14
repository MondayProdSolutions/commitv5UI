import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { ALL_PERMISSION_KEYS } from '../src/lib/auth/rbac';
import { ROLE_PERMISSIONS } from '../src/lib/auth/role-permissions';

// Prisma 7 requires a driver adapter on the client. Pool a una sola conexión: una
// bandera de alcance de sesión (`set_config(..., false)`) solo es confiable si
// todas las consultas posteriores reusan la misma conexión.
const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL, max: 1 }),
});

async function main() {
  // Este script confía en sí mismo para escribir en cualquier tenant — necesario
  // una vez que la Task 3 active Row-Level Security en las tablas de negocio.
  // `false` = alcance de sesión (no de transacción): el seed no envuelve sus
  // consultas en una transacción compartida, así que necesita que la bandera
  // persista para toda la conexión, no solo para la siguiente consulta.
  await db.$executeRaw`SELECT set_config('app.platform_admin', 'true', false)`;

  const plan = await db.plan.upsert({
    where: { nombre: 'Estándar' },
    update: {},
    create: { nombre: 'Estándar', maxUsuarios: 10, maxSucursales: 3 },
  });

  const tenant = await db.tenant.upsert({
    where: { slug: 'default' },
    update: {},
    create: { slug: 'default', nombre: 'Negocio de prueba', estado: 'ACTIVO', planId: plan.id },
  });

  for (const [nombre, permisos] of Object.entries(ROLE_PERMISSIONS)) {
    const role = await db.role.upsert({
      where: { tenantId_nombre: { tenantId: tenant.id, nombre } },
      update: { esSistema: true },
      create: { tenantId: tenant.id, nombre, esSistema: true, descripcion: `Rol de sistema: ${nombre}` },
    });
    await db.rolePermission.deleteMany({ where: { roleId: role.id } });
    if (permisos.length) {
      await db.rolePermission.createMany({
        data: permisos.map((permiso) => ({ tenantId: tenant.id, roleId: role.id, permiso })),
      });
    }
  }

  await db.appSetting.upsert({
    where: { tenantId_clave: { tenantId: tenant.id, clave: 'session.idleTimeoutMinutes' } },
    update: {},
    create: { tenantId: tenant.id, clave: 'session.idleTimeoutMinutes', valor: 15 },
  });

  // --- Bloque 2: tasas de impuesto ---
  const taxRates = [
    { nombre: 'IVA 16%', tasa: 0.16, esDefault: true },
    { nombre: 'Exento', tasa: 0, esDefault: false },
  ];
  for (const t of taxRates) {
    await db.taxRate.upsert({
      where: { tenantId_nombre: { tenantId: tenant.id, nombre: t.nombre } },
      update: { tasa: t.tasa, esDefault: t.esDefault, activa: true },
      create: { tenantId: tenant.id, nombre: t.nombre, tasa: t.tasa, esDefault: t.esDefault },
    });
  }

  // --- Bloque 3: cliente genérico ---
  const generico = await db.customer.findFirst({ where: { tenantId: tenant.id, esGenerico: true } });
  if (generico) {
    await db.customer.update({
      where: { id: generico.id },
      data: { nombre: 'Público en General', rfc: 'XAXX010101000', archivado: false },
    });
  } else {
    await db.customer.create({
      data: { tenantId: tenant.id, nombre: 'Público en General', rfc: 'XAXX010101000', esGenerico: true },
    });
  }

  // --- Bloque 4: contadores de folio ---
  for (const serie of ['V', 'D', 'C']) {
    await db.folioCounter.upsert({
      where: { tenantId_serie: { tenantId: tenant.id, serie } },
      update: {},
      create: { tenantId: tenant.id, serie, valor: 0 },
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
