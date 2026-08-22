import { describe, expect, it } from 'vitest';
import { dexFeeOwnerEnvComposeGapsClosed } from './dex-fee-compose-wiring.js';

describe('socket.dex-fee-source fleet compose wiring', () => {
  it('closes CLOB fee + settlement cost compose gaps', () => {
    expect(dexFeeOwnerEnvComposeGapsClosed()).toBe(true);
  });
});
