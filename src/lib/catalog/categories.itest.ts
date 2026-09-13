import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { db } from '@/lib/db';
import { hashPassword } from '@/lib/auth/password';
import { ValidationError } from '@/lib/errors';
import {
  createCategory,
  updateCategory,
  archiveCategory,
  restoreCategory,
  listCategoryTree,
  productsInArchivedCategories,
} from './categories';

const ACTOR_EMAIL = 'task8-categories@pos.com';
let actorId: string;

async function makeProduct(nombre: string, categoryId: string | null, archivado = false) {
  const tax = await db.taxRate.findFirstOrThrow({ where: { esDefault: true } });
  return db.product.create({
    data: {
      nombre,
      taxRateId: tax.id,
      tipo: 'SIMPLE',
      categoryId,
      archivado,
      variants: { create: { esDefault: true, precioVenta: 10, precioCompra: 0, stock: 0 } },
    },
  });
}

beforeEach(async () => {
  await db.inventoryMovement.deleteMany();
  await db.activityLog.deleteMany();
  await db.productVariant.deleteMany();
  await db.product.deleteMany();
  await db.category.deleteMany();
  await db.user.deleteMany({ where: { email: ACTOR_EMAIL } });
  const admin = await db.role.findFirstOrThrow({ where: { nombre: 'Administrador' } });
  actorId = (
    await db.user.create({
      data: {
        nombre: 'Task8 Actor',
        email: ACTOR_EMAIL,
        passwordHash: await hashPassword('xxxxxxxxxx'),
        roleId: admin.id,
      },
    })
  ).id;
});

afterAll(async () => {
  await db.inventoryMovement.deleteMany();
  await db.activityLog.deleteMany();
  await db.productVariant.deleteMany();
  await db.product.deleteMany();
  await db.category.deleteMany();
  await db.user.deleteMany({ where: { email: ACTOR_EMAIL } });
});

