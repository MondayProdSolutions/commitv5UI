import { describe, it, expect } from 'vitest';
import { assertParentIsRoot, canHaveChildren } from './category-depth';
import { ValidationError } from '@/lib/errors';

describe('canHaveChildren', () => {
  it('returns true for root category (parentId is null)', () => {
    expect(canHaveChildren({ parentId: null })).toBe(true);
  });

  it('returns false for subcategory (parentId is not null)', () => {
    expect(canHaveChildren({ parentId: 'some-id' })).toBe(false);
  });
});

describe('assertParentIsRoot', () => {
  it('throws ValidationError when parent is null', () => {
    expect(() => assertParentIsRoot(null)).toThrow(ValidationError);
    try {
      assertParentIsRoot(null);
    } catch (e) {
      if (e instanceof ValidationError) {
        expect(e.fields).toHaveProperty('parentId');
      } else {
        throw e;
      }
    }
  });

  it('does not throw when parent is a root category', () => {
    expect(() => assertParentIsRoot({ parentId: null })).not.toThrow();
  });

  it('throws ValidationError when parent is a subcategory', () => {
    expect(() => assertParentIsRoot({ parentId: 'some-id' })).toThrow(ValidationError);
    try {
      assertParentIsRoot({ parentId: 'some-id' });
    } catch (e) {
      if (e instanceof ValidationError) {
        expect(e.fields).toHaveProperty('parentId');
      } else {
        throw e;
      }
    }
  });
});
