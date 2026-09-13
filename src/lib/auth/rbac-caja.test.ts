import { describe, it, expect } from 'vitest';
import { PERMISSIONS, ALL_PERMISSION_KEYS } from './rbac';

describe('grupo de permisos caja', () => {
  it('existe el módulo caja con 1 clave', () => {
    const g = PERMISSIONS.find((x) => x.modulo === 'caja');
    expect(g?.permisos.map((p) => p.key)).toEqual(['caja.gestionar']);
  });
  it('caja.gestionar está en ALL_PERMISSION_KEYS', () => {
    expect(ALL_PERMISSION_KEYS).toContain('caja.gestionar');
  });
});
