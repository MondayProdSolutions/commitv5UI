'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

const ACTIVITY_EVENTS = ['mousemove', 'keydown', 'click', 'scroll'] as const;
const HEARTBEAT_THROTTLE_MS = 30_000;
const WARNING_LEAD_SECONDS = 60;

async function sendHeartbeat(): Promise<void> {
  try {
    await fetch('/api/session/heartbeat', { method: 'POST', keepalive: true });
  } catch {
    /* la red puede fallar; el proxy es la autoridad real */
  }
}

export function InactivityWatcher({ idleTimeoutMinutes }: { idleTimeoutMinutes: number }) {
  const totalSeconds = Math.max(Math.round(idleTimeoutMinutes * 60), 120);
  const warnAfterSeconds = Math.max(totalSeconds - WARNING_LEAD_SECONDS, 30);

  const lastActivityRef = useRef<number>(0);
  const lastHeartbeatRef = useRef<number>(0);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const stayConnected = useCallback(() => {
    lastActivityRef.current = Date.now();
    lastHeartbeatRef.current = Date.now();
    setSecondsLeft(null);
    void sendHeartbeat();
  }, []);

  // Actividad del usuario: reinicia el contador y late (throttled a 30s).
  useEffect(() => {
    lastActivityRef.current = Date.now();
    const onActivity = () => {
      const now = Date.now();
      lastActivityRef.current = now;
      if (now - lastHeartbeatRef.current >= HEARTBEAT_THROTTLE_MS) {
        lastHeartbeatRef.current = now;
        void sendHeartbeat();
      }
    };
    for (const ev of ACTIVITY_EVENTS) {
      window.addEventListener(ev, onActivity, { passive: true });
    }
    return () => {
      for (const ev of ACTIVITY_EVENTS) window.removeEventListener(ev, onActivity);
    };
  }, []);

  // Reloj de 1s: decide si mostrar el aviso, la cuenta atrás o redirigir.
  useEffect(() => {
    const id = window.setInterval(() => {
      if (lastActivityRef.current === 0) return;
      const idleSeconds = (Date.now() - lastActivityRef.current) / 1000;
      if (idleSeconds >= totalSeconds) {
        // Navegación dura a propósito: recarga el documento para descartar todo
        // el estado de cliente tras el cierre forzado de sesión.
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination
        window.location.href = '/login?motivo=inactividad';
        return;
      }
      if (idleSeconds >= warnAfterSeconds) {
        setSecondsLeft(Math.max(Math.ceil(totalSeconds - idleSeconds), 0));
      } else {
        setSecondsLeft((prev) => (prev === null ? prev : null));
      }
    }, 1000);
    return () => window.clearInterval(id);
  }, [totalSeconds, warnAfterSeconds]);

  const open = secondsLeft !== null;

  // Accesibilidad del modal: foco al botón y Esc = "Seguir conectado".
  useEffect(() => {
    if (!open) return;
    buttonRef.current?.focus();
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        stayConnected();
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [open, stayConnected]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="inactivity-title"
      aria-describedby="inactivity-desc"
    >
      <div className="w-full max-w-sm rounded-card bg-surface p-6 shadow-xl">
        <h2 id="inactivity-title" className="text-lg font-semibold text-ink">
          Tu sesión se cerrará por inactividad
        </h2>
        <p id="inactivity-desc" className="mt-2 text-sm text-ink-muted">
          Por seguridad cerraremos tu sesión en{' '}
          <span className="font-semibold tabular-nums">{secondsLeft}</span>{' '}
          segundo{secondsLeft === 1 ? '' : 's'}.
        </p>
        <div className="mt-5 flex justify-end">
          <button
            ref={buttonRef}
            type="button"
            onClick={stayConnected}
            className="rounded-control bg-primary px-4 py-2 text-sm font-medium text-on-primary hover:bg-primary-hover"
          >
            Seguir conectado
          </button>
        </div>
      </div>
    </div>
  );
}
