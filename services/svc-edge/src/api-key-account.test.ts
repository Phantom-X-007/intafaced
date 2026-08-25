import { describe, expect, it } from 'vitest';
import {
  apiKeyAccountAllowed,
  assertApiKeyAccount,
  optionalAccountId,
  optionalAccountIdFromExchange,
  requestAccountId,
  KeyAccountError,
} from './api-key-account.js';

const ACC = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTHER = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

describe('optionalAccountId', () => {
  it('trims; empty is missing; never invents', () => {
    expect(optionalAccountId(ACC)).toBe(ACC);
    expect(optionalAccountId(` ${ACC} `)).toBe(ACC);
    expect(optionalAccountId('')).toBeUndefined();
    expect(optionalAccountId('   ')).toBeUndefined();
    expect(optionalAccountId(undefined)).toBeUndefined();
    expect(optionalAccountId(null)).toBeUndefined();
  });
});

describe('optionalAccountIdFromExchange', () => {
  it('reads tRPC envelope or bare body; never invents a bind', () => {
    expect(optionalAccountIdFromExchange({ result: { data: { json: { accountId: ACC } } } })).toBe(ACC);
    expect(optionalAccountIdFromExchange({ result: { data: { account_id: OTHER } } })).toBe(OTHER);
    expect(optionalAccountIdFromExchange({ accountId: ACC })).toBe(ACC);
    expect(optionalAccountIdFromExchange({ accessToken: 'x' })).toBeUndefined();
  });
});

describe('requestAccountId', () => {
  it('reads x-account-id; blank is missing', () => {
    expect(requestAccountId({ 'x-account-id': ACC })).toBe(ACC);
    expect(requestAccountId({ 'account-id': OTHER })).toBe(OTHER);
    expect(requestAccountId({ 'x-account-id': '  ' })).toBeUndefined();
    expect(requestAccountId({})).toBeUndefined();
  });
});

describe('apiKeyAccountAllowed', () => {
  it('match works; mismatch and empty/unbound refuse', () => {
    expect(apiKeyAccountAllowed(ACC, ACC)).toBe(true);
    expect(apiKeyAccountAllowed(ACC, ` ${ACC} `)).toBe(true);
    expect(apiKeyAccountAllowed(ACC, OTHER)).toBe(false);
    expect(apiKeyAccountAllowed(ACC, '')).toBe(false);
    expect(apiKeyAccountAllowed(ACC, undefined)).toBe(false);
    expect(apiKeyAccountAllowed(null, ACC)).toBe(false);
    expect(apiKeyAccountAllowed('', ACC)).toBe(false);
  });
});

describe('assertApiKeyAccount', () => {
  it('unbound stays open; bound match proceeds; mismatch and missing refuse', () => {
    expect(() => assertApiKeyAccount(undefined, undefined)).not.toThrow();
    expect(() => assertApiKeyAccount(undefined, ACC)).not.toThrow();
    expect(() => assertApiKeyAccount(ACC, ACC)).not.toThrow();
    expect(() => assertApiKeyAccount(ACC, OTHER)).toThrow(KeyAccountError);
    try {
      assertApiKeyAccount(ACC, OTHER);
    } catch (err) {
      expect(err).toMatchObject({ code: 'auth.account_mismatch' });
    }
    try {
      assertApiKeyAccount(ACC, undefined);
    } catch (err) {
      expect(err).toMatchObject({ code: 'auth.account_required' });
    }
  });
});
