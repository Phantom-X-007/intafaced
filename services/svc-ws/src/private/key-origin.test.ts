import { describe, expect, it } from 'vitest';
import { IncomingMessage } from 'node:http';
import { Socket } from 'node:net';
import { apiKeyOriginAllowed, normalizeOriginHost, requestOriginFromUpgrade } from './key-origin.js';

describe('normalizeOriginHost', () => {
  it('extracts host from URLs and host[:port]; rejects blanks', () => {
    expect(normalizeOriginHost('https://app.example.com')).toBe('app.example.com');
    expect(normalizeOriginHost('https://app.example.com/dashboard')).toBe('app.example.com');
    expect(normalizeOriginHost(' APP.EXAMPLE.COM ')).toBe('app.example.com');
    expect(normalizeOriginHost('app.example.com:443')).toBe('app.example.com');
    expect(normalizeOriginHost('')).toBeNull();
    expect(normalizeOriginHost('  ')).toBeNull();
    expect(normalizeOriginHost(null)).toBeNull();
    expect(normalizeOriginHost(undefined)).toBeNull();
  });
});

describe('apiKeyOriginAllowed', () => {
  it('empty list stays open; missing origin with a bound list fails closed', () => {
    expect(apiKeyOriginAllowed([], null)).toBe(true);
    expect(apiKeyOriginAllowed([], 'https://evil.example')).toBe(true);
    expect(apiKeyOriginAllowed(['app.example.com'], null)).toBe(false);
    expect(apiKeyOriginAllowed(['app.example.com'], '')).toBe(false);
    expect(apiKeyOriginAllowed(['app.example.com'], undefined)).toBe(false);
    expect(apiKeyOriginAllowed(['app.example.com'], 'https://app.example.com')).toBe(true);
    expect(apiKeyOriginAllowed(['https://partner.example'], 'https://partner.example/path')).toBe(true);
    expect(apiKeyOriginAllowed(['app.example.com'], 'https://evil.example')).toBe(false);
  });

  it('allows a subdomain of a listed registrable host; rejects suffix collisions', () => {
    expect(apiKeyOriginAllowed(['example.com'], 'https://app.example.com')).toBe(true);
    expect(apiKeyOriginAllowed(['example.com'], 'https://example.com')).toBe(true);
    expect(apiKeyOriginAllowed(['app.example.com'], 'https://not-app.example.com')).toBe(false);
  });

  it('does not invent localhost or wildcards', () => {
    expect(apiKeyOriginAllowed([], 'https://localhost')).toBe(true);
    expect(apiKeyOriginAllowed(['app.example.com'], 'https://localhost')).toBe(false);
    expect(apiKeyOriginAllowed(['*'], 'https://evil.example')).toBe(false);
  });
});

describe('requestOriginFromUpgrade', () => {
  function req(opts: { origin?: string; forwardedOrigin?: string }): IncomingMessage {
    const headers: Record<string, string> = {};
    if (opts.origin !== undefined) headers.origin = opts.origin;
    if (opts.forwardedOrigin !== undefined) headers['x-forwarded-origin'] = opts.forwardedOrigin;
    return { headers, socket: new Socket() } as IncomingMessage;
  }

  it('uses the Origin header; never trusts x-forwarded-origin', () => {
    expect(requestOriginFromUpgrade(req({ origin: 'https://app.example.com' }))).toBe('https://app.example.com');
    expect(requestOriginFromUpgrade(req({ origin: 'https://app.example.com', forwardedOrigin: 'https://evil.example' }))).toBe(
      'https://app.example.com',
    );
    expect(requestOriginFromUpgrade(req({ forwardedOrigin: 'https://app.example.com' }))).toBeNull();
    expect(requestOriginFromUpgrade(req({}))).toBeNull();
    expect(requestOriginFromUpgrade(req({ origin: '  ' }))).toBeNull();
  });
});
