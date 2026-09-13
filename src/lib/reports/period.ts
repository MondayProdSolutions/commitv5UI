export type ReportPeriod = { desde: Date; hasta: Date; etiqueta: string };

const MX_OFFSET = '-06:00'; // America/Mexico_City no observa horario de verano (abolido desde 2022).

/**
 * Copia local de `parseDateParam` (`@/lib/activity/query`) — NO se importa de
 * ahí porque ese módulo importa `@/lib/db` en su primera línea, lo que
 * arrastraría una dependencia de BD a este archivo y obligaría a que
 * `period.test.ts` fuera `.itest.ts` para probar lógica de fechas 100% pura.
 * Ver Global Constraints del plan.
 */
function parseFechaParam(s: string | undefined): Date | undefined {
  if (!s) return undefined;
  // Treat YYYY-MM-DD format as Mexico time date
  const match = s.match(/^\d{4}-\d{2}-\d{2}$/);
  if (match) {
    return new Date(`${s}T00:00:00${MX_OFFSET}`);
  }
  // Fallback to standard Date parsing for other formats
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

/** Clave de día natural en America/Mexico_City, formato YYYY-MM-DD (orden lexicográfico = orden cronológico). */
export function diaKeyMX(d: Date): string {
  return d.toLocaleDateString('en-CA', { timeZone: 'America/Mexico_City' });
}

function inicioDiaMX(d: Date): Date {
  return new Date(`${diaKeyMX(d)}T00:00:00${MX_OFFSET}`);
}

function finDiaMX(d: Date): Date {
  return new Date(`${diaKeyMX(d)}T23:59:59.999${MX_OFFSET}`);
}

function sumarDias(d: Date, n: number): Date {
  return new Date(d.getTime() + n * 24 * 60 * 60 * 1000);
}

type Atajo = 'hoy' | 'semana' | 'mes' | '30dias';

function esAtajo(v: string | undefined): v is Atajo {
  return v === 'hoy' || v === 'semana' || v === 'mes' || v === '30dias';
}

/**
 * Resuelve el período de un reporte a partir de los `searchParams` de la URL.
 * Prioridad: `desde`/`hasta` (rango personalizado) > `atajo` > default `'mes'`.
 * `hasta` es inclusivo hasta el final del día MX.
 */
export function resolvePeriod(params: {
  atajo?: string;
  desde?: string;
  hasta?: string;
}): ReportPeriod {
  const desdeParam = parseFechaParam(params.desde);
  const hastaParam = parseFechaParam(params.hasta);
  const ahora = new Date();

  if (desdeParam || hastaParam) {
    const desde = desdeParam ? inicioDiaMX(desdeParam) : inicioDiaMX(ahora);
    const hasta = hastaParam ? finDiaMX(hastaParam) : finDiaMX(ahora);
    return { desde, hasta, etiqueta: 'Rango personalizado' };
  }

  const atajo: Atajo = esAtajo(params.atajo) ? params.atajo : 'mes';
  const hoyKey = diaKeyMX(ahora);

  switch (atajo) {
    case 'hoy':
      return { desde: inicioDiaMX(ahora), hasta: finDiaMX(ahora), etiqueta: 'Hoy' };
    case 'semana': {
      const [y, m, dd] = hoyKey.split('-').map(Number);
      const refUTC = new Date(Date.UTC(y, m - 1, dd));
      const diaIso = refUTC.getUTCDay() === 0 ? 7 : refUTC.getUTCDay(); // 1=lunes .. 7=domingo
      const lunes = sumarDias(inicioDiaMX(ahora), -(diaIso - 1));
      return { desde: lunes, hasta: finDiaMX(ahora), etiqueta: 'Esta semana' };
    }
    case '30dias':
      return {
        desde: sumarDias(inicioDiaMX(ahora), -29),
        hasta: finDiaMX(ahora),
        etiqueta: 'Últimos 30 días',
      };
    case 'mes':
    default: {
      const [y, m] = hoyKey.split('-').map(Number);
      const primerDia = new Date(`${y}-${String(m).padStart(2, '0')}-01T00:00:00${MX_OFFSET}`);
      return { desde: primerDia, hasta: finDiaMX(ahora), etiqueta: 'Este mes' };
    }
  }
}
