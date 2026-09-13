'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { REGIMENES_FISCALES } from '@/lib/sat/regimenes-fiscales';
import { USOS_CFDI } from '@/lib/sat/usos-cfdi';
import { Button } from '@/components/ui/Button';
import { inputClass } from '@/app/(app)/ventas/types';
import { crearClienteAction, editarClienteAction } from './actions';
import type { FormState } from '@/app/(auth)/setup/actions';

type Initial = {
  id: string;
  nombre: string;
  telefono: string | null;
  correo: string | null;
  direccion: string | null;
  notas: string | null;
  rfc: string | null;
  razonSocial: string | null;
  regimenFiscalCode: string | null;
  usoCfdiCode: string | null;
  cpFiscal: string | null;
  correoFacturacion: string | null;
};

function Err({ msg }: { msg?: string }) {
  return msg ? <p className="mt-1 text-xs text-danger">{msg}</p> : null;
}

function SubmitBtn({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="primary" pending={pending} pendingLabel="Guardando…">
      {label}
    </Button>
  );
}

export function CustomerForm({
  mode,
  initial,
  readOnly = false,
  genericoLock = false,
}: {
  mode: 'crear' | 'editar';
  initial?: Initial;
  readOnly?: boolean;
  genericoLock?: boolean;
}) {
  const action = mode === 'crear' ? crearClienteAction : editarClienteAction;
  const [state, formAction] = useActionState<FormState, FormData>(action, { ok: false });
  const fe = state.fieldErrors ?? {};

  const fiscalConDatos = Boolean(
    initial?.rfc || initial?.razonSocial || initial?.regimenFiscalCode ||
    initial?.usoCfdiCode || initial?.cpFiscal,
  );
  const [fiscalOpen, setFiscalOpen] = useState(fiscalConDatos);

  const fiscalDisabled = readOnly || genericoLock;

  return (
    <form action={formAction} className="space-y-6">
      {mode === 'editar' && initial ? <input type="hidden" name="id" value={initial.id} /> : null}
      {state.formError ? (
        <p className="rounded-control bg-danger-soft px-3 py-2 text-sm text-on-danger-soft">{state.formError}</p>
      ) : null}
      {state.ok ? (
        <p className="rounded-control bg-success-soft px-3 py-2 text-sm text-on-success-soft">Cambios guardados.</p>
      ) : null}

      <fieldset className="space-y-4" disabled={readOnly}>
        <legend className="text-sm font-semibold uppercase tracking-wide text-ink-subtle">
          Datos de contacto
        </legend>
        <label className="block space-y-1">
          <span className="text-sm font-medium text-ink-muted">Nombre *</span>
          <input
            name="nombre"
            defaultValue={initial?.nombre ?? ''}
            className={inputClass}
            required
            readOnly={genericoLock}
          />
          <Err msg={fe.nombre} />
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block space-y-1">
            <span className="text-sm font-medium text-ink-muted">Teléfono</span>
            <input name="telefono" defaultValue={initial?.telefono ?? ''} className={inputClass} />
            <Err msg={fe.telefono} />
          </label>
          <label className="block space-y-1">
            <span className="text-sm font-medium text-ink-muted">Correo</span>
            <input name="correo" type="email" defaultValue={initial?.correo ?? ''} className={inputClass} />
            <Err msg={fe.correo} />
          </label>
        </div>
        <label className="block space-y-1">
          <span className="text-sm font-medium text-ink-muted">Dirección</span>
          <input name="direccion" defaultValue={initial?.direccion ?? ''} className={inputClass} />
          <Err msg={fe.direccion} />
        </label>
        <label className="block space-y-1">
          <span className="text-sm font-medium text-ink-muted">Notas</span>
          <textarea name="notas" defaultValue={initial?.notas ?? ''} rows={3} className={inputClass} />
          <Err msg={fe.notas} />
        </label>
      </fieldset>

      <div className="rounded-card border border-line">
        <button
          type="button"
          onClick={() => setFiscalOpen((v) => !v)}
          className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-semibold text-ink-muted"
        >
          Datos de facturación (CFDI)
          <span className="text-ink-subtle">{fiscalOpen ? '▲' : '▼'}</span>
        </button>
        <fieldset
          className={`space-y-4 px-4 pb-4 ${fiscalOpen ? '' : 'hidden'}`}
          disabled={fiscalDisabled}
        >
          <p className="text-xs text-ink-subtle">
            Deja esta sección vacía si el cliente no requiere factura. Si capturas un dato, se
            piden todos.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block space-y-1">
              <span className="text-sm font-medium text-ink-muted">RFC</span>
              <input name="rfc" defaultValue={initial?.rfc ?? ''} className={inputClass} />
              <Err msg={fe.rfc} />
            </label>
            <label className="block space-y-1">
              <span className="text-sm font-medium text-ink-muted">Razón social</span>
              <input name="razonSocial" defaultValue={initial?.razonSocial ?? ''} className={inputClass} />
              <Err msg={fe.razonSocial} />
            </label>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block space-y-1">
              <span className="text-sm font-medium text-ink-muted">Régimen fiscal</span>
              <select name="regimenFiscalCode" defaultValue={initial?.regimenFiscalCode ?? ''} className={inputClass}>
                <option value="">— Selecciona —</option>
                {REGIMENES_FISCALES.map((r) => (
                  <option key={r.code} value={r.code}>{r.code} — {r.label}</option>
                ))}
              </select>
              <Err msg={fe.regimenFiscalCode} />
            </label>
            <label className="block space-y-1">
              <span className="text-sm font-medium text-ink-muted">Uso de CFDI</span>
              <select name="usoCfdiCode" defaultValue={initial?.usoCfdiCode ?? ''} className={inputClass}>
                <option value="">— Selecciona —</option>
                {USOS_CFDI.map((u) => (
                  <option key={u.code} value={u.code}>{u.code} — {u.label}</option>
                ))}
              </select>
              <Err msg={fe.usoCfdiCode} />
            </label>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block space-y-1">
              <span className="text-sm font-medium text-ink-muted">Código postal fiscal</span>
              <input name="cpFiscal" defaultValue={initial?.cpFiscal ?? ''} className={inputClass} inputMode="numeric" />
              <Err msg={fe.cpFiscal} />
            </label>
            <label className="block space-y-1">
              <span className="text-sm font-medium text-ink-muted">Correo de facturación</span>
              <input name="correoFacturacion" type="email" defaultValue={initial?.correoFacturacion ?? ''} className={inputClass} />
              <Err msg={fe.correoFacturacion} />
            </label>
          </div>
        </fieldset>
      </div>

      {!readOnly ? <SubmitBtn label={mode === 'crear' ? 'Crear cliente' : 'Guardar cambios'} /> : null}
    </form>
  );
}
