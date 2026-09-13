import { describe, it, expect } from 'vitest';
import { createCategorySchema, updateCategorySchema } from './category';

describe('createCategorySchema', () => {
  it('acepta una categoría válida', () => {
    const r = createCategorySchema.safeParse({
      nombre: 'Electrónica',
    });
    expect(r.success).toBe(true);
  });

  it('acepta una categoría con parentId', () => {
    const r = createCategorySchema.safeParse({
      nombre: 'Laptops',
      parentId: 'cat-1',
    });
    expect(r.success).toBe(true);
  });

  it('transforma parentId vacío a null', () => {
    const r = createCategorySchema.safeParse({
      nombre: 'Laptops',
      parentId: '',
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.parentId).toBe(null);
    }
  });

  it('rechaza nombre muy corto', () => {
    const r = createCategorySchema.safeParse({
      nombre: 'A',
    });
    expect(r.success).toBe(false);
  });

  it('acepta nombre con espacios que se trimean', () => {
    const r = createCategorySchema.safeParse({
      nombre: '  Electrónica  ',
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.nombre).toBe('Electrónica');
    }
  });
});

describe('updateCategorySchema', () => {
  it('acepta una actualización válida', () => {
    const r = updateCategorySchema.safeParse({
      id: 'cat-1',
      nombre: 'Electrónica Actualizada',
    });
    expect(r.success).toBe(true);
  });

  it('requiere ID', () => {
    const r = updateCategorySchema.safeParse({
      id: '',
      nombre: 'Electrónica',
    });
    expect(r.success).toBe(false);
  });

  it('transforma parentId vacío a null', () => {
    const r = updateCategorySchema.safeParse({
      id: 'cat-1',
      nombre: 'Electrónica',
      parentId: '',
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.parentId).toBe(null);
    }
  });
});
