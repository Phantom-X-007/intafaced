import { describe, expect, it } from 'vitest';
import { normalizeIp, requestClientIp } from './request-client-ip.js';

describe('normalizeIp', () => {
  it('accepts IPv4 and IPv6 after trim; rejects CIDR and junk', () => {
    expect(normalizeIp('203.0.113.10')).toBe('203.0.113.10');
    expect(normalizeIp('  2001:db8::1  ')).toBe('2001:db8::1');
    expect(normalizeIp('10.0.0.0/8')).toBeNull();
    expect(normalizeIp('not-an-ip')).toBeNull();
    expect(normalizeIp('')).toBeNull();
  });
});

describe('requestClientIp', () => {
  it('takes the first x-forwarded-for hop, else x-real-ip', () => {
    expect(requestClientIp({ 'x-forwarded-for': '203.0.113.10, 198.51.100.1' })).toBe('203.0.113.10');
    expect(requestClientIp({ 'x-real-ip': '2001:db8::1' })).toBe('2001:db8::1');
    expect(requestClientIp({ 'x-forwarded-for': 'not-an-ip' })).toBeNull();
    expect(requestClientIp({})).toBeNull();
  });
});
