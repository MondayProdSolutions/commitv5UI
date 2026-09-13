import { describe, it, expect } from 'vitest';
import { createReturnSchema } from './return';

const hasPath = (issues: { path: PropertyKey[] }[], path: string) =>
  issues.some((i) => i.path.join('.') === path);

const valid = {
  saleId: 'sale-1',
  lineas: [{ saleLineId: 'line-1', cantidad: 2 }],
  metodoReembolso: 'EFECTIVO',
  motivo: 'Producto defectuoso',
};

describe('createReturnSchema', () => {
  it('devolución válida parsea', () => {
    const r = createReturnSchema.safeParse(valid);
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.saleId).toBe('sale-1');
      expect(r.data.lineas[0].cantidad).toBe(2);
      expect(r.data.metodoReembolso).toBe('EFECTIVO');
    }
  });

  it('recorta el motivo', () => {
    const r = createReturnSchema.safeParse({ ...valid, motivo: '  caja rota  ' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.motivo).toBe('caja rota');
  });

  it('lineas vacío → issue', () => {
    const r = createReturnSchema.safeParse({ ...valid, lineas: [] });
    expect(r.success).toBe(false);
    if (!r.success) expect(hasPath(r.error.issues, 'lineas')).toBe(true);
  });

  it('cantidad <= 0 → issue en lineas.0.cantidad', () => {
    const r = createReturnSchema.safeParse({
      ...valid,
      lineas: [{ saleLineId: 'line-1', cantidad: 0 }],
    });
    expect(r.success).toBe(false);
    if (!r.success) expect(hasPath(r.error.issues, 'lineas.0.cantidad')).toBe(true);
  });

  it('cantidad decimal → issue en lineas.0.cantidad', () => {
    const r = createReturnSchema.safeParse({
      ...valid,
      lineas: [{ saleLineId: 'line-1', cantidad: 1.5 }],
    });
    expect(r.success).toBe(false);
    if (!r.success) expect(hasPath(r.error.issues, 'lineas.0.cantidad')).toBe(true);
  });

  it('motivo < 3 → issue en motivo', () => {
    const r = createReturnSchema.safeParse({ ...valid, motivo: 'ab' });
    expect(r.success).toBe(false);
    if (!r.success) expect(hasPath(r.error.issues, 'motivo')).toBe(true);
  });

  it('metodoReembolso fuera del enum → issue', () => {
    const r = createReturnSchema.safeParse({ ...valid, metodoReembolso: 'CHEQUE' });
    expect(r.success).toBe(false);
    if (!r.success) expect(hasPath(r.error.issues, 'metodoReembolso')).toBe(true);
  });

  it('saleId vacío → issue', () => {
    const r = createReturnSchema.safeParse({ ...valid, saleId: '' });
    expect(r.success).toBe(false);
    if (!r.success) expect(hasPath(r.error.issues, 'saleId')).toBe(true);
  });

  it('coacciona cantidad desde string', () => {
    const r = createReturnSchema.safeParse({
      ...valid,
      lineas: [{ saleLineId: 'line-1', cantidad: '4' }],
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.lineas[0].cantidad).toBe(4);
  });
});
