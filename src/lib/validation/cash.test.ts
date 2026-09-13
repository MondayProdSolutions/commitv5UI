import { describe, it, expect } from 'vitest';
import { openCashSessionSchema, cashMovementSchema, closeCashSessionSchema } from './cash';

const errs = (schema: { safeParse: (v: unknown) => { success: boolean; error?: { issues: { path: PropertyKey[]; message: string }[] } } }, v: unknown) => {
  const r = schema.safeParse(v);
  if (r.success) return {} as Record<string, string>;
  const out: Record<string, string> = {};
  for (const i of r.error!.issues) { const k = i.path.map(String).join('.'); if (k && !(k in out)) out[k] = i.message; }
  return out;
};

describe('openCashSessionSchema', () => {
  it('fondo 0 y positivo válidos', () => {
    expect(openCashSessionSchema.safeParse({ fondoApertura: 0 }).success).toBe(true);
    expect(openCashSessionSchema.safeParse({ fondoApertura: '1500.50' }).success).toBe(true);
  });
  it('fondo negativo → issue en fondoApertura', () => {
    expect(errs(openCashSessionSchema, { fondoApertura: -1 })).toHaveProperty('fondoApertura');
  });
});

describe('cashMovementSchema', () => {
  it('válido parsea', () => {
    expect(cashMovementSchema.safeParse({ tipo: 'RETIRO', monto: 200, motivo: 'depósito banco' }).success).toBe(true);
  });
  it('monto 0 / negativo → issue en monto', () => {
    expect(errs(cashMovementSchema, { tipo: 'INGRESO', monto: 0, motivo: 'xxx' })).toHaveProperty('monto');
  });
  it('motivo < 3 → issue en motivo', () => {
    expect(errs(cashMovementSchema, { tipo: 'INGRESO', monto: 10, motivo: 'ab' })).toHaveProperty('motivo');
  });
  it('tipo fuera del enum → issue', () => {
    expect(cashMovementSchema.safeParse({ tipo: 'X', monto: 10, motivo: 'xxxx' }).success).toBe(false);
  });
});

describe('closeCashSessionSchema', () => {
  it('contado ≥ 0 válido; notaCierre "" → null', () => {
    const r = closeCashSessionSchema.safeParse({ efectivoContado: 732, notaCierre: '' });
    expect(r.success && r.data.notaCierre).toBeNull();
  });
  it('contado negativo → issue en efectivoContado', () => {
    expect(errs(closeCashSessionSchema, { efectivoContado: -5 })).toHaveProperty('efectivoContado');
  });
});
