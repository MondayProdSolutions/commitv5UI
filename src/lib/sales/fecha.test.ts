import { describe, it, expect } from 'vitest';
import { esMismoDiaMX } from './fecha';

describe('esMismoDiaMX', () => {
  // 2026-09-04T04:30:00Z es el 3 de septiembre en America/Mexico_City (UTC−6):
  // su día natural en MX difiere del día natural en UTC.
  const madrugadaUTC = new Date('2026-09-04T04:30:00Z'); // MX: 2026-09-03 22:30
  const tardeSep3 = new Date('2026-09-03T18:00:00Z'); // MX: 2026-09-03 12:00
  const tardeSep4 = new Date('2026-09-04T18:00:00Z'); // MX: 2026-09-04 12:00

  it('mismo día MX aunque el día UTC difiera', () => {
    expect(esMismoDiaMX(madrugadaUTC, tardeSep3)).toBe(true);
  });

  it('distinto día MX aunque compartan día UTC', () => {
    expect(esMismoDiaMX(madrugadaUTC, tardeSep4)).toBe(false);
  });

  it('es simétrica', () => {
    expect(esMismoDiaMX(tardeSep3, madrugadaUTC)).toBe(true);
    expect(esMismoDiaMX(tardeSep4, madrugadaUTC)).toBe(false);
  });

  // Guarda de regresión: si alguien sustituye la implementación por
  // `toISOString().slice(0, 10)` (comparación en UTC), este caso fallaría.
  it('no colapsa a comparación en UTC', () => {
    const aUTC = madrugadaUTC.toISOString().slice(0, 10);
    const bUTC = tardeSep4.toISOString().slice(0, 10);
    expect(aUTC).toBe(bUTC); // ambos "2026-09-04" en UTC
    expect(esMismoDiaMX(madrugadaUTC, tardeSep4)).toBe(false); // pero distinto día en MX
  });
});
