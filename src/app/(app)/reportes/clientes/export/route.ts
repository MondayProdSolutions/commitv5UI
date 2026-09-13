import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/context';
import { ForbiddenError } from '@/lib/errors';
import { resolvePeriod } from '@/lib/reports/period';
import { getCustomersReport } from '@/lib/reports/clientes';
import { fmtFechaMX } from '@/app/(app)/ventas/types';

export const runtime = 'nodejs';

const esc = (v: string): string => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
const money = (n: number): string => n.toFixed(2);

const HEADER = 'Cliente,Compras,Monto neto,Ticket promedio,Última compra';

export async function GET(req: Request): Promise<NextResponse> {
  try {
    await requirePermission('reportes.ver');
  } catch (e) {
    if (e instanceof ForbiddenError) return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }

  const url = new URL(req.url);
  const periodo = resolvePeriod({
    atajo: url.searchParams.get('atajo') ?? undefined,
    desde: url.searchParams.get('desde') ?? undefined,
    hasta: url.searchParams.get('hasta') ?? undefined,
  });
  const r = await getCustomersReport(periodo);

  const lines = r.detalle.map((c) =>
    [c.nombre, String(c.compras), money(c.montoNeto), money(c.ticketPromedio), fmtFechaMX(c.ultimaCompra)]
      .map(esc)
      .join(','),
  );
  const csv = '﻿' + [HEADER, ...lines].join('\n') + '\n';
  const fecha = new Date().toISOString().slice(0, 10);
  return new NextResponse(csv, {
    status: 200,
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="reporte-clientes-${fecha}.csv"`,
    },
  });
}
