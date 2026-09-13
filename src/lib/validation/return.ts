import { z } from 'zod';

export const createReturnSchema = z.object({
  saleId: z.string().min(1),
  lineas: z
    .array(z.object({ saleLineId: z.string().min(1), cantidad: z.coerce.number().int().gt(0) }))
    .min(1, 'Selecciona al menos una línea.'),
  metodoReembolso: z.enum(['EFECTIVO', 'TARJETA', 'TRANSFERENCIA']),
  motivo: z.string().trim().min(3, 'Indica el motivo.').max(300),
});
export type CreateReturnInput = z.infer<typeof createReturnSchema>;
