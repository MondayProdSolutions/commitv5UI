export type RegimenFiscal = {
  code: string;
  label: string;
  aplicaFisica: boolean;
  aplicaMoral: boolean;
};

// Catálogo SAT c_RegimenFiscal (CFDI 4.0). Solo se almacena el código; sin
// integración con el SAT.
export const REGIMENES_FISCALES: readonly RegimenFiscal[] = [
  { code: '601', label: 'General de Ley Personas Morales', aplicaFisica: false, aplicaMoral: true },
  { code: '603', label: 'Personas Morales con Fines no Lucrativos', aplicaFisica: false, aplicaMoral: true },
  { code: '605', label: 'Sueldos y Salarios e Ingresos Asimilados a Salarios', aplicaFisica: true, aplicaMoral: false },
  { code: '606', label: 'Arrendamiento', aplicaFisica: true, aplicaMoral: false },
  { code: '607', label: 'Régimen de Enajenación o Adquisición de Bienes', aplicaFisica: true, aplicaMoral: false },
  { code: '608', label: 'Demás ingresos', aplicaFisica: true, aplicaMoral: false },
  { code: '610', label: 'Residentes en el Extranjero sin Establecimiento Permanente en México', aplicaFisica: true, aplicaMoral: true },
  { code: '611', label: 'Ingresos por Dividendos (socios y accionistas)', aplicaFisica: true, aplicaMoral: false },
  { code: '612', label: 'Personas Físicas con Actividades Empresariales y Profesionales', aplicaFisica: true, aplicaMoral: false },
  { code: '614', label: 'Ingresos por intereses', aplicaFisica: true, aplicaMoral: false },
  { code: '615', label: 'Régimen de los ingresos por obtención de premios', aplicaFisica: true, aplicaMoral: false },
  { code: '616', label: 'Sin obligaciones fiscales', aplicaFisica: true, aplicaMoral: false },
  { code: '620', label: 'Sociedades Cooperativas de Producción que optan por diferir sus ingresos', aplicaFisica: false, aplicaMoral: true },
  { code: '621', label: 'Incorporación Fiscal', aplicaFisica: true, aplicaMoral: false },
  { code: '622', label: 'Actividades Agrícolas, Ganaderas, Silvícolas y Pesqueras', aplicaFisica: true, aplicaMoral: true },
  { code: '623', label: 'Opcional para Grupos de Sociedades', aplicaFisica: false, aplicaMoral: true },
  { code: '624', label: 'Coordinados', aplicaFisica: false, aplicaMoral: true },
  { code: '625', label: 'Régimen de las Actividades Empresariales con ingresos a través de Plataformas Tecnológicas', aplicaFisica: true, aplicaMoral: false },
  { code: '626', label: 'Régimen Simplificado de Confianza', aplicaFisica: true, aplicaMoral: true },
] as const;

export const REGIMEN_CODES: ReadonlySet<string> = new Set(REGIMENES_FISCALES.map((r) => r.code));

const BY_CODE = new Map(REGIMENES_FISCALES.map((r) => [r.code, r] as const));

export function getRegimenLabel(code: string): string {
  return BY_CODE.get(code)?.label ?? code;
}
