/**
 * OTC reference mid port (trade.otc / SPEC-OTC-RFQ-AND-EARN Part A).
 *
 * The mid a quote is priced off is **server-sourced**. It is never read from
 * the caller.
 *
 * "Never invent a mid" is a rule about where a price may come from, not only
 * about refusing to make one up: a desk that prices at a number the taker
 * chose has not avoided inventing a price, it has outsourced the invention to
 * the one party with a reason to get it wrong. The taker names the size and
 * the side; the desk names the price, or there is no quote.
 *
 * Null → `trade.otc_no_reference_price`. A dark feed is a refusal, never a
 * fallback and never a stale number.
 *
 * This deliberately does NOT reuse `mm/mid-source.ts`, whose config source is
 * the same handful of lines: that module reaches `venue-contracts` and
 * `futures/mark-source`, and importing it here would pull the venue fabric and
 * the futures graph into a desk that needs neither. When a published desk
 * wants live venue mids, chain a second source in front of this one rather
 * than widening the import.
 */

/** Keyed by pair, not by market id — the OTC desk quotes assets, not listings. */
export type OtcMidSource = (pairKey: string) => string | null | Promise<string | null>;

/**
 * `BASE/QUOTE`, upper-cased — the same shape as `trade.markets.symbol`, so one
 * ops entry reads the same whether it names a listing or an OTC pair.
 */
export function otcPairKey(baseAsset: string, quoteAsset: string): string {
  return `${baseAsset.trim().toUpperCase()}/${quoteAsset.trim().toUpperCase()}`;
}

/** Production default: nothing published → every quote refuses. */
export const NO_OTC_MIDS: OtcMidSource = () => null;

/**
 * Ops-published map: `BASE/QUOTE:mid,BASE/QUOTE:mid`.
 *
 * A malformed or half-written entry is dropped rather than coerced — a pair
 * with no usable mid must reach the desk as absent, not as zero.
 */
export function parseOtcMids(raw: string | null | undefined): Map<string, string> {
  const map = new Map<string, string>();
  for (const part of (raw ?? '').split(',')) {
    const idx = part.indexOf(':');
    if (idx <= 0) continue;
    const pair = part.slice(0, idx).trim().toUpperCase();
    const mid = part.slice(idx + 1).trim();
    if (!pair || !mid) continue;
    map.set(pair, mid);
  }
  return map;
}

/** Ops-published map only. Blank env → refuses for every pair. */
export function createConfigOtcMidSource(raw: string | null | undefined): OtcMidSource {
  const mids = parseOtcMids(raw);
  return (pairKey) => mids.get(pairKey.trim().toUpperCase()) ?? null;
}
