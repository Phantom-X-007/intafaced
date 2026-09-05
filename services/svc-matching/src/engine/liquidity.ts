/**
 * Liquidity mill (PTX-M13-R02 PTX-M13-R05 PTX-M13-R06).
 * External depth is visibly sourced. Unset rebate program does not pay.
 * Incentives must not reward wash. Quality telemetry may exist without proving liquid.
 * Do not invent a rebate. Hitch wraps MatchingEngine without recutting engine.ts or l3-queue.ts.
 */
import { publishedEngineL2Limit } from '../l2-limit.js';
import { MatchingEngine } from './engine.js';
import type { MarketId, RejectReason } from './types.js';

export const UNSOURCED_DEPTH = 'unsourced_depth' as const;
export const REBATE_PROGRAM_UNSET = 'rebate_program_unset' as const;
export const REBATE_WASH = 'rebate_wash' as const;

export const UNSOURCED_DEPTH_MESSAGE = 'external depth requires a visible source; the engine does not invent a venue';
export const REBATE_PROGRAM_UNSET_MESSAGE = 'rebate program is unset; the engine does not invent a rebate';
export const REBATE_WASH_MESSAGE = 'incentives must not reward wash; same-account maker/taker is not paid';

const FLAG = Symbol.for('intafaced.matching.liquidity');

export type SourcedDepth = {
  readonly accepted: true;
  readonly marketId: MarketId;
  readonly source: string;
  readonly native: boolean;
  readonly bids: readonly (readonly [string, string])[];
  readonly asks: readonly (readonly [string, string])[];
};

export type SourcedDepthRefuse = {
  readonly accepted: false;
  readonly marketId: MarketId;
  readonly source: null;
  readonly native: false;
  readonly bids: readonly [];
  readonly asks: readonly [];
  readonly rejected: RejectReason;
};

export type RebateCmd = {
  readonly makerAccountId?: string | null;
  readonly takerAccountId?: string | null;
  readonly programId?: string | null;
};

export type RebateResult = {
  readonly accepted: false;
  readonly paid: null;
  readonly rejected: RejectReason;
};

export type QualityTelemetry = {
  readonly marketId: MarketId;
  readonly samples: number;
  readonly provenLiquid: false;
};

function readRequired(raw: string | null | undefined): string | null {
  if (raw === undefined || raw === null) return null;
  const trimmed = raw.trim();
  return trimmed.length === 0 ? null : trimmed;
}

/** Owner rebate program. No MATCHING_REBATE_* env. Unset is the live product. */
export function rebateProgramUnset(): boolean {
  return true;
}

export function unsourcedDepthRefuse(): RejectReason {
  return { code: UNSOURCED_DEPTH, message: UNSOURCED_DEPTH_MESSAGE };
}

export function rebateProgramUnsetRefuse(): RejectReason {
  return { code: REBATE_PROGRAM_UNSET, message: REBATE_PROGRAM_UNSET_MESSAGE };
}

export function rebateWashRefuse(): RejectReason {
  return { code: REBATE_WASH, message: REBATE_WASH_MESSAGE };
}

export function isWash(cmd: RebateCmd): boolean {
  const maker = readRequired(cmd.makerAccountId ?? null);
  const taker = readRequired(cmd.takerAccountId ?? null);
  return maker !== null && taker !== null && maker === taker;
}

export function payRebate(cmd: RebateCmd): RebateResult {
  if (isWash(cmd)) {
    return { accepted: false, paid: null, rejected: rebateWashRefuse() };
  }
  return { accepted: false, paid: null, rejected: rebateProgramUnsetRefuse() };
}

export function qualityTelemetry(marketId: MarketId, samples = 0): QualityTelemetry {
  return { marketId, samples, provenLiquid: false };
}

type SourcedDepthInput = {
  readonly source?: string | null;
  readonly external?: boolean | null;
  readonly limit?: number | null;
};

type Host = MatchingEngine & {
  l2Depth?: (
    marketId: MarketId,
    n?: number | null,
  ) => { bids: readonly (readonly [string, string])[]; asks: readonly (readonly [string, string])[] };
  depth: (
    marketId: MarketId,
    n?: number | null,
  ) => { bids: readonly (readonly [string, string])[]; asks: readonly (readonly [string, string])[] } | null;
};

export function installLiquidity(ctor: typeof MatchingEngine = MatchingEngine): void {
  const proto = ctor.prototype as {
    sourcedDepth?: (marketId: MarketId, input?: SourcedDepthInput) => SourcedDepth | SourcedDepthRefuse;
    payRebate?: (cmd: RebateCmd) => RebateResult;
    qualityTelemetry?: (marketId: MarketId, samples?: number) => QualityTelemetry;
    [FLAG]?: true;
  };
  if (proto[FLAG]) return;
  proto[FLAG] = true;

  proto.sourcedDepth = function (this: MatchingEngine, marketId: MarketId, input?: SourcedDepthInput) {
    const external = input?.external === true;
    const source = readRequired(input?.source ?? null);
    if (external) {
      if (source === null) {
        return {
          accepted: false,
          marketId,
          source: null,
          native: false,
          bids: [],
          asks: [],
          rejected: unsourcedDepthRefuse(),
        };
      }
      return { accepted: true, marketId, source, native: false, bids: [], asks: [] };
    }
    const n = publishedEngineL2Limit(input?.limit);
    const host = this as Host;
    const depth = host.l2Depth?.(marketId, n) ?? host.depth(marketId, n) ?? { bids: [], asks: [] };
    return {
      accepted: true,
      marketId,
      source: 'matching',
      native: true,
      bids: depth.bids ?? [],
      asks: depth.asks ?? [],
    };
  };

  proto.payRebate = function (this: MatchingEngine, cmd: RebateCmd) {
    return payRebate(cmd);
  };

  proto.qualityTelemetry = function (this: MatchingEngine, marketId: MarketId, samples = 0) {
    return qualityTelemetry(marketId, samples);
  };
}

try {
  installLiquidity();
} catch {
  queueMicrotask(() => installLiquidity());
}
