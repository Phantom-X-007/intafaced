import { describe, expect, it } from 'vitest';
import { apiKeyIpAllowed, assertApiKeyIp, optionalIpAllowlist, optionalIpAllowlistFromExchange, KeyIpError } from './api-key-ip.js';

const LISTED = '203.0.113.10';
const KEEP = '2001:db8::1';
const FOREIGN = '198.51.100.9';

describe('optionalIpAllowlist', () => {
  it('reads ipAllowlist / ip_allowlist; never invents', () => {
    expect(optionalIpAllowlist({ ipAllowlist: [LISTED] })).toEqual([LISTED]);
    expect(optionalIpAllowlist({ ip_allowlist: [KEEP] })).toEqual([KEEP]);
    expect(optionalIpAllowlist({ ipAllowlist: [` ${LISTED} `] })).toEqual([LISTED]);
    expect(optionalIpAllowlist({ ipAllowlist: [] })).toEqual([]);
    expect(optionalIpAllowlist({ ipAllowlist: [] })).not.toContain('127.0.0.1');
    expect(optionalIpAllowlist({ id: 'k' })).toBeUndefined();
    expect(optionalIpAllowlist({ ipAllowlist: LISTED })).toBeUndefined();
    expect(optionalIpAllowlist(null)).toBeUndefined();
  });
});

describe('optionalIpAllowlistFromExchange', () => {
  it('reads tRPC envelope or bare body; never invents a list', () => {
    expect(optionalIpAllowlistFromExchange({ result: { data: { json: { ipAllowlist: [LISTED] } } } })).toEqual([LISTED]);
    expect(optionalIpAllowlistFromExchange({ result: { data: { ip_allowlist: [KEEP] } } })).toEqual([KEEP]);
    expect(optionalIpAllowlistFromExchange({ ipAllowlist: [LISTED] })).toEqual([LISTED]);
    expect(optionalIpAllowlistFromExchange({ accessToken: 'x' })).toBeUndefined();
  });
});

describe('apiKeyIpAllowed', () => {
  it('empty list stays open; no invented loopback', () => {
    expect(apiKeyIpAllowed([], undefined)).toBe(true);
    expect(apiKeyIpAllowed([], FOREIGN)).toBe(true);
    expect(apiKeyIpAllowed([], '127.0.0.1')).toBe(true);
  });

  it('refuses missing IP when the list is set', () => {
    expect(apiKeyIpAllowed([LISTED], undefined)).toBe(false);
    expect(apiKeyIpAllowed([LISTED], null)).toBe(false);
    expect(apiKeyIpAllowed([LISTED], '')).toBe(false);
    expect(apiKeyIpAllowed([LISTED], '   ')).toBe(false);
  });

  it('matching IP proceeds; foreign IP refuses; CIDR never matches', () => {
    const list = [LISTED, KEEP];
    expect(apiKeyIpAllowed(list, LISTED)).toBe(true);
    expect(apiKeyIpAllowed(list, `  ${LISTED}  `)).toBe(true);
    expect(apiKeyIpAllowed(list, KEEP)).toBe(true);
    expect(apiKeyIpAllowed(list, FOREIGN)).toBe(false);
    expect(apiKeyIpAllowed(['10.0.0.0/8'], '10.0.0.1')).toBe(false);
    expect(apiKeyIpAllowed(['not-an-ip'], 'not-an-ip')).toBe(false);
    expect(apiKeyIpAllowed([LISTED, '10.0.0.0/8'], LISTED)).toBe(true);
    expect(apiKeyIpAllowed([LISTED, '10.0.0.0/8'], '10.0.0.1')).toBe(false);
  });
});

describe('assertApiKeyIp', () => {
  it('empty / missing list stays open; bound list refuses foreign IP with a named code', () => {
    expect(() => assertApiKeyIp(undefined, FOREIGN)).not.toThrow();
    expect(() => assertApiKeyIp([], FOREIGN)).not.toThrow();
    expect(() => assertApiKeyIp([LISTED], LISTED)).not.toThrow();
    expect(() => assertApiKeyIp([LISTED], FOREIGN)).toThrow(KeyIpError);
    try {
      assertApiKeyIp([LISTED], FOREIGN);
    } catch (err) {
      expect(err).toMatchObject({ code: 'auth.ip_not_allowed' });
    }
    expect(() => assertApiKeyIp([LISTED], undefined)).toThrow(KeyIpError);
  });
});
