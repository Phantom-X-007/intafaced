import { describe, expect, it } from 'vitest';
import { upstreamBody } from './proxy-body.js';

describe('upstreamBody — never re-serialise bytes a webhook signed', () => {
  it('forwards GET/HEAD with no body', () => {
    expect(upstreamBody('GET', '{"a":1}')).toBeUndefined();
    expect(upstreamBody('HEAD', Buffer.from('x'))).toBeUndefined();
  });

  it('forwards a raw string and a Buffer as-is (HMAC covers these bytes)', () => {
    const raw = '{"amount":"1.00","id":"p1"}';
    expect(upstreamBody('POST', raw)).toBe(raw);

    const buf = Buffer.from(raw, 'utf8');
    expect(upstreamBody('POST', buf)).toBe(buf);
  });

  it('forwards a Uint8Array as a Buffer of the same bytes', () => {
    const bytes = new TextEncoder().encode('{"k":1}');
    const out = upstreamBody('POST', bytes);
    expect(Buffer.isBuffer(out)).toBe(true);
    expect(out?.toString()).toBe('{"k":1}');
  });

  it('falls back to JSON.stringify only for a leftover parsed object', () => {
    expect(upstreamBody('POST', { amount: '1.00' })).toBe('{"amount":"1.00"}');
  });

  it('treats empty/missing as no body, not "null"', () => {
    expect(upstreamBody('POST', undefined)).toBeUndefined();
    expect(upstreamBody('POST', null)).toBeUndefined();
  });
});
