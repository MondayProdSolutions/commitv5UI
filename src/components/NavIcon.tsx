import type { SVGProps } from 'react';

/**
 * Iconos de navegación — trazo, 20px, `currentColor`. Se usan sobre todo en
 * el riel compacto del Punto de venta (sidebar colapsado a 76px); en el
 * sidebar completo acompañan a la etiqueta.
 */
const PATHS: Record<string, string> = {
  '/dashboard': 'M3 10.5 12 3l9 7.5M5 9.5V21h14V9.5',
  '/admin/usuarios': 'M16 21v-2a4 4 0 0 0-8 0v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z',
  '/admin/roles': 'M12 3l7 4v5c0 4-3 7-7 9-4-2-7-5-7-9V7l7-4Z',
  '/admin/auditoria': 'M9 11l3 3 6-6M4 5h16v14H4z',
  '/admin/configuracion': 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM19 12a7 7 0 0 0-.1-1l2-1.6-2-3.4-2.4 1a7 7 0 0 0-1.7-1L14.5 2h-5l-.3 2.5a7 7 0 0 0-1.7 1l-2.4-1-2 3.4L3 11a7 7 0 0 0 0 2l-2 1.6 2 3.4 2.4-1a7 7 0 0 0 1.7 1L9.5 22h5l.3-2.5a7 7 0 0 0 1.7-1l2.4 1 2-3.4-2-1.6a7 7 0 0 0 .1-1Z',
  '/productos': 'M20 7 12 3 4 7l8 4 8-4ZM4 7v10l8 4 8-4V7M12 11v10',
  '/categorias': 'M4 5h16M4 12h16M4 19h10',
  '/inventario': 'M3 7h18v13H3zM3 7l2-4h14l2 4M9 12h6',
  '/clientes': 'M17 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM22 21v-2a4 4 0 0 0-3-3.9',
  '/ventas': 'M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4H6ZM3 6h18M16 10a4 4 0 0 1-8 0',
  '/ventas/historial': 'M12 8v4l3 2M4 12a8 8 0 1 0 16 0A8 8 0 0 0 4 12ZM4 6v4h4',
  '/caja': 'M2 8h20v11H2zM2 8l3-4h14l3 4M12 13h.01M6 19v2M18 19v2',
  '/reportes': 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  '/perfil': 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM4 21a8 8 0 0 1 16 0',
};

export function NavIcon({ href, ...props }: { href: string } & SVGProps<SVGSVGElement>) {
  const d = PATHS[href] ?? 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Z';
  return (
    <svg
      viewBox="0 0 24 24"
      width={20}
      height={20}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <path d={d} />
    </svg>
  );
}
