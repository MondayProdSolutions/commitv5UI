'use client';

import { useSyncExternalStore } from 'react';

type Theme = 'light' | 'dark';

function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
  return () => observer.disconnect();
}

function getSnapshot(): Theme {
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
}

/**
 * Toggle real de tema claro/oscuro. El tema inicial ya lo aplica el script
 * inline de `layout.tsx` (sin parpadeo); este control solo lo cambia y
 * persiste la elección en `localStorage`. Lee el estado directamente de la
 * clase `.dark` del `<html>` vía `useSyncExternalStore`, así no hay estado
 * duplicado que sincronizar.
 */
export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, getSnapshot, () => 'light' as Theme);
  const isDark = theme === 'dark';

  function toggle() {
    const next: Theme = isDark ? 'light' : 'dark';
    document.documentElement.classList.toggle('dark', next === 'dark');
    try {
      localStorage.setItem('theme', next);
    } catch {
      /* almacenamiento no disponible: el cambio sigue aplicando en esta sesión */
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isDark ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
      title={isDark ? 'Modo claro' : 'Modo oscuro'}
      className="inline-flex h-11 w-11 items-center justify-center rounded-control border border-line text-ink-muted transition-colors hover:bg-surface-raised hover:text-ink"
    >
      <span aria-hidden="true" className="text-lg">
        {isDark ? '☀' : '☾'}
      </span>
    </button>
  );
}
