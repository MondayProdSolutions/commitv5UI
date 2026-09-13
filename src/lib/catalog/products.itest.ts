import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { db } from '@/lib/db';
import { hashPassword } from '@/lib/auth/password';
import { ValidationError } from '@/lib/errors';
import type { CreateProductInput, UpdateProductInput } from '@/lib/validation/product';
import {
  createProduct,
  updateProduct,
  setProductDisponible,
  archiveProduct,
  restoreProduct,
  getProduct,
  listProducts,
} from './products';

const ACTOR_EMAIL = 'task10-products@pos.com';
let actorId: string;
let ivaId: string;
let exentoId: string;

type VInput = CreateProductInput['variantes'][number];

function v(over: Partial<VInput> = {}): VInput {
  return {
    nombre: null,
    sku: null,
    codigoBarras: null,
    precioVenta: 100,
    precioCompra: 0,
    stockMinimo: 0,
    stockInicial: 0,
    ...over,
  };
}

function prodInput(over: Partial<CreateProductInput> = {}): CreateProductInput {
  return {
    nombre: 'Producto Test',
    descripcion: null,
    categoryId: null,
    taxRateId: ivaId,
    tipo: 'SIMPLE',
    imagenUrl: null,
    variantes: [v()],
    ...over,
  };
}

function updInput(over: Partial<UpdateProductInput> & { id: string }): UpdateProductInput {
  return {
    nombre: 'Producto Test',
    descripcion: null,
    categoryId: null,
    taxRateId: ivaId,
    imagenUrl: null,
    ...over,
  };
}

async function cleanup() {
  await db.activityLog.deleteMany();
  await db.inventoryMovement.deleteMany();
  await db.productVariant.deleteMany();
  await db.product.deleteMany();
  await db.user.deleteMany({ where: { email: ACTOR_EMAIL } });
}

beforeEach(async () => {
  await cleanup();
  const admin = await db.role.findFirstOrThrow({ where: { nombre: 'Administrador' } });
  actorId = (
    await db.user.create({
      data: {
        nombre: 'Task10 Actor',
        email: ACTOR_EMAIL,
        passwordHash: await hashPassword('xxxxxxxxxx'),
        roleId: admin.id,
      },
    })
  ).id;
  ivaId = (await db.taxRate.findFirstOrThrow({ where: { esDefault: true } })).id;
  exentoId = (await db.taxRate.findFirstOrThrow({ where: { nombre: 'Exento' } })).id;
});

afterAll(cleanup);

describe('createProduct', () => {
  it('SIMPLE con stockInicial:20 → 1 variante default, movimiento ENTRADA, auditoría', async () => {
    const res = await createProduct(
      actorId,
      prodInput({
        nombre: 'Café Molido',
        variantes: [v({ precioVenta: 100, precioCompra: 40, stockInicial: 20 })],
      }),
      null,
    );

    expect(res.variantIds).toHaveLength(1);

    const variant = await db.productVariant.findUniqueOrThrow({ where: { id: res.variantIds[0] } });
    expect(variant).toMatchObject({ esDefault: true, nombre: null, stock: 20 });

    const movs = await db.inventoryMovement.findMany({ where: { variantId: variant.id } });
    expect(movs).toHaveLength(1);
    expect(movs[0]).toMatchObject({
      tipo: 'ENTRADA',
      motivo: 'Alta de producto',
      stockPrevio: 0,
      stockNuevo: 20,
      cantidad: 20,
    });

    const log = await db.activityLog.findFirstOrThrow({ where: { accion: 'productos.crear' } });
    expect(log.metadata).toMatchObject({ nombre: 'Café Molido', tipo: 'SIMPLE', nVariantes: 1 });
  });

  it('CON_VARIANTES con 2 variantes (una con stockInicial:5) → 2 variantes con nombre, 1 movimiento inicial', async () => {
    const res = await createProduct(
      actorId,
      prodInput({
        nombre: 'Playera',
        tipo: 'CON_VARIANTES',
        variantes: [
          v({ nombre: 'Chica', precioVenta: 150, stockInicial: 5 }),
          v({ nombre: 'Grande', precioVenta: 180 }),
        ],
      }),
      null,
    );

    expect(res.variantIds).toHaveLength(2);
    const variants = await db.productVariant.findMany({
      where: { productId: res.productId },
      orderBy: { precioVenta: 'asc' },
    });
    expect(variants.map((x) => x.nombre)).toEqual(['Chica', 'Grande']);
    expect(variants.every((x) => x.esDefault === false)).toBe(true);
    expect(variants.find((x) => x.nombre === 'Chica')!.stock).toBe(5);
    expect(variants.find((x) => x.nombre === 'Grande')!.stock).toBe(0);

    const movs = await db.inventoryMovement.findMany({
      where: { variantId: { in: res.variantIds } },
    });
    expect(movs).toHaveLength(1);
    expect(movs[0].stockNuevo).toBe(5);
  });

  it('SKU duplicado (input vs variante existente) → ValidationError con la clave correcta y rollback total', async () => {
    await db.product.create({
      data: {
        nombre: 'Existente',
        taxRateId: ivaId,
        tipo: 'SIMPLE',
        variants: { create: { esDefault: true, precioVenta: 10, sku: 'DUP-1', stock: 0 } },
      },
    });

    const countBefore = await db.product.count();

    let caught: unknown;
    try {
      await createProduct(
        actorId,
        prodInput({
          nombre: 'Nuevo Con Dup',
          tipo: 'CON_VARIANTES',
          variantes: [
            v({ nombre: 'A', sku: 'SKU-NUEVO' }),
            v({ nombre: 'B', sku: 'DUP-1' }),
          ],
        }),
        null,
      );
    } catch (e) {
      caught = e;
    }

    expect(caught).toBeInstanceOf(ValidationError);
    expect((caught as ValidationError).fields).toHaveProperty('variantes.1.sku');

    expect(await db.product.count()).toBe(countBefore);
    expect(await db.productVariant.findFirst({ where: { sku: 'SKU-NUEVO' } })).toBeNull();
    expect(await db.product.findFirst({ where: { nombre: 'Nuevo Con Dup' } })).toBeNull();
  });
});

