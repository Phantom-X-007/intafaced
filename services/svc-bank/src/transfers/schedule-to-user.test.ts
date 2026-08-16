import { describe, expect, it } from 'vitest';
import { BankError } from '../errors.js';

describe('bank.scheduleToUser dest refuse', () => {
  it('names dest_user_missing — does not invent a dest', () => {
    const err = new BankError('dest user has no primary space — schedule refused', 'bank.dest_user_missing');
    expect(err.code).toBe('bank.dest_user_missing');
  });
});
