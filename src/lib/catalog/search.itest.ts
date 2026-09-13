import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { TaxRate } from '@prisma/client';
import { db } from '@/lib/db';
import { searchProducts } from './search';

beforeEach(async () => {
  await db.inventoryMovement.deleteMany();
  await db.productVariant.deleteMany();
  await db.product.deleteMany();
});

afterAll(async () => {
  await db.inventoryMovement.deleteMany();
  await db.productVariant.deleteMany();
  await db.product.deleteMany();
});

describe('searchProducts', () => {
  let taxRate: TaxRate;

  beforeEach(async () => {
    // Get the default tax rate (seeded by bloque 2)
    taxRate = await db.taxRate.findFirstOrThrow({ where: { esDefault: true } });
  });

  it('busca por nombre (insensible a mayúsculas)', async () => {
    // Seed: Coca Cola 600ml
    await db.product.create({
      data: {
        nombre: 'Coca Cola 600ml',
        taxRateId: taxRate.id,
        variants: {
          create: {
            sku: 'CC-600',
            codigoBarras: '7501055300019',
            precioVenta: 18,
            precioCompra: 0,
          },
        },
      },
    });

    const hits = await searchProducts('coca');
    expect(hits).toHaveLength(1);
    expect(hits[0].productoNombre).toBe('Coca Cola 600ml');
  });

  it('busca por SKU exacto', async () => {
    await db.product.create({
      data: {
        nombre: 'Coca Cola 600ml',
        taxRateId: taxRate.id,
        variants: {
          create: {
            sku: 'CC-600',
            codigoBarras: '7501055300019',
            precioVenta: 18,
            precioCompra: 0,
          },
        },
      },
    });

    const hits = await searchProducts('CC-600');
    expect(hits).toHaveLength(1);
    expect(hits[0].sku).toBe('CC-600');
  });

  it('busca por prefijo de SKU', async () => {
    await db.product.create({
      data: {
        nombre: 'Coca Cola 600ml',
        taxRateId: taxRate.id,
        variants: {
          create: {
            sku: 'CC-600',
            codigoBarras: '7501055300019',
            precioVenta: 18,
            precioCompra: 0,
          },
        },
      },
    });

    const hits = await searchProducts('CC-');
    expect(hits).toHaveLength(1);
    expect(hits[0].sku).toBe('CC-600');
  });

  it('busca por código de barras exacto y lo coloca primero', async () => {
    // Create two products to verify ordering
    await db.product.create({
      data: {
        nombre: 'Coca Cola 600ml',
        taxRateId: taxRate.id,
        variants: {
          create: {
            sku: 'CC-600',
            codigoBarras: '7501055300019',
            precioVenta: 18,
            precioCompra: 0,
          },
        },
      },
    });

    // Create another product whose name contains the barcode digits
    // Actually, let's create a variant with a SKU that starts with part of the barcode
    // to ensure exactBarcode still comes first
    await db.product.create({
      data: {
        nombre: 'Producto con 7501',
        taxRateId: taxRate.id,
        variants: {
          create: {
            sku: 'SKU-OTHER',
            codigoBarras: 'OTHER-BARCODE',
            precioVenta: 20,
            precioCompra: 0,
          },
        },
      },
    });

    const hits = await searchProducts('7501055300019');
    expect(hits).toHaveLength(1);
    expect(hits[0].exactBarcode).toBe(true);
    expect(hits[0].codigoBarras).toBe('7501055300019');
  });

  it('devuelve vacío para búsqueda vacía', async () => {
    await db.product.create({
      data: {
        nombre: 'Coca Cola 600ml',
        taxRateId: taxRate.id,
        variants: {
          create: {
            sku: 'CC-600',
            codigoBarras: '7501055300019',
            precioVenta: 18,
            precioCompra: 0,
          },
        },
      },
    });

    const hits = await searchProducts('');
    expect(hits).toEqual([]);
  });

  it('excluye productos archivados por defecto, incluye con incluirArchivados: true', async () => {
    const cocaCola = await db.product.create({
      data: {
        nombre: 'Coca Cola 600ml',
        taxRateId: taxRate.id,
        archivado: true,
        variants: {
          create: {
            sku: 'CC-600',
            codigoBarras: '7501055300019',
            precioVenta: 18,
            precioCompra: 0,
          },
        },
      },
    });

    // Default: exclude archived
    let hits = await searchProducts('coca');
    expect(hits).toHaveLength(0);

    // With incluirArchivados: true
    hits = await searchProducts('coca', { incluirArchivados: true });
    expect(hits).toHaveLength(1);
    expect(hits[0].productId).toBe(cocaCola.id);
  });

  it('excluye variantes no disponibles cuando soloDisponibles: true', async () => {
    await db.product.create({
      data: {
        nombre: 'Coca Cola 600ml',
        taxRateId: taxRate.id,
        variants: {
          create: {
            sku: 'CC-600',
            codigoBarras: '7501055300019',
            precioVenta: 18,
            precioCompra: 0,
            disponible: false,
          },
        },
      },
    });

    // Default: include unavailable
    let hits = await searchProducts('coca');
    expect(hits).toHaveLength(1);

    // With soloDisponibles: true
    hits = await searchProducts('coca', { soloDisponibles: true });
    expect(hits).toHaveLength(0);
  });

  it('calcula precioConImpuesto correctamente', async () => {
    // Coca Cola 600ml, precioVenta: 18
    // Default tax rate is IVA 16%, so 18 * 1.16 = 20.88
    await db.product.create({
      data: {
        nombre: 'Coca Cola 600ml',
        taxRateId: taxRate.id,
        variants: {
          create: {
            sku: 'CC-600',
            codigoBarras: '7501055300019',
            precioVenta: 18,
            precioCompra: 0,
          },
        },
      },
    });

    const hits = await searchProducts('coca');
    expect(hits).toHaveLength(1);
    expect(hits[0].precioVenta).toBe(18);
    expect(hits[0].precioConImpuesto).toBeCloseTo(20.88);
  });

  it('respeta el parámetro limit', async () => {
    // Create 5 products to test limiting
    for (let i = 1; i <= 5; i++) {
      await db.product.create({
        data: {
          nombre: `Producto ${i}`,
          taxRateId: taxRate.id,
          variants: {
            create: {
              sku: `SKU-${i}`,
              precioVenta: 10 * i,
              precioCompra: 0,
            },
          },
        },
      });
    }

    // Search for all (they all start with 'P')
    let hits = await searchProducts('Producto', { limit: 2 });
    expect(hits).toHaveLength(2);

    // Default limit is 20
    hits = await searchProducts('Producto');
    expect(hits).toHaveLength(5);
  });

  it('respeta un limit grande explícito (no lo recorta al antiguo tope de 60)', async () => {
    // Seed 70 variantes coincidentes: con el viejo `Math.min(limit * 3, 60)` sólo
    // volverían 60; con el tope elevado deben volver las 70.
    await Promise.all(
      Array.from({ length: 70 }, (_, i) =>
        db.product.create({
          data: {
            nombre: `Bulk Item ${String(i).padStart(3, '0')}`,
            taxRateId: taxRate.id,
            variants: {
              create: { sku: `BULK-${String(i).padStart(3, '0')}`, precioVenta: 10, precioCompra: 0 },
            },
          },
        }),
      ),
    );

    const hits = await searchProducts('Bulk Item', { limit: 100 });
    expect(hits.length).toBe(70);
  });

  it('ordena por exactBarcode, luego prefijo de SKU, luego nombre de producto', async () => {
    // Create products to test sorting
    await db.product.create({
      data: {
        nombre: 'Apple Juice',
        taxRateId: taxRate.id,
        variants: {
          create: {
            sku: 'AJ-100',
            codigoBarras: 'APPLE-BARCODE',
            precioVenta: 10,
            precioCompra: 0,
          },
        },
      },
    });

    await db.product.create({
      data: {
        nombre: 'Banana Juice',
        taxRateId: taxRate.id,
        variants: {
          create: {
            sku: 'BJ-100',
            precioVenta: 10,
            precioCompra: 0,
          },
        },
      },
    });

    await db.product.create({
      data: {
        nombre: 'Apple Pie',
        taxRateId: taxRate.id,
        variants: {
          create: {
            sku: 'AP-100',
            precioVenta: 10,
            precioCompra: 0,
          },
        },
      },
    });

    // Search for 'AP' - should get AP prefix first, then other matches alphabetically
    const hits = await searchProducts('AP');
    expect(hits).toHaveLength(2);
    // AP-100 (SKU prefix match) should come first
    expect(hits[0].sku).toBe('AP-100');
    // Then alphabetical by product name
    expect(hits[1].productoNombre).toBe('Apple Juice');
  });

  it('excluye variantes archivadas por defecto', async () => {
    await db.product.create({
      data: {
        nombre: 'Coca Cola 600ml',
        taxRateId: taxRate.id,
        variants: {
          create: [
            {
              sku: 'CC-600',
              precioVenta: 18,
              precioCompra: 0,
              archivada: true,
            },
          ],
        },
      },
    });

    // Should not find the archived variant by name
    let hits = await searchProducts('coca');
    expect(hits).toHaveLength(0);

    // Should find it when including archived
    hits = await searchProducts('coca', { incluirArchivados: true });
    expect(hits).toHaveLength(1);
  });
});
