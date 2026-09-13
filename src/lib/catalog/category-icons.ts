/**
 * Set curado de iconos para las categorías del Punto de venta (mosaicos
 * grandes de acceso rápido). Solo datos: paths SVG de trazo sobre `viewBox`
 * 24, pensados para `stroke="currentColor"`. El componente que los pinta es
 * `src/components/CategoryIcon.tsx`.
 *
 * Neutral a propósito — cubre retail, comida y servicios sin atarse a un giro
 * concreto. `CATEGORY_ICON_KEYS` alimenta el selector del admin en
 * `CategoryForm`; la validación en `src/lib/validation/category.ts` restringe
 * el campo `Category.icono` a estas claves.
 */
export const CATEGORY_ICON_PATHS = {
  camiseta: ['M8 3 4 7l3 3 1-1v11h8V9l1 1 3-3-4-4h-2a3 3 0 0 1-6 0z'],
  pantalon: ['M6 3h12l1 18h-5l-2-12-2 12H5z', 'M6 3h12'],
  zapato: ['M3 9v5h18c0-2-1-3-4-4-4-1-6-1-8-3-2 0-3 1-6 2z', 'M7 14v-2'],
  gorra: ['M4 15a8 5 0 0 1 16 0z', 'M20 15c1.6 0 3 .7 3 1.7H12'],
  bolsa: ['M6 8h12l1 12H5z', 'M9 8V6a3 3 0 0 1 6 0v2'],
  reloj: [
    'M12 10a2 2 0 1 0 0 4 2 2 0 1 0 0-4z',
    'M12 9V7m0 8v2m3-5h2M7 12H5',
    'M9 3h6m-6 18h6',
    'M6 12a6 6 0 1 0 12 0 6 6 0 1 0-12 0z',
  ],
  calcetin: ['M8 3v8c0 2-4 3-4 6a3 3 0 0 0 5 2l4-3c1-1 2-1 3-1V3z', 'M8 3h8'],
  abrigo: ['M8 3 4 6v15h5V12M15 21h5V6l-4-3M9 3a3 3 0 0 0 6 0M12 3v18'],
  vestido: ['M9 3 8 7 5 10l3 3-2 8h12l-2-8 3-3-3-3-1-4a3 3 0 0 1-6 0z'],
  lentes: [
    'M2 10h3l1-1h4M22 10h-3l-1-1h-4M10 10h4',
    'M4 13a3 3 0 1 0 6 0 3 3 0 1 0-6 0z',
    'M14 13a3 3 0 1 0 6 0 3 3 0 1 0-6 0z',
  ],
  joya: ['M12 8l4 4-4 9-4-9z', 'M8 8h8l-2-3h-4z', 'M8 8l4 4 4-4'],
  taza: ['M4 8h13v7a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5z', 'M17 10h2a2 2 0 0 1 0 6h-2', 'M7 3v2m4-2v2'],
  botella: ['M10 3h4v3l1 2v11a2 2 0 0 1-2 2h-2a2 2 0 0 1-2-2V8l1-2z', 'M9 13h6'],
  copa: ['M7 3h10l-1 6a4 4 0 0 1-8 0z', 'M12 13v6m-4 2h8'],
  plato: [
    'M4 12a8 8 0 1 0 16 0 8 8 0 1 0-16 0z',
    'M4 12a8 3.5 0 0 0 16 0',
    'M9 12a3 3 0 1 0 6 0 3 3 0 1 0-6 0z',
  ],
  pan: ['M4 13a4 4 0 0 1 4-6h8a4 4 0 0 1 4 6l-1 5H5z', 'M9 9v3m3-3v3m3-3v3'],
  helado: ['M8 9a4 4 0 0 1 8 0l-4 12z', 'M6 9h12'],
  fruta: ['M12 7c1-4 5-4 6-1s-1 5-3 6c1 4-1 9-3 9s-4-5-3-9c-2-1-4-3-3-6s5-3 6 1z', 'M12 7V4l2-2'],
  caja: ['M3 7l9-4 9 4-9 4z', 'M3 7v10l9 4 9-4V7', 'M12 11v10'],
  despensa: ['M6 7h12l-1 13H7z', 'M9 7a3 3 0 0 1 6 0', 'M4 7h16'],
  etiqueta: ['M3 12 12 3h8v8l-9 9z', 'M15.5 8.5a1 1 0 1 0 0-2 1 1 0 1 0 0 2z'],
  oferta: [
    'M5 19 19 5',
    'M6 8a2 2 0 1 0 4 0 2 2 0 1 0-4 0z',
    'M14 16a2 2 0 1 0 4 0 2 2 0 1 0-4 0z',
  ],
  herramienta: ['M21 4a5 5 0 0 1-7 6L5 19l-2-2 9-9a5 5 0 0 1 6-7l-3 3 1 3 3 1z'],
  libro: ['M6 4h12v14H7a1 1 0 0 0-1 1z', 'M6 19a1 1 0 0 0 1 1h11', 'M9 8h6m-6 4h6'],
  regalo: [
    'M4 9h16v3H4z',
    'M5 12h14v9H5z',
    'M12 9v12',
    'M12 9C9 9 7 8 7 6s3-2 5 3c2-5 5-4 5-2s-2 2-5 2',
  ],
  flor: [
    'M12 8a3 3 0 1 0 0 6 3 3 0 1 0 0-6z',
    'M12 8c0-3-2-4-4-3s-1 4 2 4c-3 0-5 3-4 5s4 1 5-2c0 3 2 4 4 3s1-4-2-4c3 0 5-3 4-5s-4-1-5 2z',
    'M12 14v7',
  ],
  mascota: [
    'M7 11a2 2 0 1 0 0 4 2 2 0 1 0 0-4z',
    'M17 11a2 2 0 1 0 0 4 2 2 0 1 0 0-4z',
    'M10 7a2 2 0 1 0 0 4 2 2 0 1 0 0-4z',
    'M14 7a2 2 0 1 0 0 4 2 2 0 1 0 0-4z',
    'M8 17a4 4 0 0 1 8 0 3 3 0 0 1-3 3h-2a3 3 0 0 1-3-3z',
  ],
  tijeras: [
    'M6 4a2.5 2.5 0 1 0 0 5 2.5 2.5 0 1 0 0-5z',
    'M6 15a2.5 2.5 0 1 0 0 5 2.5 2.5 0 1 0 0-5z',
    'M8 8l12 9M8 16 20 7M8 8l6 4.5',
  ],
  spray: ['M9 8h5v12H9z', 'M9 8V5h5v3', 'M15 4h2M15 7h2M17 2v1', 'M6 10h3M6 13h3'],
  pastilla: ['M4 12a5 5 0 0 1 5-5h6a5 5 0 0 1 0 10H9a5 5 0 0 1-5-5z', 'M12 7v10'],
  maquillaje: ['M8 21h6V10H8z', 'M8 10 10 3h2l2 4v3', 'M9 13h4'],
  electronico: [
    'M7 3h10a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z',
    'M10 18h4',
  ],
  auricular: [
    'M4 13v-1a8 8 0 0 1 16 0v1',
    'M4 13h3v6H5a1 1 0 0 1-1-1z',
    'M20 13h-3v6h2a1 1 0 0 0 1-1z',
  ],
  deporte: ['M4 9v6m2-8v10m12-10v10m2-8v6', 'M6 12h12'],
  bebe: ['M12 4a2 2 0 1 0 0 4 2 2 0 1 0 0-4z', 'M6 12a6 6 0 0 0 12 0 6 6 0 0 0-12 0z', 'M9 20h6'],
  hogar: ['M3 11 12 4l9 7', 'M5 10v10h14V10', 'M10 20v-6h4v6'],
  papeleria: ['M4 20l1-4L16 5l3 3L8 19z', 'M14 7l3 3'],
  estrella: ['M12 3l3 6 6 .9-4.5 4.2 1 6L12 17l-5.5 3 1-6L3 9.9 9 9z'],
  general: ['M4 4h7v7H4z', 'M13 4h7v7h-7z', 'M4 13h7v7H4z', 'M13 13h7v7h-7z'],
} as const satisfies Record<string, readonly string[]>;

export type CategoryIconKey = keyof typeof CATEGORY_ICON_PATHS;

export const CATEGORY_ICON_KEYS = Object.keys(CATEGORY_ICON_PATHS) as CategoryIconKey[];

export function isCategoryIconKey(v: string | null | undefined): v is CategoryIconKey {
  return v != null && v in CATEGORY_ICON_PATHS;
}
