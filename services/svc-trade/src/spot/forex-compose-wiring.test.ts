import { describe, expect, it } from 'vitest';
import { forexOwnerEnvComposeGapsClosed } from './forex-compose-wiring.js';

describe('trade.forex fleet compose wiring', () => {
  it('closes P0-05 settlement asset law compose gap', () => {
    expect(forexOwnerEnvComposeGapsClosed()).toBe(true);
  });
});
