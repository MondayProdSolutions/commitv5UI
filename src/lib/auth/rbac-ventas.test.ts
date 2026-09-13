import { describe, it, expect } from 'vitest';
import { PERMISSIONS, ALL_PERMISSION_KEYS } from './rbac';

describe('grupo de permisos ventas', () => {
  it('existe el módulo ventas con 5 claves en orden', () => {
    const g = PERMISSIONS.find((x) => x.modulo === 'ventas');
    expect(g?.permisos.map((p) => p.key)).toEqual([
      'ventas.crear', 'ventas.descuento', 'ventas.cancelar', 'ventas.devolver', 'ventas.ver',
    ]);
  });
  it('las claves están en ALL_PERMISSION_KEYS', () => {
    for (const k of ['ventas.crear', 'ventas.descuento', 'ventas.cancelar', 'ventas.devolver', 'ventas.ver'])
      expect(ALL_PERMISSION_KEYS).toContain(k);
  });
});
