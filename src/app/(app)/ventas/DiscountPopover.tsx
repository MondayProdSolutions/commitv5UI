'use client';

import { useState } from 'react';
import { inputClass, type Descuento } from './types';
import { Button } from '@/components/ui/Button';

export function DiscountPopover({
  value,
  onApply,
  onClear,
  onClose,
}: {
  value: Descuento | null;
  onApply: (d: Descuento) => void;
  onClear: () => void;
  onClose: () => void;
}) {
  const [tipo, setTipo] = useState<'monto' | 'porcentaje'>(value?.tipo ?? 'monto');
  const [valor, setValor] = useState<string>(value ? String(value.valor) : '');

  const n = Number(valor);
  const valido = valor.trim() !== '' && Number.isFinite(n) && n > 0 && (tipo !== 'porcentaje' || n <= 100);

  function apply() {
    if (!valido) return;
    onApply({ tipo, valor: n });
    onClose();
  }

  return (
    <div className="absolute right-0 z-20 mt-1 w-64 rounded-control border border-line bg-surface p-3 shadow-pop">
      <div className="space-y-2">
        <label className="block space-y-1">
          <span className="text-xs font-medium text-ink-muted">Tipo</span>
          <select
            value={tipo}
            onChange={(e) => setTipo(e.target.value === 'porcentaje' ? 'porcentaje' : 'monto')}
            className={inputClass}
          >
            <option value="monto">Monto ($)</option>
            <option value="porcentaje">Porcentaje (%)</option>
          </select>
        </label>
        <label className="block space-y-1">
          <span className="text-xs font-medium text-ink-muted">Valor</span>
          <input
            type="number"
            inputMode="decimal"
            step="0.01"
            min={0}
            max={tipo === 'porcentaje' ? 100 : undefined}
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            className={inputClass}
            autoFocus
          />
        </label>
        <div className="flex items-center justify-between gap-2 pt-1">
          <button
            type="button"
            onClick={() => {
              onClear();
              onClose();
            }}
            className="text-xs text-ink-subtle hover:text-ink"
          >
            Quitar
          </button>
          <div className="flex gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="button" variant="primary" size="sm" onClick={apply} disabled={!valido}>
              Aplicar
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
