import { describe, expect, it } from 'vitest';
import { TRPCError } from '@trpc/server';
import { requireSettleService, SETTLE_CALLER } from './settle-hmac.js';

describe('requireSettleService', () => {
  it('null is UNAUTHORIZED', () => {
    try {
      requireSettleService(null);
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(TRPCError);
      expect(err).toMatchObject({ code: 'UNAUTHORIZED' });
    }
  });

  it('svc-trade is FORBIDDEN', () => {
    try {
      requireSettleService('svc-trade');
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(TRPCError);
      expect(err).toMatchObject({ code: 'FORBIDDEN' });
    }
  });

  it('svc-agents passes', () => {
    expect(() => requireSettleService(SETTLE_CALLER)).not.toThrow();
  });
});
