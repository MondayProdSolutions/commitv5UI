import { describe, it, expect } from 'vitest';
import { db, getCurrentTenantId } from '@/lib/db';

/** `Role.nombre` ahora tiene clave compuesta `(tenantId, nombre)`. */
function roleWhere(nombre: string) {
  return { tenantId_nombre: { tenantId: getCurrentTenantId(), nombre } };
}

describe('seed bloque 3', () => {
  it('siembra el cliente Público en General', async () => {
    const generico = await db.customer.findFirst({ where: { esGenerico: true } });
    expect(generico).not.toBeNull();
    expect(generico!.nombre).toBe('Público en General');
    expect(generico!.rfc).toBe('XAXX010101000');
    expect(generico!.archivado).toBe(false);
  });

  it('solo hay un cliente genérico', async () => {
    const count = await db.customer.count({ where: { esGenerico: true } });
    expect(count).toBe(1);
  });

  it('Gerente tiene las 4 claves de clientes', async () => {
    const rol = await db.role.findUniqueOrThrow({
      where: roleWhere('Gerente'),
      include: { permissions: true },
    });
    const keys = rol.permissions.map((p) => p.permiso);
    for (const k of ['clientes.ver', 'clientes.crear', 'clientes.editar', 'clientes.archivar']) {
      expect(keys).toContain(k);
    }
  });

  it('Cajero ve y crea; Empleado solo ve', async () => {
    const cajero = await db.role.findUniqueOrThrow({
      where: roleWhere('Cajero'), include: { permissions: true },
    });
    const ck = cajero.permissions.map((p) => p.permiso);
    expect(ck).toContain('clientes.ver');
    expect(ck).toContain('clientes.crear');
    expect(ck).not.toContain('clientes.editar');
    expect(ck).not.toContain('clientes.archivar');

    const empleado = await db.role.findUniqueOrThrow({
      where: roleWhere('Empleado'), include: { permissions: true },
    });
    const ek = empleado.permissions.map((p) => p.permiso);
    expect(ek).toContain('clientes.ver');
    expect(ek).not.toContain('clientes.crear');
  });
});
