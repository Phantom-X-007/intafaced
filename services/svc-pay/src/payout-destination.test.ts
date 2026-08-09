import { describe, expect, it } from 'vitest';
import {
  assertPayoutDestinationKind,
  DestinationKindError,
  isEvmAddressRef,
  isIbanRef,
} from './payout-destination.js';

/** Well-known structural-valid fixtures (not real accounts). */
const EVM = '0x000000000000000000000000000000000000dEaD';
const IBAN = 'GB82WEST12345698765432';

describe('shape helpers', () => {
  it('accepts a 20-byte hex EVM address and refuses short / non-hex', () => {
    expect(isEvmAddressRef(EVM)).toBe(true);
    expect(isEvmAddressRef('0xabc')).toBe(false);
    expect(isEvmAddressRef('0xmerchantwallet')).toBe(false);
    expect(isEvmAddressRef('not-an-address')).toBe(false);
  });

  it('accepts a mod-97 IBAN and refuses gibberish / bad checksum', () => {
    expect(isIbanRef(IBAN)).toBe(true);
    expect(isIbanRef('GB00X')).toBe(false);
    expect(isIbanRef('DE00 1234')).toBe(false);
    expect(isIbanRef('X')).toBe(false);
    expect(isIbanRef('GB82WEST12345698765433')).toBe(false); // bad check digits
  });
});

describe('assertPayoutDestinationKind', () => {
  it('accepts crypto on crypto-native with a real address shape', () => {
    expect(() => assertPayoutDestinationKind('crypto-native', { kind: 'crypto', ref: EVM })).not.toThrow();
  });

  it('accepts bank on card-sandbox with a structural IBAN', () => {
    expect(() => assertPayoutDestinationKind('card-sandbox', { kind: 'bank', ref: IBAN })).not.toThrow();
  });

  it('REFUSES an IBAN on crypto-native (the harvest break)', () => {
    expect(() =>
      assertPayoutDestinationKind('crypto-native', {
        kind: 'bank',
        ref: IBAN,
      }),
    ).toThrow(DestinationKindError);
    try {
      assertPayoutDestinationKind('crypto-native', {
        kind: 'bank',
        ref: IBAN,
      });
    } catch (e) {
      expect(e).toMatchObject({ code: 'pay.destination_kind_mismatch' });
    }
  });

  it('REFUSES crypto address on card-sandbox', () => {
    expect(() => assertPayoutDestinationKind('card-sandbox', { kind: 'crypto', ref: EVM })).toThrow(/crypto/);
  });

  it('refuses empty kind or ref', () => {
    expect(() => assertPayoutDestinationKind('crypto-native', { kind: '', ref: EVM })).toThrow(DestinationKindError);
    expect(() => assertPayoutDestinationKind('crypto-native', { kind: 'crypto', ref: '  ' })).toThrow(DestinationKindError);
  });

  it('refuses closed on an undeclared rail', () => {
    expect(() => assertPayoutDestinationKind('some-future-rail', { kind: 'crypto', ref: EVM })).toThrow(/no declared/);
  });

  it('REFUSES a non-address crypto ref before any hold (shape, not kind)', () => {
    try {
      assertPayoutDestinationKind('crypto-native', { kind: 'crypto', ref: '0xdead' });
      expect.unreachable('should throw');
    } catch (e) {
      expect(e).toMatchObject({ code: 'pay.invalid_destination_ref' });
    }
    try {
      assertPayoutDestinationKind('crypto-native', { kind: 'crypto', ref: 'not-an-address' });
      expect.unreachable('should throw');
    } catch (e) {
      expect(e).toMatchObject({ code: 'pay.invalid_destination_ref' });
    }
  });

  it('REFUSES a non-IBAN bank ref before any hold', () => {
    try {
      assertPayoutDestinationKind('card-sandbox', { kind: 'bank', ref: 'X' });
      expect.unreachable('should throw');
    } catch (e) {
      expect(e).toMatchObject({ code: 'pay.invalid_destination_ref' });
    }
    try {
      assertPayoutDestinationKind('card-sandbox', { kind: 'bank', ref: 'DE00 1234' });
      expect.unreachable('should throw');
    } catch (e) {
      expect(e).toMatchObject({ code: 'pay.invalid_destination_ref' });
    }
  });
});

it('accepts bank on bank-payout (absent rail; kind + IBAN must still match)', () => {
  expect(() => assertPayoutDestinationKind('bank-payout', { kind: 'bank', ref: IBAN })).not.toThrow();
  expect(() => assertPayoutDestinationKind('bank-payout', { kind: 'crypto', ref: EVM })).toThrow(/crypto/);
});
