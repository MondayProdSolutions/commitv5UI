import { enmascararRfc } from '@/lib/customers/fiscal';
import type { SaleDetail } from '@/lib/sales/sales';
import { money, METODO_LABEL, fmtFechaMX } from './types';

export type DatosFiscales = {
  rfc: string;
  razonSocial: string;
  regimenFiscalCode: string;
  usoCfdiCode: string;
  cpFiscal: string;
};

/** Narrowing seguro del `Json?` que guarda `Sale.datosFiscales`. */
export function leerDatosFiscales(v: unknown): DatosFiscales | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  if (typeof o.rfc !== 'string' || o.rfc === '') return null;
  return {
    rfc: o.rfc,
    razonSocial: typeof o.razonSocial === 'string' ? o.razonSocial : '',
    regimenFiscalCode: typeof o.regimenFiscalCode === 'string' ? o.regimenFiscalCode : '',
    usoCfdiCode: typeof o.usoCfdiCode === 'string' ? o.usoCfdiCode : '',
    cpFiscal: typeof o.cpFiscal === 'string' ? o.cpFiscal : '',
  };
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

const TICKET_CSS = `
.ticket { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 12px; line-height: 1.45; color: #000; }
.ticket h1 { font-size: 14px; font-weight: 700; text-align: center; margin: 0 0 4px; }
.ticket .muted { color: #333; }
.ticket .center { text-align: center; }
.ticket hr { border: none; border-top: 1px dashed #999; margin: 6px 0; }
.ticket .row { display: flex; justify-content: space-between; gap: 8px; }
.ticket .row.total { font-weight: 700; font-size: 13px; }
.ticket .line-desc { white-space: pre-wrap; }
@media print {
  .no-print { display: none !important; }
  .ticket { font-size: 11px; }
}
`;

export function TicketView({ sale, negocio }: { sale: SaleDetail; negocio: string }) {
  const datosFiscales = leerDatosFiscales(sale.datosFiscales);
  const descuentos = sale.descuentoLineas + sale.descuentoTicket;
  // "Subtotal" impreso = base BRUTA, para que `Subtotal − Descuentos + IVA == Total`.
  const baseBruta = round2(sale.subtotal + sale.descuentoLineas + sale.descuentoTicket);

  return (
    <div className="ticket">
      <style dangerouslySetInnerHTML={{ __html: TICKET_CSS }} />

      <h1>{negocio}</h1>
      <p className="center muted">Comprobante no fiscal</p>

      <hr />

      <div className="row">
        <span>Folio</span>
        <span>{sale.folio}</span>
      </div>
      <div className="row">
        <span>Fecha</span>
        <span>{fmtFechaMX(sale.createdAt)}</span>
      </div>
      <div className="row">
        <span>Cajero</span>
        <span>{sale.cajeroNombre}</span>
      </div>
      <div className="row">
        <span>Cliente</span>
        <span>{sale.clienteNombre}</span>
      </div>
      {sale.estado === 'CANCELADA' ? <p className="center">*** VENTA CANCELADA ***</p> : null}

      <hr />

      {sale.lines.map((l) => {
        const desc = l.varianteNombre ? `${l.productoNombre} · ${l.varianteNombre}` : l.productoNombre;
        return (
          <div key={l.id} style={{ marginBottom: 4 }}>
            <div className="line-desc">{desc}</div>
            <div className="row">
              <span className="muted">
                {l.cantidad} × {money(l.precioUnitario)}
              </span>
              <span>{money(l.total)}</span>
            </div>
          </div>
        );
      })}

      <hr />

      <div className="row">
        <span>Subtotal</span>
        <span>{money(baseBruta)}</span>
      </div>
      {descuentos > 0 ? (
        <div className="row">
          <span>Descuentos</span>
          <span>-{money(descuentos)}</span>
        </div>
      ) : null}
      <div className="row">
        <span>IVA</span>
        <span>{money(sale.impuestos)}</span>
      </div>
      <div className="row total">
        <span>TOTAL</span>
        <span>{money(sale.total)}</span>
      </div>

      <hr />

      {sale.payments.map((p, i) => (
        <div className="row" key={`${p.metodo}-${i}`}>
          <span>{METODO_LABEL[p.metodo] ?? p.metodo}</span>
          <span>{money(p.monto)}</span>
        </div>
      ))}
      <div className="row">
        <span>CAMBIO</span>
        <span>{money(sale.cambio)}</span>
      </div>

      {sale.requiereFactura && datosFiscales ? (
        <>
          <hr />
          <p>Solicitó factura — RFC {enmascararRfc(datosFiscales.rfc)}</p>
        </>
      ) : null}

      <hr />
      <p className="center muted">Comprobante no fiscal</p>
    </div>
  );
}
