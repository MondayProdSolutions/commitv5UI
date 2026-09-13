import { z } from 'zod';
import { CATEGORY_ICON_KEYS } from '@/lib/catalog/category-icons';
import { CATEGORY_COLORS } from '@/lib/catalog/category-style';

const parentId = z
  .string()
  .optional()
  .or(z.literal(''))
  .transform((v) => (v ? v : null));

// Acceso rápido táctil del Punto de venta. Los tres campos son opcionales: un
// select vacío llega como '' y se normaliza a null / 0.
const icono = z
  .string()
  .optional()
  .transform((v) => (v ? v : null))
  .refine(
    (v) => v === null || (CATEGORY_ICON_KEYS as readonly string[]).includes(v),
    'Icono no válido',
  );

const color = z
  .string()
  .optional()
  .transform((v) => (v ? v : null))
  .refine(
    (v) => v === null || (CATEGORY_COLORS as readonly string[]).includes(v),
    'Color no válido',
  );

const orden = z.coerce
  .number()
  .int('Debe ser un número entero')
  .min(0, 'No puede ser negativo')
  .max(9999, 'Máximo 9999')
  .catch(0);

export const createCategorySchema = z.object({
  nombre: z.string().trim().min(2, 'Mínimo 2 caracteres'),
  parentId,
  icono,
  color,
  orden,
});
export type CreateCategoryInput = z.infer<typeof createCategorySchema>;

export const updateCategorySchema = z.object({
  id: z.string().min(1, 'ID es requerido'),
  nombre: z.string().trim().min(2, 'Mínimo 2 caracteres'),
  parentId,
  icono,
  color,
  orden,
});
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;
