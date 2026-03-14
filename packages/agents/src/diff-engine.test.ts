import { describe, it, expect } from 'vitest';
import { diffProducts } from './diff-engine.js';
import type { DbProduct, DfsProduct } from './diff-engine.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeDb(overrides: Partial<DbProduct> = {}): DbProduct {
  return {
    asin: 'B000000001',
    current_price: 9.99,
    availability: 'available',
    source_image_url: 'https://m.media-amazon.com/images/original.jpg',
    rating: 4.5,
    ...overrides,
  };
}

function makeDfs(overrides: Partial<DfsProduct> = {}): DfsProduct {
  return {
    asin: 'B000000001',
    price: 9.99,
    imageUrl: 'https://m.media-amazon.com/images/original.jpg',
    rating: 4.5,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Price change tests
// ---------------------------------------------------------------------------

describe('price changes', () => {
  it('triggers rebuild when price changes beyond epsilon', () => {
    const result = diffProducts(
      [makeDb({ current_price: 9.99 })],
      [makeDfs({ price: 12.99 })],
    );
    expect(result.changes).toHaveLength(1);
    expect(result.changes[0].type).toBe('price');
    expect(result.changes[0].old).toBe(9.99);
    expect(result.changes[0].new).toBe(12.99);
    expect(result.shouldRebuild).toBe(true);
    expect(result.rebuildReason).toBe('price');
  });

  it('does NOT trigger rebuild when price difference is within epsilon (< 0.01)', () => {
    const result = diffProducts(
      [makeDb({ current_price: 9.99 })],
      [makeDfs({ price: 9.991 })],
    );
    const priceChanges = result.changes.filter((c) => c.type === 'price');
    expect(priceChanges).toHaveLength(0);
    expect(result.shouldRebuild).toBe(false);
  });

  it('triggers rebuild when price goes from null to a number', () => {
    const result = diffProducts(
      [makeDb({ current_price: null })],
      [makeDfs({ price: 19.99 })],
    );
    const priceChanges = result.changes.filter((c) => c.type === 'price');
    expect(priceChanges).toHaveLength(1);
    expect(priceChanges[0].old).toBeNull();
    expect(priceChanges[0].new).toBe(19.99);
    expect(result.shouldRebuild).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Rating change tests
// ---------------------------------------------------------------------------

describe('rating changes', () => {
  it('does NOT trigger rebuild when only rating changes', () => {
    const result = diffProducts(
      [makeDb({ rating: 4.5 })],
      [makeDfs({ rating: 3.8 })],
    );
    const ratingChanges = result.changes.filter((c) => c.type === 'rating');
    expect(ratingChanges).toHaveLength(1);
    expect(ratingChanges[0].type).toBe('rating');
    expect(result.shouldRebuild).toBe(false);
    expect(result.rebuildReason).toBe('none');
  });
});

// ---------------------------------------------------------------------------
// SERP-absent tests
// ---------------------------------------------------------------------------

describe('SERP-absent products', () => {
  it('puts SERP-absent ASIN in serpAbsentAsins, not in changes', () => {
    const result = diffProducts(
      [makeDb({ asin: 'B000000002' })],
      [], // empty DFS result
    );
    expect(result.serpAbsentAsins).toContain('B000000002');
    expect(result.changes).toHaveLength(0);
  });

  it('returns all DB products in serpAbsentAsins when DFS result is empty', () => {
    const dbProducts = [
      makeDb({ asin: 'B000000001' }),
      makeDb({ asin: 'B000000002' }),
      makeDb({ asin: 'B000000003' }),
    ];
    const result = diffProducts(dbProducts, []);
    expect(result.serpAbsentAsins).toHaveLength(3);
    expect(result.serpAbsentAsins).toEqual(
      expect.arrayContaining(['B000000001', 'B000000002', 'B000000003']),
    );
    expect(result.changes).toHaveLength(0);
    expect(result.shouldRebuild).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Image change tests
// ---------------------------------------------------------------------------

describe('image changes', () => {
  it('triggers rebuild when image URL changes and source_image_url is set', () => {
    const result = diffProducts(
      [makeDb({ source_image_url: 'https://m.media-amazon.com/images/old.jpg' })],
      [makeDfs({ imageUrl: 'https://m.media-amazon.com/images/new.jpg' })],
    );
    const imageChanges = result.changes.filter((c) => c.type === 'image');
    expect(imageChanges).toHaveLength(1);
    expect(imageChanges[0].old).toBe('https://m.media-amazon.com/images/old.jpg');
    expect(result.shouldRebuild).toBe(true);
    expect(result.rebuildReason).toBe('image');
  });

  it('skips image diff when source_image_url is null in DB', () => {
    const result = diffProducts(
      [makeDb({ source_image_url: null })],
      [makeDfs({ imageUrl: 'https://m.media-amazon.com/images/new.jpg' })],
    );
    const imageChanges = result.changes.filter((c) => c.type === 'image');
    expect(imageChanges).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Mixed / compound tests
// ---------------------------------------------------------------------------

describe('compound changes', () => {
  it('shouldRebuild is false when only rating changes', () => {
    const result = diffProducts(
      [makeDb({ rating: 4.5, current_price: 9.99, source_image_url: 'https://m.media-amazon.com/images/same.jpg' })],
      [makeDfs({ rating: 3.0, price: 9.99, imageUrl: 'https://m.media-amazon.com/images/same.jpg' })],
    );
    expect(result.shouldRebuild).toBe(false);
    expect(result.changes.every((c) => c.type === 'rating')).toBe(true);
  });

  it('shouldRebuild is true when price changes alongside a rating change', () => {
    const result = diffProducts(
      [makeDb({ current_price: 9.99, rating: 4.5 })],
      [makeDfs({ price: 14.99, rating: 3.5 })],
    );
    const types = result.changes.map((c) => c.type);
    expect(types).toContain('price');
    expect(types).toContain('rating');
    expect(result.shouldRebuild).toBe(true);
    expect(result.rebuildReason).toBe('price');
  });
});
