export function computeStock(
  tipo: 'ENTRADA' | 'SALIDA' | 'AJUSTE' | 'VENTA' | 'DEVOLUCION',
  stockPrevio: number,
  valor: number,
): { stockNuevo: number; delta: number } {
  switch (tipo) {
    case 'ENTRADA':
      return { stockNuevo: stockPrevio + valor, delta: valor };
    case 'SALIDA':
      return { stockNuevo: stockPrevio - valor, delta: -valor };
    case 'AJUSTE':
      return { stockNuevo: valor, delta: valor - stockPrevio };
    case 'VENTA':
      return { stockNuevo: stockPrevio - valor, delta: -valor };
    case 'DEVOLUCION':
      return { stockNuevo: stockPrevio + valor, delta: valor };
    default: {
      // Guarda exhaustiva: si Bloque 4 amplía los tipos (VENTA, DEVOLUCION),
      // un tipo sin `case` propio falla aquí en vez de heredar la semántica
      // de AJUSTE (fijar el stock a un valor absoluto) de forma silenciosa.
      const _exhaustive: never = tipo;
      throw new Error(`computeStock: tipo no soportado: ${String(_exhaustive)}`);
    }
  }
}
