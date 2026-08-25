import { describe, expect, it } from 'vitest';
import { apiKeyAccountAllowed, ApiKeyAccountError, requireAccountId } from './api-key-account.js';

describe('requireAccountId', () => {
  it('refuses empty and does not invent an id', () => {
    expect(() => requireAccountId(undefined)).toThrow(ApiKeyAccountError);
    expect(() => requireAccountId(null)).toThrow(/accountId is required/);
    expect(() => requireAccountId('')).toThrow(/accountId is required/);
    expect(() => requireAccountId('   ')).toThrow(/accountId is required/);
    expect(requireAccountId('  acc-a  ')).toBe('acc-a');
  });
});

describe('apiKeyAccountAllowed', () => {
  it('match works; mismatch and empty/unbound refuse', () => {
    expect(apiKeyAccountAllowed('acc-a', 'acc-a')).toBe(true);
    expect(apiKeyAccountAllowed('acc-a', ' acc-a ')).toBe(true);
    expect(apiKeyAccountAllowed('acc-a', 'acc-b')).toBe(false);
    expect(apiKeyAccountAllowed('acc-a', '')).toBe(false);
    expect(apiKeyAccountAllowed('acc-a', undefined)).toBe(false);
    expect(apiKeyAccountAllowed(null, 'acc-a')).toBe(false);
    expect(apiKeyAccountAllowed('', 'acc-a')).toBe(false);
  });
});
