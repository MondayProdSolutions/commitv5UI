import { describe, it, expect } from 'vitest';
import { PERMISSIONS, ALL_PERMISSION_KEYS } from './rbac';

describe('grupo de permisos clientes', () => {
  it('existe el módulo clientes con 4 claves', () => {
    const grupo = PERMISSIONS.find((g) => g.modulo === 'clientes');
    expect(grupo).toBeDefined();
    expect(grupo!.permisos.map((p) => p.key)).toEqual([
      'clientes.ver', 'clientes.crear', 'clientes.editar', 'clientes.archivar',
    ]);
  });

  it('las claves están en ALL_PERMISSION_KEYS', () => {
    for (const k of ['clientes.ver', 'clientes.crear', 'clientes.editar', 'clientes.archivar']) {
      expect(ALL_PERMISSION_KEYS).toContain(k);
    }
  });
});
