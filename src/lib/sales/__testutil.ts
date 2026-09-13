import { randomUUID } from 'node:crypto';
import { db } from '@/lib/db';
import { hashPassword } from '@/lib/auth/password';
import { openCashSession, getOpenCashSession } from '@/lib/cash/sessions';

/**
 * Utilidades de siembra compartidas por los itest de Ventas (Task 6) y
 * Devoluciones (Task 8). No borran el cliente genérico, roles ni taxRates.
 */

/** Crea (o recrea) un usuario con rol `Cajero` y devuelve su id — FK real para `Sale.cajeroId`. */
export async function seedCajero(email: string): Promise<string> {
  await db.user.deleteMany({ where: { email } });
  const rol = await db.role.findFirstOrThrow({ where: { nombre: 'Cajero' } });
  const user = await db.user.create({
    data: {
      nombre: 'Cajero Test',
      email,
      passwordHash: await hashPassword('xxxxxxxxxx'),
      roleId: rol.id,
    },
  });
  return user.id;
}

export type SeedVariantOpts = {
  precioVenta: number;
  stock?: number;
  /** `'default'` = IVA 16 %, `'exento'` = 0 %. El impuesto es a nivel de Product. */
  tasa?: 'default' | 'exento';
  disponible?: boolean;
  archivada?: boolean;
  productoArchivado?: boolean;
  nombreProducto?: string;
  nombreVariante?: string | null;
  sku?: string | null;
};

/**
 * Crea un `Product` SIMPLE con una única variante default con la tasa, precio y
 * stock indicados. Para líneas de tasas mixtas, llama al helper varias veces.
 */
export async function seedVariant(
  opts: SeedVariantOpts,
): Promise<{ productId: string; variantId: string; tasa: number }> {
  const tax =
    opts.tasa === 'exento'
      ? await db.taxRate.findFirstOrThrow({ where: { nombre: 'Exento' } })
      : await db.taxRate.findFirstOrThrow({ where: { esDefault: true } });

  const product = await db.product.create({
    data: {
      nombre: opts.nombreProducto ?? `P-${randomUUID()}`,
      taxRateId: tax.id,
      tipo: 'SIMPLE',
      archivado: opts.productoArchivado ?? false,
      variants: {
        create: {
          esDefault: true,
          nombre: opts.nombreVariante ?? null,
          sku: opts.sku ?? null,
          precioVenta: opts.precioVenta,
          stock: opts.stock ?? 0,
          disponible: opts.disponible ?? true,
          archivada: opts.archivada ?? opts.productoArchivado ?? false,
        },
      },
    },
    include: { variants: true },
  });

  return {
    productId: product.id,
    variantId: product.variants[0].id,
    tasa: Number(tax.tasa),
  };
}

/** Abre una caja con fondo 0 si no hay ninguna abierta; devuelve el id de la sesión abierta. */
export async function conCajaAbierta(actorId: string): Promise<string> {
  const abierta = await getOpenCashSession();
  if (abierta) return abierta.id;
  const { id } = await openCashSession(actorId, 0, null);
  return id;
}

/** Limpieza FK-segura de todo lo que una venta/devolución puede crear. */
export async function cleanupSales(userEmails: string[]): Promise<void> {
  await db.activityLog.deleteMany();
  await db.payment.deleteMany();
  await db.returnLine.deleteMany();
  await db.return.deleteMany();
  await db.saleLine.deleteMany();
  await db.sale.deleteMany();
  await db.cashMovement.deleteMany();
  await db.cashSession.deleteMany();
  await db.inventoryMovement.deleteMany();
  await db.productVariant.deleteMany();
  await db.product.deleteMany();
  await db.customer.deleteMany({ where: { esGenerico: false } });
  if (userEmails.length) await db.user.deleteMany({ where: { email: { in: userEmails } } });
}
