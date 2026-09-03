/**
 * Market-maker protection law (PX-S03 / M11 / PTX-M11-R11 PTX-M11-R12).
 * Magnitudes are OWNER-SET. Unset is the live product — the engine does not invent 0.
 * Quoted qty is the only size. No sidecar MM / vendor MM / off-engine margin.
 * Hitch: imported from index.ts so MatchingEngine is wrapped without recutting engine.ts.
 */
import { MatchingEngine } from './engine.js';
import type { EngineOrder, MarketId, RejectReason, SubmitResult } from './types.js';

export const MMP_UNPUBLISHED = 'mmp_unpublished' as const;
export const MMP_SIDECAR_REFUSED = 'mmp_sidecar_refused' as const;

export const MMP_UNPUBLISHED_MESSAGE =
  'MMP magnitudes are unpublished; the engine does not invent a zero max quote, position, loss, delta, or quote-size band';
export const MMP_SIDECAR_REFUSED_MESSAGE = 'sidecar MM / vendor MM / off-engine margin is refused; MMP law stays in-repo';

const FLAG = Symbol.for('intafaced.matching.mmp');

export type MillRejectReason = {
  readonly code: string;
  readonly message: string;
};

export type MmpResult = {
  readonly accepted: boolean;
  readonly marketId: MarketId;
  readonly rejected?: MillRejectReason;
};

type MmpTaggedOrder = EngineOrder & {
  readonly mmp?: boolean;
  readonly mmpMaxQuote?: unknown;
  readonly mmpMaxPosition?: unknown;
  readonly mmpMaxLoss?: unknown;
  readonly mmpMaxDelta?: unknown;
  readonly mmpMaxVega?: unknown;
  readonly mmpVendor?: boolean;
  readonly sidecar?: boolean;
};

/**
 * Owner MMP magnitudes. No env on this process publishes them.
 * MATCHING_MMP_* is not added — a default number would invent a max.
 * UNSET is the live product — no compose pin, no invented max-quote/position/loss.
 */
export function mmpMagnitudesUnset(): boolean {
  return true;
}

export function mmpUnpublishedRefuse(): MillRejectReason {
  return {
    code: MMP_UNPUBLISHED,
    message: MMP_UNPUBLISHED_MESSAGE,
  };
}

export function mmpSidecarRefuse(): MillRejectReason {
  return {
    code: MMP_SIDECAR_REFUSED,
    message: MMP_SIDECAR_REFUSED_MESSAGE,
  };
}

function asReject(reason: MillRejectReason): RejectReason {
  return reason as RejectReason;
}

function unpublishedResult(): SubmitResult {
  return {
    accepted: false,
    sequence: null,
    fills: [],
    resting: null,
    rejected: asReject(mmpUnpublishedRefuse()),
    cancellations: [],
    triggered: [],
  };
}

function sidecarResult(): SubmitResult {
  return {
    accepted: false,
    sequence: null,
    fills: [],
    resting: null,
    rejected: asReject(mmpSidecarRefuse()),
    cancellations: [],
    triggered: [],
  };
}

function presentMagnitude(value: unknown): boolean {
  return value !== undefined && value !== null;
}

/** MMP intent: explicit flag, or any owner magnitude field present. Blank still unpublished. */
export function wantsMmp(order: EngineOrder): boolean {
  const tagged = order as MmpTaggedOrder;
  if (tagged.mmp === true) return true;
  if (presentMagnitude(tagged.mmpMaxQuote)) return true;
  if (presentMagnitude(tagged.mmpMaxPosition)) return true;
  if (presentMagnitude(tagged.mmpMaxLoss)) return true;
  if (presentMagnitude(tagged.mmpMaxDelta)) return true;
  if (presentMagnitude(tagged.mmpMaxVega)) return true;
  return false;
}

export function wantsSidecarMm(order: EngineOrder): boolean {
  const tagged = order as MmpTaggedOrder;
  return tagged.mmpVendor === true || tagged.sidecar === true;
}

/** Refuse unpublished. Never a max-quote/max-position/max-loss of 0 presented as live. */
export function unpublishedMmp(marketId: MarketId): MmpResult {
  return {
    accepted: false,
    marketId,
    rejected: mmpUnpublishedRefuse(),
  };
}

/** Uncross analog: read the band. Unpublished refuses; never returns 0 as a live max. */
export function applyMmp(marketId: MarketId): MmpResult {
  return unpublishedMmp(marketId);
}

export function installMmp(ctor: typeof MatchingEngine = MatchingEngine): void {
  const proto = ctor.prototype as {
    submit: (marketId: MarketId, order: EngineOrder, proof?: unknown) => Promise<SubmitResult>;
    applyMmp?: (marketId: MarketId) => Promise<MmpResult>;
    [FLAG]?: true;
  };
  if (proto[FLAG]) return;
  proto[FLAG] = true;

  const origSubmit = proto.submit;

  proto.submit = async function (this: MatchingEngine, marketId: MarketId, order: EngineOrder, proof?: unknown) {
    if (wantsSidecarMm(order)) return sidecarResult();
    if (wantsMmp(order) && mmpMagnitudesUnset()) return unpublishedResult();
    return origSubmit.call(this, marketId, order, proof);
  };

  proto.applyMmp = async function (this: MatchingEngine, marketId: MarketId) {
    return applyMmp(marketId);
  };
}

try {
  installMmp();
} catch {
  queueMicrotask(() => installMmp());
}
