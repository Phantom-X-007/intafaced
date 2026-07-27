import { describe, expect, it } from 'vitest';
import { TRPCError } from '@trpc/server';
import {
  SERVICE_HEADER,
  SERVICE_TIMESTAMP_HEADER,
  SERVICE_SIGNATURE_HEADER,
  SERVICE_CALL_MAX_SKEW_SECONDS,
  ServiceAuthError,
  requireServiceCaller,
  serviceAuthHeaders,
  signServiceCall,
  verifyServiceCall,
  verifyServiceHeaders,
} from './service-auth.js';

const SECRET = 'a'.repeat(32);
const OTHER = 'b'.repeat(32);

const nowSec = () => Math.floor(Date.now() / 1000);

describe('service credentials — the happy path', () => {
  it('accepts headers produced by the matching secret', () => {
    const headers = serviceAuthHeaders('svc-trade', SECRET);

    expect(verifyServiceHeaders(headers, SECRET)).toEqual({ service: 'svc-trade', rejected: null });
  });

  it('names the calling service, so the ledger knows who posted', () => {
    for (const svc of ['svc-trade', 'svc-pay', 'svc-p2p', 'svc-token', 'svc-bank', 'svc-agents']) {
      expect(verifyServiceHeaders(serviceAuthHeaders(svc, SECRET), SECRET).service).toBe(svc);
    }
  });
});

describe('service credentials — the attack this closes', () => {
  /**
   * The exact pre-fix exploit: `ledger.post` was `publicProcedure` and every
   * caller sent only `content-type`. A stranger posting the `deposit` recipe
   * mints themselves any balance — it is a well-formed transaction, just
   * unauthorised. With no headers at all, there is now no service.
   */
  it('refuses a caller that sends no credentials at all', () => {
    expect(verifyServiceHeaders({ 'content-type': 'application/json' }, SECRET)).toEqual({
      service: null,
      rejected: 'missing',
    });
  });

  /**
   * Added after a mutation test found only one assertion covered it: claiming
   * to BE a service, with no signature offered at all. The cheapest possible
   * forgery — one header — and the suite had no direct test for it.
   */
  it('refuses a caller that claims a service name but sends no signature', () => {
    expect(verifyServiceHeaders({ [SERVICE_HEADER]: 'svc-trade' }, SECRET)).toEqual({
      service: null,
      rejected: 'missing',
    });

    expect(verifyServiceHeaders({ [SERVICE_HEADER]: 'svc-trade', [SERVICE_TIMESTAMP_HEADER]: String(nowSec()) }, SECRET)).toEqual({
      service: null,
      rejected: 'missing',
    });
  });

  it('refuses a caller that names a service but cannot sign for it', () => {
    expect(
      verifyServiceHeaders(
        {
          [SERVICE_HEADER]: 'svc-trade',
          [SERVICE_TIMESTAMP_HEADER]: String(nowSec()),
          [SERVICE_SIGNATURE_HEADER]: 'f'.repeat(64),
        },
        SECRET,
      ),
    ).toEqual({ service: null, rejected: 'bad-signature' });
  });

  it('refuses a signature minted with the wrong secret', () => {
    expect(verifyServiceHeaders(serviceAuthHeaders('svc-trade', OTHER), SECRET).service).toBeNull();
  });

  /**
   * Impersonation: a captured svc-agents signature replayed while claiming to
   * be svc-trade. The service name is inside the signed preimage, so the
   * signature does not travel to another identity.
   */
  it('refuses a valid signature reused under a different service name', () => {
    const headers = serviceAuthHeaders('svc-agents', SECRET);
    const stolen = { ...headers, [SERVICE_HEADER]: 'svc-trade' };

    expect(verifyServiceHeaders(stolen, SECRET)).toEqual({ service: null, rejected: 'bad-signature' });
  });

  it('refuses a signature reused under a different timestamp', () => {
    const ts = nowSec();
    const headers = serviceAuthHeaders('svc-trade', SECRET);

    expect(verifyServiceHeaders({ ...headers, [SERVICE_TIMESTAMP_HEADER]: String(ts + 1) }, SECRET).service).toBeNull();
  });

  it('cannot be forged by splitting the delimiter between fields', () => {
    // Without the '\n', ('ab', 1) and ('a', 'b1') would share a preimage.
    expect(signServiceCall('ab', SECRET, 1)).not.toBe(signServiceCall('a', SECRET, 11));
  });

  it('refuses non-hex, empty, truncated and over-long signatures without throwing', () => {
    const ts = nowSec();
    const good = signServiceCall('svc-trade', SECRET, ts);

    for (const bad of ['', 'zz', 'not-hex', good.slice(0, -1), good.slice(0, 32), `${good}00`]) {
      const call = () => verifyServiceCall('svc-trade', String(ts), bad, SECRET);
      expect(call).not.toThrow();
      expect(call().service).toBeNull();
    }
  });

  it('refuses a non-integer timestamp', () => {
    expect(verifyServiceCall('svc-trade', 'not-a-number', 'ab', SECRET).rejected).toBe('missing');
  });
});

describe('service credentials — replay window', () => {
  it('accepts a call inside the skew window', () => {
    const at = new Date();
    const headers = serviceAuthHeaders('svc-trade', SECRET, at);
    const later = new Date(at.getTime() + (SERVICE_CALL_MAX_SKEW_SECONDS - 1) * 1000);

    expect(verifyServiceHeaders(headers, SECRET, later).service).toBe('svc-trade');
  });

  it('refuses a captured header once the window has passed', () => {
    const at = new Date();
    const headers = serviceAuthHeaders('svc-trade', SECRET, at);
    const later = new Date(at.getTime() + (SERVICE_CALL_MAX_SKEW_SECONDS + 1) * 1000);

    expect(verifyServiceHeaders(headers, SECRET, later)).toEqual({ service: null, rejected: 'stale' });
  });

  it('refuses a header from too far in the future, not just the past', () => {
    const at = new Date();
    const headers = serviceAuthHeaders('svc-trade', SECRET, new Date(at.getTime() + (SERVICE_CALL_MAX_SKEW_SECONDS + 1) * 1000));

    expect(verifyServiceHeaders(headers, SECRET, at).rejected).toBe('stale');
  });
});

describe('secret strength', () => {
  it('refuses to sign with a weak or absent secret', () => {
    expect(() => signServiceCall('svc-trade', '', 1)).toThrow(ServiceAuthError);
    expect(() => signServiceCall('svc-trade', 'short', 1)).toThrow(/at least 32/);
  });
});

describe('requireServiceCaller', () => {
  it('throws UNAUTHORIZED — not FORBIDDEN — when no service identified itself', () => {
    try {
      requireServiceCaller(null);
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(TRPCError);
      // UNAUTHORIZED because the caller has not said who it is. FORBIDDEN would
      // mean "you are known and not allowed", which is a different answer and
      // must stay distinguishable to a caller.
      expect((err as TRPCError).code).toBe('UNAUTHORIZED');
    }
  });

  it('passes a named service through', () => {
    expect(() => requireServiceCaller('svc-trade')).not.toThrow();
  });
});
