import { z } from 'zod';

export const openCashSessionSchema = z.object({
  fondoApertura: z.coerce.number().min(0, 'El fondo no puede ser negativo.').max(1_000_000),
});
export type OpenCashSessionInput = z.infer<typeof openCashSessionSchema>;

export const cashMovementSchema = z.object({
  tipo: z.enum(['RETIRO', 'INGRESO']),
  monto: z.coerce.number().gt(0, 'El monto debe ser mayor que 0.').max(1_000_000),
  motivo: z.string().trim().min(3, 'Indica el motivo.').max(300),
});
export type CashMovementInput = z.infer<typeof cashMovementSchema>;

export const closeCashSessionSchema = z.object({
  efectivoContado: z.coerce.number().min(0, 'El efectivo contado no puede ser negativo.').max(1_000_000),
  notaCierre: z.string().trim().max(500).optional().or(z.literal('')).transform((v) => v || null),
});
export type CloseCashSessionInput = z.infer<typeof closeCashSessionSchema>;
