import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { db } from '@/lib/db';
import { hashPassword } from '@/lib/auth/password';
import { ValidationError } from '@/lib/errors';
import type { EditVariantInput, VariantInput } from '@/lib/validation/product';
import {
  editVariant,
  addVariant,
  convertToVariants,
  archiveVariant,
  setVariantDisponible,
} from './variants';

const ACTOR_EMAIL = 'task11-variants@pos.com';
let actorId: string;
let ivaId: string;

function editInput(id: string, over: Partial<EditVariantInput> = {}): EditVariantInput {
  return {
    id,
    nombre: null,
    sku: null,
    codigoBarras: null,
    precioVenta: 100,
    precioCompra: 40,
    stockMinimo: 0,
    disponible: true,
    ...over,
  };
}

function vInput(over: Partial<VariantInput> & { nombre: string }): VariantInput & { nombre: string } {
  return {
    sku: null,
    codigoBarras: null,
    precioVenta: 100,
    precioCompra: 0,
    stockMinimo: 0,
    stockInicial: 0,
    ...over,
  };
}

async function makeSimpleProduct(nombre: string, variantOver: Record<string, unknown> = {}) {
  const product = await db.product.create({
    data: {
      nombre,
      taxRateId: ivaId,
      tipo: 'SIMPLE',
      variants: {
        create: {
          esDefault: true,
          nombre: null,
          precioVenta: 100,
          precioCompra: 40,
          stock: 0,
          ...variantOver,
        },
      },
    },
    include: { variants: true },
  });
  return { product, variant: product.variants[0] };
}

async function makeVariantsProduct(nombre: string, variantNames: string[]) {
  const product = await db.product.create({
    data: {
      nombre,
      taxRateId: ivaId,
      tipo: 'CON_VARIANTES',
      variants: {
        create: variantNames.map((n) => ({
          esDefault: false,
          nombre: n,
          precioVenta: 100,
          precioCompra: 40,
          stock: 0,
        })),
      },
    },
    include: { variants: { orderBy: { nombre: 'asc' } } },
  });
  return { product, variants: product.variants };
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
        nombre: 'Task11 Actor',
        email: ACTOR_EMAIL,
        passwordHash: await hashPassword('xxxxxxxxxx'),
        roleId: admin.id,
      },
    })
  ).id;
  ivaId = (await db.taxRate.findFirstOrThrow({ where: { esDefault: true } })).id;
});

afterAll(cleanup);

