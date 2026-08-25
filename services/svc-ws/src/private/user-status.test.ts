import { describe, expect, it } from 'vitest';
import { assertUserActive, optionalUserStatus, optionalUserStatusFromBody, userIsActive, UserStatusError } from './user-status.js';

describe('optionalUserStatus', () => {
  it('accepts identity statuses; empty and junk are missing', () => {
    expect(optionalUserStatus('active')).toBe('active');
    expect(optionalUserStatus('frozen')).toBe('frozen');
    expect(optionalUserStatus('closed')).toBe('closed');
    expect(optionalUserStatus(' frozen ')).toBe('frozen');
    expect(optionalUserStatus('')).toBeUndefined();
    expect(optionalUserStatus('disabled')).toBeUndefined();
    expect(optionalUserStatus(undefined)).toBeUndefined();
    expect(optionalUserStatus(null)).toBeUndefined();
  });
});

describe('optionalUserStatusFromBody', () => {
  it('reads status; never invents active', () => {
    expect(optionalUserStatusFromBody({ status: 'active' })).toBe('active');
    expect(optionalUserStatusFromBody({ status: 'frozen' })).toBe('frozen');
    expect(optionalUserStatusFromBody({ status: 'closed' })).toBe('closed');
    expect(optionalUserStatusFromBody({ userId: 'x' })).toBeUndefined();
    expect(optionalUserStatusFromBody({ status: 'live' })).toBeUndefined();
    expect(optionalUserStatusFromBody(null)).toBeUndefined();
  });
});

describe('assertUserActive', () => {
  it('active proceeds; frozen, closed, and missing refuse as auth.account_frozen', () => {
    expect(() => assertUserActive('active')).not.toThrow();
    expect(userIsActive('active')).toBe(true);
    expect(userIsActive('frozen')).toBe(false);
    expect(userIsActive(undefined)).toBe(false);
    expect(() => assertUserActive('frozen')).toThrow(UserStatusError);
    expect(() => assertUserActive('closed')).toThrow(UserStatusError);
    expect(() => assertUserActive(undefined)).toThrow(UserStatusError);
    try {
      assertUserActive('frozen');
    } catch (err) {
      expect(err).toMatchObject({ code: 'auth.account_frozen' });
    }
    try {
      assertUserActive('closed');
    } catch (err) {
      expect(err).toMatchObject({ code: 'auth.account_frozen', message: 'Account is closed' });
    }
  });
});
