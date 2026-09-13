import { describe, it, expect } from 'vitest';
import { USOS_CFDI, USO_CFDI_CODES, getUsoCfdiLabel } from './usos-cfdi';

describe('USOS_CFDI', () => {
  it('no tiene códigos duplicados', () => {
    const codes = USOS_CFDI.map((u) => u.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('incluye los usos SAT esperados', () => {
    for (const c of ['G01', 'G03', 'S01', 'CP01', 'CN01', 'I01', 'D01']) {
      expect(USO_CFDI_CODES.has(c)).toBe(true);
    }
  });

  it('USO_CFDI_CODES coincide con el array', () => {
    expect(USO_CFDI_CODES.size).toBe(USOS_CFDI.length);
  });

  it('getUsoCfdiLabel devuelve la etiqueta o el code como fallback', () => {
    expect(getUsoCfdiLabel('G03')).toContain('Gastos en general');
    expect(getUsoCfdiLabel('ZZZ')).toBe('ZZZ');
  });
});
