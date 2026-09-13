import { describe, it, expect } from 'vitest';
import { movementSchema } from './movement';

describe('movementSchema', () => {
  it('acepta una ENTRADA válida', () => {
    const r = movementSchema.safeParse({
      variantId: 'var-1',
      tipo: 'ENTRADA',
      valor: 10,
      motivo: 'Compra a proveedor',
      costoUnitario: 50,
    });
    expect(r.success).toBe(true);
  });

  it('rechaza ENTRADA con valor 0', () => {
    const r = movementSchema.safeParse({
      variantId: 'var-1',
      tipo: 'ENTRADA',
      valor: 0,
      motivo: 'Compra a proveedor',
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.some((i) => i.path.includes('valor'))).toBe(true);
    }
  });

  it('rechaza ENTRADA con valor negativo', () => {
    const r = movementSchema.safeParse({
      variantId: 'var-1',
      tipo: 'ENTRADA',
      valor: -5,
      motivo: 'Compra a proveedor',
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.some((i) => i.path.includes('valor'))).toBe(true);
    }
  });

  it('rechaza SALIDA con valor 0', () => {
    const r = movementSchema.safeParse({
      variantId: 'var-1',
      tipo: 'SALIDA',
      valor: 0,
      motivo: 'Venta',
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.some((i) => i.path.includes('valor'))).toBe(true);
    }
  });

  it('rechaza SALIDA con valor negativo', () => {
    const r = movementSchema.safeParse({
      variantId: 'var-1',
      tipo: 'SALIDA',
      valor: -1,
      motivo: 'Venta',
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.some((i) => i.path.includes('valor'))).toBe(true);
    }
  });

  it('acepta AJUSTE con valor 0', () => {
    const r = movementSchema.safeParse({
      variantId: 'var-1',
      tipo: 'AJUSTE',
      valor: 0,
      motivo: 'Corrección de inventario',
    });
    expect(r.success).toBe(true);
  });

  it('rechaza AJUSTE con valor negativo', () => {
    const r = movementSchema.safeParse({
      variantId: 'var-1',
      tipo: 'AJUSTE',
      valor: -1,
      motivo: 'Corrección de inventario',
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.some((i) => i.path.includes('valor'))).toBe(true);
    }
  });

  it('acepta AJUSTE con valor positivo', () => {
    const r = movementSchema.safeParse({
      variantId: 'var-1',
      tipo: 'AJUSTE',
      valor: 10,
      motivo: 'Corrección de inventario',
    });
    expect(r.success).toBe(true);
  });

  it('rechaza SALIDA con costoUnitario', () => {
    const r = movementSchema.safeParse({
      variantId: 'var-1',
      tipo: 'SALIDA',
      valor: 5,
      motivo: 'Venta',
      costoUnitario: 50,
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.some((i) => i.path.includes('costoUnitario'))).toBe(true);
    }
  });

  it('rechaza AJUSTE con costoUnitario', () => {
    const r = movementSchema.safeParse({
      variantId: 'var-1',
      tipo: 'AJUSTE',
      valor: 10,
      motivo: 'Corrección',
      costoUnitario: 50,
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.some((i) => i.path.includes('costoUnitario'))).toBe(true);
    }
  });

  it('rechaza motivo vacío', () => {
    const r = movementSchema.safeParse({
      variantId: 'var-1',
      tipo: 'ENTRADA',
      valor: 10,
      motivo: '',
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.some((i) => i.path.includes('motivo'))).toBe(true);
    }
  });

  it('rechaza motivo solo espacios', () => {
    const r = movementSchema.safeParse({
      variantId: 'var-1',
      tipo: 'ENTRADA',
      valor: 10,
      motivo: '   ',
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.some((i) => i.path.includes('motivo'))).toBe(true);
    }
  });

  it('rechaza sin variantId', () => {
    const r = movementSchema.safeParse({
      variantId: '',
      tipo: 'ENTRADA',
      valor: 10,
      motivo: 'Compra',
    });
    expect(r.success).toBe(false);
  });

  it('convierte valor a número entero', () => {
    const r = movementSchema.safeParse({
      variantId: 'var-1',
      tipo: 'ENTRADA',
      valor: '10',
      motivo: 'Compra',
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.valor).toBe(10);
      expect(typeof r.data.valor).toBe('number');
    }
  });
});
