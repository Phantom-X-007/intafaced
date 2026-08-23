/**
 * OMS external arb scan door (D26-P1-X4) — wraps `@intafaced/execution-arb`.
 *
 * Caller supplies quotes, §28 cost terms, inventory, clock, and owner max age.
 * This module never invents mids, spreads, fees, or freshness windows.
 */
import { formatAmount, parseAmount } from '@intafaced/ledger-client';
import {
  scanArbClass,
  type ArbOpportunity,
  type ArbRefusal,
  type ArbScanClass,
  type ScanExternalArbResult,
} from '@intafaced/execution-arb';
import type { SorCostTerms, VenueKind } from '@intafaced/venue-adapter';

export type OmsArbQuoteInput = {
  readonly venueId: string;
  readonly kind: VenueKind;
  /** Null = missing quote — scanner refuses; never a default mid. */
  readonly price: string | null;
  readonly amount: string;
  /** Observation time (ms). Null = missing — refused as stale/missing. */
  readonly asOfMs: number | null;
};

export type OmsArbScanInput = {
  readonly symbol: string;
  readonly amount: string;
  readonly quotes: readonly OmsArbQuoteInput[];
  readonly costTermsByVenue: Readonly<Record<string, SorCostTerms>>;
  readonly inventory: { readonly prePositionedByVenue: Readonly<Record<string, boolean>> };
  readonly nowMs: number;
  /** Owner freshness window. Null → every quote stale (not invented). */
  readonly maxQuoteAgeMs: number | null;
  readonly scanClass?: ArbScanClass;
  readonly fundingRate?: string | null;
};

export type OmsArbOpportunityWire = {
  readonly ok: true;
  readonly symbol: string;
  readonly buyVenueId: string;
  readonly sellVenueId: string;
  readonly buyKind: VenueKind;
  readonly sellKind: VenueKind;
  readonly amount: string;
  readonly buyAllIn: string;
  readonly sellAllIn: string;
  readonly edgePerUnit: string;
  readonly buyCostBps: number;
  readonly sellCostBps: number;
};

export type OmsArbScanResultWire = {
  readonly symbol: string;
  readonly opportunities: readonly OmsArbOpportunityWire[];
  readonly refused: readonly ArbRefusal[];
};

function wireOpportunity(opp: ArbOpportunity): OmsArbOpportunityWire {
  return {
    ok: true,
    symbol: opp.symbol,
    buyVenueId: opp.buyVenueId,
    sellVenueId: opp.sellVenueId,
    buyKind: opp.buyKind,
    sellKind: opp.sellKind,
    amount: formatAmount(opp.amount),
    buyAllIn: formatAmount(opp.buyAllIn),
    sellAllIn: formatAmount(opp.sellAllIn),
    edgePerUnit: formatAmount(opp.edgePerUnit),
    buyCostBps: opp.buyCostBps,
    sellCostBps: opp.sellCostBps,
  };
}

function wireScanResult(result: ScanExternalArbResult): OmsArbScanResultWire {
  return {
    symbol: result.symbol,
    opportunities: result.opportunities.map(wireOpportunity),
    refused: result.refused,
  };
}

export function scanOmsExternalArb(input: OmsArbScanInput): OmsArbScanResultWire {
  const result = scanArbClass({
    scanClass: input.scanClass ?? 'cross-exchange',
    fundingRate: input.fundingRate,
    symbol: input.symbol,
    amount: parseAmount(input.amount),
    quotes: input.quotes.map((quote) => ({
      venueId: quote.venueId,
      kind: quote.kind,
      price: quote.price === null ? null : parseAmount(quote.price),
      amount: parseAmount(quote.amount),
      asOfMs: quote.asOfMs,
    })),
    costTermsByVenue: input.costTermsByVenue,
    inventory: input.inventory,
    nowMs: input.nowMs,
    maxQuoteAgeMs: input.maxQuoteAgeMs,
  });
  return wireScanResult(result);
}
