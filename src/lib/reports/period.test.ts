import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { resolvePeriod, diaKeyMX } from './period';

describe('diaKeyMX', () => {
  it('usa el día natural de America/Mexico_City, no UTC', () => {
    // 2026-09-04T04:30:00Z = 2026-09-03 22:30 en MX (UTC-6) — mismo caso que fecha.test.ts.
    expect(diaKeyMX(new Date('2026-09-04T04:30:00Z'))).toBe('2026-09-03');
  });
});

describe('resolvePeriod', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // 2026-09-04T15:00:00Z = 2026-09-04 09:00 en MX.
    vi.setSystemTime(new Date('2026-09-04T15:00:00Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('sin parámetros usa el atajo "mes" (default) — desde el día 1 del mes MX en curso', () => {
    const p = resolvePeriod({});
    expect(p.etiqueta).toBe('Este mes');
    expect(diaKeyMX(p.desde)).toBe('2026-09-01');
    expect(p.hasta.toISOString()).toBe('2026-09-05T05:59:59.999Z'); // fin del día MX de hoy
  });

  it('atajo "hoy" — medianoche a medianoche del día MX en curso', () => {
    const p = resolvePeriod({ atajo: 'hoy' });
    expect(p.desde.toISOString()).toBe('2026-09-04T06:00:00.000Z'); // medianoche MX = 06:00 UTC
    expect(p.hasta.toISOString()).toBe('2026-09-05T05:59:59.999Z');
  });

  it('atajo "semana" — desde el lunes de la semana MX en curso', () => {
    const p = resolvePeriod({ atajo: 'semana' });
    const nombreDia = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Mexico_City',
      weekday: 'long',
    }).format(p.desde);
    expect(nombreDia).toBe('Monday');
    expect(diaKeyMX(p.hasta)).toBe('2026-09-04');
  });

  it('atajo "30dias" — últimos 30 días naturales incluyendo hoy', () => {
    const p = resolvePeriod({ atajo: '30dias' });
    expect(diaKeyMX(p.desde)).toBe('2026-08-06');
    expect(diaKeyMX(p.hasta)).toBe('2026-09-04');
  });

  it('rango personalizado (desde/hasta) ignora el atajo', () => {
    const p = resolvePeriod({ atajo: 'hoy', desde: '2026-09-01', hasta: '2026-09-15' });
    expect(diaKeyMX(p.desde)).toBe('2026-09-01');
    expect(diaKeyMX(p.hasta)).toBe('2026-09-15');
    expect(p.etiqueta).toBe('Rango personalizado');
  });

  it('atajo desconocido cae al default "mes"', () => {
    const p = resolvePeriod({ atajo: 'x' });
    expect(p.etiqueta).toBe('Este mes');
  });
});
