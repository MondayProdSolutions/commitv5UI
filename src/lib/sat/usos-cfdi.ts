export type UsoCfdi = { code: string; label: string };

// Catálogo SAT c_UsoCFDI (CFDI 4.0). Solo se almacena el código.
export const USOS_CFDI: readonly UsoCfdi[] = [
  { code: 'G01', label: 'Adquisición de mercancías' },
  { code: 'G02', label: 'Devoluciones, descuentos o bonificaciones' },
  { code: 'G03', label: 'Gastos en general' },
  { code: 'I01', label: 'Construcciones' },
  { code: 'I02', label: 'Mobiliario y equipo de oficina por inversiones' },
  { code: 'I03', label: 'Equipo de transporte' },
  { code: 'I04', label: 'Equipo de cómputo y accesorios' },
  { code: 'I05', label: 'Dados, troqueles, moldes, matrices y herramental' },
  { code: 'I06', label: 'Comunicaciones telefónicas' },
  { code: 'I07', label: 'Comunicaciones satelitales' },
  { code: 'I08', label: 'Otra maquinaria y equipo' },
  { code: 'D01', label: 'Honorarios médicos, dentales y gastos hospitalarios' },
  { code: 'D02', label: 'Gastos médicos por incapacidad o discapacidad' },
  { code: 'D03', label: 'Gastos funerales' },
  { code: 'D04', label: 'Donativos' },
  { code: 'D05', label: 'Intereses reales efectivamente pagados por créditos hipotecarios (casa habitación)' },
  { code: 'D06', label: 'Aportaciones voluntarias al SAR' },
  { code: 'D07', label: 'Primas por seguros de gastos médicos' },
  { code: 'D08', label: 'Gastos de transportación escolar obligatoria' },
  { code: 'D09', label: 'Depósitos en cuentas para el ahorro, primas que tengan como base planes de pensiones' },
  { code: 'D10', label: 'Pagos por servicios educativos (colegiaturas)' },
  { code: 'S01', label: 'Sin efectos fiscales' },
  { code: 'CP01', label: 'Pagos' },
  { code: 'CN01', label: 'Nómina' },
] as const;

export const USO_CFDI_CODES: ReadonlySet<string> = new Set(USOS_CFDI.map((u) => u.code));

const BY_CODE = new Map(USOS_CFDI.map((u) => [u.code, u] as const));

export function getUsoCfdiLabel(code: string): string {
  return BY_CODE.get(code)?.label ?? code;
}
