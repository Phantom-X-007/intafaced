import { describe, expect, it } from 'vitest';
import { copyOwnerLawComposeGapsClosed } from './copy-compose-wiring.js';

describe('trade.copy fleet compose wiring', () => {
  it('closes fee-share and jurisdiction owner-law compose gaps', () => {
    expect(copyOwnerLawComposeGapsClosed()).toBe(true);
  });
});
