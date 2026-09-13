import { describe, it, expect } from 'vitest';
import { computeStock } from './stock-calc';

describe('computeStock', () => {
  describe('ENTRADA', () => {
    it('suma el valor al stock previo', () => {
      const result = computeStock('ENTRADA', 0, 10);
      expect(result).toEqual({ stockNuevo: 10, delta: 10 });
    });

    it('suma cuando el stock previo es positivo', () => {
      const result = computeStock('ENTRADA', 5, 3);
      expect(result).toEqual({ stockNuevo: 8, delta: 3 });
    });
  });

  describe('SALIDA', () => {
    it('resta el valor del stock previo', () => {
      const result = computeStock('SALIDA', 10, 4);
      expect(result).toEqual({ stockNuevo: 6, delta: -4 });
    });

    it('puede resultar en stock negativo (sin validar)', () => {
      const result = computeStock('SALIDA', 2, 5);
      expect(result).toEqual({ stockNuevo: -3, delta: -5 });
    });
  });

  describe('AJUSTE', () => {
    it('reemplaza el stock previo con el nuevo valor', () => {
      const result = computeStock('AJUSTE', 5, 2);
      expect(result).toEqual({ stockNuevo: 2, delta: -3 });
    });

    it('calcula delta correctamente cuando el ajuste es mayor', () => {
      const result = computeStock('AJUSTE', 2, 8);
      expect(result).toEqual({ stockNuevo: 8, delta: 6 });
    });

    it('calcula delta correctamente cuando no hay cambio', () => {
      const result = computeStock('AJUSTE', 5, 5);
      expect(result).toEqual({ stockNuevo: 5, delta: 0 });
    });
  });

  describe('VENTA', () => {
    it('baja el stock como SALIDA', () => {
      expect(computeStock('VENTA', 10, 3)).toEqual({ stockNuevo: 7, delta: -3 });
    });
  });

  describe('DEVOLUCION', () => {
    it('sube el stock como ENTRADA', () => {
      expect(computeStock('DEVOLUCION', 10, 3)).toEqual({ stockNuevo: 13, delta: 3 });
    });
  });

  describe('tipo no soportado', () => {
    it('lanza para un tipo fuera de la unión (guarda exhaustiva)', () => {
      // La guarda exhaustiva ya cubre los 5 MovementType; un valor fuera de la
      // unión (defensa en runtime) debe fallar en vez de heredar la semántica
      // de AJUSTE de forma silenciosa.
      expect(() => computeStock('OTRO' as never, 10, 3)).toThrow(/tipo no soportado/);
    });
  });
});
