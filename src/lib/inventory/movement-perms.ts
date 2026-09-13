import type { PermissionKey } from '@/lib/auth/rbac';

export type MovementTipo = 'ENTRADA' | 'SALIDA' | 'AJUSTE';

/**
 * Única fuente del mapping tipo de movimiento → permiso requerido.
 * La usan tanto la página `inventario/movimientos/nuevo` (para calcular los
 * tipos permitidos sin generar filas `auth.forbidden`) como
 * `registrarMovimientoAction` (para exigir el permiso antes de mutar).
 */
export function permisoParaTipo(tipo: MovementTipo): PermissionKey {
  switch (tipo) {
    case 'ENTRADA':
      return 'inventario.entrada';
    case 'SALIDA':
      return 'inventario.salida';
    case 'AJUSTE':
      return 'inventario.ajustar';
    default: {
      const _exhaustive: never = tipo;
      throw new Error(`permisoParaTipo: tipo no soportado: ${String(_exhaustive)}`);
    }
  }
}
