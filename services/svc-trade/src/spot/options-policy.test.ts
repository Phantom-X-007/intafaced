/**
 * Unit card — consolidated trade.options policy honesty door
 * 1. Promise: default refuse, constants from options-listing, no invented assets
 * 2. Break: describeOptionsPolicy omits socket or refuse codes
 * 3. Done bar: router mounts options.policy → describeOptionsPolicy()
 * 4. Class N
 * 5. Paths: svc-trade/src/spot/options-policy.ts, router.ts
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  OPTIONS_FIXING_UNCONFIGURED,
  OPTIONS_SETTLEMENT_LAW_UNSET,
  OPTIONS_SETTLEMENT_RESIDUAL,
  OPTIONS_SETTLEMENT_SOCKET,
  OPTIONS_TERMS_INCOMPLETE,
  describeOptionsPolicy,
} from './options-policy.js';

const here = dirname(fileURLToPath(import.meta.url));
const routerSource = readFileSync(join(here, '..', 'router.ts'), 'utf8');

describe('describeOptionsPolicy — trade.options honesty door', () => {
  it('states settlement law gate without inventing assets', () => {
    const policy = describeOptionsPolicy();
    expect(policy.socket).toBe(OPTIONS_SETTLEMENT_SOCKET);
    expect(policy.settlementLawUnsetCode).toBe(OPTIONS_SETTLEMENT_LAW_UNSET);
    expect(policy.fixingUnconfiguredCode).toBe(OPTIONS_FIXING_UNCONFIGURED);
    expect(policy.termsIncompleteCode).toBe(OPTIONS_TERMS_INCOMPLETE);
    expect(policy.settlementAssetLawStamped).toBe(false);
    expect(policy.settlementFixingConfigured).toBe(false);
    expect(policy.residual).toBe(OPTIONS_SETTLEMENT_RESIDUAL);
    expect(policy.inventsLiveSet).toBe(false);
    expect(policy.inventsSettlementAsset).toBe(false);
    expect(policy.inventsIvSurface).toBe(false);
    expect(policy.ordersStillRefuseUntilEngine).toBe(true);
    expect(policy.allowed.optionsOrders).toBe(false);
    expect(policy.allowed.optionsListing).toBe(false);
    expect(policy.allowed.nonOptionsListing).toBe(true);
    expect(policy.statusLine).toContain('lawStamped=0');
    expect(JSON.stringify(policy)).not.toMatch(/USDT|USDC|BTC/);
  });

  it('reflects non-empty env stamps without parsing or echoing them', () => {
    const policy = describeOptionsPolicy({
      settlementAssetLawConfigured: 'opaque-owner-stamp',
      settlementFixingConfigured: 'opaque-d7-fixing',
    });
    expect(policy.settlementAssetLawStamped).toBe(true);
    expect(policy.settlementFixingConfigured).toBe(true);
    expect(policy.allowed.optionsListing).toBe(true);
    expect(policy.allowed.optionsOrders).toBe(false);
    expect(JSON.stringify(policy)).not.toContain('opaque-owner-stamp');
    expect(JSON.stringify(policy)).not.toContain('opaque-d7-fixing');
  });

  it('whitespace-only env counts as unset', () => {
    const policy = describeOptionsPolicy({ settlementAssetLawConfigured: '   ', settlementFixingConfigured: '\t' });
    expect(policy.settlementAssetLawStamped).toBe(false);
    expect(policy.settlementFixingConfigured).toBe(false);
    expect(policy.allowed.optionsListing).toBe(false);
  });
});

describe('options.policy route (trade.options honesty door)', () => {
  it('router mounts describeOptionsPolicy on options.policy', () => {
    expect(routerSource).toMatch(/policy:\s*publicProcedure\.query\(\(\)\s*=>\s*describeOptionsPolicy\(\)\)/);
  });
});
