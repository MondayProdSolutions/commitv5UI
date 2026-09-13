import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { money, fmtFechaMX } from '@/app/(app)/ventas/types';
import type { CashSessionDetail } from '@/lib/cash/sessions';

/**
 * Resumen de una sesión de caja ABIERTA: fondo + lista de movimientos.
 * Extraído de la duplicación entre `PanelCajaAbierta` (pantalla `/caja`) y
 * `sesiones/[id]/page.tsx` (pantalla `/caja/sesiones/[id]` para la sesión que
 * sigue abierta). Arqueo a ciegas: NUNCA lee `esperadoEfectivo`/`diferencia`/
 * `efectivoContado` de `session` — solo `folio`, `abiertaPorNombre`,
 * `abiertaEn`, `fondoApertura` y `movements`.
 */
export function SesionAbiertaResumen({ session }: { session: CashSessionDetail }) {
  return (
    <>
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-ink">Caja {session.folio}</h2>
            <p className="text-sm text-ink-muted">
              Abierta por {session.abiertaPorNombre} · {fmtFechaMX(session.abiertaEn)}
            </p>
          </div>
          <div className="rounded-control bg-surface-raised px-3 py-2 text-right">
            <p className="text-xs font-medium uppercase tracking-wide text-ink-subtle">Fondo</p>
            <p className="text-lg font-bold tabular-nums text-ink">
              {money(session.fondoApertura)}
            </p>
          </div>
        </div>
      </Card>

      <Card>
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-subtle">
          Movimientos
        </h3>
        {session.movements.length === 0 ? (
          <p className="text-sm text-ink-subtle">Sin movimientos</p>
        ) : (
          <ul className="space-y-2">
            {session.movements.map((m) => (
              <li
                key={m.id}
                className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-2 text-sm last:border-0 last:pb-0"
              >
                <div className="flex items-center gap-2">
                  <Badge tone={m.tipo === 'RETIRO' ? 'warning' : 'success'}>
                    {m.tipo === 'RETIRO' ? 'Retiro' : 'Ingreso'}
                  </Badge>
                  <span className="font-medium text-ink">{money(m.monto)}</span>
                  <span className="text-ink-muted">{m.motivo}</span>
                </div>
                <span className="text-ink-subtle">
                  {m.actorNombre} · {fmtFechaMX(m.createdAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
