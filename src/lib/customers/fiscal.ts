import { REGIMENES_FISCALES } from '@/lib/sat/regimenes-fiscales';

const RFC_MORAL = /^[A-ZÑ&]{3}\d{6}[A-Z0-9]{3}$/;
const RFC_FISICA = /^[A-ZÑ&]{4}\d{6}[A-Z0-9]{3}$/;
const RFC_GENERICOS = new Set(['XAXX010101000', 'XEXX010101000']);

export function normalizarRfc(rfc: string): string {
  return rfc.toUpperCase().replace(/[\s-]/g, '');
}

export function rfcEsValido(rfc: string): boolean {
  const n = normalizarRfc(rfc);
  if (n.length === 12) return RFC_MORAL.test(n);
  if (n.length === 13) return RFC_FISICA.test(n);
  return false;
}

export function esFisica(rfc: string): boolean {
  return normalizarRfc(rfc).length === 13;
}

export function esRfcGenerico(rfc: string): boolean {
  return RFC_GENERICOS.has(normalizarRfc(rfc));
}

export type BloqueFiscalInput = {
  rfc?: string | null;
  razonSocial?: string | null;
  regimenFiscalCode?: string | null;
  usoCfdiCode?: string | null;
  cpFiscal?: string | null;
};

const CAMPOS_NUCLEO: (keyof BloqueFiscalInput)[] = [
  'rfc', 'razonSocial', 'regimenFiscalCode', 'usoCfdiCode', 'cpFiscal',
];

function tieneValor(v: string | null | undefined): boolean {
  return typeof v === 'string' && v.trim() !== '';
}

export function bloqueFiscalCompleto(x: BloqueFiscalInput): boolean {
  return CAMPOS_NUCLEO.every((k) => tieneValor(x[k]));
}

export function bloqueFiscalVacio(x: BloqueFiscalInput): boolean {
  return CAMPOS_NUCLEO.every((k) => !tieneValor(x[k]));
}

export function enmascararRfc(rfc: string): string {
  const n = normalizarRfc(rfc);
  if (n.length <= 6) return '*'.repeat(n.length);
  return `${n.slice(0, 3)}${'*'.repeat(n.length - 6)}${n.slice(-3)}`;
}

export function regimenCompatibleConRfc(regimenCode: string, rfc: string): boolean {
  const r = REGIMENES_FISCALES.find((x) => x.code === regimenCode);
  if (!r) return false;
  return esFisica(rfc) ? r.aplicaFisica : r.aplicaMoral;
}
