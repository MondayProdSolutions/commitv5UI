import { db, withPlatformAdmin } from '@/lib/db';
import { ValidationError } from '@/lib/errors';

export type PlanSummary = { id: string; nombre: string; maxUsuarios: number; maxSucursales: number };

export async function listPlans(): Promise<PlanSummary[]> {
  return withPlatformAdmin(() => db.plan.findMany({ orderBy: { nombre: 'asc' } }));
}

export async function createPlan(input: {
  nombre: string;
  maxUsuarios: number;
  maxSucursales: number;
}): Promise<{ id: string }> {
  if (input.maxUsuarios < 1) throw new ValidationError({ maxUsuarios: 'Debe ser al menos 1' });
  if (input.maxSucursales < 1) throw new ValidationError({ maxSucursales: 'Debe ser al menos 1' });
  return withPlatformAdmin(() => db.plan.create({ data: input }));
}

export async function updatePlan(
  id: string,
  input: Partial<{ maxUsuarios: number; maxSucursales: number }>,
): Promise<void> {
  await withPlatformAdmin(() => db.plan.update({ where: { id }, data: input }));
}
