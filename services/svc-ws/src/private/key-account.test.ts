import { describe, expect, it } from 'vitest';
import { IncomingMessage } from 'node:http';
import { Socket } from 'node:net';
import {
  apiKeyAccountAllowed,
  assertApiKeyAccount,
  optionalAccountId,
  optionalAccountIdFromBody,
  requestAccountIdFromUpgrade,
  KeyAccountError,
} from './key-account.js';

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

describe('optionalAccountIdFromBody', () => {
  it('reads accountId or account_id; never invents a bind', () => {
    expect(optionalAccountIdFromBody({ accountId: ACC })).toBe(ACC);
    expect(optionalAccountIdFromBody({ account_id: OTHER })).toBe(OTHER);
    expect(optionalAccountIdFromBody({ id: 'k' })).toBeUndefined();
    expect(optionalAccountIdFromBody({ accountId: '' })).toBeUndefined();
    expect(optionalAccountIdFromBody(null)).toBeUndefined();
  });
});

describe('requestAccountIdFromUpgrade', () => {
  function req(headers: Record<string, string>): IncomingMessage {
    return { headers, socket: new Socket() } as IncomingMessage;
  }

  it('reads x-account-id; blank is missing', () => {
    expect(requestAccountIdFromUpgrade(req({ 'x-account-id': ACC }))).toBe(ACC);
    expect(requestAccountIdFromUpgrade(req({ 'account-id': OTHER }))).toBe(OTHER);
    expect(requestAccountIdFromUpgrade(req({ 'x-account-id': '  ' }))).toBeUndefined();
    expect(requestAccountIdFromUpgrade(req({}))).toBeUndefined();
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
