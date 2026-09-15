'use server';

import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { requirePermission } from '@/lib/auth/context';
import { getClientIp } from '@/lib/http';
import { ValidationError } from '@/lib/errors';
import { movementSchema } from '@/lib/validation/movement';
import { recordMovement } from '@/lib/inventory/movements';
import { permisoParaTipo } from '@/lib/inventory/movement-perms';
import { searchProducts, type SearchHit } from '@/lib/catalog/search';
import { withTenant } from '@/lib/db';
import { requireRequestTenantId } from '@/lib/tenant/with-request-tenant';
import type { FormState } from '@/app/(auth)/setup/actions';

const MOVIMIENTOS_PATH = '/inventario/movimientos';

function fieldErrorsFrom(error: z.ZodError): Record<string, string> {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.map(String).join('.');
    if (key && !(key in fieldErrors)) fieldErrors[key] = issue.message;
  }
  return fieldErrors;
}

export async function registrarMovimientoAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const tipo = String(formData.get('tipo') ?? '');
  if (tipo !== 'ENTRADA' && tipo !== 'SALIDA' && tipo !== 'AJUSTE') {
    return { ok: false, fieldErrors: { tipo: 'Tipo de movimiento inválido.' } };
  }

  // `recordMovement` es una escritura; corre dentro de `withTenant` y el
  // `redirect()` va después de que la transacción ya hizo commit (ver la nota
  // en `caja/actions.ts`).
  const tenantId = await requireRequestTenantId();
  const error = await withTenant(tenantId, async (): Promise<FormState | null> => {
    const actor = await requirePermission(permisoParaTipo(tipo));

    const parsed = movementSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) {
      return { ok: false, fieldErrors: fieldErrorsFrom(parsed.error) };
    }

    try {
      await recordMovement({
        variantId: parsed.data.variantId,
        tipo: parsed.data.tipo,
        valor: parsed.data.valor,
        motivo: parsed.data.motivo,
        costoUnitario: parsed.data.costoUnitario ?? null,
        actorId: actor.id,
        ip: getClientIp(await headers()),
      });
    } catch (e) {
      if (e instanceof ValidationError) {
        return { ok: false, fieldErrors: e.fields, formError: e.message };
      }
      throw e;
    }
    return null;
  });
  if (error) return error;

  revalidatePath(MOVIMIENTOS_PATH);
  revalidatePath('/inventario');
  redirect(MOVIMIENTOS_PATH);
}

export type BuscarVariantesState = { ok: boolean; hits: SearchHit[] };

export async function buscarVariantesAction(
  _prev: BuscarVariantesState,
  formData: FormData,
): Promise<BuscarVariantesState> {
  const tenantId = await requireRequestTenantId();
  return withTenant(tenantId, async () => {
    await requirePermission('inventario.ver');
    const q = String(formData.get('q') ?? '');
    const hits = await searchProducts(q, { soloDisponibles: false, limit: 10 });
    return { ok: true, hits };
  });
}
