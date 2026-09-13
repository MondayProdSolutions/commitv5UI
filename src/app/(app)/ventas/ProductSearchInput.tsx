'use client';

import { useRef, useState, type FormEvent } from 'react';
import { buscarProductosAction, type SearchHitLite } from './actions';
import { inputClass, money, type AddItem } from './types';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';

const INITIAL = { ok: false as const, hits: [] as SearchHitLite[] };

function hitToItem(h: SearchHitLite): AddItem {
  return {
    variantId: h.variantId,
    productoNombre: h.productoNombre,
    varianteNombre: h.varianteNombre,
    precioConImpuesto: h.precioConImpuesto,
    stock: h.stock,
  };
}

export function ProductSearchInput({ onAdd }: { onAdd: (item: AddItem) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [hits, setHits] = useState<SearchHitLite[]>([]);
  const [searched, setSearched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function clearInput() {
    if (inputRef.current) inputRef.current.value = '';
    inputRef.current?.focus();
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const q = inputRef.current?.value.trim() ?? '';
    if (q === '') return;

    setLoading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.set('q', q);
      const res = await buscarProductosAction(INITIAL, fd);
      setSearched(true);

      if (!res.ok) {
        setHits([]);
        setError('No se pudo completar la búsqueda. Reintenta.');
        return;
      }

      // Atajo de código exacto: si hay coincidencia exacta de código de barras,
      // se añade directamente y se limpia el input.
      const exact = res.hits.find((h) => h.exactBarcode);
      if (exact) {
        onAdd(hitToItem(exact));
        setHits([]);
        setSearched(false);
        clearInput();
        return;
      }
      setHits(res.hits);
    } catch {
      setError('No se pudo completar la búsqueda. Reintenta.');
    } finally {
      setLoading(false);
    }
  }

  function pick(h: SearchHitLite) {
    onAdd(hitToItem(h));
    setHits([]);
    setSearched(false);
    clearInput();
  }

  return (
    <Card className="space-y-3">
      <form onSubmit={handleSubmit} className="flex items-end gap-2">
        <label className="block flex-1 space-y-1">
          <span className="text-sm font-medium text-ink-muted">Buscar producto</span>
          <input
            ref={inputRef}
            name="q"
            autoFocus
            placeholder="Nombre, SKU o código de barras (Enter)"
            className={inputClass}
            autoComplete="off"
          />
        </label>
        <Button type="submit" variant="secondary" pending={loading} pendingLabel="Buscando…">
          Buscar
        </Button>
      </form>

      {error ? <p className="text-sm text-danger">{error}</p> : null}

      {!error && searched && hits.length === 0 ? (
        <p className="text-sm text-ink-subtle">Sin resultados.</p>
      ) : null}

      {hits.length > 0 ? (
        <ul className="max-h-72 divide-y divide-line overflow-y-auto rounded-control border border-line">
          {hits.map((h) => (
            <li key={h.variantId}>
              <button
                type="button"
                onClick={() => pick(h)}
                className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-surface-raised"
              >
                <span>
                  {h.varianteNombre
                    ? `${h.productoNombre} · ${h.varianteNombre}`
                    : h.productoNombre}
                  {h.sku ? <span className="text-ink-subtle"> · {h.sku}</span> : null}
                </span>
                <span className="shrink-0 tabular-nums text-ink-subtle">
                  {money(h.precioConImpuesto)} · stock {h.stock}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </Card>
  );
}
