'use client';

import { useEffect, useRef } from 'react';
import type { MouseEvent } from 'react';
import { Button } from './Button';

/**
 * Confirmación de una acción destructiva/crítica (cancelar venta, cerrar
 * caja, archivar, ajustar inventario, desactivar usuario, borrar rol).
 * Usa el elemento `<dialog>` nativo — modal, backdrop y manejo de foco
 * vienen gratis del navegador, sin dependencia nueva. Cierra con Escape
 * (evento `cancel` nativo) o clic en el fondo; ambos casos notifican
 * `onOpenChange(false)` igual que el botón "Volver".
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  onConfirm,
  pending = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel: string;
  onConfirm: () => void;
  pending?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  function handleBackdropClick(e: MouseEvent<HTMLDialogElement>) {
    if (e.target === ref.current) onOpenChange(false);
  }

  return (
    <dialog
      ref={ref}
      onClose={() => onOpenChange(false)}
      onCancel={() => onOpenChange(false)}
      onClick={handleBackdropClick}
      className="m-auto w-full max-w-sm rounded-card border border-line bg-surface shadow-pop backdrop:bg-black/50"
    >
      <div className="p-5">
        <p className="text-base font-bold text-ink">{title}</p>
        <p className="mt-1.5 text-sm text-ink-muted">{description}</p>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" size="sm" type="button" onClick={() => onOpenChange(false)}>
            Volver
          </Button>
          <Button
            variant="danger-solid"
            size="sm"
            type="button"
            pending={pending}
            pendingLabel="Procesando…"
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </dialog>
  );
}
