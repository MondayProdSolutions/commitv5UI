import type { SVGProps } from 'react';
import { CATEGORY_ICON_PATHS, isCategoryIconKey } from '@/lib/catalog/category-icons';

/**
 * Pinta un icono del set curado de categorías (ver `category-icons.ts`).
 * Misma mecánica que `NavIcon`: SVG de trazo, `currentColor`, sin dependencias.
 * Si `name` no es una clave válida cae al icono genérico (`general`).
 */
export function CategoryIcon({
  name,
  ...props
}: { name: string | null | undefined } & Omit<SVGProps<SVGSVGElement>, 'name'>) {
  const segs = isCategoryIconKey(name)
    ? CATEGORY_ICON_PATHS[name]
    : CATEGORY_ICON_PATHS.general;
  return (
    <svg
      viewBox="0 0 24 24"
      width={28}
      height={28}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {segs.map((seg) => (
        <path key={seg} d={seg} />
      ))}
    </svg>
  );
}
