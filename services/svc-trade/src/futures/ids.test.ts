import { describe, expect, it } from 'vitest';
import { positionIdFor } from './ids.js';

describe('positionIdFor', () => {
  it('is stable for the same (user, market, clientOpenId)', () => {
    const a = positionIdFor('user-1', 'mkt-1', 'intent-A');
    const b = positionIdFor('user-1', 'mkt-1', 'intent-A');
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  });

  it('differs across users, markets, and client keys', () => {
    const base = positionIdFor('user-1', 'mkt-1', 'intent-A');
    expect(positionIdFor('user-2', 'mkt-1', 'intent-A')).not.toBe(base);
    expect(positionIdFor('user-1', 'mkt-2', 'intent-A')).not.toBe(base);
    expect(positionIdFor('user-1', 'mkt-1', 'intent-B')).not.toBe(base);
  });
});
