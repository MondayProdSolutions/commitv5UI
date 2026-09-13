import { describe, it, expect } from 'vitest';
import { PERMISSIONS, ALL_PERMISSION_KEYS } from './rbac';

describe('grupo de permisos asistencia', () => {
  it('existe el módulo asistencia con 3 claves', () => {
    const g = PERMISSIONS.find((x) => x.modulo === 'asistencia');
    expect(g?.permisos.map((p) => p.key)).toEqual([
      'asistencia.registrar',
      'asistencia.ver',
      'asistencia.corregir',
    ]);
  });
  it('las 3 claves están en ALL_PERMISSION_KEYS', () => {
    expect(ALL_PERMISSION_KEYS).toContain('asistencia.registrar');
    expect(ALL_PERMISSION_KEYS).toContain('asistencia.ver');
    expect(ALL_PERMISSION_KEYS).toContain('asistencia.corregir');
  });
});
