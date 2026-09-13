import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '@/lib/db';
import { lowStockVariants, stockAlertsCount, invalidateStockAlertsCache } from './stock';
import { recordMovement } from './movements';

interface VariantInput {
  nombre?: string | null;
  stock: number;
  stockMinimo: number;
  archivada?: boolean;
}

async function seedProduct(nombre: string, variants: VariantInput[] = []) {
  const tax = await db.taxRate.findFirstOrThrow({ where: { esDefault: true } });
  return db.product.create({
    data: {
      nombre,
      taxRateId: tax.id,
      tipo: 'SIMPLE',
      variants: {
        create: variants.map((v) => ({
          nombre: v.nombre ?? undefined,
          esDefault: variants.length === 1,
          precioVenta: 10,
          precioCompra: 0,
          stock: v.stock,
          stockMinimo: v.stockMinimo,
          archivada: v.archivada ?? false,
        })),
      },
    },
    include: { variants: true },
  });
}

beforeEach(async () => {
  await db.inventoryMovement.deleteMany();
  await db.activityLog.deleteMany();
  await db.productVariant.deleteMany();
  await db.product.deleteMany();
  invalidateStockAlertsCache();
});

describe('lowStockVariants', () => {
  it('variant with stockMinimo:5, stock:5 appears with deficit:0', async () => {
    const p = await seedProduct('P1', [{ stock: 5, stockMinimo: 5 }]);
    const result = await lowStockVariants();

    expect(result.total).toBe(1);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({
      variantId: p.variants[0].id,
      productId: p.id,
      productoNombre: 'P1',
      stock: 5,
      stockMinimo: 5,
      deficit: 0,
    });
  });

  it('variant with stockMinimo:5, stock:6 does NOT appear', async () => {
    await seedProduct('P1', [{ stock: 6, stockMinimo: 5 }]);
    const result = await lowStockVariants();

    expect(result.total).toBe(0);
    expect(result.rows).toHaveLength(0);
  });

  it('variant with stockMinimo:0, stock:0 does NOT appear', async () => {
    await seedProduct('P1', [{ stock: 0, stockMinimo: 0 }]);
    const result = await lowStockVariants();

    expect(result.total).toBe(0);
    expect(result.rows).toHaveLength(0);
  });

  it('archived variant does NOT appear', async () => {
    await seedProduct('P1', [{ stock: 1, stockMinimo: 5, archivada: true }]);
    const result = await lowStockVariants();

    expect(result.total).toBe(0);
    expect(result.rows).toHaveLength(0);
  });

  it('variant on an archived product does NOT appear', async () => {
    const tax = await db.taxRate.findFirstOrThrow({ where: { esDefault: true } });
    await db.product.create({
      data: {
        nombre: 'P1',
        taxRateId: tax.id,
        tipo: 'SIMPLE',
        archivado: true,
        variants: { create: { esDefault: true, precioVenta: 10, precioCompra: 0, stock: 1, stockMinimo: 5 } },
      },
    });

    const result = await lowStockVariants();
    expect(result.total).toBe(0);
    expect(result.rows).toHaveLength(0);
  });

  it('sorts by deficit DESC (highest first), then by productoNombre ASC', async () => {
    await seedProduct('ProductB', [
      { nombre: 'v1', stock: 5, stockMinimo: 10 }, // deficit: 5
    ]);
    await seedProduct('ProductA', [
      { nombre: 'v1', stock: 2, stockMinimo: 10 }, // deficit: 8
    ]);
    await seedProduct('ProductC', [
      { nombre: 'v1', stock: 5, stockMinimo: 10 }, // deficit: 5
    ]);

    const result = await lowStockVariants();

    expect(result.total).toBe(3);
    expect(result.rows).toHaveLength(3);
    // First: ProductA with deficit 8 (highest)
    expect(result.rows[0]).toMatchObject({
      productoNombre: 'ProductA',
      deficit: 8,
    });
    // Second: ProductB with deficit 5 (comes before ProductC alphabetically)
    expect(result.rows[1]).toMatchObject({
      productoNombre: 'ProductB',
      deficit: 5,
    });
    // Third: ProductC with deficit 5
    expect(result.rows[2]).toMatchObject({
      productoNombre: 'ProductC',
      deficit: 5,
    });
  });

  it('respects pagination', async () => {
    for (let i = 0; i < 5; i++) {
      await seedProduct(`P${i}`, [{ stock: 0, stockMinimo: 10 }]);
    }

    const page1 = await lowStockVariants({ page: 1, pageSize: 2 });
    expect(page1.total).toBe(5);
    expect(page1.rows).toHaveLength(2);

    const page2 = await lowStockVariants({ page: 2, pageSize: 2 });
    expect(page2.total).toBe(5);
    expect(page2.rows).toHaveLength(2);

    const page3 = await lowStockVariants({ page: 3, pageSize: 2 });
    expect(page3.total).toBe(5);
    expect(page3.rows).toHaveLength(1);
  });
});

describe('stockAlertsCount', () => {
  it('returns correct count of low-stock variants', async () => {
    await seedProduct('P1', [{ stock: 1, stockMinimo: 5 }]);
    await seedProduct('P2', [{ stock: 6, stockMinimo: 5 }]); // Not low-stock
    await seedProduct('P3', [{ stock: 0, stockMinimo: 5 }]);

    const count = await stockAlertsCount();
    expect(count).toBe(2);
  });

  it('caches result for 30 seconds', async () => {
    await seedProduct('P1', [{ stock: 1, stockMinimo: 5 }]);

    const count1 = await stockAlertsCount();
    expect(count1).toBe(1);

    // Manually add another low-stock variant in the database
    const tax = await db.taxRate.findFirstOrThrow({ where: { esDefault: true } });
    await db.product.create({
      data: {
        nombre: 'P2',
        taxRateId: tax.id,
        tipo: 'SIMPLE',
        variants: { create: { esDefault: true, precioVenta: 10, precioCompra: 0, stock: 1, stockMinimo: 5 } },
      },
    });

    // Without invalidation, should still return cached value
    const count2 = await stockAlertsCount();
    expect(count2).toBe(1); // Cached value

    // After invalidation, should reflect new value
    invalidateStockAlertsCache();
    const count3 = await stockAlertsCount();
    expect(count3).toBe(2); // Fresh value
  });

  it('invalidates cache after recordMovement', async () => {
    const p = await seedProduct('P1', [{ stock: 1, stockMinimo: 5 }]);
    const variant = p.variants[0];

    const count1 = await stockAlertsCount();
    expect(count1).toBe(1);

    // Record a movement that brings stock above threshold
    await recordMovement({
      variantId: variant.id,
      tipo: 'ENTRADA',
      valor: 10,
      motivo: 'test',
      actorId: null,
    });

    // Cache should have been invalidated by recordMovement
    const count2 = await stockAlertsCount();
    expect(count2).toBe(0); // Stock is now 11, above minimum of 5
  });
});
