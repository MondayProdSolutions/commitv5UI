import type { CashSessionDetail } from '@/lib/cash/sessions';
import { money, fmtFechaMX } from '@/app/(app)/ventas/types';
import { Badge } from '@/components/ui/Badge';

const CORTE_CSS = `
.corte { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 12px; line-height: 1.45; color: #000; }
.corte h1 { font-size: 14px; font-weight: 700; text-align: center; margin: 0 0 4px; }
.corte .muted { color: #333; }
.corte .center { text-align: center; }
.corte hr { border: none; border-top: 1px dashed #999; margin: 6px 0; }
.corte .row { display: flex; justify-content: space-between; gap: 8px; }
.corte .row.total { font-weight: 700; font-size: 13px; }
.corte .mov { display: flex; justify-content: space-between; gap: 8px; padding-left: 8px; }
@media print {
  .no-print { display: none !important; }
  .corte { font-size: 11px; }
}
`;

function DiferenciaBadge({ diferencia }: { diferencia: number }) {
  if (diferencia === 0) return <Badge tone="success">Cuadra</Badge>;
  if (diferencia > 0) return <Badge tone="warning">Sobrante +{money(diferencia)}</Badge>;
  return <Badge tone="danger">Faltante −{money(Math.abs(diferencia))}</Badge>;
}

/**
 * Desglose del corte de caja, formato tira ~80 mm. Render puro, reutilizado
 * por `/caja/sesiones/[id]` (detalle) y `/caja-corte/[id]` (versión imprimible).
 *
 * Precondición: `session.estado === 'CERRADA'` — los campos de cierre
 * (`cerradaEn`, `efectivoContado`, `esperadoEfectivo`, `diferencia`, los
 * `total*` y `nVentas`) están garantizados no-nulos por el llamador.
 */
export function CorteView({ session, negocio }: { session: CashSessionDetail; negocio: string }) {
  const retiros = session.movements.filter((m) => m.tipo === 'RETIRO');
  const ingresos = session.movements.filter((m) => m.tipo === 'INGRESO');

  return (
    <div className="corte">
      <style dangerouslySetInnerHTML={{ __html: CORTE_CSS }} />

      <h1>{negocio}</h1>
      <p className="center muted">CORTE DE CAJA</p>

      <hr />

      <div className="row">
        <span>Folio</span>
        <span>{session.folio}</span>
      </div>
      <div className="row">
        <span>Apertura</span>
        <span>{fmtFechaMX(session.abiertaEn)}</span>
      </div>
      <div className="row">
        <span>Cierre</span>
        <span>{fmtFechaMX(session.cerradaEn!)}</span>
      </div>
      <p className="muted">Abrió: {session.abiertaPorNombre}</p>
      <p className="muted">Cerró: {session.cerradaPorNombre}</p>

      <hr />

      <div className="row">
        <span>Fondo de apertura</span>
        <span>{money(session.fondoApertura)}</span>
      </div>

      <hr />

      <p className="muted">Ventas ({session.nVentas})</p>
      <div className="row">
        <span>Efectivo (neto)</span>
        <span>{money(session.totalEfectivoVentas!)}</span>
      </div>
      <div className="row">
        <span>Tarjeta</span>
        <span>{money(session.totalTarjeta!)}</span>
      </div>
      <div className="row">
        <span>Transferencia</span>
        <span>{money(session.totalTransferencia!)}</span>
      </div>

      <hr />

      <div className="row">
        <span>Reembolsos en efectivo</span>
        <span>{money(session.totalReembolsosEfectivo!)}</span>
      </div>

      <hr />

      <p className="muted">Retiros ({money(session.totalRetiros!)})</p>
      {retiros.length === 0 ? (
        <p className="mov muted">— Sin retiros —</p>
      ) : (
        retiros.map((m) => (
          <div className="mov" key={m.id}>
            <span>{m.motivo}</span>
            <span>{money(m.monto)}</span>
          </div>
        ))
      )}

      <p className="muted">Ingresos ({money(session.totalIngresos!)})</p>
      {ingresos.length === 0 ? (
        <p className="mov muted">— Sin ingresos —</p>
      ) : (
        ingresos.map((m) => (
          <div className="mov" key={m.id}>
            <span>{m.motivo}</span>
            <span>{money(m.monto)}</span>
          </div>
        ))
      )}

      <hr />

      <div className="row">
        <span>Esperado en efectivo</span>
        <span>{money(session.esperadoEfectivo!)}</span>
      </div>
      <div className="row">
        <span>Contado</span>
        <span>{money(session.efectivoContado!)}</span>
      </div>
      <div className="row total">
        <span>Diferencia</span>
        <DiferenciaBadge diferencia={session.diferencia!} />
      </div>

      {session.notaCierre ? (
        <>
          <hr />
          <p>Nota: {session.notaCierre}</p>
        </>
      ) : null}

      <hr />
      <p className="center muted">Documento interno — no fiscal</p>
    </div>
  );
}
