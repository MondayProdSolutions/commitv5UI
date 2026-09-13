import { describe, it, expect } from 'vitest';
import { getTaxRates, getDefaultTaxRate, precioConImpuesto } from './taxes';

describe('precioConImpuesto', () => {
  it('calculates price with 16% tax correctly', () => {
    expect(precioConImpuesto(100, 0.16)).toBe(116);
  });

  it('handles decimal prices correctly', () => {
    expect(precioConImpuesto(9.99, 0.16)).toBe(11.59);
  });

  it('handles zero tax rate', () => {
    expect(precioConImpuesto(100, 0)).toBe(100);
  });

  it('rounds to 2 decimal places', () => {
    expect(precioConImpuesto(10.01, 0.16)).toBe(11.61);
  });
});

describe('getTaxRates', () => {
  it('returns active tax rates with default first', async () => {
    const rates = await getTaxRates();
    expect(rates.length).toBe(2);
    expect(rates[0].nombre).toBe('IVA 16%');
    expect(rates[0].esDefault).toBe(true);
    expect(rates[1].nombre).toBe('Exento');
    expect(rates[1].esDefault).toBe(false);
  });

  it('includes tasa as number', async () => {
    const rates = await getTaxRates();
    expect(typeof rates[0].tasa).toBe('number');
    expect(rates[0].tasa).toBe(0.16);
  });
});

describe('getDefaultTaxRate', () => {
  it('returns the default tax rate', async () => {
    const rate = await getDefaultTaxRate();
    expect(rate.nombre).toBe('IVA 16%');
    expect(rate.tasa).toBe(0.16);
  });

  it('includes id and nombre', async () => {
    const rate = await getDefaultTaxRate();
    expect(rate).toHaveProperty('id');
    expect(rate).toHaveProperty('nombre');
    expect(rate).toHaveProperty('tasa');
  });
});
