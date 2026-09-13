import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '@/lib/db';
import { recordMovement } from './movements';
import { ValidationError } from '@/lib/errors';

async function seedVariant(stock = 0, precioCompra = 0) {
  const tax = await db.taxRate.findFirstOrThrow({ where: { esDefault: true } });
  const p = await db.product.create({
    data: {
      nombre: `P-${Math.random()}`, taxRateId: tax.id, tipo: 'SIMPLE',
      variants: { create: { esDefault: true, precioVenta: 10, precioCompra, stock } },
    },
    include: { variants: true },
  });
  return p.variants[0];
}

beforeEach(async () => {
  await db.inventoryMovement.deleteMany();
  await db.activityLog.deleteMany();
  await db.productVariant.deleteMany();
  await db.product.deleteMany();
});

describe('recordMovement', () => {
  it('ENTRADA suma stock y registra el movimiento + auditoría', async () => {
    const v = await seedVariant(0);
    const r = await recordMovement({ variantId: v.id, tipo: 'ENTRADA', valor: 10, motivo: 'compra', actorId: null });
    expect(r).toMatchObject({ stockPrevio: 0, stockNuevo: 10, delta: 10 });
    const after = await db.productVariant.findUniqueOrThrow({ where: { id: v.id } });
    expect(after.stock).toBe(10);
    const mov = await db.inventoryMovement.findUniqueOrThrow({ where: { id: r.movementId } });
    expect(mov).toMatchObject({ tipo: 'ENTRADA', cantidad: 10, stockPrevio: 0, stockNuevo: 10, motivo: 'compra' });
    const log = await db.activityLog.findFirstOrThrow({ where: { accion: 'inventario.movimiento' } });
    expect(log.metadata).toMatchObject({ tipo: 'ENTRADA', delta: 10, stockPrevio: 0, stockNuevo: 10 });
  });

  it('ENTRADA con costoUnitario actualiza precioCompra', async () => {
    const v = await seedVariant(0, 5);
    await recordMovement({ variantId: v.id, tipo: 'ENTRADA', valor: 3, motivo: 'x', costoUnitario: 7.5, actorId: null });
    const after = await db.productVariant.findUniqueOrThrow({ where: { id: v.id } });
    expect(Number(after.precioCompra)).toBe(7.5);
  });

  it('SALIDA resta stock', async () => {
    const v = await seedVariant(10);
    const r = await recordMovement({ variantId: v.id, tipo: 'SALIDA', valor: 4, motivo: 'merma', actorId: null });
    expect(r).toMatchObject({ stockPrevio: 10, stockNuevo: 6, delta: -4 });
    const mov = await db.inventoryMovement.findUniqueOrThrow({ where: { id: r.movementId } });
    expect(mov.cantidad).toBe(-4);
  });

  it('SALIDA que dejaría stock negativo se rechaza sin efectos', async () => {
    const v = await seedVariant(3);
    await expect(recordMovement({ variantId: v.id, tipo: 'SALIDA', valor: 5, motivo: 'x', actorId: null }))
      .rejects.toBeInstanceOf(ValidationError);
    const after = await db.productVariant.findUniqueOrThrow({ where: { id: v.id } });
    expect(after.stock).toBe(3);
    expect(await db.inventoryMovement.count()).toBe(0);
  });

  it('AJUSTE fija el stock al objetivo y guarda el delta', async () => {
    const v = await seedVariant(5);
    const r = await recordMovement({ variantId: v.id, tipo: 'AJUSTE', valor: 2, motivo: 'recuento', actorId: null });
    expect(r).toMatchObject({ stockPrevio: 5, stockNuevo: 2, delta: -3 });
    const mov = await db.inventoryMovement.findUniqueOrThrow({ where: { id: r.movementId } });
    expect(mov).toMatchObject({ tipo: 'AJUSTE', cantidad: -3, stockPrevio: 5, stockNuevo: 2 });
  });

  it('AJUSTE a un objetivo negativo se rechaza', async () => {
    const v = await seedVariant(5);
    await expect(recordMovement({ variantId: v.id, tipo: 'AJUSTE', valor: -1, motivo: 'x', actorId: null }))
      .rejects.toBeInstanceOf(ValidationError);
  });

  it('rechaza movimientos sobre una variante archivada', async () => {
    const v = await seedVariant(1);
    await db.productVariant.update({ where: { id: v.id }, data: { archivada: true } });
    await expect(recordMovement({ variantId: v.id, tipo: 'ENTRADA', valor: 1, motivo: 'x', actorId: null }))
      .rejects.toBeInstanceOf(ValidationError);
  });

  it('respeta una tx externa que hace rollback', async () => {
    const v = await seedVariant(0);
    await db.$transaction(async (tx) => {
      await recordMovement({ variantId: v.id, tipo: 'ENTRADA', valor: 9, motivo: 'x', actorId: null }, tx);
      throw new Error('rollback');
    }).catch(() => {});
    const after = await db.productVariant.findUniqueOrThrow({ where: { id: v.id } });
    expect(after.stock).toBe(0);
    expect(await db.inventoryMovement.count()).toBe(0);
  });

  it('VENTA baja el stock y registra el movimiento', async () => {
    const v = await seedVariant(5);
    const r = await recordMovement({
      variantId: v.id, tipo: 'VENTA', valor: 2, motivo: 'Venta V-000001', actorId: null,
      referenciaTipo: 'venta', referenciaId: 'sale-x',
    });
    expect(r.stockNuevo).toBe(3);
    const after = await db.productVariant.findUniqueOrThrow({ where: { id: v.id } });
    expect(after.stock).toBe(3);
    const mov = await db.inventoryMovement.findFirstOrThrow({ where: { variantId: v.id, tipo: 'VENTA' } });
    expect(mov.referenciaId).toBe('sale-x');
    expect(mov.cantidad).toBe(-2);
  });

  it('VENTA con stock insuficiente lanza y no muta', async () => {
    const v = await seedVariant(1);
    await expect(
      recordMovement({ variantId: v.id, tipo: 'VENTA', valor: 5, motivo: 'x', actorId: null }),
    ).rejects.toBeInstanceOf(ValidationError);
    const after = await db.productVariant.findUniqueOrThrow({ where: { id: v.id } });
    expect(after.stock).toBe(1);
  });

  it('DEVOLUCION sube el stock', async () => {
    const v = await seedVariant(2);
    const r = await recordMovement({ variantId: v.id, tipo: 'DEVOLUCION', valor: 3, motivo: 'Devolución D-000001', actorId: null });
    expect(r.stockNuevo).toBe(5);
  });

  it('dos movimientos concurrentes sobre la misma variante no se pisan (FOR UPDATE)', async () => {
    // Stock inicial 5 para que ambos órdenes sean válidos: 5 +10 -5 = 10 y
    // 5 -5 +10 = 10 (con stock 3, si SALIDA gana el lock primero haría 3 - 5 < 0).
    const v = await seedVariant(5);
    await Promise.all([
      recordMovement({ variantId: v.id, tipo: 'ENTRADA', valor: 10, motivo: 'a', actorId: null }),
      recordMovement({ variantId: v.id, tipo: 'SALIDA', valor: 5, motivo: 'b', actorId: null }),
    ]);
    const after = await db.productVariant.findUniqueOrThrow({ where: { id: v.id } });
    expect(after.stock).toBe(10); // resultado agregado independiente del orden
    expect(await db.inventoryMovement.count()).toBe(2);
  });
});
