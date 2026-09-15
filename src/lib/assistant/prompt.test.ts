import { describe, it, expect } from 'vitest';
import { buildSystemInstruction, ESCALATE_MARKER } from './prompt';

describe('buildSystemInstruction', () => {
  it('incluye el módulo, los límites del sistema y la instrucción de escalamiento', () => {
    const text = buildSystemInstruction({ modulo: 'Caja', excerpt: null });
    expect(text).toContain('Caja');
    expect(text).toContain('No emite ni timbra facturas');
    expect(text).toContain(ESCALATE_MARKER);
  });

  it('incluye el extracto del manual cuando existe', () => {
    const text = buildSystemInstruction({ modulo: 'Ventas', excerpt: 'Texto del manual de ventas' });
    expect(text).toContain('Texto del manual de ventas');
  });

  it('incluye el error visible solo cuando se reporta', () => {
    const sinError = buildSystemInstruction({ modulo: 'Ventas', excerpt: null });
    expect(sinError).not.toContain('Error visible en pantalla');

    const conError = buildSystemInstruction({ modulo: 'Ventas', excerpt: null, errorVisible: 'no imprime el ticket' });
    expect(conError).toContain('no imprime el ticket');
  });
});
