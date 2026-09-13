import type { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { computeStock } from './stock-calc';
import { logActivity } from '@/lib/audit';
import { ValidationError } from '@/lib/errors';
import { invalidateStockAlertsCache } from './stock';

export type MovementInput = {
  variantId: string;
  tipo: 'ENTRADA' | 'SALIDA' | 'AJUSTE' | 'VENTA' | 'DEVOLUCION';
  valor: number;
  motivo: string;
  costoUnitario?: number | null;
  actorId: string | null;
  ip?: string | null;
  referenciaTipo?: string;
  referenciaId?: string;
};

export type MovementResult = {
  movementId: string;
  stockPrevio: number;
  stockNuevo: number;
  delta: number;
};

async function run(tx: Prisma.TransactionClient, input: MovementInput): Promise<MovementResult> {
  const motivo = input.motivo.trim();
  if (!motivo) throw new ValidationError({ motivo: 'El motivo es obligatorio.' });
  if (
    (input.tipo === 'ENTRADA' ||
      input.tipo === 'SALIDA' ||
      input.tipo === 'VENTA' ||
      input.tipo === 'DEVOLUCION') &&
    (!Number.isInteger(input.valor) || input.valor <= 0)
  )
    throw new ValidationError({ valor: 'La cantidad debe ser un entero mayor que 0.' });
  if (input.tipo === 'AJUSTE' && (!Number.isInteger(input.valor) || input.valor < 0))
    throw new ValidationError({ valor: 'El stock objetivo no puede ser negativo.' });

  // Bloqueo de fila: serializa movimientos concurrentes sobre la misma variante.
  const locked = await tx.$queryRaw<{ id: string; stock: number; archivada: boolean }[]>`
    SELECT v.id, v.stock, (v.archivada OR p.archivado) AS archivada
    FROM "ProductVariant" v JOIN "Product" p ON p.id = v."productId"
    WHERE v.id = ${input.variantId}
    FOR UPDATE OF v`;
  const row = locked[0];
  if (!row) throw new ValidationError({ variantId: 'La variante no existe.' });
  if (row.archivada) throw new ValidationError({ variantId: 'La variante o su producto están archivados.' });

  const stockPrevio = Number(row.stock);
  // `computeStock` tiene una guarda exhaustiva: un `tipo` inesperado (p. ej. los
  // futuros VENTA/DEVOLUCION de Bloque 4) lanza aquí en vez de continuar en
  // silencio con semántica de AJUSTE.
  const { stockNuevo, delta } = computeStock(input.tipo, stockPrevio, input.valor);
  if (stockNuevo < 0)
    throw new ValidationError({ valor: `Stock insuficiente: disponible ${stockPrevio}.` });

  await tx.productVariant.update({
    where: { id: input.variantId },
    data: {
      stock: stockNuevo,
      ...(input.tipo === 'ENTRADA' && input.costoUnitario != null
        ? { precioCompra: input.costoUnitario }
        : {}),
    },
  });

  const mov = await tx.inventoryMovement.create({
    data: {
      variantId: input.variantId,
      tipo: input.tipo,
      cantidad: delta,
      stockPrevio,
      stockNuevo,
      costoUnitario: input.tipo === 'ENTRADA' ? (input.costoUnitario ?? null) : null,
      motivo,
      referenciaTipo: input.referenciaTipo ?? null,
      referenciaId: input.referenciaId ?? null,
      actorId: input.actorId,
    },
  });

  await logActivity(
    {
      actorId: input.actorId,
      accion: 'inventario.movimiento',
      entidad: 'ProductVariant',
      entidadId: input.variantId,
      metadata: { tipo: input.tipo, delta, stockPrevio, stockNuevo, motivo, costoUnitario: input.costoUnitario ?? null },
      ip: input.ip ?? null,
    },
    tx,
  );

  return { movementId: mov.id, stockPrevio, stockNuevo, delta };
}

export async function recordMovement(
  input: MovementInput,
  tx?: Prisma.TransactionClient,
): Promise<MovementResult> {
  if (tx) return run(tx, input);
  const result = await db.$transaction((t) => run(t, input));
  invalidateStockAlertsCache();
  return result;
}
