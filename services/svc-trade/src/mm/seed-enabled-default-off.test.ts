/**
 * trade.mm-bot residual — TRADE_MM_SEED_ENABLED stays default OFF.
 *
 * Pins SD-4 so a default-ON or "any truthy string" parser cannot sneak in.
 * Jobs and placeOrder seeded path share the same kill. Does not invent a mid.
 */
import { describe, expect, it } from 'vitest';
import { MemoryLedger } from '@intafaced/ledger-client';
import type { EngineSubmitRequest, EngineSubmitResult, MatchingClient } from '../spot/matching-client.js';
import {
  MM_SEED_ENABLED_DEFAULT,
  MM_SEED_ENABLE_TOKENS,
  mmSeedJobsArmed,
  mmSeedPlacePathArmed,
  parseMmSeedEnabled,
} from './seed-honesty.js';
import { startMmSeedJobs } from './seed-jobs.js';
import type { SeedTradableMarket } from './seed-market.js';

const ACTIVE_SPOT: SeedTradableMarket = { symbol: 'BTC/USDT', assetClass: 'crypto', kind: 'spot', status: 'active' };

class SilentMatching implements Pick<MatchingClient, 'submit' | 'depth' | 'cancel'> {
  readonly submitted: EngineSubmitRequest[] = [];
  async depth() {
    return { bids: [] as [string, string][], asks: [] as [string, string][], sequence: 0 };
  }
  async cancel(_marketId: string, orderId: string) {
    return { cancelled: false, orderId, sequence: null, cancellation: null };
  }
  async submit(_marketId: string, request: EngineSubmitRequest): Promise<EngineSubmitResult> {
    this.submitted.push(request);
    throw new Error('seed must not submit when kill is off');
  }
}

describe('TRADE_MM_SEED_ENABLED default OFF', () => {
  it('module default is literally false — not undefined, not true', () => {
    expect(MM_SEED_ENABLED_DEFAULT).toBe(false);
    expect(parseMmSeedEnabled()).toBe(false);
    expect(parseMmSeedEnabled(undefined)).toBe(false);
    expect(parseMmSeedEnabled(null)).toBe(false);
    expect(parseMmSeedEnabled('')).toBe(false);
  });

  it('only explicit ops tokens arm; JS-truthy traps stay OFF', () => {
    expect(MM_SEED_ENABLE_TOKENS).toEqual(['1', 'true', 'on', 'yes']);
    expect(parseMmSeedEnabled(true)).toBe(true);
    expect(parseMmSeedEnabled('1')).toBe(true);
    expect(parseMmSeedEnabled('true')).toBe(true);
    expect(parseMmSeedEnabled('TRUE')).toBe(true);
    expect(parseMmSeedEnabled('on')).toBe(true);
    expect(parseMmSeedEnabled('yes')).toBe(true);

    expect(parseMmSeedEnabled(false)).toBe(false);
    // Boolean("false") === true in JS — must not arm seed.
    expect(parseMmSeedEnabled('false')).toBe(false);
    expect(parseMmSeedEnabled('0')).toBe(false);
    expect(parseMmSeedEnabled('off')).toBe(false);
    expect(parseMmSeedEnabled('no')).toBe(false);
    expect(parseMmSeedEnabled('enabled')).toBe(false);
    expect(parseMmSeedEnabled('default')).toBe(false);
    expect(parseMmSeedEnabled('TRUE ')).toBe(false);
    expect(parseMmSeedEnabled(' 1')).toBe(false);
  });

  it('SD-4: unset flag leaves jobs unarmed even when markets are named', () => {
    const enabled = parseMmSeedEnabled(undefined);
    expect(mmSeedJobsArmed(enabled, 3)).toBe(false);

    const matching = new SilentMatching();
    const dead = startMmSeedJobs({
      ledger: new MemoryLedger(),
      matching,
      midSource: () => {
        throw new Error('must not invent or read a mid while kill is off');
      },
      marketFor: () => ACTIVE_SPOT,
      config: {
        enabled,
        intervalMs: 1000,
        halfSpreadBps: 10,
        stepBps: 10,
        levels: 1,
        qtyPerLevel: '1',
        targets: [{ marketId: 'm', baseAsset: 'BTC', quoteAsset: 'USDT' }],
      },
    });
    expect(dead.host.list()).toEqual([]);
    expect(matching.submitted).toHaveLength(0);
    dead.stop();
  });

  it('SD-4: placeOrder seeded path stays killable with the same flag', () => {
    expect(mmSeedPlacePathArmed(parseMmSeedEnabled(undefined))).toBe(false);
    expect(mmSeedPlacePathArmed(parseMmSeedEnabled('false'))).toBe(false);
    expect(mmSeedPlacePathArmed(parseMmSeedEnabled('true'))).toBe(true);
    expect(mmSeedPlacePathArmed(false)).toBe(false);
    expect(mmSeedPlacePathArmed(true)).toBe(true);
  });

  it('does not invent a mid when the kill is off', () => {
    const enabled = parseMmSeedEnabled();
    expect(enabled).toBe(false);
    // Jobs unarmed → midSource is never consulted (no manufactured book, no invented mid).
    expect(mmSeedJobsArmed(enabled, 1)).toBe(false);
  });
});
