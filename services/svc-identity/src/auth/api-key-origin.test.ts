import { describe, expect, it } from 'vitest';
import { apiKeyOriginAllowed } from './api-key-origin.js';

describe('apiKeyOriginAllowed', () => {
  it('allows any origin when the whitelist is empty (server bots)', () => {
    expect(apiKeyOriginAllowed([], undefined)).toBe(true);
    expect(apiKeyOriginAllowed([], 'https://evil.example')).toBe(true);
  });

  it('refuses missing origin when the whitelist is set', () => {
    expect(apiKeyOriginAllowed(['app.example.com'], undefined)).toBe(false);
    expect(apiKeyOriginAllowed(['app.example.com'], null)).toBe(false);
    expect(apiKeyOriginAllowed(['app.example.com'], '')).toBe(false);
  });

  it('matches hostnames and full origins; rejects foreign hosts', () => {
    const list = ['app.example.com', 'https://partner.example'];
    expect(apiKeyOriginAllowed(list, 'https://app.example.com')).toBe(true);
    expect(apiKeyOriginAllowed(list, 'https://app.example.com/dashboard')).toBe(true);
    expect(apiKeyOriginAllowed(list, 'https://partner.example')).toBe(true);
    expect(apiKeyOriginAllowed(list, 'https://evil.example')).toBe(false);
    expect(apiKeyOriginAllowed(list, 'https://not-app.example.com')).toBe(false);
  });

  it('allows a subdomain of a listed registrable host', () => {
    expect(apiKeyOriginAllowed(['example.com'], 'https://app.example.com')).toBe(true);
    expect(apiKeyOriginAllowed(['example.com'], 'https://example.com')).toBe(true);
  });
});
