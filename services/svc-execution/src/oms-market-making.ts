/**
 * OMS external MM door (D26-P1-X5) — wraps `@intafaced/execution-mm`.
 *
 * Caller supplies mids, book depth, owner spread/skew/bands, and §28 cost terms.
 * Internal venues and missing books refuse — never invented quotes or hedges.
 */
import { formatAmount, parseAmount } from '@intafaced/ledger-client';
import {
  planExternalMmHedge,
  quoteExternalMm,
  type MmKillConfig,
  type PlanExternalMmHedgeInput,
  type PlanExternalMmHedgeResult,
  type QuoteExternalMmInput,
  type QuoteExternalMmResult,
} from '@intafaced/execution-mm';
import type { SorCostTerms, VenueKind } from '@intafaced/venue-adapter';

export type OmsMmBookDepthInput = {
  readonly bidSize: string;
  readonly askSize: string;
};

export type OmsMmKillInput = {
  readonly adminKill: boolean;
  readonly inventory: {
    readonly position: string;
    readonly minPosition: string;
    readonly maxPosition: string;
  };
  readonly volatility: {
    readonly realizedVolBps: number | null;
    readonly maxVolBps: number;
  };
};

export type OmsMmQuoteInput = {
  readonly symbol: string;
  readonly venueId: string;
  readonly kind: VenueKind;
  readonly midKind?: VenueKind;
  readonly mid: string | null;
  readonly book: OmsMmBookDepthInput | null;
  readonly quoteSize: string;
  readonly halfSpreadBps: number;
  readonly inventorySkewBps: number;
  readonly costTerms: SorCostTerms;
  readonly kill: OmsMmKillInput;
};

export type OmsMmHedgeVenueInput = {
  readonly venueId: string;
  readonly kind: VenueKind;
  readonly midKind?: VenueKind;
  readonly mid: string | null;
  readonly costTerms: SorCostTerms;
  readonly availableSize: string;
};

export type OmsMmHedgeInput = {
  readonly symbol: string;
  readonly quoteVenueId: string;
  readonly inventory: OmsMmKillInput['inventory'];
  readonly kill: OmsMmKillInput;
  readonly hedge: OmsMmHedgeVenueInput;
};

function parseKill(kill: OmsMmKillInput): MmKillConfig {
  return {
    adminKill: kill.adminKill,
    inventory: {
      position: parseAmount(kill.inventory.position),
      minPosition: parseAmount(kill.inventory.minPosition),
      maxPosition: parseAmount(kill.inventory.maxPosition),
    },
    volatility: kill.volatility,
  };
}

function wireQuoteResult(result: QuoteExternalMmResult) {
  if (!result.ok) return result;
  return {
    ok: true as const,
    symbol: result.symbol,
    venueId: result.venueId,
    kind: result.kind,
    mid: formatAmount(result.mid),
    bid: {
      side: result.bid.side,
      price: formatAmount(result.bid.price),
      allIn: formatAmount(result.bid.allIn),
      size: formatAmount(result.bid.size),
    },
    ask: {
      side: result.ask.side,
      price: formatAmount(result.ask.price),
      allIn: formatAmount(result.ask.allIn),
      size: formatAmount(result.ask.size),
    },
    totalCostBps: result.totalCostBps,
    halfSpreadBps: result.halfSpreadBps,
    inventorySkewBps: result.inventorySkewBps,
  };
}

function wireHedgeResult(result: PlanExternalMmHedgeResult) {
  if (!result.ok) return result;
  return {
    ok: true as const,
    symbol: result.symbol,
    quoteVenueId: result.quoteVenueId,
    hedgeVenueId: result.hedgeVenueId,
    hedgeKind: result.hedgeKind,
    side: result.side,
    amount: formatAmount(result.amount),
    mid: formatAmount(result.mid),
    allIn: formatAmount(result.allIn),
    totalCostBps: result.totalCostBps,
  };
}

export function quoteOmsExternalMm(input: OmsMmQuoteInput): ReturnType<typeof wireQuoteResult> {
  const mmInput: QuoteExternalMmInput = {
    symbol: input.symbol,
    venueId: input.venueId,
    kind: input.kind,
    midKind: input.midKind,
    mid: input.mid === null ? null : parseAmount(input.mid),
    book:
      input.book === null
        ? null
        : {
            bidSize: parseAmount(input.book.bidSize),
            askSize: parseAmount(input.book.askSize),
          },
    quoteSize: parseAmount(input.quoteSize),
    halfSpreadBps: input.halfSpreadBps,
    inventorySkewBps: input.inventorySkewBps,
    costTerms: input.costTerms,
    kill: parseKill(input.kill),
  };
  return wireQuoteResult(quoteExternalMm(mmInput));
}

export function planOmsExternalMmHedge(input: OmsMmHedgeInput): ReturnType<typeof wireHedgeResult> {
  const mmInput: PlanExternalMmHedgeInput = {
    symbol: input.symbol,
    quoteVenueId: input.quoteVenueId,
    inventory: {
      position: parseAmount(input.inventory.position),
      minPosition: parseAmount(input.inventory.minPosition),
      maxPosition: parseAmount(input.inventory.maxPosition),
    },
    kill: parseKill(input.kill),
    hedge: {
      venueId: input.hedge.venueId,
      kind: input.hedge.kind,
      midKind: input.hedge.midKind,
      mid: input.hedge.mid === null ? null : parseAmount(input.hedge.mid),
      costTerms: input.hedge.costTerms,
      availableSize: parseAmount(input.hedge.availableSize),
    },
  };
  return wireHedgeResult(planExternalMmHedge(mmInput));
}
