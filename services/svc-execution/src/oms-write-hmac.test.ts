import { describe, expect, it } from 'vitest';
import { TRPCError } from '@trpc/server';
import { serviceAuthHeaders, serviceAuthHeadersForBody } from '@intafaced/contracts';
import { authorizeOmsWriteHmac, OMS_WRITE_CALLER, requireOmsWriteService } from './oms-write-hmac.js';

const SECRET = 'a'.repeat(32);
const BODY = '{"parentClientOrderId":"p-basket"}';

describe('authorizeOmsWriteHmac', () => {
  it('unsigned is 401 — persist is not the mill', () => {
    expect(authorizeOmsWriteHmac({ 'content-type': 'application/json' }, SECRET)).toEqual({
      ok: false,
      status: 401,
      body: { code: 'UNAUTHORIZED' },
    });
  });

  it('blank secret is 401', () => {
    const headers = serviceAuthHeadersForBody(OMS_WRITE_CALLER, SECRET, BODY);
    expect(authorizeOmsWriteHmac(headers, '')).toMatchObject({ ok: false, status: 401 });
    expect(authorizeOmsWriteHmac(headers, undefined)).toMatchObject({ ok: false, status: 401 });
  });

  it('session-shaped headers without HMAC are 401', () => {
    expect(
      authorizeOmsWriteHmac(
        {
          'x-intafaced-principal': 'not-a-service',
          'x-intafaced-principal-sig': 'ff',
        },
        SECRET,
      ),
    ).toMatchObject({ ok: false, status: 401, body: { code: 'UNAUTHORIZED' } });
  });

  it('svc-trade HMAC is 403 — session must not impersonate svc-trade', () => {
    const headers = serviceAuthHeadersForBody('svc-trade', SECRET, BODY);
    expect(authorizeOmsWriteHmac(headers, SECRET)).toEqual({
      ok: false,
      status: 403,
      body: { code: 'FORBIDDEN' },
    });
  });

  it('svc-execution HMAC is ok', () => {
    const headers = serviceAuthHeadersForBody(OMS_WRITE_CALLER, SECRET, BODY);
    expect(authorizeOmsWriteHmac(headers, SECRET)).toEqual({ ok: true, service: OMS_WRITE_CALLER });
  });

  it('v1 HMAC as svc-execution is ok during body-bind migration', () => {
    const headers = serviceAuthHeaders(OMS_WRITE_CALLER, SECRET);
    expect(authorizeOmsWriteHmac(headers, SECRET)).toEqual({ ok: true, service: OMS_WRITE_CALLER });
  });
});

describe('requireOmsWriteService', () => {
  it('null is UNAUTHORIZED', () => {
    try {
      requireOmsWriteService(null);
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(TRPCError);
      expect(err).toMatchObject({ code: 'UNAUTHORIZED' });
    }
  });

  it('svc-trade is FORBIDDEN', () => {
    try {
      requireOmsWriteService('svc-trade');
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(TRPCError);
      expect(err).toMatchObject({ code: 'FORBIDDEN' });
    }
  });

  it('svc-execution passes', () => {
    expect(() => requireOmsWriteService(OMS_WRITE_CALLER)).not.toThrow();
  });
});
