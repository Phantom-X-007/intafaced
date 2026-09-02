/**
 * Owner fat-finger / collars / throttles / severe-market (PTX-M03-R06).
 * Magnitudes blank → unpublished, not zero. Do not invent a collar.
 * Hitch: installCollars from index.ts. engine.ts not recut.
 */
import { MatchingEngine } from './engine.js';
import type { CollarPolicyResult, MarketId, RejectReason } from './types.js';

export const COLLAR_UNPUBLISHED = 'collar_unpublished' as const;
export const FAT_FINGER_UNPUBLISHED = 'fat_finger_unpublished' as const;
export const THROTTLE_UNPUBLISHED = 'throttle_unpublished' as const;
export const SEVERE_MARKET_UNSET = 'severe_market_unset' as const;

const FLAG = Symbol.for('intafaced.matching.collars-policy');

/** Owner collar sockets are unset. Zero would invent a tight band. Unpublished is the live product. */
export function collarMagnitudesUnset(): boolean {
  return true;
}

export function fatFingerMagnitudesUnset(): boolean {
  return true;
}

export function throttleMagnitudesUnset(): boolean {
  return true;
}

/** Severe-market is an explicit door. Missing / false / blank is not severe. */
export function readSevereMarket(cmd: { readonly severeMarket?: boolean | null }): boolean {
  return cmd.severeMarket === true;
}

export function unpublishedCollarRefuse(): RejectReason {
  return {
    code: COLLAR_UNPUBLISHED,
    message: 'collar magnitudes are unpublished; the engine does not invent a collar or treat blank as zero',
  };
}

export function unpublishedFatFingerRefuse(): RejectReason {
  return {
    code: FAT_FINGER_UNPUBLISHED,
    message: 'fat-finger magnitudes are unpublished; the engine does not invent a collar or treat blank as zero',
  };
}

export function unpublishedThrottleRefuse(): RejectReason {
  return {
    code: THROTTLE_UNPUBLISHED,
    message: 'throttle magnitudes are unpublished; the engine does not invent a rate or treat blank as zero',
  };
}

export function severeMarketUnsetRefuse(): RejectReason {
  return {
    code: SEVERE_MARKET_UNSET,
    message: 'severe-market mode is unset; the engine does not infer it',
  };
}

export function refusedPolicy(marketId: MarketId, rejected: RejectReason): CollarPolicyResult {
  return {
    accepted: false,
    marketId,
    unpublished: true,
    band: null,
    rejected,
  };
}

export function installCollars(ctor: typeof MatchingEngine = MatchingEngine): void {
  const proto = ctor.prototype as {
    applyCollar?: (marketId: MarketId) => Promise<CollarPolicyResult>;
    applyFatFinger?: (marketId: MarketId) => Promise<CollarPolicyResult>;
    applyThrottle?: (marketId: MarketId) => Promise<CollarPolicyResult>;
    enterSevereMarket?: (
      marketId: MarketId,
      cmd?: { readonly severeMarket?: boolean | null },
    ) => Promise<CollarPolicyResult>;
    [FLAG]?: true;
  };
  if (proto[FLAG]) return;
  proto[FLAG] = true;

  proto.applyCollar = async function (this: MatchingEngine, marketId: MarketId) {
    return refusedPolicy(marketId, unpublishedCollarRefuse());
  };

  proto.applyFatFinger = async function (this: MatchingEngine, marketId: MarketId) {
    return refusedPolicy(marketId, unpublishedFatFingerRefuse());
  };

  proto.applyThrottle = async function (this: MatchingEngine, marketId: MarketId) {
    return refusedPolicy(marketId, unpublishedThrottleRefuse());
  };

  proto.enterSevereMarket = async function (
    this: MatchingEngine,
    marketId: MarketId,
    cmd?: { readonly severeMarket?: boolean | null },
  ) {
    if (!readSevereMarket(cmd ?? {})) return refusedPolicy(marketId, severeMarketUnsetRefuse());
    return refusedPolicy(marketId, unpublishedCollarRefuse());
  };
}

try {
  installCollars();
} catch {
  queueMicrotask(() => installCollars());
}
