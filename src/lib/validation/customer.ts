import { z } from 'zod';
import { REGIMEN_CODES } from '@/lib/sat/regimenes-fiscales';
import { USO_CFDI_CODES } from '@/lib/sat/usos-cfdi';
import {
  normalizarRfc,
  rfcEsValido,
  esRfcGenerico,
  bloqueFiscalVacio,
  bloqueFiscalCompleto,
  regimenCompatibleConRfc,
} from '@/lib/customers/fiscal';

const optStr = z
  .string()
  .trim()
  .optional()
  .or(z.literal(''))
  .transform((v) => (v ? v : null));

const optStrMax = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Máximo ${max} caracteres`)
    .optional()
    .or(z.literal(''))
    .transform((v) => (v ? v : null));

const optCorreo = z
  .string()
  .trim()
  .toLowerCase()
  .optional()
  .or(z.literal(''))
  .transform((v) => (v ? v : null))
  .refine((v) => v === null || z.email().safeParse(v).success, {
    message: 'Correo no válido',
  });

const NUCLEO = ['rfc', 'razonSocial', 'regimenFiscalCode', 'usoCfdiCode', 'cpFiscal'] as const;

const shape = {
  nombre: z.string().trim().min(2, 'Mínimo 2 caracteres'),
  telefono: optStrMax(30),
  correo: optCorreo,
  direccion: optStrMax(500),
  notas: optStrMax(500),
  rfc: optStr.transform((v) => (v ? normalizarRfc(v) : null)),
  razonSocial: optStrMax(200),
  regimenFiscalCode: optStr,
  usoCfdiCode: optStr,
  cpFiscal: optStr,
  correoFacturacion: optCorreo,
};

function refineFiscal(data: Record<string, unknown>, ctx: z.RefinementCtx): void {
  const bloque = {
    rfc: data.rfc as string | null,
    razonSocial: data.razonSocial as string | null,
    regimenFiscalCode: data.regimenFiscalCode as string | null,
    usoCfdiCode: data.usoCfdiCode as string | null,
    cpFiscal: data.cpFiscal as string | null,
  };

  if (bloqueFiscalVacio(bloque)) return;

  if (!bloqueFiscalCompleto(bloque)) {
    for (const k of NUCLEO) {
      if (!bloque[k]) {
        ctx.addIssue({
          code: 'custom',
          path: [k],
          message: 'Completa todos los datos de facturación o déjalos vacíos.',
        });
      }
    }
    return;
  }

  const rfc = bloque.rfc as string;
  if (!rfcEsValido(rfc)) {
    ctx.addIssue({ code: 'custom', path: ['rfc'], message: 'RFC con formato no válido.' });
  } else if (esRfcGenerico(rfc)) {
    ctx.addIssue({
      code: 'custom',
      path: ['rfc'],
      message: 'RFC reservado; usa el cliente Público en General.',
    });
  }

  if (!REGIMEN_CODES.has(bloque.regimenFiscalCode as string)) {
    ctx.addIssue({
      code: 'custom',
      path: ['regimenFiscalCode'],
      message: 'Régimen fiscal no válido.',
    });
  } else if (
    rfcEsValido(rfc) &&
    !regimenCompatibleConRfc(bloque.regimenFiscalCode as string, rfc)
  ) {
    ctx.addIssue({
      code: 'custom',
      path: ['regimenFiscalCode'],
      message: 'El régimen no corresponde al tipo de RFC.',
    });
  }

  if (!USO_CFDI_CODES.has(bloque.usoCfdiCode as string)) {
    ctx.addIssue({ code: 'custom', path: ['usoCfdiCode'], message: 'Uso de CFDI no válido.' });
  }

  if (!/^\d{5}$/.test(bloque.cpFiscal as string)) {
    ctx.addIssue({
      code: 'custom',
      path: ['cpFiscal'],
      message: 'El código postal debe tener 5 dígitos.',
    });
  }
}

export const customerSchema = z.object(shape).superRefine(refineFiscal);
export type CustomerInput = z.infer<typeof customerSchema>;

export const editCustomerSchema = z
  .object({ id: z.string().min(1, 'ID requerido'), ...shape })
  .superRefine(refineFiscal);
export type EditCustomerInput = z.infer<typeof editCustomerSchema>;
