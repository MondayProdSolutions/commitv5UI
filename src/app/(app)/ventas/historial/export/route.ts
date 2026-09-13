import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/context';
import { ForbiddenError } from '@/lib/errors';
import { parseDateParam } from '@/lib/activity/query';
import { db } from '@/lib/db';
import { listSales, type SaleRow } from '@/lib/sales/sales';
import { fmtFechaMX } from '../../types';

export const runtime = 'nodejs';

const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

// CSV: importe sin símbolo de moneda (a diferencia de `money` de `../../types`).
const money = (n: number) => n.toFixed(2);

const estadoLabel = (e: SaleRow['estado']) => (e === 'COMPLETADA' ? 'Completada' : 'Cancelada');

type Extra = {
  descuentos: number;
  subtotal: number;
  impuestos: number;
  metodos: string;
};

function toCsv(rows: SaleRow[], extra: Map<string, Extra>): string {
  const header =
    'Folio,Fecha,Cliente,Cajero,Nº líneas,Subtotal,Descuentos,IVA,Total,Estado,Métodos de pago';
  const lines = rows.map((r) => {
    const x = extra.get(r.id);
    return [
      r.folio,
      fmtFechaMX(r.fecha),
      r.cliente,
      r.cajero,
      String(r.nLineas),
      money(x?.subtotal ?? 0),
      money(x?.descuentos ?? 0),
      money(x?.impuestos ?? 0),
      money(r.total),
      estadoLabel(r.estado),
      x?.metodos ?? '',
    ]
      .map(esc)
      .join(',');
  });
  return [header, ...lines].join('\n') + '\n';
}

export async function GET(req: Request) {
  try {
    await requirePermission('ventas.ver');
  } catch (e) {
    if (e instanceof ForbiddenError) return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }

  const url = new URL(req.url);
  const rawEstado = url.searchParams.get('estado') ?? undefined;
  const estado =
    rawEstado === 'COMPLETADA' || rawEstado === 'CANCELADA' ? rawEstado : undefined;

  const { rows } = await listSales({
    q: url.searchParams.get('q')?.trim() || undefined,
    estado,
    cajeroId: url.searchParams.get('cajero')?.trim() || undefined,
    desde: parseDateParam(url.searchParams.get('desde')),
    hasta: parseDateParam(url.searchParams.get('hasta')),
    page: 1,
    pageSize: 5000,
  });

  // `SaleRow` no trae subtotal/descuentos/IVA ni métodos de pago: se recuperan
  // en una sola consulta y se mapean por id.
  const detalles = await db.sale.findMany({
    where: { id: { in: rows.map((r) => r.id) } },
    select: {
      id: true,
      subtotal: true,
      descuentoLineas: true,
      descuentoTicket: true,
      impuestos: true,
      payments: { select: { metodo: true } },
    },
  });

  const extra = new Map(
    detalles.map((d) => [
      d.id,
      {
        subtotal: Number(d.subtotal),
        descuentos: Number(d.descuentoLineas) + Number(d.descuentoTicket),
        impuestos: Number(d.impuestos),
        metodos: [...new Set(d.payments.map((p) => p.metodo))].join('; '),
      } satisfies Extra,
    ]),
  );

  const csv = '﻿' + toCsv(rows, extra);
  const fecha = new Date().toISOString().slice(0, 10);
  return new NextResponse(csv, {
    status: 200,
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="ventas-${fecha}.csv"`,
    },
  });
}
