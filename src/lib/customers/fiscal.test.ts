import { describe, it, expect } from 'vitest';
import {
  normalizarRfc,
  rfcEsValido,
  esFisica,
  esRfcGenerico,
  bloqueFiscalCompleto,
  bloqueFiscalVacio,
  enmascararRfc,
  regimenCompatibleConRfc,
} from './fiscal';

describe('normalizarRfc', () => {
  it('mayúsculas y sin espacios ni guiones', () => {
    expect(normalizarRfc(' loam-800101-1x3 ')).toBe('LOAM8001011X3');
    expect(normalizarRfc('abc010101xyz')).toBe('ABC010101XYZ');
  });
});

describe('rfcEsValido', () => {
  it('acepta persona moral (12)', () => {
    expect(rfcEsValido('ABC010101XYZ')).toBe(true);
  });
  it('acepta persona física (13)', () => {
    expect(rfcEsValido('LOAM8001011X3')).toBe(true);
  });
  it('normaliza antes de validar', () => {
    expect(rfcEsValido(' loam-800101-1x3 ')).toBe(true);
  });
  it('rechaza longitud 11 y 14', () => {
    expect(rfcEsValido('ABC010101XY')).toBe(false);
    expect(rfcEsValido('ABCD010101XYZ4')).toBe(false);
  });
  it('rechaza caracteres inválidos', () => {
    expect(rfcEsValido('AB!010101XYZ')).toBe(false);
  });
});

describe('esFisica', () => {
  it('true para 13, false para 12', () => {
    expect(esFisica('LOAM8001011X3')).toBe(true);
    expect(esFisica('ABC010101XYZ')).toBe(false);
  });
});

describe('esRfcGenerico', () => {
  it('reconoce XAXX y XEXX en cualquier caja', () => {
    expect(esRfcGenerico('XAXX010101000')).toBe(true);
    expect(esRfcGenerico('xexx010101000')).toBe(true);
    expect(esRfcGenerico('LOAM8001011X3')).toBe(false);
  });
});

describe('bloqueFiscal*', () => {
  const full = {
    rfc: 'ABC010101XYZ',
    razonSocial: 'ACME',
    regimenFiscalCode: '601',
    usoCfdiCode: 'G03',
    cpFiscal: '06000',
  };
  it('completo cuando están los 5 núcleo', () => {
    expect(bloqueFiscalCompleto(full)).toBe(true);
    expect(bloqueFiscalVacio(full)).toBe(false);
  });
  it('vacío cuando no hay ninguno', () => {
    expect(bloqueFiscalVacio({})).toBe(true);
    expect(bloqueFiscalCompleto({})).toBe(false);
  });
  it('parcial no es completo ni vacío', () => {
    const parcial = { rfc: 'ABC010101XYZ' };
    expect(bloqueFiscalCompleto(parcial)).toBe(false);
    expect(bloqueFiscalVacio(parcial)).toBe(false);
  });
  it('trata cadena vacía y espacios como ausente', () => {
    expect(bloqueFiscalVacio({ rfc: '   ', razonSocial: '' })).toBe(true);
  });
});

describe('enmascararRfc', () => {
  it('deja 3 al inicio y 3 al final', () => {
    expect(enmascararRfc('ABC010101XYZ')).toBe('ABC******XYZ');
    expect(enmascararRfc('LOAM8001011X3')).toBe('LOA*******1X3');
  });
  it('normaliza primero', () => {
    expect(enmascararRfc(' abc-010101-xyz ')).toBe('ABC******XYZ');
  });
});

describe('regimenCompatibleConRfc', () => {
  it('601 con RFC moral: compatible', () => {
    expect(regimenCompatibleConRfc('601', 'ABC010101XYZ')).toBe(true);
  });
  it('601 con RFC física: incompatible', () => {
    expect(regimenCompatibleConRfc('601', 'LOAM8001011X3')).toBe(false);
  });
  it('605 con RFC física: compatible', () => {
    expect(regimenCompatibleConRfc('605', 'LOAM8001011X3')).toBe(true);
  });
  it('626 (ambos) con cualquiera: compatible', () => {
    expect(regimenCompatibleConRfc('626', 'ABC010101XYZ')).toBe(true);
    expect(regimenCompatibleConRfc('626', 'LOAM8001011X3')).toBe(true);
  });
  it('código fuera del catálogo: incompatible', () => {
    expect(regimenCompatibleConRfc('999', 'ABC010101XYZ')).toBe(false);
  });
});
