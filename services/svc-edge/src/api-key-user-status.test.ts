import { describe, expect, it } from 'vitest';
import {
  assertUserNotFrozen,
  optionalUserStatus,
  optionalUserStatusFromExchange,
  userStatusFrozen,
  KeyUserStatusError,
} from './api-key-user-status.js';

describe('optionalUserStatus', () => {
  it('reads status / userStatus / user_status; never invents a freeze', () => {
    expect(optionalUserStatus({ status: 'active' })).toBe('active');
    expect(optionalUserStatus({ userStatus: 'frozen' })).toBe('frozen');
    expect(optionalUserStatus({ user_status: 'closed' })).toBe('closed');
    expect(optionalUserStatus({ status: ' FROZEN ' })).toBe('frozen');
    expect(optionalUserStatus({ id: 'k' })).toBeUndefined();
    expect(optionalUserStatus({ status: 'nope' })).toBeUndefined();
    expect(optionalUserStatus({ status: '' })).toBeUndefined();
    expect(optionalUserStatus(null)).toBeUndefined();
  });
});

describe('optionalUserStatusFromExchange', () => {
  it('reads tRPC envelope or bare body', () => {
    expect(optionalUserStatusFromExchange({ result: { data: { json: { status: 'frozen' } } } })).toBe('frozen');
    expect(optionalUserStatusFromExchange({ result: { data: { userStatus: 'closed' } } })).toBe('closed');
    expect(optionalUserStatusFromExchange({ status: 'active' })).toBe('active');
    expect(optionalUserStatusFromExchange({ accessToken: 'x' })).toBeUndefined();
  });
});

describe('userStatusFrozen', () => {
  it('frozen and closed refuse; missing and active stay open', () => {
    expect(userStatusFrozen('frozen')).toBe(true);
    expect(userStatusFrozen('closed')).toBe(true);
    expect(userStatusFrozen('active')).toBe(false);
    expect(userStatusFrozen(undefined)).toBe(false);
    expect(userStatusFrozen(null)).toBe(false);
    expect(userStatusFrozen('')).toBe(false);
  });
});

describe('assertUserNotFrozen', () => {
  it('throws auth.account_frozen when frozen or closed', () => {
    expect(() => assertUserNotFrozen('frozen')).toThrow(KeyUserStatusError);
    expect(() => assertUserNotFrozen('closed')).toThrowError(/frozen/);
    try {
      assertUserNotFrozen('frozen');
    } catch (err) {
      expect(err).toMatchObject({ code: 'auth.account_frozen' });
    }
    expect(() => assertUserNotFrozen('active')).not.toThrow();
    expect(() => assertUserNotFrozen(undefined)).not.toThrow();
  });
});
