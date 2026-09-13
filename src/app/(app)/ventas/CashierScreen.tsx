'use client';

import { useActionState, useCallback, useEffect, useMemo, useState } from 'react';
import type { CategoryNode } from '@/lib/catalog/categories';
import type { FormState } from '@/app/(auth)/setup/actions';
import { crearVentaAction } from './actions';
import { ProductSearchInput } from './ProductSearchInput';
import { CategoryGrid } from './CategoryGrid';
import { CartTable } from './CartTable';
import { CustomerPicker } from './CustomerPicker';
import { DiscountPopover } from './DiscountPopover';
import { PaymentPanel } from './PaymentPanel';
import { TotalsPanel } from './TotalsPanel';
import { Button } from '@/components/ui/Button';
import {
  money,
  type AddItem,
  type CartLine,
  type Descuento,
  type PagoRow,
  type SaleComputeResult,
  type SelectedCustomer,
} from './types';

const CREATE_INITIAL: FormState = { ok: false };

export function CashierScreen({
  tree,
  genericCustomer,
  canDescuento,
  canCrearCliente,
}: {
  tree: CategoryNode[];
  genericCustomer: { id: string; nombre: string };
  canDescuento: boolean;
  canCrearCliente: boolean;
}) {
  const [cart, setCart] = useState<CartLine[]>([]);
  const [customer, setCustomer] = useState<SelectedCustomer>({
    id: genericCustomer.id,
    nombre: genericCustomer.nombre,
    facturable: false,
  });
  const [requiereFactura, setRequiereFactura] = useState(false);
  const [descuentoTicket, setDescuentoTicket] = useState<Descuento | null>(null);
  const [ticketDescOpen, setTicketDescOpen] = useState(false);
  const [quote, setQuote] = useState<SaleComputeResult | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [quoteSig, setQuoteSig] = useState<string | null>(null);
  const [payingOpen, setPayingOpen] = useState(false);
  const [pagos, setPagos] = useState<PagoRow[]>([]);

  const [createState, createAction] = useActionState(crearVentaAction, CREATE_INITIAL);

  // --- Carrito ---------------------------------------------------------------
  const addToCart = useCallback((item: AddItem) => {
    setCart((prev) => {
      const existing = prev.find((l) => l.variantId === item.variantId);
      if (existing) {
        return prev.map((l) =>
          l.variantId === item.variantId ? { ...l, cantidad: l.cantidad + 1 } : l,
        );
      }
      return [
        ...prev,
        {
          key: crypto.randomUUID(),
          variantId: item.variantId,
          productoNombre: item.productoNombre,
          varianteNombre: item.varianteNombre,
          precioConImpuesto: item.precioConImpuesto,
          stock: item.stock,
          cantidad: 1,
          descuento: null,
        },
      ];
    });
  }, []);

  const setQty = useCallback((key: string, cantidad: number) => {
    const n = Math.trunc(cantidad);
    setCart((prev) =>
      prev.map((l) => (l.key === key ? { ...l, cantidad: n >= 1 ? n : 1 } : l)),
    );
  }, []);

  const removeLine = useCallback((key: string) => {
    setCart((prev) => prev.filter((l) => l.key !== key));
  }, []);

  const setLineDescuento = useCallback((key: string, d: Descuento | null) => {
    setCart((prev) => prev.map((l) => (l.key === key ? { ...l, descuento: d } : l)));
  }, []);

  // Firma del carrito + descuento de ticket. La cotización guardada solo es
  // válida si su firma coincide con la del carrito actual; mientras una petición
  // nueva está en vuelo la firma no cuadra y no se muestra dinero desfasado.
  const cartSig =
    JSON.stringify(cart.map((c) => [c.variantId, c.cantidad, c.descuento])) +
    '::' +
    JSON.stringify(descuentoTicket);

  // --- Cotización (única fuente del dinero mostrado) ------------------------
  useEffect(() => {
    if (cart.length === 0) return;
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      void (async () => {
        let nextQuote: SaleComputeResult | null = null;
        let nextError: string | null = null;
        try {
          const res = await fetch('/ventas/quote', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              lineas: cart.map((c) => ({
                variantId: c.variantId,
                cantidad: c.cantidad,
                descuento: c.descuento,
              })),
              descuentoTicket,
            }),
            signal: ctrl.signal,
          });
          if (res.ok) {
            nextQuote = (await res.json()) as SaleComputeResult;
          } else {
            nextError = 'No se pudo calcular el total. Revisa el carrito y los descuentos.';
          }
        } catch {
          if (ctrl.signal.aborted) return;
          nextError = 'No se pudo calcular el total.';
        }
        if (ctrl.signal.aborted) return;
        setQuote(nextQuote);
        setQuoteError(nextError);
        setQuoteSig(cartSig);
      })();
    }, 250);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [cart, descuentoTicket, cartSig]);

  // El carrito vacío, o una cotización cuya firma ya no cuadra (petición en
  // vuelo), no tienen dinero válido que mostrar.
  const quoteFresh = cart.length > 0 && quoteSig === cartSig;
  const activeQuote = quoteFresh ? quote : null;
  const activeQuoteError = quoteFresh ? quoteError : null;
  const total = activeQuote?.total ?? 0;

  const payload = useMemo(
    () =>
      JSON.stringify({
        customerId: customer.id === genericCustomer.id ? '' : customer.id,
        lineas: cart.map((c) => ({
          variantId: c.variantId,
          cantidad: c.cantidad,
          descuento: c.descuento,
        })),
        descuentoTicket,
        pagos: pagos
          .filter((p) => Number.isFinite(p.monto) && p.monto > 0)
          .map((p) => ({ metodo: p.metodo, monto: p.monto })),
        requiereFactura: customer.facturable ? requiereFactura : false,
      }),
    [cart, customer, genericCustomer.id, descuentoTicket, pagos, requiereFactura],
  );

  const ticketBtnLabel = descuentoTicket
    ? descuentoTicket.tipo === 'porcentaje'
      ? `${descuentoTicket.valor}%`
      : money(descuentoTicket.valor)
    : 'Añadir descuento';

  const handleRequiereFactura = useCallback((v: boolean) => setRequiereFactura(v), []);
  const handleSelectCustomer = useCallback((c: SelectedCustomer) => setCustomer(c), []);

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <ProductSearchInput onAdd={addToCart} />
        <CategoryGrid tree={tree} onAdd={addToCart} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="space-y-4">
          <CartTable
            lines={cart}
            quote={activeQuote}
            canDescuento={canDescuento}
            onQty={setQty}
            onRemove={removeLine}
            onDescuento={setLineDescuento}
          />

          {canDescuento ? (
            <div className="relative flex items-center justify-between rounded-card border border-line bg-surface p-4">
              <span className="text-sm font-medium text-ink-muted">Descuento al ticket</span>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setTicketDescOpen((v) => !v)}
              >
                {ticketBtnLabel}
              </Button>
              {ticketDescOpen ? (
                <DiscountPopover
                  value={descuentoTicket}
                  onApply={(d) => setDescuentoTicket(d)}
                  onClear={() => setDescuentoTicket(null)}
                  onClose={() => setTicketDescOpen(false)}
                />
              ) : null}
            </div>
          ) : null}

          <CustomerPicker
            customer={customer}
            genericCustomer={genericCustomer}
            requiereFactura={requiereFactura}
            canCrearCliente={canCrearCliente}
            onSelect={handleSelectCustomer}
            onRequiereFacturaChange={handleRequiereFactura}
          />

          {activeQuoteError ? (
            <p className="rounded-control bg-danger-soft px-3 py-2 text-sm text-on-danger-soft">
              {activeQuoteError}
            </p>
          ) : null}
        </div>

        <div className="space-y-4 lg:sticky lg:top-6 lg:self-start lg:max-h-[calc(100vh-3rem)] lg:overflow-y-auto">
          <TotalsPanel quote={activeQuote} />

          {!payingOpen ? (
            <Button
              type="button"
              variant="primary"
              className="w-full"
              onClick={() => setPayingOpen(true)}
              disabled={!activeQuote}
            >
              Cobrar {activeQuote ? `· ${money(total)}` : ''}
            </Button>
          ) : (
            <form action={createAction} className="space-y-3">
              <input type="hidden" name="payload" value={payload} />
              <PaymentPanel
                total={total}
                pagos={pagos}
                onChange={setPagos}
                formError={createState.formError}
                fieldErrors={createState.fieldErrors}
              />
              <Button
                type="button"
                variant="secondary"
                className="w-full"
                onClick={() => setPayingOpen(false)}
              >
                Volver al carrito
              </Button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
