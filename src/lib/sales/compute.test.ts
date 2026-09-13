import { describe, it, expect } from 'vitest';
import { computeSale, prorateReturnLine } from './compute';

const linea = (over = {}) => ({
  variantId: 'v1', cantidad: 1, precioUnitario: 100, tasaImpuesto: 0.16, ...over,
});

describe('computeSale', () => {
  it('1 línea sin descuento: base·1, IVA 16 %', () => {
    const r = computeSale({ lineas: [linea({ cantidad: 2 })] });
    expect(r.subtotal).toBe(200);
    expect(r.impuestos).toBe(32);
    expect(r.total).toBe(232);
    expect(r.lineas[0].baseNeta).toBe(200);
    expect(r.lineas[0].impuesto).toBe(32);
  });

  it('tasas mixtas 16 % y 0 %', () => {
    const r = computeSale({ lineas: [linea(), linea({ variantId: 'v2', tasaImpuesto: 0 })] });
    expect(r.subtotal).toBe(200);
    expect(r.impuestos).toBe(16);
    expect(r.total).toBe(216);
  });

  it('descuento de línea monto reduce la base; IVA sobre base neta', () => {
    const r = computeSale({ lineas: [linea({ precioUnitario: 100, cantidad: 1, descuento: { tipo: 'monto', valor: 20 } })] });
    expect(r.lineas[0].descuentoLinea).toBe(20);
    expect(r.lineas[0].baseNeta).toBe(80);
    expect(r.lineas[0].impuesto).toBe(12.8);
    expect(r.total).toBe(92.8);
  });

  it('descuento de línea %', () => {
    const r = computeSale({ lineas: [linea({ descuento: { tipo: 'porcentaje', valor: 10 } })] });
    expect(r.lineas[0].baseNeta).toBe(90);
    expect(r.lineas[0].impuesto).toBe(14.4);
  });

  it('descuento de ticket % se prorratea y el residuo de centavos cuadra exacto', () => {
    // 3 líneas de bases 33.33 / 33.33 / 33.34 → total 100; 10 % ticket = 10.00
    const r = computeSale({
      lineas: [
        linea({ variantId: 'a', precioUnitario: 33.33, cantidad: 1, tasaImpuesto: 0 }),
        linea({ variantId: 'b', precioUnitario: 33.33, cantidad: 1, tasaImpuesto: 0 }),
        linea({ variantId: 'c', precioUnitario: 33.34, cantidad: 1, tasaImpuesto: 0 }),
      ],
      descuentoTicket: { tipo: 'porcentaje', valor: 10 },
    });
    const sumaProrrateo = r.lineas.reduce((s, l) => s + l.descuentoTicketProrrateado, 0);
    expect(Math.round(sumaProrrateo * 100) / 100).toBe(r.descuentoTicket);
    expect(r.descuentoTicket).toBe(10);
    expect(r.subtotal).toBe(90);
  });

  it('descuento de línea + ticket combinados', () => {
    const r = computeSale({
      lineas: [linea({ precioUnitario: 100, cantidad: 1, tasaImpuesto: 0, descuento: { tipo: 'monto', valor: 10 } })],
      descuentoTicket: { tipo: 'porcentaje', valor: 50 },
    });
    // base tras línea = 90; ticket 50 % = 45; base neta = 45
    expect(r.lineas[0].baseNeta).toBe(45);
    expect(r.total).toBe(45);
  });

  it('descuento de línea del 100 % deja esa línea en base 0 e IVA 0 (no lanza)', () => {
    const r = computeSale({ lineas: [
      linea({ variantId: 'a', precioUnitario: 100, cantidad: 1, tasaImpuesto: 0.16, descuento: { tipo: 'porcentaje', valor: 100 } }),
      linea({ variantId: 'b', precioUnitario: 100, cantidad: 1, tasaImpuesto: 0.16 }),
    ]});
    expect(r.lineas[0].baseNeta).toBe(0);
    expect(r.lineas[0].impuesto).toBe(0);
    expect(r.lineas[0].total).toBe(0);
    expect(r.total).toBe(116); // línea b intacta
  });

  it('total resultante 0 → ValidationError _form', () => {
    expect(() => computeSale({ lineas: [linea({ descuento: { tipo: 'porcentaje', valor: 100 } })] }))
      .toThrowError(/mayor que 0/);
  });

  it('descuento que excede la base se acota (no lanza)', () => {
    const r = computeSale({ lineas: [
      linea({ precioUnitario: 100, cantidad: 1, tasaImpuesto: 0, descuento: { tipo: 'monto', valor: 500 } }),
      linea({ variantId: 'v2', precioUnitario: 100, cantidad: 1, tasaImpuesto: 0 }),
    ]});
    expect(r.lineas[0].baseNeta).toBe(0);
    expect(r.total).toBe(100);
  });

  it('cantidad 0 / negativa / decimal → error de campo', () => {
    expect(() => computeSale({ lineas: [linea({ cantidad: 0 })] })).toThrow();
    expect(() => computeSale({ lineas: [linea({ cantidad: -1 })] })).toThrow();
    expect(() => computeSale({ lineas: [linea({ cantidad: 1.5 })] })).toThrow();
  });

  it('lista vacía → error', () => {
    expect(() => computeSale({ lineas: [] })).toThrow();
  });

  it('precioUnitario negativo → error', () => {
    expect(() => computeSale({ lineas: [linea({ precioUnitario: -1 })] })).toThrow();
  });

  it('tasaImpuesto negativa → error', () => {
    expect(() => computeSale({ lineas: [linea({ tasaImpuesto: -0.1 })] })).toThrow();
  });

  it('descuento de línea con valor ≤ 0 → error', () => {
    expect(() => computeSale({ lineas: [linea({ descuento: { tipo: 'monto', valor: 0 } })] })).toThrow();
    expect(() => computeSale({ lineas: [linea({ descuento: { tipo: 'porcentaje', valor: -5 } })] })).toThrow();
  });

  it('descuento de ticket con valor ≤ 0 → error', () => {
    expect(() => computeSale({ lineas: [linea()], descuentoTicket: { tipo: 'monto', valor: 0 } })).toThrow();
  });

  it('descuento de ticket a un centavo del máximo no deja ninguna base de línea negativa', () => {
    const lineas = [
      linea({ variantId: 'a', precioUnitario: 100, cantidad: 1, tasaImpuesto: 0.16 }),
      linea({ variantId: 'b', precioUnitario: 50, cantidad: 1, tasaImpuesto: 0.16 }),
      linea({ variantId: 'c', precioUnitario: 33, cantidad: 1, tasaImpuesto: 0.16 }),
    ];
    // Σ baseTrasLinea = 183.00; ticket = 182.99 (un centavo por debajo del máximo)
    const r = computeSale({ lineas, descuentoTicket: { tipo: 'monto', valor: 182.99 } });
    for (const l of r.lineas) {
      expect(l.baseNeta).toBeGreaterThanOrEqual(0);
      expect(l.total).toBeGreaterThanOrEqual(0);
    }
    const sp = Math.round(r.lineas.reduce((s, l) => s + l.descuentoTicketProrrateado, 0) * 100) / 100;
    expect(sp).toBe(r.descuentoTicket);
    expect(r.descuentoTicket).toBe(182.99);
  });

  it('invariante: Σ baseNeta + Σ impuesto == total, para entradas variadas', () => {
    for (let i = 0; i < 50; i++) {
      const n = 1 + (i % 4);
      const lineas = Array.from({ length: n }, (_, k) => linea({
        variantId: `v${k}`,
        cantidad: 1 + ((i + k) % 5),
        precioUnitario: 1 + ((i * 7 + k * 13) % 999) + ((k % 2) ? 0.99 : 0.5),
        tasaImpuesto: (k % 2) ? 0.16 : 0,
      }));
      const r = computeSale({ lineas, descuentoTicket: i % 3 ? { tipo: 'porcentaje', valor: (i % 30) + 1 } : null });
      expect(Math.round((r.subtotal + r.impuestos) * 100) / 100).toBe(r.total);
      const sp = Math.round(r.lineas.reduce((s, l) => s + l.descuentoTicketProrrateado, 0) * 100) / 100;
      expect(sp).toBe(r.descuentoTicket);
    }
  });
});

describe('prorateReturnLine', () => {
  const sl = { cantidad: 3, baseNeta: 90, impuesto: 14.4, total: 104.4 };
  it('devolución total de la línea = importes exactos', () => {
    expect(prorateReturnLine(sl, 3)).toEqual({ baseNeta: 90, impuesto: 14.4, total: 104.4 });
  });
  it('devolución parcial 2 de 3', () => {
    const r = prorateReturnLine(sl, 2);
    expect(r.baseNeta).toBe(60);
    expect(r.impuesto).toBe(9.6);
    expect(r.total).toBe(69.6);
  });
  it('cantidad > vendida → error', () => {
    expect(() => prorateReturnLine(sl, 4)).toThrow();
  });
  it('cantidad 0 o decimal → error', () => {
    expect(() => prorateReturnLine(sl, 0)).toThrow();
    expect(() => prorateReturnLine(sl, 1.5)).toThrow();
  });
});
