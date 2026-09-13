import { describe, it, expect } from 'vitest';
import { PERMISSIONS, ALL_PERMISSION_KEYS, can, type AuthUser } from './rbac';

const user = (perms: string[]): AuthUser => ({
  id: 'u1', nombre: 'Test', email: 't@pos.com', roleId: 'r1', roleName: 'X',
  permissions: new Set(perms), mustChangePassword: false,
});

describe('catálogo', () => {
  it('agrupa por módulo y no repite claves', () => {
    const keys = PERMISSIONS.flatMap((g) => g.permisos.map((p) => p.key));
    expect(new Set(keys).size).toBe(keys.length);
    expect([...ALL_PERMISSION_KEYS].sort()).toEqual([...keys].sort());
  });
  it('incluye las claves del Bloque 1', () => {
    for (const k of [
      'usuarios.ver','usuarios.crear','usuarios.editar','usuarios.desactivar',
      'usuarios.reset_password','roles.ver','roles.gestionar','auditoria.ver','config.editar',
    ]) expect(ALL_PERMISSION_KEYS).toContain(k);
  });
  it('incluye las claves del Bloque 2', () => {
    for (const k of [
      'productos.ver','productos.crear','productos.editar','productos.archivar',
      'categorias.gestionar',
      'inventario.ver','inventario.entrada','inventario.salida','inventario.ajustar',
    ]) expect(ALL_PERMISSION_KEYS).toContain(k);
  });
  it('los grupos productos/categorias/inventario están en PERMISSIONS', () => {
    const modulos = PERMISSIONS.map((g) => g.modulo);
    expect(modulos).toEqual(expect.arrayContaining(['productos', 'categorias', 'inventario']));
  });
});

describe('can()', () => {
  it('true si el usuario tiene el permiso', () => {
    expect(can(user(['usuarios.crear']), 'usuarios.crear')).toBe(true);
  });
  it('false si no lo tiene', () => {
    expect(can(user(['usuarios.ver']), 'usuarios.crear')).toBe(false);
  });
  it('false si el usuario es null', () => {
    expect(can(null, 'usuarios.ver')).toBe(false);
  });
});
