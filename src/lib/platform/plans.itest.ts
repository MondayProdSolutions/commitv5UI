import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { db, withPlatformAdmin } from '@/lib/db';
import { createPlan, listPlans, updatePlan } from './plans';

const NOMBRE = 't-plan-itest';

beforeEach(async () => {
  await withPlatformAdmin(() => db.plan.deleteMany({ where: { nombre: NOMBRE } }));
});
afterAll(async () => {
  await withPlatformAdmin(() => db.plan.deleteMany({ where: { nombre: NOMBRE } }));
});

describe('createPlan / listPlans / updatePlan', () => {
  it('crea un plan y aparece en el listado', async () => {
    const { id } = await createPlan({ nombre: NOMBRE, maxUsuarios: 5, maxSucursales: 1 });
    const planes = await listPlans();
    expect(planes.find((p) => p.id === id)?.maxUsuarios).toBe(5);
  });

  it('actualiza los límites de un plan existente', async () => {
    const { id } = await createPlan({ nombre: NOMBRE, maxUsuarios: 5, maxSucursales: 1 });
    await updatePlan(id, { maxUsuarios: 20 });
    const planes = await listPlans();
    expect(planes.find((p) => p.id === id)?.maxUsuarios).toBe(20);
  });
});
