import { describe, expect, it } from 'vitest';
import { BankError } from '../errors.js';

describe('bank.dest_user_missing', () => {
  it('is a named refuse, not an invented dest', () => {
    const err = new BankError('dest user has no primary space', 'bank.dest_user_missing');
    expect(err.code).toBe('bank.dest_user_missing');
  });
});
