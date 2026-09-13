import { z } from 'zod';

// Optional string that transforms empty strings to null
const optionalStringToNull = z
  .string()
  .trim()
  .optional()
  .or(z.literal(''))
  .transform((v) => (v ? v : null));

export const variantInputSchema = z.object({
  nombre: z
    .string()
    .trim()
    .optional()
    .or(z.literal(''))
    .transform((v) => (v ? v : null)),
  sku: optionalStringToNull,
  codigoBarras: optionalStringToNull,
  precioVenta: z.coerce.number().min(0, 'El precio debe ser mayor o igual a 0'),
  precioCompra: z.coerce.number().min(0, 'El precio debe ser mayor o igual a 0').default(0),
  stockMinimo: z.coerce.number().int().min(0, 'El stock debe ser mayor o igual a 0').default(0),
  stockInicial: z.coerce.number().int().min(0, 'El stock debe ser mayor o igual a 0').default(0),
});
export type VariantInput = z.infer<typeof variantInputSchema>;

export const createProductSchema = z
  .object({
    nombre: z.string().trim().min(2, 'Mínimo 2 caracteres'),
    descripcion: z
      .string()
      .trim()
      .max(500, 'Máximo 500 caracteres')
      .optional()
      .or(z.literal(''))
      .transform((v) => (v ? v : null)),
    categoryId: z
      .string()
      .optional()
      .or(z.literal(''))
      .transform((v) => (v ? v : null)),
    taxRateId: z.string().min(1, 'Selecciona una tasa de impuesto'),
    tipo: z.enum(['SIMPLE', 'CON_VARIANTES']),
    imagenUrl: z.string().nullable().optional(),
    variantes: z.array(variantInputSchema).min(1, 'Al menos una variante es requerida'),
  })
  .superRefine((data, ctx) => {
    if (data.tipo === 'SIMPLE') {
      if (data.variantes.length !== 1) {
        ctx.addIssue({
          code: 'custom',
          path: ['variantes'],
          message: 'Un producto simple debe tener exactamente una variante',
        });
      } else if (data.variantes[0].nombre) {
        ctx.addIssue({
          code: 'custom',
          path: ['variantes'],
          message: 'Un producto simple no puede tener nombre de variante',
        });
      }
    } else if (data.tipo === 'CON_VARIANTES') {
      if (data.variantes.length < 2) {
        ctx.addIssue({
          code: 'custom',
          path: ['variantes'],
          message: 'Un producto con variantes debe tener al menos 2 variantes',
        });
      }

      const nonEmptyVariantes = data.variantes.filter((v) => v.nombre);
      if (nonEmptyVariantes.length < data.variantes.length) {
        ctx.addIssue({
          code: 'custom',
          path: ['variantes'],
          message: 'Todas las variantes deben tener un nombre',
        });
      }

      const uniqueNames = new Set(nonEmptyVariantes.map((v) => v.nombre));
      if (uniqueNames.size !== nonEmptyVariantes.length) {
        ctx.addIssue({
          code: 'custom',
          path: ['variantes'],
          message: 'Todas las variantes deben tener nombres únicos',
        });
      }
    }
  });
export type CreateProductInput = z.infer<typeof createProductSchema>;

export const updateProductSchema = z.object({
  id: z.string().min(1, 'ID es requerido'),
  nombre: z.string().trim().min(2, 'Mínimo 2 caracteres'),
  descripcion: z
    .string()
    .trim()
    .max(500, 'Máximo 500 caracteres')
    .optional()
    .or(z.literal(''))
    .transform((v) => (v ? v : null)),
  categoryId: z
    .string()
    .optional()
    .or(z.literal(''))
    .transform((v) => (v ? v : null)),
  taxRateId: z.string().min(1, 'Selecciona una tasa de impuesto'),
  imagenUrl: z.string().nullable().optional(),
});
export type UpdateProductInput = z.infer<typeof updateProductSchema>;

export const editVariantSchema = z.object({
  id: z.string().min(1, 'ID es requerido'),
  nombre: optionalStringToNull,
  sku: optionalStringToNull,
  codigoBarras: optionalStringToNull,
  precioVenta: z.coerce.number().min(0, 'El precio debe ser mayor o igual a 0'),
  precioCompra: z.coerce.number().min(0, 'El precio debe ser mayor o igual a 0'),
  stockMinimo: z.coerce.number().int().min(0, 'El stock debe ser mayor o igual a 0'),
  disponible: z.coerce.boolean(),
});
export type EditVariantInput = z.infer<typeof editVariantSchema>;
