import { describe, expect, it } from 'vitest';
import { TRPCError } from '@trpc/server';
import { JOB_CALLER, authorizeTokenJobHttp, requireTokenJobService } from './job-hmac.js';

describe('requireTokenJobService', () => {
  it('null is UNAUTHORIZED', () => {
    try {
      requireTokenJobService(null);
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(TRPCError);
      expect(err).toMatchObject({ code: 'UNAUTHORIZED' });
    }
  });

  it('svc-trade is FORBIDDEN', () => {
    try {
      requireTokenJobService('svc-trade');
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(TRPCError);
      expect(err).toMatchObject({ code: 'FORBIDDEN' });
    }
  });

  it('svc-cron is FORBIDDEN — not an unpublished allowlist', () => {
    try {
      requireTokenJobService('svc-cron');
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(TRPCError);
      expect(err).toMatchObject({ code: 'FORBIDDEN' });
    }
  });

  it('svc-token passes', () => {
    expect(() => requireTokenJobService(JOB_CALLER)).not.toThrow();
  });
});

describe('authorizeTokenJobHttp', () => {
  it('null is 401 token.unauthenticated', () => {
    expect(authorizeTokenJobHttp(null)).toEqual({
      ok: false,
      status: 401,
      code: 'token.unauthenticated',
      error: 'service credentials required',
    });
  });

  it('svc-trade is 403 token.forbidden', () => {
    expect(authorizeTokenJobHttp('svc-trade')).toEqual({
      ok: false,
      status: 403,
      code: 'token.forbidden',
      error: 'token job is callable only as svc-token',
    });
  });

  it('svc-token passes', () => {
    expect(authorizeTokenJobHttp(JOB_CALLER)).toEqual({ ok: true, service: JOB_CALLER });
  });
});
