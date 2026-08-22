import { describe, expect, it } from 'vitest';
import { mmSpreadSkewBandsComposeWired } from './mm-compose-wiring.js';

describe('execution.market-making fleet compose wiring', () => {
  it('svc-execution passes spread/skew owner bands env through', () => {
    expect(mmSpreadSkewBandsComposeWired()).toBe(true);
  });
});