describe('createCategory', () => {
  it('crea una categoría raíz', async () => {
    const { id } = await createCategory(actorId, { nombre: 'Bebidas', parentId: null }, null);
    const cat = await db.category.findUniqueOrThrow({ where: { id } });
    expect(cat).toMatchObject({ nombre: 'Bebidas', parentId: null, archivada: false });
    const log = await db.activityLog.findFirstOrThrow({ where: { accion: 'categorias.crear' } });
    expect(log.metadata).toMatchObject({ nombre: 'Bebidas', parentId: null });
  });

  it('crea una subcategoría bajo una raíz', async () => {
    const raiz = await createCategory(actorId, { nombre: 'Bebidas', parentId: null }, null);
    const { id } = await createCategory(actorId, { nombre: 'Gaseosas', parentId: raiz.id }, null);
    const cat = await db.category.findUniqueOrThrow({ where: { id } });
    expect(cat.parentId).toBe(raiz.id);
  });

  it('rechaza una subcategoría de una subcategoría (profundidad máx. 2)', async () => {
    const raiz = await createCategory(actorId, { nombre: 'Bebidas', parentId: null }, null);
    const sub = await createCategory(actorId, { nombre: 'Gaseosas', parentId: raiz.id }, null);
    await expect(
      createCategory(actorId, { nombre: 'Cola', parentId: sub.id }, null),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('rechaza una subcategoría bajo una categoría archivada', async () => {
    const raiz = await createCategory(actorId, { nombre: 'Bebidas', parentId: null }, null);
    await archiveCategory(actorId, raiz.id, null);
    await expect(
      createCategory(actorId, { nombre: 'Gaseosas', parentId: raiz.id }, null),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('rechaza nombre duplicado en el mismo nivel, permite el mismo nombre en niveles distintos', async () => {
    const raiz = await createCategory(actorId, { nombre: 'Bebidas', parentId: null }, null);
    await createCategory(actorId, { nombre: 'Promo', parentId: raiz.id }, null);

    // Mismo nombre, mismo nivel (misma raíz) -> ValidationError
    await expect(
      createCategory(actorId, { nombre: 'Promo', parentId: raiz.id }, null),
    ).rejects.toBeInstanceOf(ValidationError);

    // Mismo nombre, nivel distinto (raíz) -> OK
    const otra = await createCategory(actorId, { nombre: 'Promo', parentId: null }, null);
    expect(otra.id).toBeTruthy();
  });
});

describe('updateCategory', () => {
  it('rechaza convertir en subcategoría una categoría que tiene hijos', async () => {
    const raizA = await createCategory(actorId, { nombre: 'A', parentId: null }, null);
    await createCategory(actorId, { nombre: 'A1', parentId: raizA.id }, null);
    const raizB = await createCategory(actorId, { nombre: 'B', parentId: null }, null);

    await expect(
      updateCategory(actorId, raizA.id, { nombre: 'A', parentId: raizB.id }, null),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('renombra una categoría y audita antes/después', async () => {
    const raiz = await createCategory(actorId, { nombre: 'Bebidas', parentId: null }, null);
    await updateCategory(actorId, raiz.id, { nombre: 'Líquidos', parentId: null }, null);
    const cat = await db.category.findUniqueOrThrow({ where: { id: raiz.id } });
    expect(cat.nombre).toBe('Líquidos');
    const log = await db.activityLog.findFirstOrThrow({ where: { accion: 'categorias.editar' } });
    expect(log.metadata).toMatchObject({
      antes: { nombre: 'Bebidas', parentId: null },
      despues: { nombre: 'Líquidos', parentId: null },
    });
  });
});

describe('archiveCategory', () => {
  it('archiva en cascada, cuenta subcategorías y productos, y NO toca los productos', async () => {
    const raiz = await createCategory(actorId, { nombre: 'Abarrotes', parentId: null }, null);
    const sub1 = await createCategory(actorId, { nombre: 'Enlatados', parentId: raiz.id }, null);
    const sub2 = await createCategory(actorId, { nombre: 'Pastas', parentId: raiz.id }, null);

    const p1 = await makeProduct('Atún', sub1.id);
    const p2 = await makeProduct('Sardina', sub1.id);
    const p3 = await makeProduct('Arroz', raiz.id);

    const res = await archiveCategory(actorId, raiz.id, null);
    expect(res).toEqual({ subcategoriasArchivadas: 2, productosAfectados: 3 });

    // Los 3 productos conservan su categoryId y siguen sin archivar.
    for (const [prod, catId] of [
      [p1, sub1.id],
      [p2, sub1.id],
      [p3, raiz.id],
    ] as const) {
      const after = await db.product.findUniqueOrThrow({ where: { id: prod.id } });
      expect(after.categoryId).toBe(catId);
      expect(after.archivado).toBe(false);
    }

    // Las 2 subcategorías quedan archivadas.
    expect((await db.category.findUniqueOrThrow({ where: { id: sub1.id } })).archivada).toBe(true);
    expect((await db.category.findUniqueOrThrow({ where: { id: sub2.id } })).archivada).toBe(true);
    expect((await db.category.findUniqueOrThrow({ where: { id: raiz.id } })).archivada).toBe(true);

    // Auditoría con los conteos.
    const log = await db.activityLog.findFirstOrThrow({ where: { accion: 'categorias.archivar' } });
    expect(log.metadata).toMatchObject({ subcategoriasArchivadas: 2, productosAfectados: 3 });
  });

  it('es idempotente: archivar una categoría ya archivada devuelve los conteos sin error', async () => {
    const raiz = await createCategory(actorId, { nombre: 'Abarrotes', parentId: null }, null);
    await createCategory(actorId, { nombre: 'Enlatados', parentId: raiz.id }, null);
    await makeProduct('Arroz', raiz.id);

    await archiveCategory(actorId, raiz.id, null);
    const res = await archiveCategory(actorId, raiz.id, null);
    expect(res).toEqual({ subcategoriasArchivadas: 1, productosAfectados: 1 });

    // El re-archivo NO escribe una segunda fila de auditoría.
    const archivarLogs = await db.activityLog.findMany({
      where: { accion: 'categorias.archivar', entidadId: raiz.id },
    });
    expect(archivarLogs).toHaveLength(1);
  });
});

describe('restoreCategory', () => {
  it('rechaza restaurar una subcategoría mientras su padre siga archivado, luego permite tras restaurar el padre', async () => {
    const raiz = await createCategory(actorId, { nombre: 'Abarrotes', parentId: null }, null);
    const sub = await createCategory(actorId, { nombre: 'Enlatados', parentId: raiz.id }, null);
    await archiveCategory(actorId, raiz.id, null);

    await expect(restoreCategory(actorId, sub.id, null)).rejects.toBeInstanceOf(ValidationError);

    await restoreCategory(actorId, raiz.id, null);
    // El padre restaurado NO restaura hijos automáticamente.
    expect((await db.category.findUniqueOrThrow({ where: { id: sub.id } })).archivada).toBe(true);

    await restoreCategory(actorId, sub.id, null);
    expect((await db.category.findUniqueOrThrow({ where: { id: sub.id } })).archivada).toBe(false);
  });
});

describe('listCategoryTree', () => {
  it('devuelve un árbol de 2 niveles ordenado por nombre con productosCount directo', async () => {
    const a = await createCategory(actorId, { nombre: 'A', parentId: null }, null);
    const a2 = await createCategory(actorId, { nombre: 'A2', parentId: a.id }, null);
    const a1 = await createCategory(actorId, { nombre: 'A1', parentId: a.id }, null);
    const b = await createCategory(actorId, { nombre: 'B', parentId: null }, null);

    await makeProduct('p1', a1.id);
    await makeProduct('p2', a1.id);
    await makeProduct('p3', a1.id, true); // archivado -> no cuenta
    await makeProduct('p4', b.id);
    await makeProduct('p5', a.id); // directo en la raíz

    const tree = await listCategoryTree();
    expect(tree.map((n) => n.nombre)).toEqual(['A', 'B']);

    const nodeA = tree[0];
    expect(nodeA.hijos.map((n) => n.nombre)).toEqual(['A1', 'A2']);
    expect(nodeA.productosCount).toBe(1); // sólo el directo, sin roll-up
    const nodeA1 = nodeA.hijos.find((n) => n.id === a1.id)!;
    expect(nodeA1.productosCount).toBe(2);
    expect(nodeA.hijos.find((n) => n.id === a2.id)!.productosCount).toBe(0);
    expect(tree[1].productosCount).toBe(1);
  });

  it('filtra archivadas salvo incluirArchivadas', async () => {
    const a = await createCategory(actorId, { nombre: 'A', parentId: null }, null);
    const a1 = await createCategory(actorId, { nombre: 'A1', parentId: a.id }, null);
    await createCategory(actorId, { nombre: 'A2', parentId: a.id }, null);
    // Archiva sólo la subcategoría A1 (updateCategory no aplica; se marca directo).
    await db.category.update({ where: { id: a1.id }, data: { archivada: true } });

    const visible = await listCategoryTree();
    expect(visible[0].hijos.map((n) => n.nombre)).toEqual(['A2']);

    const todas = await listCategoryTree({ incluirArchivadas: true });
    expect(todas[0].hijos.map((n) => n.nombre)).toEqual(['A1', 'A2']);
  });
});

describe('productsInArchivedCategories', () => {
  it('lista exactamente los productos no archivados bajo categorías archivadas', async () => {
    const a = await createCategory(actorId, { nombre: 'Abarrotes', parentId: null }, null);
    const a1 = await createCategory(actorId, { nombre: 'Enlatados', parentId: a.id }, null);
    const b = await createCategory(actorId, { nombre: 'Bebidas', parentId: null }, null);

    const p1 = await makeProduct('Arroz', a.id);
    const p2 = await makeProduct('Atún', a1.id);
    await makeProduct('Agua', b.id); // categoría activa -> no
    await makeProduct('Frijol', a.id, true); // archivado -> no

    await archiveCategory(actorId, a.id, null);

    const { rows, total } = await productsInArchivedCategories({ page: 1, pageSize: 50 });
    expect(total).toBe(2);
    expect(rows.map((r) => r.id).sort()).toEqual([p1.id, p2.id].sort());
    const arroz = rows.find((r) => r.id === p1.id)!;
    expect(arroz.categoriaNombre).toBe('Abarrotes');
    const atun = rows.find((r) => r.id === p2.id)!;
    expect(atun.categoriaNombre).toBe('Enlatados');
  });
});
