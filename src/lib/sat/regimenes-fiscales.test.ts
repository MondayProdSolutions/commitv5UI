import { describe, it, expect } from 'vitest';
import { REGIMENES_FISCALES, REGIMEN_CODES, getRegimenLabel } from './regimenes-fiscales';

describe('REGIMENES_FISCALES', () => {
  it('no tiene códigos duplicados', () => {
    const codes = REGIMENES_FISCALES.map((r) => r.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('incluye los regímenes SAT esperados', () => {
    for (const c of ['601', '605', '612', '626']) {
      expect(REGIMEN_CODES.has(c)).toBe(true);
    }
  });

  it('601 aplica a personas morales y no a físicas', () => {
    const r = REGIMENES_FISCALES.find((x) => x.code === '601');
    expect(r?.aplicaMoral).toBe(true);
    expect(r?.aplicaFisica).toBe(false);
  });

  it('605 aplica a personas físicas y no a morales', () => {
    const r = REGIMENES_FISCALES.find((x) => x.code === '605');
    expect(r?.aplicaFisica).toBe(true);
    expect(r?.aplicaMoral).toBe(false);
  });

  it('626 (RESICO) aplica a ambos', () => {
    const r = REGIMENES_FISCALES.find((x) => x.code === '626');
    expect(r?.aplicaFisica).toBe(true);
    expect(r?.aplicaMoral).toBe(true);
  });

  it('REGIMEN_CODES coincide con el array', () => {
    expect(REGIMEN_CODES.size).toBe(REGIMENES_FISCALES.length);
  });

  it('getRegimenLabel devuelve la etiqueta o el code como fallback', () => {
    expect(getRegimenLabel('601')).toContain('Personas Morales');
    expect(getRegimenLabel('999')).toBe('999');
  });
});
