import { z } from 'zod';

export const movementSchema = z
  .object({
    variantId: z.string().min(1, 'ID de variante es requerido'),
    tipo: z.enum(['ENTRADA', 'SALIDA', 'AJUSTE']),
    valor: z.coerce.number().int('La cantidad debe ser un número entero'),
    motivo: z.string().trim().min(1, 'El motivo es obligatorio'),
    costoUnitario: z.coerce.number().min(0, 'El costo debe ser mayor o igual a 0').optional(),
  })
  .superRefine((data, ctx) => {
    const { tipo, valor, costoUnitario } = data;

    if ((tipo === 'ENTRADA' || tipo === 'SALIDA') && valor <= 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['valor'],
        message: 'La cantidad debe ser mayor que 0',
      });
    }

    if (tipo === 'AJUSTE' && valor < 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['valor'],
        message: 'El stock objetivo no puede ser negativo',
      });
    }

    if (tipo !== 'ENTRADA' && costoUnitario != null) {
      ctx.addIssue({
        code: 'custom',
        path: ['costoUnitario'],
        message: 'El costo solo aplica a entradas',
      });
    }
  });
export type MovementInput = z.infer<typeof movementSchema>;