describe('updateProduct', () => {
  it('cambiar taxRateId → auditoría refleja taxRateAntes/taxRateDespues', async () => {
    const { productId } = await createProduct(
      actorId,
      prodInput({ nombre: 'Refresco', taxRateId: ivaId }),
      null,
    );

    await updateProduct(actorId, productId, updInput({ id: productId, nombre: 'Refresco', taxRateId: exentoId }), null);

    const prod = await db.product.findUniqueOrThrow({ where: { id: productId } });
    expect(prod.taxRateId).toBe(exentoId);

    const log = await db.activityLog.findFirstOrThrow({ where: { accion: 'productos.editar' } });
    expect(log.metadata).toMatchObject({
      antes: { taxRateId: ivaId },
      despues: { taxRateId: exentoId },
      taxRateAntes: ivaId,
      taxRateDespues: exentoId,
    });
  });
});

describe('archiveProduct / restoreProduct', () => {
  it('archiva producto + todas sus variantes; restaura; los movimientos quedan intactos', async () => {
    const { productId, variantIds } = await createProduct(
      actorId,
      prodInput({
        nombre: 'Archivable',
        tipo: 'CON_VARIANTES',
        variantes: [v({ nombre: 'X', stockInicial: 7 }), v({ nombre: 'Y' })],
      }),
      null,
    );

    const movsAntes = await db.inventoryMovement.count({ where: { variantId: { in: variantIds } } });
    expect(movsAntes).toBe(1);

    await archiveProduct(actorId, productId, null);
    expect((await db.product.findUniqueOrThrow({ where: { id: productId } })).archivado).toBe(true);
    expect(
      await db.productVariant.count({ where: { productId, archivada: false } }),
    ).toBe(0);
    expect(await db.inventoryMovement.count({ where: { variantId: { in: variantIds } } })).toBe(1);
    await db.activityLog.findFirstOrThrow({ where: { accion: 'productos.archivar' } });

    await restoreProduct(actorId, productId, null);
    expect((await db.product.findUniqueOrThrow({ where: { id: productId } })).archivado).toBe(false);
    expect(await db.productVariant.count({ where: { productId, archivada: true } })).toBe(0);
    expect(await db.inventoryMovement.count({ where: { variantId: { in: variantIds } } })).toBe(1);
    await db.activityLog.findFirstOrThrow({ where: { accion: 'productos.restaurar' } });
  });
});

describe('getProduct', () => {
  it('incluye precioConImpuesto y movimientos por variante; null si no existe', async () => {
    const { productId, variantIds } = await createProduct(
      actorId,
      prodInput({
        nombre: 'Con Impuesto',
        variantes: [v({ precioVenta: 100, precioCompra: 40, stockInicial: 10 })],
      }),
      null,
    );

    const detail = await getProduct(productId);
    expect(detail).not.toBeNull();
    expect(detail!.tasa).toBeCloseTo(0.16);
    const variant = detail!.variants.find((x) => x.id === variantIds[0])!;
    expect(variant.precioVenta).toBe(100);
    expect(variant.precioConImpuesto).toBe(116);
    expect(variant.movimientos.length).toBeGreaterThanOrEqual(1);
    expect(variant.movimientos[0]).toMatchObject({
      tipo: 'ENTRADA',
      motivo: 'Alta de producto',
      stockPrevio: 0,
      stockNuevo: 10,
    });
    expect(variant.movimientos[0].createdAt).toBeInstanceOf(Date);

    expect(await getProduct('no-existe-id')).toBeNull();
  });
});

