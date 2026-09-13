import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '@/lib/db';
import { recordMovement } from './movements';
import { listMovements, listStock } from './query';

async function seedProduct(productName: string, variantName?: string) {
  const tax = await db.taxRate.findFirstOrThrow({ where: { esDefault: true } });
  const p = await db.product.create({
    data: {
      nombre: productName,
      taxRateId: tax.id,
      tipo: 'SIMPLE',
      variants: {
        create: {
          esDefault: true,
          nombre: variantName,
          precioVenta: 10,
          precioCompra: 5,
          stock: 0,
        },
      },
    },
    include: { variants: true },
  });
  return { product: p, variant: p.variants[0] };
}

beforeEach(async () => {
  await db.inventoryMovement.deleteMany();
  await db.activityLog.deleteMany();
  await db.productVariant.deleteMany();
  await db.product.deleteMany();
  await db.user.deleteMany();
});

describe('listMovements', () => {
  it('lista movimientos paginados en orden descendente por createdAt', async () => {
    const { variant: v1 } = await seedProduct('Producto A', 'Variante A1');
    const { variant: v2 } = await seedProduct('Producto B', 'Variante B1');

    // Crear 3 movimientos
    await recordMovement({
      variantId: v1.id,
      tipo: 'ENTRADA',
      valor: 10,
      motivo: 'compra inicial',
      actorId: null,
    });
    await recordMovement({
      variantId: v2.id,
      tipo: 'ENTRADA',
      valor: 5,
      motivo: 'compra v2',
      actorId: null,
    });
    await recordMovement({
      variantId: v1.id,
      tipo: 'AJUSTE',
      valor: 8,
      motivo: 'recuento físico',
      actorId: null,
    });

    // Listar con paginación: page 1, pageSize 2
    const result = await listMovements({ page: 1, pageSize: 2 });
    const result2 = await listMovements({ page: 2, pageSize: 2 });

    expect(result.total).toBe(3);
    expect(result.rows).toHaveLength(2);
    // Deben estar en orden desc por createdAt (el tercero primero, luego el segundo)
    expect(result.rows[0].tipo).toBe('AJUSTE');
    expect(result.rows[1].tipo).toBe('ENTRADA');
    // Página 2 debe tener 1 elemento
    expect(result2.rows).toHaveLength(1);
    expect(result2.rows[0].tipo).toBe('ENTRADA');
  });

  it('filtra movimientos por tipo', async () => {
    const { variant: v1 } = await seedProduct('Producto A', 'Variante A1');
    const { variant: v2 } = await seedProduct('Producto B', 'Variante B1');

    await recordMovement({
      variantId: v1.id,
      tipo: 'ENTRADA',
      valor: 10,
      motivo: 'compra',
      actorId: null,
    });
    await recordMovement({
      variantId: v2.id,
      tipo: 'ENTRADA',
      valor: 5,
      motivo: 'compra 2',
      actorId: null,
    });
    await recordMovement({
      variantId: v1.id,
      tipo: 'AJUSTE',
      valor: 8,
      motivo: 'recuento',
      actorId: null,
    });

    const result = await listMovements({
      page: 1,
      pageSize: 10,
      tipo: 'AJUSTE',
    });

    expect(result.total).toBe(1);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].tipo).toBe('AJUSTE');
    expect(result.rows[0].tipoLabel).toBe('Ajuste');
  });

  it('filtra movimientos por productId', async () => {
    const { product: p1, variant: v1 } = await seedProduct('Producto A', 'Variante A1');
    const { variant: v2 } = await seedProduct('Producto B', 'Variante B1');

    await recordMovement({
      variantId: v1.id,
      tipo: 'ENTRADA',
      valor: 10,
      motivo: 'compra 1',
      actorId: null,
    });
    await recordMovement({
      variantId: v2.id,
      tipo: 'ENTRADA',
      valor: 5,
      motivo: 'compra 2',
      actorId: null,
    });
    await recordMovement({
      variantId: v1.id,
      tipo: 'SALIDA',
      valor: 2,
      motivo: 'venta 1',
      actorId: null,
    });

    const result = await listMovements({
      page: 1,
      pageSize: 10,
      productId: p1.id,
    });

    expect(result.total).toBe(2);
    expect(result.rows).toHaveLength(2);
    expect(result.rows.every((r) => r.productoNombre === 'Producto A')).toBe(true);
  });

  it('traduce tipoLabel correctamente', async () => {
    const { variant: v } = await seedProduct('Producto', 'Variante');

    // Solo vamos a crear ENTRADA, SALIDA, AJUSTE que soporta recordMovement
    await recordMovement({
      variantId: v.id,
      tipo: 'ENTRADA',
      valor: 10,
      motivo: 'entrada',
      actorId: null,
    });
    await recordMovement({
      variantId: v.id,
      tipo: 'SALIDA',
      valor: 3,
      motivo: 'salida',
      actorId: null,
    });
    await recordMovement({
      variantId: v.id,
      tipo: 'AJUSTE',
      valor: 5,
      motivo: 'ajuste',
      actorId: null,
    });

    const result = await listMovements({ page: 1, pageSize: 10 });
    expect(result.rows).toHaveLength(3);

    const tiposMap: Record<string, string> = {
      ENTRADA: 'Entrada',
      SALIDA: 'Salida',
      AJUSTE: 'Ajuste',
    };

    result.rows.forEach((row) => {
      expect(row.tipoLabel).toBe(tiposMap[row.tipo]);
    });
  });

  it('popula actorNombre cuando hay actor, null cuando no hay', async () => {
    const { variant: v } = await seedProduct('Producto', 'Variante');

    // Crear un usuario para usar como actor
    const role = await db.role.findFirstOrThrow({ where: { nombre: 'Cajero' } });
    const user = await db.user.create({
      data: {
        email: `user-${Math.random()}@test.com`,
        nombre: 'Test Actor',
        passwordHash: 'x',
        roleId: role.id,
      },
    });

    // Movimiento con actor
    await recordMovement({
      variantId: v.id,
      tipo: 'ENTRADA',
      valor: 10,
      motivo: 'con actor',
      actorId: user.id,
    });

    // Movimiento sin actor
    await recordMovement({
      variantId: v.id,
      tipo: 'SALIDA',
      valor: 2,
      motivo: 'sin actor',
      actorId: null,
    });

    const result = await listMovements({ page: 1, pageSize: 10 });
    expect(result.rows).toHaveLength(2);

    // El primero (más reciente) es sin actor
    expect(result.rows[0].actorNombre).toBeNull();
    // El segundo es con actor
    expect(result.rows[1].actorNombre).toBe('Test Actor');
  });

  it('cantidad es el valor signed (positivo para ENTRADA, negativo para SALIDA/AJUSTE)', async () => {
    const { variant: v } = await seedProduct('Producto', 'Variante');

    await recordMovement({
      variantId: v.id,
      tipo: 'ENTRADA',
      valor: 10,
      motivo: 'entrada',
      actorId: null,
    });
    await recordMovement({
      variantId: v.id,
      tipo: 'SALIDA',
      valor: 3,
      motivo: 'salida',
      actorId: null,
    });
    await recordMovement({
      variantId: v.id,
      tipo: 'AJUSTE',
      valor: 5,
      motivo: 'ajuste de 7 a 5',
      actorId: null,
    });

    const result = await listMovements({ page: 1, pageSize: 10 });
    expect(result.rows).toHaveLength(3);

    // Ordenado desc, así que: AJUSTE (delta -2), SALIDA (delta -3), ENTRADA (delta 10)
    // ENTRADA: 0 -> 10, delta 10
    // SALIDA: 10 -> 7, delta -3
    // AJUSTE: 7 -> 5, delta -2
    expect(result.rows[0].cantidad).toBe(-2); // AJUSTE: 7 -> 5 = delta -2
    expect(result.rows[1].cantidad).toBe(-3); // SALIDA: 10 -> 7 = delta -3
    expect(result.rows[2].cantidad).toBe(10); // ENTRADA: 0 -> 10 = delta 10
  });

  it('filtra por rango de fechas (desde, hasta)', async () => {
    const { variant: v } = await seedProduct('Producto', 'Variante');

    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    await recordMovement({
      variantId: v.id,
      tipo: 'ENTRADA',
      valor: 10,
      motivo: 'entrada',
      actorId: null,
    });

    // Buscar desde ayer (debe incluir el movimiento reciente)
    const result1 = await listMovements({
      page: 1,
      pageSize: 10,
      desde: yesterday,
    });
    expect(result1.total).toBe(1);

    // Buscar desde mañana (no debe incluir nada)
    const result2 = await listMovements({
      page: 1,
      pageSize: 10,
      desde: tomorrow,
    });
    expect(result2.total).toBe(0);

    // Buscar hasta ayer (no debe incluir nada)
    const result3 = await listMovements({
      page: 1,
      pageSize: 10,
      hasta: yesterday,
    });
    expect(result3.total).toBe(0);

    // Buscar hasta mañana (debe incluir)
    const result4 = await listMovements({
      page: 1,
      pageSize: 10,
      hasta: tomorrow,
    });
    expect(result4.total).toBe(1);
  });

  it('filtra por actorId', async () => {
    const { variant: v } = await seedProduct('Producto', 'Variante');

    const role = await db.role.findFirstOrThrow({ where: { nombre: 'Cajero' } });

    const user1 = await db.user.create({
      data: {
        email: `user1-${Math.random()}@test.com`,
        nombre: 'Actor 1',
        passwordHash: 'x',
        roleId: role.id,
      },
    });

    const user2 = await db.user.create({
      data: {
        email: `user2-${Math.random()}@test.com`,
        nombre: 'Actor 2',
        passwordHash: 'x',
        roleId: role.id,
      },
    });

    await recordMovement({
      variantId: v.id,
      tipo: 'ENTRADA',
      valor: 10,
      motivo: 'entrada',
      actorId: user1.id,
    });
    await recordMovement({
      variantId: v.id,
      tipo: 'SALIDA',
      valor: 3,
      motivo: 'salida',
      actorId: user2.id,
    });

    // Filtrar por user1
    const result1 = await listMovements({
      page: 1,
      pageSize: 10,
      actorId: user1.id,
    });
    expect(result1.total).toBe(1);
    expect(result1.rows[0].actorNombre).toBe('Actor 1');

    // Filtrar por user2
    const result2 = await listMovements({
      page: 1,
      pageSize: 10,
      actorId: user2.id,
    });
    expect(result2.total).toBe(1);
    expect(result2.rows[0].actorNombre).toBe('Actor 2');
  });
});

