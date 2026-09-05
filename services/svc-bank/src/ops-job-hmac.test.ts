import { describe, expect, it } from 'vitest';
import { TRPCError } from '@trpc/server';
import { JOB_CALLER, requireBankJobService } from './ops-job-hmac.js';

describe('requireBankJobService', () => {
  it('null is UNAUTHORIZED', () => {
    try {
      requireBankJobService(null);
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(TRPCError);
      expect(err).toMatchObject({ code: 'UNAUTHORIZED' });
    }
  });

  it('svc-trade is FORBIDDEN', () => {
    try {
      requireBankJobService('svc-trade');
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(TRPCError);
      expect(err).toMatchObject({ code: 'FORBIDDEN' });
    }
  });

  it('svc-bank passes', () => {
    expect(() => requireBankJobService(JOB_CALLER)).not.toThrow();
  });
});
