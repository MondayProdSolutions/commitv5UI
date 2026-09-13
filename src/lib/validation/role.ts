import { z } from 'zod';

// `descripcion`: trimmed, capped at 200 chars, empty string collapses to null.
const descripcion = z
  .string()
  .trim()
  .max(200, 'Máximo 200 caracteres')
  .optional()
  .or(z.literal(''))
  .transform((v) => (v ? v : null));

export const roleSchema = z.object({
  nombre: z.string().trim().min(2, 'Mínimo 2 caracteres'),
  descripcion,
  // El servidor filtra estos valores contra `ALL_PERMISSION_KEYS`.
  permisos: z.array(z.string()).default([]),
});

export type RoleInput = z.infer<typeof roleSchema>;
