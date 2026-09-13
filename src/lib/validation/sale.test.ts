import { describe, it, expect } from 'vitest';
import { createSaleSchema } from './sale';

const hasPath = (issues: { path: PropertyKey[] }[], path: string) =>
  issues.some((i) => i.path.join('.') === path);

const lineaOk = { variantId: 'var-1', cantidad: 2 };
const pagoOk = { metodo: 'EFECTIVO', monto: 100 };

describe('createSaleSchema', () => {
  it('venta mínima válida (1 línea, 1 pago, sin descuento) parsea; customerId "" → null; requiereFactura default false', () => {
    const r = createSaleSchema.safeParse({
      customerId: '',
      lineas: [lineaOk],
      pagos: [pagoOk],
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.customerId).toBe(null);
      expect(r.data.requiereFactura).toBe(false);
      expect(r.data.lineas[0].cantidad).toBe(2);
      expect(r.data.pagos[0].monto).toBe(100);
    }
  });

  it('customerId omitido → null', () => {
    const r = createSaleSchema.safeParse({ lineas: [lineaOk], pagos: [pagoOk] });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.customerId).toBe(null);
  });

  it('lineas vacío → issue en "lineas"', () => {
    const r = createSaleSchema.safeParse({ lineas: [], pagos: [pagoOk] });
    expect(r.success).toBe(false);
    if (!r.success) expect(hasPath(r.error.issues, 'lineas')).toBe(true);
  });

  it('pagos vacío → issue en "pagos"', () => {
    const r = createSaleSchema.safeParse({ lineas: [lineaOk], pagos: [] });
    expect(r.success).toBe(false);
    if (!r.success) expect(hasPath(r.error.issues, 'pagos')).toBe(true);
  });

  it('cantidad 0 → issue en lineas.0.cantidad', () => {
    const r = createSaleSchema.safeParse({
      lineas: [{ variantId: 'var-1', cantidad: 0 }],
      pagos: [pagoOk],
    });
    expect(r.success).toBe(false);
    if (!r.success) expect(hasPath(r.error.issues, 'lineas.0.cantidad')).toBe(true);
  });

  it('cantidad decimal → issue en lineas.0.cantidad', () => {
    const r = createSaleSchema.safeParse({
      lineas: [{ variantId: 'var-1', cantidad: 1.5 }],
      pagos: [pagoOk],
    });
    expect(r.success).toBe(false);
    if (!r.success) expect(hasPath(r.error.issues, 'lineas.0.cantidad')).toBe(true);
  });

  it('cantidad negativa → issue en lineas.0.cantidad', () => {
    const r = createSaleSchema.safeParse({
      lineas: [{ variantId: 'var-1', cantidad: -2 }],
      pagos: [pagoOk],
    });
    expect(r.success).toBe(false);
    if (!r.success) expect(hasPath(r.error.issues, 'lineas.0.cantidad')).toBe(true);
  });

  it('descuento de línea porcentaje > 100 → issue en lineas.0.descuento.valor', () => {
    const r = createSaleSchema.safeParse({
      lineas: [{ variantId: 'var-1', cantidad: 2, descuento: { tipo: 'porcentaje', valor: 150 } }],
      pagos: [pagoOk],
    });
    expect(r.success).toBe(false);
    if (!r.success) expect(hasPath(r.error.issues, 'lineas.0.descuento.valor')).toBe(true);
  });

  it('descuento de línea porcentaje <= 100 y monto libre parsean', () => {
    const r = createSaleSchema.safeParse({
      lineas: [
        { variantId: 'var-1', cantidad: 2, descuento: { tipo: 'porcentaje', valor: 100 } },
        { variantId: 'var-2', cantidad: 1, descuento: { tipo: 'monto', valor: 999 } },
      ],
      pagos: [pagoOk],
    });
    expect(r.success).toBe(true);
  });

  it('descuento de ticket porcentaje > 100 → issue en descuentoTicket.valor', () => {
    const r = createSaleSchema.safeParse({
      lineas: [lineaOk],
      pagos: [pagoOk],
      descuentoTicket: { tipo: 'porcentaje', valor: 101 },
    });
    expect(r.success).toBe(false);
    if (!r.success) expect(hasPath(r.error.issues, 'descuentoTicket.valor')).toBe(true);
  });

  it('descuentoTicket null / omitido parsea', () => {
    const r1 = createSaleSchema.safeParse({ lineas: [lineaOk], pagos: [pagoOk], descuentoTicket: null });
    const r2 = createSaleSchema.safeParse({ lineas: [lineaOk], pagos: [pagoOk] });
    expect(r1.success).toBe(true);
    expect(r2.success).toBe(true);
  });

  it('monto de pago <= 0 → issue', () => {
    const r = createSaleSchema.safeParse({
      lineas: [lineaOk],
      pagos: [{ metodo: 'EFECTIVO', monto: 0 }],
    });
    expect(r.success).toBe(false);
    if (!r.success) expect(hasPath(r.error.issues, 'pagos.0.monto')).toBe(true);
  });

  it('metodo de pago fuera del enum → issue', () => {
    const r = createSaleSchema.safeParse({
      lineas: [lineaOk],
      pagos: [{ metodo: 'CHEQUE', monto: 100 }],
    });
    expect(r.success).toBe(false);
    if (!r.success) expect(hasPath(r.error.issues, 'pagos.0.metodo')).toBe(true);
  });

  it('coacciona cantidad y monto desde string', () => {
    const r = createSaleSchema.safeParse({
      lineas: [{ variantId: 'var-1', cantidad: '3' }],
      pagos: [{ metodo: 'TARJETA', monto: '250.50' }],
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.lineas[0].cantidad).toBe(3);
      expect(r.data.pagos[0].monto).toBe(250.5);
    }
  });
});
