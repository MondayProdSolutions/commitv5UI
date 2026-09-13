import { z } from 'zod';

// Zod 4: `.email()` on a string schema is deprecated. Pipe a trimming/lowercasing
// string pipeline into the top-level `z.email()` schema instead.
const email = z.string().trim().toLowerCase().pipe(z.email('Correo inválido'));

const nombre = z.string().trim().min(2, 'Mínimo 2 caracteres');

// Optional phone: trimmed, capped at 30 chars, empty string collapses to null.
const telefono = z
  .string()
  .trim()
  .max(30, 'Máximo 30 caracteres')
  .optional()
  .or(z.literal(''))
  .transform((v) => (v ? v : null));

export const profileSchema = z.object({ nombre, telefono });
export type ProfileInput = z.infer<typeof profileSchema>;

const rolePicker = z.string().min(1, 'Selecciona un rol');

export const createUserSchema = z.object({
  nombre,
  email,
  telefono,
  roleId: rolePicker,
});
export type CreateUserInput = z.infer<typeof createUserSchema>;

export const editUserSchema = createUserSchema.extend({ id: z.string().min(1) });
export type EditUserInput = z.infer<typeof editUserSchema>;
