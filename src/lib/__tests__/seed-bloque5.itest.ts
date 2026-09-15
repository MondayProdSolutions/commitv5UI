import { describe, it, expect } from 'vitest';
import { db, getCurrentTenantId } from '@/lib/db';

/** `Role.nombre` y `FolioCounter.serie` ahora tienen clave compuesta con `tenantId`. */
function roleWhere(nombre: string) {
  return { tenantId_nombre: { tenantId: getCurrentTenantId(), nombre } };
}

describe('seed bloque 5', () => {
  it('siembra FolioCounter con la serie C', async () => {
    const c = await db.folioCounter.findUnique({
      where: { tenantId_serie: { tenantId: getCurrentTenantId(), serie: 'C' } },
    });
    expect(c).not.toBeNull();
    expect(c!.valor).toBeTypeOf('number');
  });

  it('no hay ninguna CashSession sembrada', async () => {
    expect(await db.cashSession.count()).toBe(0);
  });

  it('Gerente y Cajero tienen caja.gestionar, Empleado no', async () => {
    const gerente = await db.role.findUniqueOrThrow({ where: roleWhere('Gerente'), include: { permissions: true } });
    const gerenteKeys = gerente.permissions.map((p) => p.permiso);
    expect(gerenteKeys).toContain('caja.gestionar');

    const cajero = await db.role.findUniqueOrThrow({ where: roleWhere('Cajero'), include: { permissions: true } });
    const cajeroKeys = cajero.permissions.map((p) => p.permiso);
    expect(cajeroKeys).toContain('caja.gestionar');

    const empleado = await db.role.findUniqueOrThrow({ where: roleWhere('Empleado'), include: { permissions: true } });
    const empleadoKeys = empleado.permissions.map((p) => p.permiso);
    expect(empleadoKeys).not.toContain('caja.gestionar');
  });
});