describe('listProducts', () => {
  it('deriva los 4 estados: archivado, agotado, no_disponible, activo', async () => {
    const archived = await createProduct(actorId, prodInput({ nombre: 'ZZ Archivado' }), null);
    await archiveProduct(actorId, archived.productId, null);

    const agotado = await createProduct(
      actorId,
      prodInput({ nombre: 'ZZ Agotado', variantes: [v({ stockInicial: 0 })] }),
      null,
    );

    const noDisp = await createProduct(
      actorId,
      prodInput({ nombre: 'ZZ NoDisponible', variantes: [v({ stockInicial: 5 })] }),
      null,
    );
    await setProductDisponible(actorId, noDisp.productId, false, null);

    const activo = await createProduct(
      actorId,
      prodInput({ nombre: 'ZZ Activo', variantes: [v({ stockInicial: 5 })] }),
      null,
    );

    const { rows, total } = await listProducts({ estado: 'todos', page: 1, pageSize: 50 });
    expect(total).toBe(4);
    const byId = new Map(rows.map((r) => [r.id, r.estado]));
    expect(byId.get(archived.productId)).toBe('archivado');
    expect(byId.get(agotado.productId)).toBe('agotado');
    expect(byId.get(noDisp.productId)).toBe('no_disponible');
    expect(byId.get(activo.productId)).toBe('activo');
  });

  it('estado por defecto (activos) excluye archivados', async () => {
    const a = await createProduct(actorId, prodInput({ nombre: 'YY Uno', variantes: [v({ stockInicial: 3 })] }), null);
    const b = await createProduct(actorId, prodInput({ nombre: 'YY Dos' }), null);
    await archiveProduct(actorId, b.productId, null);

    const { rows, total } = await listProducts({ page: 1, pageSize: 50 });
    expect(total).toBe(1);
    expect(rows.map((r) => r.id)).toEqual([a.productId]);
  });

  it('filtro q por nombre', async () => {
    const wanted = await createProduct(actorId, prodInput({ nombre: 'Manzana Verde Unica' }), null);
    await createProduct(actorId, prodInput({ nombre: 'Otro Producto' }), null);

    const { rows, total } = await listProducts({ q: 'Manzana Verde', estado: 'todos', page: 1, pageSize: 50 });
    expect(total).toBe(1);
    expect(rows[0].id).toBe(wanted.productId);

    const empty = await listProducts({ q: 'nada-coincide-xyz', estado: 'todos', page: 1, pageSize: 50 });
    expect(empty).toEqual({ rows: [], total: 0 });
  });

  it('filtro soloStockBajo', async () => {
    const bajo = await createProduct(
      actorId,
      prodInput({ nombre: 'SB Bajo', variantes: [v({ stockMinimo: 5, stockInicial: 3 })] }),
      null,
    );
    await createProduct(
      actorId,
      prodInput({ nombre: 'SB Sin Alerta', variantes: [v({ stockMinimo: 0, stockInicial: 0 })] }),
      null,
    );
    await createProduct(
      actorId,
      prodInput({ nombre: 'SB Suficiente', variantes: [v({ stockMinimo: 5, stockInicial: 10 })] }),
      null,
    );

    const { rows, total } = await listProducts({
      soloStockBajo: true,
      estado: 'todos',
      page: 1,
      pageSize: 50,
    });
    expect(total).toBe(1);
    expect(rows[0].id).toBe(bajo.productId);
  });

  it('reporta rango de precios, nº de variantes y stock total', async () => {
    const { productId } = await createProduct(
      actorId,
      prodInput({
        nombre: 'RP Rango',
        tipo: 'CON_VARIANTES',
        variantes: [
          v({ nombre: 'A', precioVenta: 50, stockInicial: 2 }),
          v({ nombre: 'B', precioVenta: 90, stockInicial: 3 }),
        ],
      }),
      null,
    );

    const { rows } = await listProducts({ estado: 'todos', page: 1, pageSize: 50 });
    const row = rows.find((r) => r.id === productId)!;
    expect(row).toMatchObject({
      nVariantes: 2,
      precioMin: 50,
      precioMax: 90,
      stockTotal: 5,
    });
  });
});

describe('setProductDisponible', () => {
  it('pone disponible:false en todas las variantes y listProducts lo marca no_disponible', async () => {
    const { productId } = await createProduct(
      actorId,
      prodInput({
        nombre: 'SD Producto',
        tipo: 'CON_VARIANTES',
        variantes: [v({ nombre: 'A', stockInicial: 5 }), v({ nombre: 'B', stockInicial: 5 })],
      }),
      null,
    );

    await setProductDisponible(actorId, productId, false, null);

    const variants = await db.productVariant.findMany({ where: { productId } });
    expect(variants.every((x) => x.disponible === false)).toBe(true);

    const log = await db.activityLog.findFirstOrThrow({ where: { accion: 'productos.disponibilidad' } });
    expect(log.metadata).toMatchObject({ productId, disponible: false });

    const { rows } = await listProducts({ estado: 'todos', page: 1, pageSize: 50 });
    expect(rows.find((r) => r.id === productId)!.estado).toBe('no_disponible');
  });
});
