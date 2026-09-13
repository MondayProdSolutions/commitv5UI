import { describe, it, expect } from 'vitest';
import { createProductSchema, updateProductSchema, editVariantSchema, variantInputSchema } from './product';

describe('variantInputSchema', () => {
  it('acepta una variante válida', () => {
    const r = variantInputSchema.safeParse({
      nombre: 'Rojo',
      sku: 'SKU-001',
      codigoBarras: '123456789',
      precioVenta: 100,
      precioCompra: 50,
      stockMinimo: 5,
      stockInicial: 10,
    });
    expect(r.success).toBe(true);
  });

  it('transforma sku vacío a null', () => {
    const r = variantInputSchema.safeParse({
      nombre: 'Rojo',
      sku: '',
      precioVenta: 100,
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.sku).toBe(null);
    }
  });

  it('rechaza precioVenta negativo', () => {
    const r = variantInputSchema.safeParse({
      nombre: 'Rojo',
      precioVenta: -10,
    });
    expect(r.success).toBe(false);
  });

  it('precioCompra por defecto 0', () => {
    const r = variantInputSchema.safeParse({
      precioVenta: 100,
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.precioCompra).toBe(0);
    }
  });
});

describe('createProductSchema', () => {
  it('acepta un producto SIMPLE válido', () => {
    const r = createProductSchema.safeParse({
      nombre: 'Producto Simple',
      taxRateId: 'tax-1',
      tipo: 'SIMPLE',
      variantes: [
        {
          precioVenta: 100,
          precioCompra: 50,
        },
      ],
    });
    expect(r.success).toBe(true);
  });

  it('rechaza producto SIMPLE con 2 variantes', () => {
    const r = createProductSchema.safeParse({
      nombre: 'Producto Simple',
      taxRateId: 'tax-1',
      tipo: 'SIMPLE',
      variantes: [
        { precioVenta: 100, precioCompra: 50 },
        { precioVenta: 110, precioCompra: 55 },
      ],
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.some((i) => i.path.includes('variantes'))).toBe(true);
    }
  });

  it('rechaza producto SIMPLE con 1 variante con nombre', () => {
    const r = createProductSchema.safeParse({
      nombre: 'Producto Simple',
      taxRateId: 'tax-1',
      tipo: 'SIMPLE',
      variantes: [
        {
          nombre: 'Rojo',
          precioVenta: 100,
          precioCompra: 50,
        },
      ],
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.some((i) => i.path.includes('variantes'))).toBe(true);
    }
  });

  it('acepta producto CON_VARIANTES con 2 variantes con nombres distintos', () => {
    const r = createProductSchema.safeParse({
      nombre: 'Producto Con Variantes',
      taxRateId: 'tax-1',
      tipo: 'CON_VARIANTES',
      variantes: [
        {
          nombre: 'Rojo',
          precioVenta: 100,
          precioCompra: 50,
        },
        {
          nombre: 'Azul',
          precioVenta: 110,
          precioCompra: 55,
        },
      ],
    });
    expect(r.success).toBe(true);
  });

  it('rechaza producto CON_VARIANTES con 1 variante', () => {
    const r = createProductSchema.safeParse({
      nombre: 'Producto Con Variantes',
      taxRateId: 'tax-1',
      tipo: 'CON_VARIANTES',
      variantes: [
        {
          nombre: 'Rojo',
          precioVenta: 100,
          precioCompra: 50,
        },
      ],
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.some((i) => i.path.includes('variantes'))).toBe(true);
    }
  });

  it('rechaza producto CON_VARIANTES con variantes sin nombre', () => {
    const r = createProductSchema.safeParse({
      nombre: 'Producto Con Variantes',
      taxRateId: 'tax-1',
      tipo: 'CON_VARIANTES',
      variantes: [
        {
          precioVenta: 100,
          precioCompra: 50,
        },
        {
          nombre: 'Azul',
          precioVenta: 110,
          precioCompra: 55,
        },
      ],
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.some((i) => i.path.includes('variantes'))).toBe(true);
    }
  });

  it('rechaza producto CON_VARIANTES con nombres repetidos', () => {
    const r = createProductSchema.safeParse({
      nombre: 'Producto Con Variantes',
      taxRateId: 'tax-1',
      tipo: 'CON_VARIANTES',
      variantes: [
        {
          nombre: 'Rojo',
          precioVenta: 100,
          precioCompra: 50,
        },
        {
          nombre: 'Rojo',
          precioVenta: 110,
          precioCompra: 55,
        },
      ],
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.some((i) => i.path.includes('variantes'))).toBe(true);
    }
  });

  it('transforma categoryId vacío a null', () => {
    const r = createProductSchema.safeParse({
      nombre: 'Producto',
      categoryId: '',
      taxRateId: 'tax-1',
      tipo: 'SIMPLE',
      variantes: [
        {
          precioVenta: 100,
        },
      ],
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.categoryId).toBe(null);
    }
  });

  it('rechaza nombre corto', () => {
    const r = createProductSchema.safeParse({
      nombre: 'A',
      taxRateId: 'tax-1',
      tipo: 'SIMPLE',
      variantes: [
        {
          precioVenta: 100,
        },
      ],
    });
    expect(r.success).toBe(false);
  });

  it('rechaza sin variantes', () => {
    const r = createProductSchema.safeParse({
      nombre: 'Producto',
      taxRateId: 'tax-1',
      tipo: 'SIMPLE',
      variantes: [],
    });
    expect(r.success).toBe(false);
  });
});

describe('updateProductSchema', () => {
  it('acepta actualización válida', () => {
    const r = updateProductSchema.safeParse({
      id: 'prod-1',
      nombre: 'Producto Actualizado',
      taxRateId: 'tax-1',
    });
    expect(r.success).toBe(true);
  });

  it('requiere ID', () => {
    const r = updateProductSchema.safeParse({
      id: '',
      nombre: 'Producto',
      taxRateId: 'tax-1',
    });
    expect(r.success).toBe(false);
  });
});

describe('editVariantSchema', () => {
  it('acepta edición de variante válida', () => {
    const r = editVariantSchema.safeParse({
      id: 'var-1',
      precioVenta: 100,
      precioCompra: 50,
      stockMinimo: 5,
      disponible: true,
    });
    expect(r.success).toBe(true);
  });

  it('convierte disponible a boolean', () => {
    const r = editVariantSchema.safeParse({
      id: 'var-1',
      precioVenta: 100,
      precioCompra: 50,
      stockMinimo: 5,
      disponible: 'true',
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.disponible).toBe(true);
    }
  });

  it('rechaza precio negativo', () => {
    const r = editVariantSchema.safeParse({
      id: 'var-1',
      precioVenta: -100,
      precioCompra: 50,
      stockMinimo: 5,
      disponible: true,
    });
    expect(r.success).toBe(false);
  });
});
