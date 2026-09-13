/**
 * Color-coding de categorías para el acceso rápido táctil del Punto de venta
 * (estilo Clover). Los siete colores mapean a los acentos ya definidos en el
 * sistema de diseño (`globals.css`), así que funcionan igual en claro y oscuro.
 *
 * Las clases se escriben COMPLETAS a propósito: Tailwind v4 solo genera las
 * utilidades que aparecen literalmente en el código, nunca las que se arman
 * concatenando strings.
 */
export const CATEGORY_COLORS = [
  'teal',
  'blue',
  'amber',
  'violet',
  'green',
  'rose',
  'slate',
] as const;

export type CategoryColor = (typeof CATEGORY_COLORS)[number];

type Swatch = {
  /** Mosaico en reposo: fondo teñido + texto legible sobre ese fondo. */
  tile: string;
  /** Solo el fondo teñido (sin color de texto), para chips con icono propio. */
  soft: string;
  /** Color del icono (acento más saturado). */
  icon: string;
  /** Punto/«chip» de color sólido, para el selector del admin. */
  dot: string;
  /** Anillo al estar activo/seleccionado. */
  ring: string;
};

const SWATCHES: Record<CategoryColor, Swatch> = {
  teal: {
    tile: 'bg-primary-soft text-on-primary-soft',
    soft: 'bg-primary-soft',
    icon: 'text-primary',
    dot: 'bg-primary',
    ring: 'ring-primary',
  },
  blue: {
    tile: 'bg-accent-blue-soft text-on-accent-blue-soft',
    soft: 'bg-accent-blue-soft',
    icon: 'text-accent-blue',
    dot: 'bg-accent-blue',
    ring: 'ring-accent-blue',
  },
  amber: {
    tile: 'bg-accent-amber-soft text-on-accent-amber-soft',
    soft: 'bg-accent-amber-soft',
    icon: 'text-accent-amber',
    dot: 'bg-accent-amber',
    ring: 'ring-accent-amber',
  },
  violet: {
    tile: 'bg-accent-violet-soft text-on-accent-violet-soft',
    soft: 'bg-accent-violet-soft',
    icon: 'text-accent-violet',
    dot: 'bg-accent-violet',
    ring: 'ring-accent-violet',
  },
  green: {
    tile: 'bg-success-soft text-on-success-soft',
    soft: 'bg-success-soft',
    icon: 'text-success',
    dot: 'bg-success',
    ring: 'ring-success',
  },
  rose: {
    tile: 'bg-danger-soft text-on-danger-soft',
    soft: 'bg-danger-soft',
    icon: 'text-danger',
    dot: 'bg-danger',
    ring: 'ring-danger',
  },
  slate: {
    tile: 'bg-surface-raised text-ink-muted',
    soft: 'bg-surface-raised',
    icon: 'text-ink-muted',
    dot: 'bg-line-strong',
    ring: 'ring-line-strong',
  },
};

export function isCategoryColor(v: string | null | undefined): v is CategoryColor {
  return v != null && (CATEGORY_COLORS as readonly string[]).includes(v);
}

/** Color estable derivado del nombre, para categorías sin color asignado. */
export function fallbackColor(seed: string): CategoryColor {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return CATEGORY_COLORS[Math.abs(h) % CATEGORY_COLORS.length]!;
}

export function categorySwatch(
  color: string | null | undefined,
  seed = '',
): Swatch {
  return SWATCHES[isCategoryColor(color) ? color : fallbackColor(seed)];
}
