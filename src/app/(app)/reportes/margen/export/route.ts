import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/context';
import { ForbiddenError } from '@/lib/errors';
import { resolvePeriod } from '@/lib/reports/period';
import { getMarginReport } from '@/lib/reports/margen';

export const runtime = 'nodejs';

const esc = (v: string): string => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
const money = (n: number): string => n.toFixed(2);

const HEADER = 'Producto,Unidades,Ingreso,Costo,Utilidad,% Margen';

export async function GET(req: Request): Promise<NextResponse> {
  try {
    await requirePermission('reportes.margen');
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
  const r = await getMarginReport(periodo);

  const lines = r.detalle.map((d) =>
    [d.nombre, String(d.unidades), money(d.ingreso), money(d.costo), money(d.utilidad), money(d.margenPct)]
      .map(esc)
      .join(','),
  );
  const csv = '﻿' + [HEADER, ...lines].join('\n') + '\n';
  const fecha = new Date().toISOString().slice(0, 10);
  return new NextResponse(csv, {
    status: 200,
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="reporte-margen-${fecha}.csv"`,
    },
  });
}
