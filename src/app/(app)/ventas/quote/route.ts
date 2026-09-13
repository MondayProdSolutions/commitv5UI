import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/context';
import { ForbiddenError, ValidationError } from '@/lib/errors';
import { db } from '@/lib/db';
import { computeSale, type DescuentoInput, type SaleLineInput } from '@/lib/sales/compute';

export const runtime = 'nodejs';

type QuoteLinea = { variantId: string; cantidad: number; descuento: DescuentoInput };
type QuoteBody = { lineas: QuoteLinea[]; descuentoTicket: DescuentoInput };

function parseDescuento(v: unknown): DescuentoInput {
  if (v == null) return null;
  if (typeof v !== 'object') return undefined;
  const d = v as Record<string, unknown>;
  if ((d.tipo === 'monto' || d.tipo === 'porcentaje') && typeof d.valor === 'number') {
    return { tipo: d.tipo, valor: d.valor };
  }
  return undefined;
}

function parseBody(raw: unknown): QuoteBody | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const b = raw as Record<string, unknown>;
  if (!Array.isArray(b.lineas) || b.lineas.length === 0) return null;

  const lineas: QuoteLinea[] = [];
  for (const item of b.lineas) {
    if (typeof item !== 'object' || item === null) return null;
    const l = item as Record<string, unknown>;
    if (typeof l.variantId !== 'string' || l.variantId === '') return null;
    if (typeof l.cantidad !== 'number' || !Number.isFinite(l.cantidad)) return null;
    lineas.push({ variantId: l.variantId, cantidad: l.cantidad, descuento: parseDescuento(l.descuento) });
  }

  return { lineas, descuentoTicket: parseDescuento(b.descuentoTicket) };
}

export async function POST(req: Request) {
  try {
    await requirePermission('ventas.crear');
  } catch (e) {
    if (e instanceof ForbiddenError) return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }

  const body = parseBody(await req.json().catch(() => null));
  if (!body) return NextResponse.json({ error: 'Cuerpo inválido.' }, { status: 400 });

  const ids = [...new Set(body.lineas.map((l) => l.variantId))];
  const variants = await db.productVariant.findMany({
    where: { id: { in: ids } },
    include: { product: { include: { taxRate: true } } },
  });
  const byId = new Map(variants.map((v) => [v.id, v]));

  const computeLines: SaleLineInput[] = [];
  for (let i = 0; i < body.lineas.length; i++) {
    const l = body.lineas[i]!;
    const v = byId.get(l.variantId);
    if (!v || v.archivada || v.product.archivado || v.disponible === false) {
      return NextResponse.json(
        { error: 'Un producto ya no está disponible.', campo: `lineas.${i}.variantId` },
        { status: 400 },
      );
    }
    computeLines.push({
      variantId: v.id,
      cantidad: l.cantidad,
      precioUnitario: Number(v.precioVenta),
      tasaImpuesto: Number(v.product.taxRate.tasa),
      descuento: l.descuento ?? null,
    });
  }

  try {
    const result = computeSale({ lineas: computeLines, descuentoTicket: body.descuentoTicket ?? null });
    return NextResponse.json(result, { status: 200 });
  } catch (e) {
    if (e instanceof ValidationError) return NextResponse.json({ fieldErrors: e.fields }, { status: 400 });
    throw e;
  }
}
