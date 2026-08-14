import { describe, expect, it } from 'vitest';
import { BankError } from './errors.js';
import { assertOnlyWithdrawDestinations, assertPersistableWithdrawDestination, destKindForRamp } from './withdraw-destination.js';

const EVM = '0x000000000000000000000000000000000000dEaD';
const IBAN = 'GB82WEST12345698765432';
const IFSC = 'SBIN0005943';

describe('assertPersistableWithdrawDestination', () => {
  it('accepts EVM on crypto and IBAN/IFSC on bank', () => {
    expect(assertPersistableWithdrawDestination({ kind: 'crypto', ref: EVM })).toEqual({ kind: 'crypto', ref: EVM });
    expect(assertPersistableWithdrawDestination({ kind: 'bank', ref: IBAN }).ref).toBe(IBAN);
    expect(assertPersistableWithdrawDestination({ kind: 'bank', ref: IFSC }).ref).toBe(IFSC);
  });

  it('refuses empty / gibberish before any hold', () => {
    try {
      assertPersistableWithdrawDestination({ kind: 'crypto', ref: '0xdead' });
      throw new Error('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(BankError);
      expect(err).toMatchObject({ code: 'bank.ramp_invalid_destination' });
    }
    try {
      assertPersistableWithdrawDestination({ kind: 'bank', ref: 'IBAN-TEST' });
      throw new Error('expected throw');
    } catch (err) {
      expect(err).toMatchObject({ code: 'bank.ramp_invalid_destination' });
    }
  });

  it('maps ramp kind to dest kind — fiat is bank shape, not a PSP', () => {
    expect(destKindForRamp('crypto')).toBe('crypto');
    expect(destKindForRamp('fiat')).toBe('bank');
  });
});

describe('assertOnlyWithdrawDestinations (no store)', () => {
  const dests = assertOnlyWithdrawDestinations();

  it('persist asserts and returns — does not invent a stored row', async () => {
    await expect(dests.persist({ userId: 'u', kind: 'crypto', ref: EVM })).resolves.toEqual({ kind: 'crypto', ref: EVM });
  });

  it('require refuses closed — later withdraw has no ref to hold against', async () => {
    await expect(dests.require({ userId: 'u', kind: 'crypto' })).rejects.toMatchObject({
      code: 'bank.withdraw_destination_missing',
    });
  });
});
