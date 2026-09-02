/**
 * Fat-finger / collars / throttles / severe-market (PX-S03 / PTX-M03-R06).
 * Owner magnitudes are blank; unpublished is not a zero collar.
 * Hitch: imported from index.ts so MatchingEngine is wrapped without recutting engine.ts.
 */
import { MatchingEngine } from './engine.js';
import type { CollarResult, MarketId, RejectReason } from './types.js';

export const COLLAR_UNPUBLISHED = 'collar_unpublished' as const;
export const FAT_FINGER_UNPUBLISHED = 'fat_finger_unpublished' as const;
export const THROTTLE_UNPUBLISHED = 'throttle_unpublished' as const;
export const SEVERE_MARKET_UNSET = 'severe_market_unset' as const;

export const COLLAR_UNPUBLISHED_MESSAGE = 'collar magnitudes are unpublished; the engine does not invent a zero-width band';
export const FAT_FINGER_UNPUBLISHED_MESSAGE = 'fat-finger magnitudes are unpublished; the engine does not invent a zero tick band';
export const THROTTLE_UNPUBLISHED_MESSAGE = 'throttle magnitudes are unpublished; the engine does not invent a zero orders-per-sec rate';
export const SEVERE_MARKET_UNSET_MESSAGE =
  'severe-market mode is unset; missing or false is not severe and is not inferred from volatility, spread, or halt';

const FLAG = Symbol.for('intafaced.matching.collars');

export type SevereMarketCmd = {
  readonly severe?: boolean | null;
  readonly operatorId?: string | null;
};

/**
 * Owner collar/fat-finger/throttle magnitudes. No env on this process publishes them.
 * MATCHING_COLLAR_* is not added — a default number would invent a collar.
 * UNSET is the live product — no compose pin, no invented bps, ticks, or rate.
 */
export function collarMagnitudesUnset(): boolean {
  return true;
}

export function fatFingerMagnitudesUnset(): boolean {
  return collarMagnitudesUnset();
}

export function throttleMagnitudesUnset(): boolean {
  return collarMagnitudesUnset();
}

export function collarUnpublishedRefuse(): RejectReason {
  return {
    code: COLLAR_UNPUBLISHED,
    message: COLLAR_UNPUBLISHED_MESSAGE,
  };
}

export function fatFingerUnpublishedRefuse(): RejectReason {
  return {
    code: FAT_FINGER_UNPUBLISHED,
    message: FAT_FINGER_UNPUBLISHED_MESSAGE,
  };
}

export function throttleUnpublishedRefuse(): RejectReason {
  return {
    code: THROTTLE_UNPUBLISHED,
    message: THROTTLE_UNPUBLISHED_MESSAGE,
  };
}

export function severeMarketUnsetRefuse(): RejectReason {
  return {
    code: SEVERE_MARKET_UNSET,
    message: SEVERE_MARKET_UNSET_MESSAGE,
  };
}

/** Refuse unpublished. Never a band/bps/qty of 0 presented as a live collar. */
export function unpublishedCollar(marketId: MarketId): CollarResult {
  return {
    accepted: false,
    marketId,
    rejected: collarUnpublishedRefuse(),
  };
}

export function unpublishedFatFinger(marketId: MarketId): CollarResult {
  return {
    accepted: false,
    marketId,
    rejected: fatFingerUnpublishedRefuse(),
  };
}

export function unpublishedThrottle(marketId: MarketId): CollarResult {
  return {
    accepted: false,
    marketId,
    rejected: throttleUnpublishedRefuse(),
  };
}

export function applyCollar(marketId: MarketId): CollarResult {
  return unpublishedCollar(marketId);
}

/** Uncross analog: read the band. Unpublished refuses; never returns 0 as a band. */
export function collarBand(marketId: MarketId): CollarResult {
  return unpublishedCollar(marketId);
}

export function applyFatFinger(marketId: MarketId): CollarResult {
  return unpublishedFatFinger(marketId);
}

export function throttleCheck(marketId: MarketId): CollarResult {
  return unpublishedThrottle(marketId);
}

function readSevere(cmd: SevereMarketCmd | boolean | undefined | null): boolean | null {
  if (cmd === true) return true;
  if (cmd === false) return false;
  if (cmd === undefined || cmd === null) return null;
  if (cmd.severe === true) return true;
  if (cmd.severe === false) return false;
  return null;
}

/**
 * Severe-market is an explicit door (flag true). Missing/false/blank is NOT severe.
 * Do not infer from volatility, spread, or halt. Explicit true still unpublished while magnitudes are blank.
 */
export function enterSevereMarket(marketId: MarketId, cmd?: SevereMarketCmd | boolean | null): CollarResult {
  if (readSevere(cmd) !== true) {
    return {
      accepted: false,
      marketId,
      rejected: severeMarketUnsetRefuse(),
    };
  }
  return unpublishedCollar(marketId);
}

export function installCollars(ctor: typeof MatchingEngine = MatchingEngine): void {
  const proto = ctor.prototype as {
    applyCollar?: (marketId: MarketId) => Promise<CollarResult>;
    collarBand?: (marketId: MarketId) => Promise<CollarResult>;
    applyFatFinger?: (marketId: MarketId) => Promise<CollarResult>;
    throttleCheck?: (marketId: MarketId) => Promise<CollarResult>;
    enterSevereMarket?: (marketId: MarketId, cmd?: SevereMarketCmd | boolean | null) => Promise<CollarResult>;
    [FLAG]?: true;
  };
  if (proto[FLAG]) return;
  proto[FLAG] = true;

  proto.applyCollar = async function (this: MatchingEngine, marketId: MarketId) {
    return applyCollar(marketId);
  };

  proto.collarBand = async function (this: MatchingEngine, marketId: MarketId) {
    return collarBand(marketId);
  };

  proto.applyFatFinger = async function (this: MatchingEngine, marketId: MarketId) {
    return applyFatFinger(marketId);
  };

  proto.throttleCheck = async function (this: MatchingEngine, marketId: MarketId) {
    return throttleCheck(marketId);
  };

  proto.enterSevereMarket = async function (this: MatchingEngine, marketId: MarketId, cmd?: SevereMarketCmd | boolean | null) {
    return enterSevereMarket(marketId, cmd);
  };
}

try {
  installCollars();
} catch {
  queueMicrotask(() => installCollars());
}
