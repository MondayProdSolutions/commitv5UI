'use client';

import { useActionState, useState, type FormEvent } from 'react';
import { useFormStatus } from 'react-dom';
import {
  buscarClientesAction,
  crearClienteInlineAction,
  type BuscarClientesState,
} from './actions';
import { inputClass, type SelectedCustomer } from './types';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';

const SEARCH_INITIAL: BuscarClientesState = { ok: false, hits: [] };

function SubmitBtn({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="secondary" size="sm" pending={pending} pendingLabel={pendingLabel}>
      {label}
    </Button>
  );
}

export function CustomerPicker({
  customer,
  genericCustomer,
  requiereFactura,
  canCrearCliente,
  onSelect,
  onRequiereFacturaChange,
}: {
  customer: SelectedCustomer;
  genericCustomer: { id: string; nombre: string };
  requiereFactura: boolean;
  canCrearCliente: boolean;
  onSelect: (c: SelectedCustomer) => void;
  onRequiereFacturaChange: (v: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);

  const [searchState, searchAction] = useActionState(buscarClientesAction, SEARCH_INITIAL);

  const [createErrors, setCreateErrors] = useState<Record<string, string>>({});
  const [createFormError, setCreateFormError] = useState<string | null>(null);
  const [createBusy, setCreateBusy] = useState(false);

  function selectGeneric() {
    onSelect({ id: genericCustomer.id, nombre: genericCustomer.nombre, facturable: false });
    onRequiereFacturaChange(false);
    setOpen(false);
  }

  async function handleCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const nombre = String(fd.get('nombre') ?? '').trim();

    setCreateBusy(true);
    setCreateErrors({});
    setCreateFormError(null);
    try {
      const res = await crearClienteInlineAction({ ok: false }, fd);
      if (res.ok && res.customerId) {
        const facturable = res.facturable ?? false;
        onSelect({ id: res.customerId, nombre, facturable });
        if (!facturable) onRequiereFacturaChange(false);
        setCreating(false);
        setOpen(false);
        return;
      }
      setCreateErrors(res.fieldErrors ?? {});
      setCreateFormError(res.formError ?? 'No se pudo crear el cliente.');
    } catch {
      setCreateFormError('No se pudo crear el cliente. Reintenta.');
    } finally {
      setCreateBusy(false);
    }
  }

  return (
    <div className="space-y-3 rounded-card border border-line bg-surface p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-ink-subtle">Cliente</p>
          <p className="font-medium text-ink">{customer.nombre}</p>
        </div>
        <Button type="button" variant="secondary" size="sm" onClick={() => setOpen((v) => !v)}>
          {open ? 'Cerrar' : 'Cambiar cliente'}
        </Button>
      </div>

      {customer.facturable ? (
        <label className="flex items-center gap-2 text-sm font-medium text-ink-muted">
          <input
            type="checkbox"
            checked={requiereFactura}
            onChange={(e) => onRequiereFacturaChange(e.target.checked)}
            className="h-4 w-4 rounded border-line-strong"
          />
          Requiere factura
        </label>
      ) : null}

      {open ? (
        <div className="space-y-3 border-t border-line pt-3">
          <form action={searchAction} className="flex items-end gap-2">
            <label className="block flex-1 space-y-1">
              <span className="text-sm font-medium text-ink-muted">Buscar cliente</span>
              <input
                name="q"
                placeholder="Nombre, teléfono, correo o RFC"
                className={inputClass}
                autoComplete="off"
              />
            </label>
            <SubmitBtn label="Buscar" pendingLabel="Buscando…" />
          </form>

          <button
            type="button"
            onClick={selectGeneric}
            className="text-sm text-ink-subtle hover:text-ink"
          >
            Usar {genericCustomer.nombre}
          </button>

          {searchState.ok && searchState.hits.length === 0 ? (
            <p className="text-sm text-ink-subtle">Sin resultados.</p>
          ) : null}

          {searchState.hits.length > 0 ? (
            <ul className="max-h-56 divide-y divide-line overflow-y-auto rounded-control border border-line">
              {searchState.hits.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onSelect({ id: c.id, nombre: c.nombre, facturable: c.facturable });
                      if (!c.facturable) onRequiereFacturaChange(false);
                      setOpen(false);
                    }}
                    className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-surface-raised"
                  >
                    <span>
                      {c.nombre}
                      {c.telefono ? <span className="text-ink-subtle"> · {c.telefono}</span> : null}
                    </span>
                    {c.facturable ? (
                      <span className="shrink-0">
                        <Badge tone="success">Facturable</Badge>
                      </span>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}

          {canCrearCliente ? (
            <div className="border-t border-line pt-3">
              {creating ? (
                <form onSubmit={handleCreate} className="space-y-2">
                  {createFormError ? (
                    <p className="rounded-control bg-danger-soft px-3 py-2 text-sm text-on-danger-soft">
                      {createFormError}
                    </p>
                  ) : null}
                  <label className="block space-y-1">
                    <span className="text-sm font-medium text-ink-muted">Nombre *</span>
                    <input name="nombre" required className={inputClass} />
                    {createErrors.nombre ? (
                      <span className="text-xs text-danger">{createErrors.nombre}</span>
                    ) : null}
                  </label>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <label className="block space-y-1">
                      <span className="text-sm font-medium text-ink-muted">Teléfono</span>
                      <input name="telefono" className={inputClass} />
                      {createErrors.telefono ? (
                        <span className="text-xs text-danger">{createErrors.telefono}</span>
                      ) : null}
                    </label>
                    <label className="block space-y-1">
                      <span className="text-sm font-medium text-ink-muted">Correo</span>
                      <input name="correo" type="email" className={inputClass} />
                      {createErrors.correo ? (
                        <span className="text-xs text-danger">{createErrors.correo}</span>
                      ) : null}
                    </label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      type="submit"
                      variant="primary"
                      size="sm"
                      pending={createBusy}
                      pendingLabel="Creando…"
                    >
                      Crear cliente
                    </Button>
                    <button
                      type="button"
                      onClick={() => setCreating(false)}
                      className="text-sm text-ink-subtle hover:text-ink"
                    >
                      Cancelar
                    </button>
                  </div>
                  <p className="text-xs text-ink-subtle">
                    El cliente se crea y queda seleccionado sin salir del punto de venta. Para datos
                    de facturación completos, edítalo luego en Clientes.
                  </p>
                </form>
              ) : (
                <button
                  type="button"
                  onClick={() => setCreating(true)}
                  className="text-sm font-medium text-ink-muted hover:text-ink"
                >
                  + Nuevo cliente
                </button>
              )}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
