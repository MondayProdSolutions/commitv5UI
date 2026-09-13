import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '@/lib/db';
import { logActivity } from '@/lib/audit';
import { queryActivity } from './query';

beforeEach(async () => {
  await db.activityLog.deleteMany();
  await db.user.deleteMany();
});

describe('queryActivity', () => {
  it('pagina y filtra por acción', async () => {
    for (let i = 0; i < 15; i++) await logActivity({ accion: 'auth.login' });
    await logActivity({ accion: 'auth.logout' });
    const p1 = await queryActivity({ accion: 'auth.login', page: 1, pageSize: 10 });
    expect(p1.rows).toHaveLength(10);
    expect(p1.total).toBe(15);
    const p2 = await queryActivity({ accion: 'auth.login', page: 2, pageSize: 10 });
    expect(p2.rows).toHaveLength(5);
  });

  it('incluye la etiqueta legible y el nombre del actor', async () => {
    const role = await db.role.findFirstOrThrow({ where: { nombre: 'Cajero' } });
    const u = await db.user.create({ data: { nombre: 'Zoe', email: 'z@pos.com', passwordHash: 'x', roleId: role.id } });
    await logActivity({ actorId: u.id, accion: 'auth.login' });
    const { rows } = await queryActivity({ page: 1, pageSize: 10 });
    expect(rows[0]).toMatchObject({ accionLabel: 'Inicio de sesión', actorNombre: 'Zoe' });
  });

  it('filtra por rango de fechas', async () => {
    await logActivity({ accion: 'auth.login' });
    const manana = new Date(Date.now() + 86_400_000);
    const { total } = await queryActivity({ desde: manana, page: 1, pageSize: 10 });
    expect(total).toBe(0);
  });
});
