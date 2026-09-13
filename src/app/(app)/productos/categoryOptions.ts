import type { CategoryNode } from '@/lib/catalog/categories';

export type CategoryOption = { id: string; nombre: string };

/**
 * Aplana el árbol de 2 niveles a una lista de opciones para `<select>`,
 * mostrando las subcategorías con el prefijo de su categoría raíz.
 */
export function flattenCategories(tree: CategoryNode[]): CategoryOption[] {
  return tree.flatMap((root) => [
    { id: root.id, nombre: root.nombre },
    ...root.hijos.map((h) => ({ id: h.id, nombre: `${root.nombre} › ${h.nombre}` })),
  ]);
}
