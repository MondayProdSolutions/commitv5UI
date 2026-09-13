import type { ReactNode } from 'react';

/** Contenedor estándar. Reemplaza el `<div className="rounded-card border ... bg-surface p-...">` repetido a mano en cada pantalla. */
export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={'rounded-card border border-line bg-surface p-5 shadow-card ' + className}>
      {children}
    </div>
  );
}
