import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/context';
import { queryActivity, parseDateParam } from '@/lib/activity/query';
import { toCsv } from '@/lib/activity/csv';
import { ForbiddenError } from '@/lib/errors';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  try {
    await requirePermission('auditoria.ver');
  } catch (e) {
    if (e instanceof ForbiddenError) return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }
  const url = new URL(req.url);
  const { rows } = await queryActivity({
    actorId: url.searchParams.get('actor') ?? undefined,
    accion: url.searchParams.get('accion') ?? undefined,
    desde: parseDateParam(url.searchParams.get('desde')),
    hasta: parseDateParam(url.searchParams.get('hasta')),
    page: 1,
    pageSize: 5000,
  });
  const csv = '﻿' + toCsv(rows);
  const fecha = new Date().toISOString().slice(0, 10);
  return new NextResponse(csv, {
    status: 200,
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="auditoria-${fecha}.csv"`,
    },
  });
}
