import { describe, it, expect } from 'vitest';
import { getModuleContext, SYSTEM_BOUNDARIES } from './knowledge';

describe('getModuleContext', () => {
  it('resuelve el módulo y trae un extracto del manual para /caja', () => {
    const ctx = getModuleContext('/caja');
    expect(ctx.modulo).toBe('Caja');
    expect(ctx.excerpt).toBeTruthy();
    expect(ctx.excerpt).toMatch(/caja/i);
  });

  it('resuelve subrutas por prefijo (/productos/123)', () => {
    const ctx = getModuleContext('/productos/123');
    expect(ctx.modulo).toBe('Productos');
  });

  it('distingue /ventas de /ventas/historial', () => {
    expect(getModuleContext('/ventas').modulo).toBe('Punto de venta (POS)');
    expect(getModuleContext('/ventas/historial').modulo).toBe('Historial de ventas');
  });

  it('cae a General para rutas no mapeadas', () => {
    const ctx = getModuleContext('/algo-desconocido');
    expect(ctx.modulo).toBe('General');
    expect(ctx.excerpt).toBeNull();
  });
});

describe('SYSTEM_BOUNDARIES', () => {
  it('incluye el límite de facturación (no timbra CFDI)', () => {
    expect(SYSTEM_BOUNDARIES.some((b) => b.includes('timbra facturas'))).toBe(true);
  });
});
