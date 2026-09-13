import { describe, it, expect } from 'vitest';
import { db } from '@/lib/db';

describe('seed bloque 2', () => {
  it('siembra las tasas de impuesto', async () => {
    const rates = await db.taxRate.findMany({ orderBy: { tasa: 'desc' } });
    expect(rates.map((r) => r.nombre)).toEqual(['IVA 16%', 'Exento']);
    const def = rates.find((r) => r.esDefault);
    expect(def?.nombre).toBe('IVA 16%');
    expect(Number(def?.tasa)).toBeCloseTo(0.16);
  });

  it('asigna los permisos de bloque 2 a Gerente (las 9)', async () => {
    const gerente = await db.role.findUniqueOrThrow({
      where: { nombre: 'Gerente' },
      include: { permissions: true },
    });
    const keys = gerente.permissions.map((p) => p.permiso);
    for (const k of [
      'productos.ver', 'productos.crear', 'productos.editar', 'productos.archivar',
      'categorias.gestionar', 'inventario.ver', 'inventario.entrada',
      'inventario.salida', 'inventario.ajustar',
    ]) expect(keys).toContain(k);
  });

  it('Cajero y Empleado solo obtienen ver, no movimientos', async () => {
    for (const nombre of ['Cajero', 'Empleado']) {
      const rol = await db.role.findUniqueOrThrow({ where: { nombre }, include: { permissions: true } });
      const keys = rol.permissions.map((p) => p.permiso);
      expect(keys).toContain('productos.ver');
      expect(keys).toContain('inventario.ver');
      expect(keys).not.toContain('inventario.entrada');
      expect(keys).not.toContain('inventario.ajustar');
      expect(keys).not.toContain('productos.crear');
    }
  });
});
