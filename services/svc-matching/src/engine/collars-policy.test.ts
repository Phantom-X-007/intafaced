import { describe, expect, it } from 'vitest';
import { collarMagnitudesUnset } from './collars.js';

/** Duplicate mill lives in collars.test.ts. */
describe('collars-policy — alias of collars mill', () => {
  it('owner magnitudes stay unset, not zero', () => {
    expect(collarMagnitudesUnset()).toBe(true);
  });
});
