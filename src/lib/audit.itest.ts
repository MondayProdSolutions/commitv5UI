import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '@/lib/db';
import { logActivity, actionLabel, KNOWN_ACTIONS } from './audit';

beforeEach(async () => {
  await db.activityLog.deleteMany();
});

describe('logActivity', () => {
  it('inserta una fila con los campos dados', async () => {
    await logActivity({ actorId: null, accion: 'auth.login_failed', metadata: { email: 'x@pos.com' }, ip: '1.2.3.4' });
    const rows = await db.activityLog.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      accion: 'auth.login_failed', actorId: null, ip: '1.2.3.4',
    });
    expect(rows[0].metadata).toEqual({ email: 'x@pos.com' });
  });

  it('respeta la transacción: si el tx hace rollback, no queda log', async () => {
    await db.$transaction(async (tx) => {
      await logActivity({ accion: 'roles.crear', entidad: 'Role', entidadId: 'r1' }, tx);
      throw new Error('rollback');
    }).catch(() => {});
    expect(await db.activityLog.count()).toBe(0);
  });
});

describe('actionLabel', () => {
  it('traduce acciones conocidas', () => {
    expect(actionLabel('auth.login')).toBe('Inicio de sesión');
  });
  it('devuelve la clave si no la conoce', () => {
    expect(actionLabel('foo.bar')).toBe('foo.bar');
  });
  it('traduce inventario.movimiento', () => {
    expect(actionLabel('inventario.movimiento')).toBe('Movimiento de inventario');
  });
  it('KNOWN_ACTIONS contiene productos.crear', () => {
    expect(KNOWN_ACTIONS).toContain('productos.crear');
  });
  it('KNOWN_ACTIONS contiene todas las 13 nuevas acciones de Bloque 2', () => {
    const nuevas = [
      'categorias.crear', 'categorias.editar', 'categorias.archivar', 'categorias.restaurar',
      'productos.crear', 'productos.editar', 'productos.precio_cambiado',
      'productos.archivar', 'productos.restaurar', 'productos.disponibilidad',
      'productos.variante_agregada', 'productos.variante_archivada',
      'inventario.movimiento',
    ];
    for (const k of nuevas) expect(KNOWN_ACTIONS).toContain(k);
  });
});
