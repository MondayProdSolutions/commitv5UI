import { z } from 'zod';

// Zod 4: the `.email()` method on a string schema is deprecated. Use the
// top-level `z.email()` schema instead, fed by a string pipeline that trims and
// lowercases first so the parsed output is a normalized address.
const email = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email('Correo inválido'));

const passwordMin10 = z.string().min(10, 'Mínimo 10 caracteres');

function confirmMatches(field: 'password' | 'newPassword') {
  return (v: Record<string, unknown>, ctx: z.RefinementCtx) => {
    if (v[field] !== v.confirm) {
      ctx.addIssue({ code: 'custom', path: ['confirm'], message: 'Las contraseñas no coinciden' });
    }
  };
}

export const loginSchema = z.object({
  email,
  password: z.string().min(1, 'Requerida'),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const setupSchema = z
  .object({
    nombre: z.string().trim().min(2, 'Mínimo 2 caracteres'),
    email,
    password: passwordMin10,
    confirm: z.string(),
  })
  .superRefine(confirmMatches('password'));
export type SetupInput = z.infer<typeof setupSchema>;

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().optional(),
    newPassword: passwordMin10,
    confirm: z.string(),
  })
  .superRefine(confirmMatches('newPassword'));
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
