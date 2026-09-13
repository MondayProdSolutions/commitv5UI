import { z } from 'zod';

export const idleTimeoutSchema = z.object({
  minutes: z.coerce.number().int().min(1, 'Mínimo 1 minuto').max(240, 'Máximo 240 minutos'),
});
