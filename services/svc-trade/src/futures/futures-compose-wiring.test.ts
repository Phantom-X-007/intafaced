import { describe, expect, it } from 'vitest';
import { futuresOwnerComposeGapsClosed } from './futures-compose-wiring.js';

describe('trade.futures fleet compose wiring', () => {
  it('closes owner ladder, funding, and leverage compose gaps', () => {
    expect(futuresOwnerComposeGapsClosed()).toBe(true);
  });
});
