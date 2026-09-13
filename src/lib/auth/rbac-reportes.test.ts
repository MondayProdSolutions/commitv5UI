import { describe, it, expect } from 'vitest';
import { PERMISSIONS, ALL_PERMISSION_KEYS } from './rbac';

describe('grupo de permisos reportes', () => {
  it('existe el módulo reportes con 2 claves', () => {
    const g = PERMISSIONS.find((x) => x.modulo === 'reportes');
    expect(g?.permisos.map((p) => p.key)).toEqual(['reportes.ver', 'reportes.margen']);
  });
  it('ambas claves están en ALL_PERMISSION_KEYS', () => {
    expect(ALL_PERMISSION_KEYS).toContain('reportes.ver');
    expect(ALL_PERMISSION_KEYS).toContain('reportes.margen');
  });
});
