import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '@/lib/db';

beforeEach(async () => {
  // Defensive reset of idle timeout to canonical seed value (in case previous test modified it)
  await db.appSetting.upsert({
    where: { clave: 'session.idleTimeoutMinutes' },
    update: { valor: 15 },
    create: { clave: 'session.idleTimeoutMinutes', valor: 15 },
  });
});

describe('seed', () => {
  it('crea los 4 roles de sistema', async () => {
    const roles = await db.role.findMany({ where: { esSistema: true } });
    expect(roles.map((r) => r.nombre).sort()).toEqual(
      ['Administrador', 'Cajero', 'Empleado', 'Gerente'],
    );
  });

  it('el Administrador tiene todos los permisos del catálogo', async () => {
    const { ALL_PERMISSION_KEYS } = await import('@/lib/auth/rbac');
    const admin = await db.role.findUniqueOrThrow({
      where: { nombre: 'Administrador' },
      include: { permissions: true },
    });
    expect(admin.permissions.map((p) => p.permiso).sort()).toEqual(
      [...ALL_PERMISSION_KEYS].sort(),
    );
  });

  it('define el timeout de inactividad por defecto en 15', async () => {
    const s = await db.appSetting.findUniqueOrThrow({
      where: { clave: 'session.idleTimeoutMinutes' },
    });
    expect(s.valor).toBe(15);
  });
});
