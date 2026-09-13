import { describe, it, expect } from 'vitest';
import { customerSchema } from './customer';

const base = { nombre: 'María López' };

function errs(input: unknown): Record<string, string> {
  const r = customerSchema.safeParse(input);
  if (r.success) return {};
  const out: Record<string, string> = {};
  for (const i of r.error.issues) {
    const k = i.path.map(String).join('.');
    if (k && !(k in out)) out[k] = i.message;
  }
  return out;
}

describe('customerSchema — contacto', () => {
  it('acepta solo nombre', () => {
    const r = customerSchema.safeParse(base);
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.telefono).toBeNull();
      expect(r.data.rfc).toBeNull();
    }
  });
  it('nombre < 2 falla', () => {
    expect(errs({ nombre: 'A' })).toHaveProperty('nombre');
  });
  it('correo inválido falla', () => {
    expect(errs({ ...base, correo: 'no-es-correo' })).toHaveProperty('correo');
  });
  it('correo válido se normaliza a minúsculas', () => {
    const r = customerSchema.safeParse({ ...base, correo: 'MARIA@ACME.MX' });
    expect(r.success && r.data.correo).toBe('maria@acme.mx');
  });
});

describe('customerSchema — bloque fiscal condicional', () => {
  const full = {
    ...base,
    rfc: 'loam800101 1x3',
    razonSocial: 'María López',
    regimenFiscalCode: '612',
    usoCfdiCode: 'G03',
    cpFiscal: '06000',
  };

  it('bloque vacío: ok', () => {
    expect(customerSchema.safeParse(base).success).toBe(true);
  });

  it('bloque completo y válido: ok, rfc normalizado', () => {
    const r = customerSchema.safeParse(full);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.rfc).toBe('LOAM8001011X3');
  });

  it('solo rfc (parcial): exige los otros 4 núcleo', () => {
    const e = errs({ ...base, rfc: 'LOAM8001011X3' });
    expect(e).toHaveProperty('razonSocial');
    expect(e).toHaveProperty('regimenFiscalCode');
    expect(e).toHaveProperty('usoCfdiCode');
    expect(e).toHaveProperty('cpFiscal');
  });

  it('rfc mal formado con bloque completo: error en rfc', () => {
    expect(errs({ ...full, rfc: 'MALO123' })).toHaveProperty('rfc');
  });

  it('rfc genérico manual: rechazado en rfc', () => {
    expect(errs({ ...full, rfc: 'XAXX010101000' })).toHaveProperty('rfc');
  });

  it('regimenFiscalCode fuera del catálogo: error', () => {
    expect(errs({ ...full, regimenFiscalCode: '999' })).toHaveProperty('regimenFiscalCode');
  });

  it('usoCfdiCode fuera del catálogo: error', () => {
    expect(errs({ ...full, usoCfdiCode: 'ZZZ' })).toHaveProperty('usoCfdiCode');
  });

  it('cpFiscal no numérico de 5: error', () => {
    expect(errs({ ...full, cpFiscal: '6000' })).toHaveProperty('cpFiscal');
  });

  it('régimen moral (601) con RFC física: error en regimenFiscalCode', () => {
    expect(errs({ ...full, regimenFiscalCode: '601' })).toHaveProperty('regimenFiscalCode');
  });
});
