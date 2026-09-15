'use client';

import { useState } from 'react';
import { usePathname } from 'next/navigation';

type Turn = { role: 'user' | 'model'; text: string };

const MAX_HISTORY = 12;

export function AssistantWidget({
  supportEmail,
  supportPhone,
}: {
  supportEmail?: string;
  supportPhone?: string;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Turn[]>([]);
  const [input, setInput] = useState('');
  const [showErrorField, setShowErrorField] = useState(false);
  const [errorVisible, setErrorVisible] = useState('');
  const [loading, setLoading] = useState(false);
  const [escalate, setEscalate] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const hasSupportContact = Boolean(supportEmail || supportPhone);

  async function send() {
    const mensaje = input.trim();
    if (!mensaje || loading) return;

    const userTurn: Turn = { role: 'user', text: mensaje };
    const nextMessages = [...messages, userTurn];
    setMessages(nextMessages);
    setInput('');
    setNotice(null);
    setLoading(true);

    try {
      const res = await fetch('/api/asistente', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          mensaje,
          pathname,
          errorVisible: errorVisible.trim() || undefined,
          historial: messages.slice(-MAX_HISTORY),
        }),
      });

      if (res.status === 429) {
        const data = (await res.json().catch(() => null)) as { retryAfterSec?: number } | null;
        setNotice(`Demasiadas preguntas seguidas. Espera ${data?.retryAfterSec ?? 60} segundos.`);
        return;
      }
      if (!res.ok) {
        setNotice('No se pudo enviar tu pregunta. Intenta de nuevo.');
        return;
      }

      const data = (await res.json()) as { reply: string; escalate: boolean };
      setMessages([...nextMessages, { role: 'model', text: data.reply }]);
      setEscalate(data.escalate);
    } catch {
      setNotice('Sin conexión con el asistente. Intenta de nuevo.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed bottom-4 right-4 z-40 flex flex-col items-end gap-2">
      {open && (
        <div className="flex h-[28rem] w-[22rem] max-w-[calc(100vw-2rem)] flex-col rounded-card border border-line bg-surface shadow-card">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <span className="text-sm font-semibold text-ink">Asistente del sistema</span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-ink-muted hover:text-ink"
              aria-label="Cerrar asistente"
            >
              ✕
            </button>
          </div>

          <div className="flex-1 space-y-2 overflow-y-auto px-4 py-3">
            {messages.length === 0 && (
              <p className="text-sm text-ink-muted">
                Pregunta sobre cualquier módulo del sistema o describe un error para recibir ayuda paso a paso.
              </p>
            )}
            {messages.map((m, i) => (
              <div
                key={i}
                className={
                  'max-w-[85%] rounded-control px-3 py-2 text-sm ' +
                  (m.role === 'user'
                    ? 'ml-auto bg-primary text-on-primary'
                    : 'bg-surface-raised text-ink')
                }
              >
                {m.text}
              </div>
            ))}
            {loading && <div className="text-sm text-ink-muted">Escribiendo…</div>}
            {notice && <div className="text-sm text-danger">{notice}</div>}
            {escalate && (
              <div className="rounded-control border border-line-strong bg-surface-raised px-3 py-2 text-sm text-ink">
                ¿Sigue sin resolverse? Contacta a soporte técnico
                {hasSupportContact ? (
                  <>
                    {supportEmail ? ` en ${supportEmail}` : ''}
                    {supportPhone ? ` o al ${supportPhone}` : ''}.
                  </>
                ) : (
                  ' con tu administrador.'
                )}
              </div>
            )}
          </div>

          <div className="border-t border-line px-4 py-3">
            {showErrorField && (
              <input
                type="text"
                value={errorVisible}
                onChange={(e) => setErrorVisible(e.target.value)}
                placeholder="Ej. 'Error al cerrar caja: el total no cuadra'"
                className="mb-2 w-full rounded-control border border-line-strong bg-canvas px-2 py-1.5 text-sm text-ink"
              />
            )}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowErrorField((v) => !v)}
                className="shrink-0 text-ink-muted hover:text-ink"
                title="Reportar un error visible en pantalla"
                aria-label="Reportar un error visible en pantalla"
              >
                ⚠
              </button>
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void send();
                }}
                placeholder="Escribe tu pregunta…"
                className="min-w-0 flex-1 rounded-control border border-line-strong bg-canvas px-2 py-1.5 text-sm text-ink"
              />
              <button
                type="button"
                onClick={() => void send()}
                disabled={loading || !input.trim()}
                className="shrink-0 rounded-control bg-primary px-3 py-1.5 text-sm font-medium text-on-primary hover:bg-primary-hover disabled:opacity-60"
              >
                Enviar
              </button>
            </div>
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex h-12 w-12 items-center justify-center rounded-full bg-primary text-on-primary shadow-primary hover:bg-primary-hover"
        aria-label={open ? 'Cerrar asistente' : 'Abrir asistente'}
      >
        {open ? '✕' : '?'}
      </button>
    </div>
  );
}
