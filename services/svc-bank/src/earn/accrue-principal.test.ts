import { parseAmount as amt, formatAmount } from '@intafaced/ledger-client';
import { describe, expect, it } from 'vitest';
import { BankError } from '../errors.js';
import { stakePrincipalForAccrual } from './accrue-principal.js';

describe('stakePrincipalForAccrual', () => {
  it('sizes interest from the ledger stake when the table agrees', () => {
    const ledger = amt('1000');
    expect(stakePrincipalForAccrual('pos-1', amt('1000'), ledger)).toBe(ledger);
  });

  it('refuses an inflated table principal rather than inventing yield', () => {
    try {
      stakePrincipalForAccrual('pos-1', amt('1000000'), amt('1000'));
      throw new Error('expected refuse');
    } catch (err) {
      expect(err).toBeInstanceOf(BankError);
      expect(err).toMatchObject({ code: 'bank.earn_principal_mismatch' });
      expect((err as BankError).message).toContain('1000000');
      expect((err as BankError).message).toContain('1000');
    }
  });

  it('refuses a deflated table principal rather than recording a silent zero day', () => {
    expect(() => stakePrincipalForAccrual('pos-1', amt('1'), amt('1000'))).toThrow(BankError);
    try {
      stakePrincipalForAccrual('pos-1', amt('1'), amt('1000'));
    } catch (err) {
      expect(err).toMatchObject({ code: 'bank.earn_principal_mismatch' });
      expect(formatAmount(amt('1'))).toBe('1');
    }
  });
});