describe('listStock', () => {
  it('lists active variants with correct estado derivation', async () => {
    const tax = await db.taxRate.findFirstOrThrow({ where: { esDefault: true } });
    await db.product.create({
      data: {
        nombre: 'Producto A',
        taxRateId: tax.id,
        tipo: 'SIMPLE',
        variants: {
          create: [
            { esDefault: true, nombre: 'ok', precioVenta: 10, precioCompra: 0, stock: 100, stockMinimo: 50 },
            { nombre: 'bajo', precioVenta: 10, precioCompra: 0, stock: 10, stockMinimo: 20 },
            { nombre: 'agotado', precioVenta: 10, precioCompra: 0, stock: 0, stockMinimo: 10 },
          ],
        },
      },
      include: { variants: true },
    });

    const result = await listStock({ page: 1, pageSize: 10 });

    expect(result.total).toBe(3);
    expect(result.rows).toHaveLength(3);

    const okRow = result.rows.find((r) => r.varianteNombre === 'ok');
    const bajoRow = result.rows.find((r) => r.varianteNombre === 'bajo');
    const agotadoRow = result.rows.find((r) => r.varianteNombre === 'agotado');

    expect(okRow?.estado).toBe('ok');
    expect(bajoRow?.estado).toBe('bajo');
    expect(agotadoRow?.estado).toBe('agotado');
  });

  it('filters by q (product name)', async () => {
    const tax = await db.taxRate.findFirstOrThrow({ where: { esDefault: true } });
    await db.product.create({
      data: {
        nombre: 'Laptop Dell XPS',
        taxRateId: tax.id,
        tipo: 'SIMPLE',
        variants: { create: { esDefault: true, precioVenta: 10, precioCompra: 0, stock: 100, stockMinimo: 0 } },
      },
    });
    await db.product.create({
      data: {
        nombre: 'Mouse Logitech',
        taxRateId: tax.id,
        tipo: 'SIMPLE',
        variants: { create: { esDefault: true, precioVenta: 10, precioCompra: 0, stock: 50, stockMinimo: 0 } },
      },
    });

    const result = await listStock({ q: 'Laptop', page: 1, pageSize: 10 });

    expect(result.total).toBe(1);
    expect(result.rows[0].productoNombre).toBe('Laptop Dell XPS');
  });

  it('filters by q (codigoBarras exacto)', async () => {
    const tax = await db.taxRate.findFirstOrThrow({ where: { esDefault: true } });
    await db.product.create({
      data: {
        nombre: 'Refresco Cola',
        taxRateId: tax.id,
        tipo: 'SIMPLE',
        variants: {
          create: {
            esDefault: true,
            codigoBarras: '7501000111222',
            precioVenta: 10,
            precioCompra: 0,
            stock: 30,
            stockMinimo: 0,
          },
        },
      },
    });
    await db.product.create({
      data: {
        nombre: 'Otro Producto',
        taxRateId: tax.id,
        tipo: 'SIMPLE',
        variants: { create: { esDefault: true, precioVenta: 10, precioCompra: 0, stock: 5, stockMinimo: 0 } },
      },
    });

    const result = await listStock({ q: '7501000111222', page: 1, pageSize: 10 });

    expect(result.total).toBe(1);
    expect(result.rows[0].productoNombre).toBe('Refresco Cola');
  });

  it('filters by soloAgotados', async () => {
    const tax = await db.taxRate.findFirstOrThrow({ where: { esDefault: true } });
    await db.product.create({
      data: {
        nombre: 'P1',
        taxRateId: tax.id,
        tipo: 'SIMPLE',
        variants: { create: { esDefault: true, precioVenta: 10, precioCompra: 0, stock: 100, stockMinimo: 50 } },
      },
    });
    await db.product.create({
      data: {
        nombre: 'P2',
        taxRateId: tax.id,
        tipo: 'SIMPLE',
        variants: { create: { esDefault: true, precioVenta: 10, precioCompra: 0, stock: 0, stockMinimo: 10 } },
      },
    });
    await db.product.create({
      data: {
        nombre: 'P3',
        taxRateId: tax.id,
        tipo: 'SIMPLE',
        variants: { create: { esDefault: true, precioVenta: 10, precioCompra: 0, stock: 5, stockMinimo: 20 } },
      },
    });

    const result = await listStock({ soloAgotados: true, page: 1, pageSize: 10 });

    expect(result.total).toBe(1);
    expect(result.rows[0].productoNombre).toBe('P2');
    expect(result.rows[0].estado).toBe('agotado');
  });

  it('filters by soloStockBajo', async () => {
    const tax = await db.taxRate.findFirstOrThrow({ where: { esDefault: true } });
    await db.product.create({
      data: {
        nombre: 'P1',
        taxRateId: tax.id,
        tipo: 'SIMPLE',
        variants: { create: { esDefault: true, precioVenta: 10, precioCompra: 0, stock: 100, stockMinimo: 50 } },
      },
    });
    await db.product.create({
      data: {
        nombre: 'P2',
        taxRateId: tax.id,
        tipo: 'SIMPLE',
        variants: { create: { esDefault: true, precioVenta: 10, precioCompra: 0, stock: 0, stockMinimo: 10 } },
      },
    });
    await db.product.create({
      data: {
        nombre: 'P3',
        taxRateId: tax.id,
        tipo: 'SIMPLE',
        variants: { create: { esDefault: true, precioVenta: 10, precioCompra: 0, stock: 5, stockMinimo: 20 } },
      },
    });

    const result = await listStock({ soloStockBajo: true, page: 1, pageSize: 10 });

    expect(result.total).toBe(1);
    expect(result.rows[0].productoNombre).toBe('P3');
    expect(result.rows[0].estado).toBe('bajo');
  });

  it('respects pagination', async () => {
    const tax = await db.taxRate.findFirstOrThrow({ where: { esDefault: true } });
    for (let i = 0; i < 5; i++) {
      await db.product.create({
        data: {
          nombre: `P${i}`,
          taxRateId: tax.id,
          tipo: 'SIMPLE',
          variants: { create: { esDefault: true, precioVenta: 10, precioCompra: 0, stock: 100, stockMinimo: 0 } },
        },
      });
    }

    const page1 = await listStock({ page: 1, pageSize: 2 });
    expect(page1.total).toBe(5);
    expect(page1.rows).toHaveLength(2);

    const page2 = await listStock({ page: 2, pageSize: 2 });
    expect(page2.total).toBe(5);
    expect(page2.rows).toHaveLength(2);

    const page3 = await listStock({ page: 3, pageSize: 2 });
    expect(page3.total).toBe(5);
    expect(page3.rows).toHaveLength(1);
  });
});
