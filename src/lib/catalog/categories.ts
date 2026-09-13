import { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { logActivity } from '@/lib/audit';
import { ValidationError } from '@/lib/errors';
import { assertParentIsRoot } from './category-depth';

export type CategoryNode = {
  id: string;
  nombre: string;
  archivada: boolean;
  icono: string | null;
  color: string | null;
  orden: number;
  productosCount: number;
  hijos: CategoryNode[];
};

export type CategoryWriteInput = {
  nombre: string;
  parentId: string | null;
  // Acceso rápido táctil del Punto de venta. Opcionales: los llamadores que no
  // los pasan dejan la categoría sin icono/color y con orden 0.
  icono?: string | null;
  color?: string | null;
  orden?: number;
};

function isDuplicate(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';
}

const DUP_NOMBRE = 'Ya existe una categoría con ese nombre en ese nivel.';

export async function createCategory(
  actorId: string,
  input: CategoryWriteInput,
  ip: string | null,
): Promise<{ id: string }> {
  const nombre = input.nombre.trim();
  const parentId = input.parentId;
  const icono = input.icono ?? null;
  const color = input.color ?? null;
  const orden = input.orden ?? 0;
  try {
    return await db.$transaction(async (tx) => {
      if (parentId !== null) {
        const parent = await tx.category.findUnique({ where: { id: parentId } });
        assertParentIsRoot(parent);
        if (parent!.archivada) {
          throw new ValidationError({
            parentId: 'No se puede crear una subcategoría bajo una categoría archivada.',
          });
        }
      }
      const created = await tx.category.create({
        data: { nombre, parentId, icono, color, orden },
      });
      await logActivity(
        {
          actorId,
          accion: 'categorias.crear',
          entidad: 'Category',
          entidadId: created.id,
          metadata: { nombre, parentId, icono, color, orden },
          ip,
        },
        tx,
      );
      return { id: created.id };
    });
  } catch (e) {
    if (isDuplicate(e)) throw new ValidationError({ nombre: DUP_NOMBRE });
    throw e;
  }
}

export async function updateCategory(
  actorId: string,
  id: string,
  input: CategoryWriteInput,
  ip: string | null,
): Promise<void> {
  const nombre = input.nombre.trim();
  const parentId = input.parentId;
  const icono = input.icono ?? null;
  const color = input.color ?? null;
  const orden = input.orden ?? 0;
  try {
    await db.$transaction(async (tx) => {
      const current = await tx.category.findUnique({
        where: { id },
        include: { _count: { select: { hijos: true } } },
      });
      if (!current) throw new ValidationError({ _form: 'La categoría no existe.' });

      if (parentId !== null) {
        if (current._count.hijos > 0) {
          throw new ValidationError({
            parentId: 'Una categoría con subcategorías no puede convertirse en subcategoría.',
          });
        }
        if (parentId === id) {
          throw new ValidationError({ parentId: 'Una categoría no puede ser su propia categoría padre.' });
        }
        const newParent = await tx.category.findUnique({ where: { id: parentId } });
        assertParentIsRoot(newParent);
      }

      await tx.category.update({
        where: { id },
        data: { nombre, parentId, icono, color, orden },
      });

      await logActivity(
        {
          actorId,
          accion: 'categorias.editar',
          entidad: 'Category',
          entidadId: id,
          metadata: {
            antes: {
              nombre: current.nombre,
              parentId: current.parentId,
              icono: current.icono,
              color: current.color,
              orden: current.orden,
            },
            despues: { nombre, parentId, icono, color, orden },
          },
          ip,
        },
        tx,
      );
    });
  } catch (e) {
    if (isDuplicate(e)) throw new ValidationError({ nombre: DUP_NOMBRE });
    throw e;
  }
}

export async function archiveCategory(
  actorId: string,
  id: string,
  ip: string | null,
): Promise<{ subcategoriasArchivadas: number; productosAfectados: number }> {
  return db.$transaction(async (tx) => {
    const cat = await tx.category.findUnique({ where: { id } });
    if (!cat) throw new ValidationError({ _form: 'La categoría no existe.' });

    // Los ids de subcategorías (sólo si es raíz) se necesitan tanto para el
    // camino de re-archivo (contar) como para el primer archivo (marcar + contar).
    const subIds =
      cat.parentId === null
        ? (await tx.category.findMany({ where: { parentId: id }, select: { id: true } })).map(
            (h) => h.id,
          )
        : [];
    const subcategoriasArchivadas = subIds.length;

    // NUNCA se modifica ningún Product: sólo se cuentan.
    const productosAfectados = await tx.product.count({
      where: { archivado: false, categoryId: { in: [id, ...subIds] } },
    });

    // Ya archivada: se devuelven los conteos actuales sin escribir nada ni
    // emitir una nueva fila de auditoría (idempotente, sin ruido).
    if (cat.archivada) {
      return { subcategoriasArchivadas, productosAfectados };
    }

    await tx.category.update({ where: { id }, data: { archivada: true } });
    if (subIds.length > 0) {
      await tx.category.updateMany({ where: { parentId: id }, data: { archivada: true } });
    }

    await logActivity(
      {
        actorId,
        accion: 'categorias.archivar',
        entidad: 'Category',
        entidadId: id,
        metadata: { categoryId: id, subcategoriasArchivadas, productosAfectados },
        ip,
      },
      tx,
    );

    return { subcategoriasArchivadas, productosAfectados };
  });
}

export async function restoreCategory(
  actorId: string,
  id: string,
  ip: string | null,
): Promise<void> {
  await db.$transaction(async (tx) => {
    const cat = await tx.category.findUnique({ where: { id }, include: { parent: true } });
    if (!cat) throw new ValidationError({ _form: 'La categoría no existe.' });

    if (cat.parentId !== null && cat.parent?.archivada) {
      throw new ValidationError({ _form: 'Restaura primero la categoría padre.' });
    }

    // Sólo esta categoría: NO restaura sus hijos automáticamente.
    await tx.category.update({ where: { id }, data: { archivada: false } });

    await logActivity(
      {
        actorId,
        accion: 'categorias.restaurar',
        entidad: 'Category',
        entidadId: id,
        metadata: { categoryId: id },
        ip,
      },
      tx,
    );
  });
}

export async function listCategoryTree(
  opts?: { incluirArchivadas?: boolean },
): Promise<CategoryNode[]> {
  const incluirArchivadas = opts?.incluirArchivadas ?? false;
  const where = incluirArchivadas ? {} : { archivada: false };

  const [cats, counts] = await Promise.all([
    // `orden` manual primero (para los mosaicos táctiles del Punto de venta),
    // desempate alfabético.
    db.category.findMany({ where, orderBy: [{ orden: 'asc' }, { nombre: 'asc' }] }),
    db.product.groupBy({
      by: ['categoryId'],
      where: { archivado: false, categoryId: { not: null } },
      _count: { _all: true },
    }),
  ]);

  const countByCategory = new Map<string, number>();
  for (const c of counts) {
    if (c.categoryId) countByCategory.set(c.categoryId, c._count._all);
  }

  const childrenByParent = new Map<string, typeof cats>();
  for (const c of cats) {
    if (c.parentId !== null) {
      const arr = childrenByParent.get(c.parentId) ?? [];
      arr.push(c);
      childrenByParent.set(c.parentId, arr);
    }
  }

  const toNode = (c: (typeof cats)[number]): CategoryNode => ({
    id: c.id,
    nombre: c.nombre,
    archivada: c.archivada,
    icono: c.icono,
    color: c.color,
    orden: c.orden,
    productosCount: countByCategory.get(c.id) ?? 0,
    hijos: (childrenByParent.get(c.id) ?? []).map(toNode),
  });

  return cats.filter((c) => c.parentId === null).map(toNode);
}

export async function productsInArchivedCategories(
  opts: { page: number; pageSize: number },
): Promise<{ rows: { id: string; nombre: string; categoriaNombre: string }[]; total: number }> {
  const { page, pageSize } = opts;
  const where: Prisma.ProductWhereInput = {
    archivado: false,
    category: { is: { archivada: true } },
  };

  const [total, products] = await Promise.all([
    db.product.count({ where }),
    db.product.findMany({
      where,
      orderBy: { nombre: 'asc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { category: { select: { nombre: true } } },
    }),
  ]);

  return {
    rows: products.map((p) => ({
      id: p.id,
      nombre: p.nombre,
      categoriaNombre: p.category?.nombre ?? '',
    })),
    total,
  };
}
