import { describe, expect, it } from 'vitest';
import { parseAmount as amt } from '@intafaced/ledger-client';
import { resolveOptionsListing } from './options-listing.js';
import { TradeError } from './types.js';

const expiry = new Date('2026-12-26T08:00:00.000Z');

describe('resolveOptionsListing — refuse until fixing + complete terms', () => {
  it('returns null for spot without inventing terms', () => {
    expect(
      resolveOptionsListing({
        kind: 'spot',
        settlementFixingConfigured: '',
      }),
    ).toBeNull();
  });

  it('returns null for futures without inventing terms', () => {
    expect(
      resolveOptionsListing({
        kind: 'futures',
        settlementFixingConfigured: 'anything',
      }),
    ).toBeNull();
  });

  it('refuses options when settlement fixing env is empty (D7 unconfigured)', () => {
    try {
      resolveOptionsListing({
        kind: 'options',
        settlementFixingConfigured: '',
        optionType: 'call',
        strike: amt('90000'),
        expiryAt: expiry,
      });
      throw new Error('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(TradeError);
      expect((err as TradeError).code).toBe('trade.options_fixing_unconfigured');
      expect((err as Error).message).toContain('TRADE_OPTIONS_SETTLEMENT_FIXING');
    }
  });

  it('refuses options when fixing is whitespace-only', () => {
    try {
      resolveOptionsListing({
        kind: 'options',
        settlementFixingConfigured: '   \t  ',
        optionType: 'put',
        strike: amt('1'),
        expiryAt: expiry,
      });
      throw new Error('should have thrown');
    } catch (err) {
      expect((err as TradeError).code).toBe('trade.options_fixing_unconfigured');
    }
  });

  it('refuses options with fixing set but missing optionType (half-list)', () => {
    try {
      resolveOptionsListing({
        kind: 'options',
        settlementFixingConfigured: 'd7-placeholder-opaque',
        strike: amt('90000'),
        expiryAt: expiry,
      });
      throw new Error('should have thrown');
    } catch (err) {
      expect((err as TradeError).code).toBe('trade.options_terms_incomplete');
      expect((err as Error).message).toMatch(/optionType/i);
    }
  });

  it('refuses options with fixing set but missing strike', () => {
    try {
      resolveOptionsListing({
        kind: 'options',
        settlementFixingConfigured: 'd7-placeholder-opaque',
        optionType: 'call',
        expiryAt: expiry,
      });
      throw new Error('should have thrown');
    } catch (err) {
      expect((err as TradeError).code).toBe('trade.options_terms_incomplete');
      expect((err as Error).message).toMatch(/strike/i);
    }
  });

  it('refuses options with zero strike', () => {
    try {
      resolveOptionsListing({
        kind: 'options',
        settlementFixingConfigured: 'd7-placeholder-opaque',
        optionType: 'call',
        strike: 0n,
        expiryAt: expiry,
      });
      throw new Error('should have thrown');
    } catch (err) {
      expect((err as TradeError).code).toBe('trade.options_terms_incomplete');
    }
  });

  it('refuses options with fixing set but missing expiry', () => {
    try {
      resolveOptionsListing({
        kind: 'options',
        settlementFixingConfigured: 'd7-placeholder-opaque',
        optionType: 'call',
        strike: amt('90000'),
      });
      throw new Error('should have thrown');
    } catch (err) {
      expect((err as TradeError).code).toBe('trade.options_terms_incomplete');
      expect((err as Error).message).toMatch(/expiry/i);
    }
  });

  it('refuses option terms attached to a non-options kind', () => {
    try {
      resolveOptionsListing({
        kind: 'spot',
        settlementFixingConfigured: '',
        optionType: 'call',
        strike: amt('90000'),
        expiryAt: expiry,
      });
      throw new Error('should have thrown');
    } catch (err) {
      expect((err as TradeError).code).toBe('trade.options_terms_incomplete');
    }
  });

  it('accepts a complete european option listing when fixing is configured', () => {
    const terms = resolveOptionsListing({
      kind: 'options',
      settlementFixingConfigured: '  owner-published-fixing-id  ',
      optionType: 'call',
      strike: amt('90000'),
      expiryAt: expiry,
    });
    expect(terms).toEqual({
      optionType: 'call',
      optionStyle: 'european',
      strike: amt('90000'),
      expiryAt: expiry,
      // trimmed opaque stamp — not parsed for source/window/account
      settlementFixing: 'owner-published-fixing-id',
    });
  });

  it('accepts put with explicit european style', () => {
    const terms = resolveOptionsListing({
      kind: 'options',
      settlementFixingConfigured: 'fixing-v1',
      optionType: 'put',
      optionStyle: 'european',
      strike: amt('100'),
      expiryAt: expiry,
    });
    expect(terms?.optionType).toBe('put');
    expect(terms?.optionStyle).toBe('european');
    expect(terms?.settlementFixing).toBe('fixing-v1');
  });
});
