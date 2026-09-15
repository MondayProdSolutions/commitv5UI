import { z } from 'zod';

export const chatTurnSchema = z.object({
  role: z.enum(['user', 'model']),
  text: z.string().min(1).max(2000),
});

export const assistantChatSchema = z.object({
  mensaje: z.string().min(1, 'Escribe una pregunta').max(2000, 'Máximo 2000 caracteres'),
  pathname: z.string().min(1).max(200),
  errorVisible: z.string().max(500).optional(),
  historial: z.array(chatTurnSchema).max(12).optional(),
});
