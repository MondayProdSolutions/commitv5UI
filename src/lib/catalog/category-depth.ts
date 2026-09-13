import { ValidationError } from '@/lib/errors';

export function canHaveChildren(cat: { parentId: string | null }): boolean {
  return cat.parentId === null;
}

export function assertParentIsRoot(parent: { parentId: string | null } | null): void {
  if (parent === null || parent.parentId !== null) {
    throw new ValidationError({ parentId: 'La categoría padre no existe o no es una categoría raíz.' });
  }
}