describe('editVariant', () => {
  it('cambia sólo el precio → una fila productos.precio_cambiado; stock intacto', async () => {
    const { variant } = await makeSimpleProduct('Café', { stock: 12 });

    await editVariant(actorId, variant.id, editInput(variant.id, { precioVenta: 150 }), null);

    const after = await db.productVariant.findUniqueOrThrow({ where: { id: variant.id } });
    expect(after.stock).toBe(12);
    expect(Number(after.precioVenta)).toBe(150);

    const logs = await db.activityLog.findMany({ where: { entidadId: variant.id } });
    expect(logs).toHaveLength(1);
    expect(logs[0].accion).toBe('productos.precio_cambiado');
    expect(logs[0].metadata).toMatchObject({
      antes: { precioVenta: 100, precioCompra: 40 },
      despues: { precioVenta: 150, precioCompra: 40 },
    });
  });

  it('cambia sólo stockMinimo → auditoría productos.editar; stock intacto', async () => {
    const { variant } = await makeSimpleProduct('Té', { stock: 8 });

    await editVariant(actorId, variant.id, editInput(variant.id, { stockMinimo: 5 }), null);

    const after = await db.productVariant.findUniqueOrThrow({ where: { id: variant.id } });
    expect(after.stock).toBe(8);
    expect(after.stockMinimo).toBe(5);

    const logs = await db.activityLog.findMany({ where: { entidadId: variant.id } });
    expect(logs).toHaveLength(1);
    expect(logs[0].accion).toBe('productos.editar');
    expect(logs[0].metadata).toMatchObject({
      antes: { stockMinimo: 0 },
      despues: { stockMinimo: 5 },
    });
  });

  it('precio + otros campos cambian → emite ambas filas de auditoría', async () => {
    const { variant } = await makeSimpleProduct('Combo');

    await editVariant(
      actorId,
      variant.id,
      editInput(variant.id, { precioVenta: 120, stockMinimo: 3, disponible: false }),
      null,
    );

    const acciones = (await db.activityLog.findMany({ where: { entidadId: variant.id } })).map(
      (l) => l.accion,
    );
    expect(acciones).toContain('productos.precio_cambiado');
    expect(acciones).toContain('productos.editar');
  });

  it('SKU ya usado por otra variante → ValidationError', async () => {
    await makeSimpleProduct('Con SKU', { sku: 'SKU-DUP' });
    const { variant } = await makeSimpleProduct('Sin SKU');

    let caught: unknown;
    try {
      await editVariant(actorId, variant.id, editInput(variant.id, { sku: 'SKU-DUP' }), null);
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(ValidationError);
    expect((caught as ValidationError).fields).toHaveProperty('sku');
  });
});

describe('addVariant', () => {
  it('sobre un producto SIMPLE → ValidationError', async () => {
    const { product } = await makeSimpleProduct('Simple');
    await expect(
      addVariant(actorId, product.id, vInput({ nombre: 'Nueva' }), null),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('sobre CON_VARIANTES con stockInicial:7 → crea variante + ENTRADA + auditoría', async () => {
    const { product } = await makeVariantsProduct('Playera', ['Chica', 'Grande']);

    const { variantId } = await addVariant(
      actorId,
      product.id,
      vInput({ nombre: 'Mediana', precioVenta: 130, precioCompra: 55, stockInicial: 7 }),
      null,
    );

    const variant = await db.productVariant.findUniqueOrThrow({ where: { id: variantId } });
    expect(variant).toMatchObject({ nombre: 'Mediana', esDefault: false, stock: 7 });

    const movs = await db.inventoryMovement.findMany({ where: { variantId } });
    expect(movs).toHaveLength(1);
    expect(movs[0]).toMatchObject({ tipo: 'ENTRADA', stockNuevo: 7, motivo: 'Alta de producto' });

    const log = await db.activityLog.findFirstOrThrow({
      where: { accion: 'productos.variante_agregada' },
    });
    expect(log.metadata).toMatchObject({ productId: product.id, variantId, nombre: 'Mediana' });
  });

  it('nombre que colisiona con una variante existente (case-insensitive) → ValidationError', async () => {
    const { product } = await makeVariantsProduct('Playera', ['Chica', 'Grande']);
    await expect(
      addVariant(actorId, product.id, vInput({ nombre: '  chica  ' }), null),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

describe('convertToVariants', () => {
  it('de SIMPLE → tipo CON_VARIANTES, ex-default renombrada y esDefault:false, nuevas creadas', async () => {
    const { product, variant } = await makeSimpleProduct('Camisa', { stock: 4 });

    await convertToVariants(
      actorId,
      product.id,
      {
        defaultNombre: 'Blanca',
        nuevas: [
          vInput({ nombre: 'Negra', precioVenta: 110 }),
          vInput({ nombre: 'Azul', precioVenta: 115, stockInicial: 3 }),
        ],
      },
      null,
    );

    const after = await db.product.findUniqueOrThrow({
      where: { id: product.id },
      include: { variants: true },
    });
    expect(after.tipo).toBe('CON_VARIANTES');

    const exDefault = after.variants.find((v) => v.id === variant.id)!;
    expect(exDefault).toMatchObject({ esDefault: false, nombre: 'Blanca' });

    expect(after.variants.map((v) => v.nombre).sort()).toEqual(['Azul', 'Blanca', 'Negra']);

    const azul = after.variants.find((v) => v.nombre === 'Azul')!;
    expect(azul.stock).toBe(3);
    const movs = await db.inventoryMovement.findMany({ where: { variantId: azul.id } });
    expect(movs).toHaveLength(1);
    expect(movs[0].tipo).toBe('ENTRADA');

    const log = await db.activityLog.findFirstOrThrow({ where: { accion: 'productos.editar' } });
    expect(log.metadata).toMatchObject({
      productId: product.id,
      conversion: 'SIMPLE_A_CON_VARIANTES',
      nuevasVariantes: 2,
    });
  });

  it('sobre un producto ya CON_VARIANTES → ValidationError', async () => {
    const { product } = await makeVariantsProduct('Ya', ['A', 'B']);
    await expect(
      convertToVariants(
        actorId,
        product.id,
        { defaultNombre: 'C', nuevas: [vInput({ nombre: 'D' })] },
        null,
      ),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('nombres duplicados entre defaultNombre y nuevas → ValidationError', async () => {
    const { product } = await makeSimpleProduct('Dup');
    await expect(
      convertToVariants(
        actorId,
        product.id,
        { defaultNombre: 'X', nuevas: [vInput({ nombre: 'x' })] },
        null,
      ),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

describe('archiveVariant', () => {
  it('sobre la última variante activa de un producto → ValidationError', async () => {
    const { variant } = await makeSimpleProduct('Unica');
    await expect(archiveVariant(actorId, variant.id, null)).rejects.toBeInstanceOf(ValidationError);
  });

  it('sobre una de varias → archivada:true + auditoría', async () => {
    const { variants } = await makeVariantsProduct('Multi', ['A', 'B', 'C']);

    await archiveVariant(actorId, variants[0].id, null);

    const after = await db.productVariant.findUniqueOrThrow({ where: { id: variants[0].id } });
    expect(after.archivada).toBe(true);

    const log = await db.activityLog.findFirstOrThrow({
      where: { accion: 'productos.variante_archivada' },
    });
    expect(log.metadata).toMatchObject({ variantId: variants[0].id });
  });
});

describe('setVariantDisponible', () => {
  it('actualiza disponible y audita productos.disponibilidad', async () => {
    const { variant } = await makeSimpleProduct('Disp');

    await setVariantDisponible(actorId, variant.id, false, null);

    const after = await db.productVariant.findUniqueOrThrow({ where: { id: variant.id } });
    expect(after.disponible).toBe(false);

    const log = await db.activityLog.findFirstOrThrow({
      where: { accion: 'productos.disponibilidad' },
    });
    expect(log.metadata).toMatchObject({ variantId: variant.id, disponible: false });
  });
});
