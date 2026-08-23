/**
 * §28 arb class scanners — triangular / basis / funding on the same SOR cost
 * model as cross-exchange. Empty books refuse. Never invent mids, spreads, bps,
 * or funding rates.
 */
import { scanExternalCrossExchangeArb, type ScanExternalArbInput, type ScanExternalArbResult } from './arbitrage.js';

export const ARB_SCAN_CLASSES = ['cross-exchange', 'triangular', 'basis', 'funding'] as const;
export type ArbScanClass = (typeof ARB_SCAN_CLASSES)[number];

export const EMPTY_BOOK_REFUSE = 'empty book — refuse rather than invent a spread' as const;

export type ScanArbClassInput = ScanExternalArbInput & {
  readonly scanClass: ArbScanClass;
  /**
   * Caller-supplied funding rate (decimal string parsed upstream). Null/omit
   * on the funding class → refuse. Never a default bps.
   */
  readonly fundingRate?: string | null;
};

function emptyRefuse(symbol: string, detail: string): ScanExternalArbResult {
  return {
    symbol,
    opportunities: [],
    refused: [
      {
        ok: false,
        buyVenueId: '',
        sellVenueId: '',
        reason: 'missing_quote',
        detail,
      },
    ],
  };
}

export function scanArbClass(input: ScanArbClassInput): ScanExternalArbResult {
  if (input.quotes.length === 0) {
    return emptyRefuse(input.symbol, EMPTY_BOOK_REFUSE);
  }

  if (input.scanClass === 'triangular' && input.quotes.length < 3) {
    return emptyRefuse(input.symbol, 'triangular needs three caller-supplied legs — refuse rather than invent a third book');
  }

  if (input.scanClass === 'basis') {
    const kinds = new Set(input.quotes.map((q) => q.kind));
    const hasSpotLike = kinds.has('external-cex') || kinds.has('external-dex') || kinds.has('amm') || kinds.has('otc');
    const hasFuturesLike = input.quotes.length >= 2;
    if (!hasSpotLike || !hasFuturesLike) {
      return emptyRefuse(input.symbol, 'basis needs two caller-supplied books — refuse rather than invent a futures mid');
    }
  }

  if (input.scanClass === 'funding') {
    const rate = (input.fundingRate ?? '').trim();
    if (rate.length === 0) {
      return emptyRefuse(input.symbol, 'funding class needs a caller-supplied rate — refuse rather than invent bps');
    }
  }

  return scanExternalCrossExchangeArb(input);
}
