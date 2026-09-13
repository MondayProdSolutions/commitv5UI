import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/context';
import { ForbiddenError } from '@/lib/errors';
import { resolvePeriod } from '@/lib/reports/period';
import { getSalesReport } from '@/lib/reports/ventas';

export const runtime = 'nodejs';

const esc = (v: string): string => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
const money = (n: number): string => n.toFixed(2);

const HEADER = 'Fecha,Ventas,Ingreso bruto,Devoluciones,Ingreso neto,IVA';

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
  const r = await getSalesReport(periodo);

  const lines = r.tendenciaDiaria.map((d) =>
    [d.fecha, String(d.ventas), money(d.ingresoBruto), money(d.devoluciones), money(d.ingresoNeto), money(d.iva)]
      .map(esc)
      .join(','),
  );
  const csv = '﻿' + [HEADER, ...lines].join('\n') + '\n';
  const fecha = new Date().toISOString().slice(0, 10);
  return new NextResponse(csv, {
    status: 200,
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="reporte-ventas-${fecha}.csv"`,
    },
  });
}
