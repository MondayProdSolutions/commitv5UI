import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/context';
import { ForbiddenError } from '@/lib/errors';
import { parseDateParam } from '@/lib/activity/query';
import { listMovements, type MovementRow } from '@/lib/inventory/query';

export const runtime = 'nodejs';

const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

const fmtFecha = (d: Date) =>
  new Intl.DateTimeFormat('es-MX', { dateStyle: 'short', timeStyle: 'medium' }).format(d);

function toCsv(rows: MovementRow[]): string {
  const header =
    'Fecha,Producto,Variante,Tipo,Cantidad,Stock previo,Stock nuevo,Motivo,Usuario,Costo unitario';
  const lines = rows.map((r) =>
    [
      fmtFecha(r.createdAt),
      r.productoNombre,
      r.varianteNombre ?? '',
      r.tipoLabel,
      String(r.cantidad),
      String(r.stockPrevio),
      String(r.stockNuevo),
      r.motivo,
      r.actorNombre ?? 'Sistema',
      r.costoUnitario == null ? '' : String(r.costoUnitario),
    ]
      .map(esc)
      .join(','),
  );
  return [header, ...lines].join('\n') + '\n';
}

export async function GET(req: Request) {
  try {
    await requirePermission('inventario.ver');
  } catch (e) {
    if (e instanceof ForbiddenError) return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }

  const url = new URL(req.url);
  const rawTipo = url.searchParams.get('tipo') ?? undefined;
  const tipo = rawTipo && ['ENTRADA', 'SALIDA', 'AJUSTE'].includes(rawTipo) ? rawTipo : undefined;

  const { rows } = await listMovements({
    productId: url.searchParams.get('productId') ?? undefined,
    tipo,
    desde: parseDateParam(url.searchParams.get('desde')),
    hasta: parseDateParam(url.searchParams.get('hasta')),
    actorId: url.searchParams.get('actorId') ?? undefined,
    page: 1,
    pageSize: 5000,
  });

  const csv = '﻿' + toCsv(rows);
  const fecha = new Date().toISOString().slice(0, 10);
  return new NextResponse(csv, {
    status: 200,
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="movimientos-${fecha}.csv"`,
    },
  });
}
