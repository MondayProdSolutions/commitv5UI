import { findSectionByKeywords } from './manual';

const MAX_EXCERPT_CHARS = 1400;

type ModuleEntry = { prefix: string; modulo: string; keywords: string[] };

// Prefijos más largos primero: el matcher toma el primero que calce.
const MODULE_MAP: ModuleEntry[] = [
  { prefix: '/ventas/historial', modulo: 'Historial de ventas', keywords: ['Consultar el historial'] },
  { prefix: '/ventas', modulo: 'Punto de venta (POS)', keywords: ['Registrar una venta', 'Cobrar'] },
  { prefix: '/caja', modulo: 'Caja', keywords: ['Cerrar la caja', 'Abrir la caja'] },
  { prefix: '/productos', modulo: 'Productos', keywords: ['Crear un producto sencillo'] },
  { prefix: '/categorias', modulo: 'Categorías', keywords: ['Crear una categoría raíz'] },
  { prefix: '/inventario', modulo: 'Inventario', keywords: ['Ver el stock y buscar', 'Registrar una entrada de stock'] },
  { prefix: '/clientes', modulo: 'Clientes', keywords: ['Ver y buscar clientes'] },
  { prefix: '/reportes', modulo: 'Reportes', keywords: ['Elegir el período de un reporte'] },
  { prefix: '/asistencia', modulo: 'Asistencia', keywords: ['Registrar tu entrada y salida'] },
  { prefix: '/admin/usuarios', modulo: 'Administración de usuarios', keywords: ['Crear un usuario'] },
  { prefix: '/admin/roles', modulo: 'Roles y permisos', keywords: ['Ver los roles'] },
  { prefix: '/admin/auditoria', modulo: 'Auditoría', keywords: ['Consultar la auditoría'] },
  { prefix: '/admin/configuracion', modulo: 'Configuración', keywords: ['tiempo de cierre por inactividad'] },
  { prefix: '/perfil', modulo: 'Perfil', keywords: ['Tu perfil: editar tus datos'] },
  { prefix: '/dashboard', modulo: 'Inicio', keywords: ['Iniciar sesión'] },
];

/**
 * Límites reales del sistema (Bloque final del manual). Se inyectan siempre en el
 * prompt para que el agente nunca ofrezca una función que el ERP no tiene
 * (timbrado de CFDI, envío por correo/WhatsApp, recuperar contraseña por email, etc.).
 */
export const SYSTEM_BOUNDARIES = [
  'No emite ni timbra facturas (CFDI). Solo guarda y valida los datos de facturación del cliente y marca la venta como "requiere factura".',
  'No sube imágenes de producto.',
  'No recupera contraseñas por correo: un administrador o gerente hace el restablecimiento.',
  'No borra usuarios, roles con uso, categorías, productos, variantes ni clientes: se archivan o desactivan.',
  'No permite deshacer un cierre de caja, una cancelación de venta ni una devolución.',
  'La pantalla de Configuración solo tiene un ajuste: el tiempo de inactividad.',
  'No cierra solo un turno de asistencia que cruza la medianoche; un Administrador debe cerrarlo a mano.',
  'No envía tickets ni comprobantes por email o WhatsApp, ni tiene pantalla de configuración de impresoras: la impresión de tickets es la del navegador/SO.',
] as const;

export type ModuleContext = { modulo: string; excerpt: string | null };

/** Dado el pathname actual, resuelve el módulo visible y un extracto relevante del manual. */
export function getModuleContext(pathname: string): ModuleContext {
  const entry = MODULE_MAP.find((m) => pathname === m.prefix || pathname.startsWith(m.prefix + '/'));
  if (!entry) return { modulo: 'General', excerpt: null };

  const section = findSectionByKeywords(entry.keywords);
  if (!section) return { modulo: entry.modulo, excerpt: null };

  const body = section.body.trim();
  const excerpt = body.length > MAX_EXCERPT_CHARS ? body.slice(0, MAX_EXCERPT_CHARS) + '…' : body;
  return { modulo: entry.modulo, excerpt: `${section.title}\n${excerpt}` };
}
