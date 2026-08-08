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
 * The one normalisation, used for BOTH the lookup key and the assets that reach
 * the ledger. Ledger asset ids are upper-case (`BTC`, `USDT`), so a desk that
 * looks a mid up under one spelling and settles under another has promised a
 * quote it cannot honour.
 *
 * `/` is refused rather than normalised: it is the pair separator, so allowing
 * it inside an asset lets `('BTC', 'USDT/X')` and `('BTC/USDT', 'X')` collide
 * onto one published mid.
 */
export function normalizeOtcAsset(asset: string): string | null {
  const a = asset.trim().toUpperCase();
  if (!a || a.includes('/')) return null;
  return a;
}

/**
 * `BASE/QUOTE`, upper-cased — the same shape as `trade.markets.symbol`, so one
 * ops entry reads the same whether it names a listing or an OTC pair.
 * Null when either side is not a usable asset id.
 */
export function otcPairKey(baseAsset: string, quoteAsset: string): string | null {
  const base = normalizeOtcAsset(baseAsset);
  const quote = normalizeOtcAsset(quoteAsset);
  if (base == null || quote == null) return null;
  return `${base}/${quote}`;
}

/** Production default: nothing published → every quote refuses. */
export const NO_OTC_MIDS: OtcMidSource = () => null;

/**
 * Ops-published map: `BASE/QUOTE:mid,BASE/QUOTE:mid`.
 *
 * A malformed entry is dropped, including one whose price is not a positive
 * decimal — a pair with no usable mid must reach the desk as ABSENT, so it
 * refuses `trade.otc_no_reference_price` at boot-time cost rather than
 * surfacing an ops typo to a customer as `trade.otc_invalid_price`.
 */
export function parseOtcMids(raw: string | null | undefined): Map<string, string> {
  const map = new Map<string, string>();
  for (const part of (raw ?? '').split(',')) {
    const idx = part.indexOf(':');
    if (idx <= 0) continue;
    const pair = otcPairKey(...(part.slice(0, idx).split('/') as [string, string]));
    const mid = part.slice(idx + 1).trim();
    if (pair == null || !/^\d+(\.\d+)?$/.test(mid) || Number(mid) <= 0) continue;
    map.set(pair, mid);
  }
  return map;
}

/**
 * Ops-published map only. Blank env → refuses for every pair.
 *
 * ── SOCKET §13 · `socket.otc-mid-feed` ──────────────────────────────────────
 *
 * This is a FIXED price read once at boot. It has no observation time, so
 * nothing here can tell a current mid from one the market left behind hours
 * ago, and a stale mid is the same economic hole as a caller-supplied one —
 * it just needs patience instead of a wire field. Publish `BTC/USDT:65000`,
 * let BTC trade to 40000, and the desk keeps buying at 65000 from anyone
 * staked.
 *
 * The vocabulary for the real thing already exists one directory over:
 * `futures/mark-policy.ts` carries `asOf`, `maxAgeSeconds` and a quality gate,
 * under the line "Older than this and the mark is not a price, it is a memory."
 * A live OTC desk needs a mid source of that shape.
 *
 * So: this map is safe for a refuse-closed or non-production desk, and
 * `TRADE_OTC_MIDS` must NOT be given a value in production until the source
 * carries a timestamp and refuses on age. The max-age number itself is owner
 * law (DIRECTION §8), not a default to pick here — which is why this is a
 * socket and not a TODO.
 */
export function createConfigOtcMidSource(raw: string | null | undefined): OtcMidSource {
  const mids = parseOtcMids(raw);
  return (pairKey) => mids.get(pairKey) ?? null;
}
