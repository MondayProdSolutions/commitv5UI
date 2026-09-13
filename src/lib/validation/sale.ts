import { z } from 'zod';

const descuentoSchema = z
  .object({ tipo: z.enum(['monto', 'porcentaje']), valor: z.coerce.number().gt(0) })
  .nullable()
  .optional();

const saleLineSchema = z.object({
  variantId: z.string().min(1),
  cantidad: z.coerce.number().int().gt(0),
  descuento: descuentoSchema,
});

const pagoSchema = z.object({
  metodo: z.enum(['EFECTIVO', 'TARJETA', 'TRANSFERENCIA']),
  monto: z.coerce.number().gt(0),
});

export const createSaleSchema = z
  .object({
    customerId: z
      .string()
      .optional()
      .or(z.literal(''))
      .transform((v) => v || null),
    lineas: z.array(saleLineSchema).min(1, 'Agrega al menos un producto.'),
    descuentoTicket: descuentoSchema,
    pagos: z.array(pagoSchema).min(1, 'Registra al menos un pago.'),
    requiereFactura: z.coerce.boolean().default(false),
  })
  .superRefine((d, ctx) => {
    for (const [i, l] of d.lineas.entries())
      if (l.descuento?.tipo === 'porcentaje' && l.descuento.valor > 100)
        ctx.addIssue({
          code: 'custom',
          path: ['lineas', i, 'descuento', 'valor'],
          message: 'Máximo 100 %.',
        });
    if (d.descuentoTicket?.tipo === 'porcentaje' && d.descuentoTicket.valor > 100)
      ctx.addIssue({ code: 'custom', path: ['descuentoTicket', 'valor'], message: 'Máximo 100 %.' });
  });
export type CreateSaleInput = z.infer<typeof createSaleSchema>;
