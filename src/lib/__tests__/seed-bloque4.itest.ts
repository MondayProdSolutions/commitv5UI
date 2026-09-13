import { describe, it, expect } from 'vitest';
import { db } from '@/lib/db';

describe('seed bloque 4', () => {
  it('siembra FolioCounter con V y D', async () => {
    const series = (await db.folioCounter.findMany()).map((c) => c.serie).sort();
    expect(series).toEqual(expect.arrayContaining(['D', 'V']));
  });

  it('Gerente tiene las 5 claves de ventas', async () => {
    const rol = await db.role.findUniqueOrThrow({ where: { nombre: 'Gerente' }, include: { permissions: true } });
    const keys = rol.permissions.map((p) => p.permiso);
    for (const k of ['ventas.crear', 'ventas.descuento', 'ventas.cancelar', 'ventas.devolver', 'ventas.ver'])
      expect(keys).toContain(k);
  });

  it('Cajero crea/ve/devuelve pero no descuenta ni cancela; Empleado nada', async () => {
    const cajero = await db.role.findUniqueOrThrow({ where: { nombre: 'Cajero' }, include: { permissions: true } });
    const ck = cajero.permissions.map((p) => p.permiso);
    expect(ck).toContain('ventas.crear');
    expect(ck).toContain('ventas.ver');
    expect(ck).toContain('ventas.devolver');
    expect(ck).not.toContain('ventas.descuento');
    expect(ck).not.toContain('ventas.cancelar');

    const empleado = await db.role.findUniqueOrThrow({ where: { nombre: 'Empleado' }, include: { permissions: true } });
    const ek = empleado.permissions.map((p) => p.permiso);
    expect(ek.some((k) => k.startsWith('ventas.'))).toBe(false);
  });
});
