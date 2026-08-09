import { describe, expect, it } from 'vitest';
import { assertPayoutDestinationKind, DestinationKindError } from './payout-destination.js';

describe('assertPayoutDestinationKind', () => {
  it('accepts crypto on crypto-native', () => {
    expect(() => assertPayoutDestinationKind('crypto-native', { kind: 'crypto', ref: '0xabc' })).not.toThrow();
  });

  it('accepts bank on card-sandbox', () => {
    expect(() => assertPayoutDestinationKind('card-sandbox', { kind: 'bank', ref: 'GB00X' })).not.toThrow();
  });

  it('REFUSES an IBAN on crypto-native (the harvest break)', () => {
    expect(() =>
      assertPayoutDestinationKind('crypto-native', {
        kind: 'bank',
        ref: 'GB82WEST12345698765432',
      }),
    ).toThrow(DestinationKindError);
    try {
      assertPayoutDestinationKind('crypto-native', {
        kind: 'bank',
        ref: 'GB82WEST12345698765432',
      });
    } catch (e) {
      expect(e).toMatchObject({ code: 'pay.destination_kind_mismatch' });
    }
  });

  it('REFUSES crypto address on card-sandbox', () => {
    expect(() => assertPayoutDestinationKind('card-sandbox', { kind: 'crypto', ref: '0xabc' })).toThrow(/crypto/);
  });

  it('refuses empty kind or ref', () => {
    expect(() => assertPayoutDestinationKind('crypto-native', { kind: '', ref: '0xabc' })).toThrow(DestinationKindError);
    expect(() => assertPayoutDestinationKind('crypto-native', { kind: 'crypto', ref: '  ' })).toThrow(DestinationKindError);
  });

  it('refuses closed on an undeclared rail', () => {
    expect(() => assertPayoutDestinationKind('some-future-rail', { kind: 'crypto', ref: '0x' })).toThrow(/no declared/);
  });
});

it('accepts bank on bank-payout (absent rail; kind must still match)', () => {
  expect(() => assertPayoutDestinationKind('bank-payout', { kind: 'bank', ref: 'GB00X' })).not.toThrow();
  expect(() => assertPayoutDestinationKind('bank-payout', { kind: 'crypto', ref: '0xabc' })).toThrow(/crypto/);
});
