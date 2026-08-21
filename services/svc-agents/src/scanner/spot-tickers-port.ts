/**
 * Live spot-ticker door for market scanner rank runs.
 *
 * Production leave this unset: live spot quotes are Class X. An unset port is
 * the honest refuse (`no_live_tickers`) — never a scraped fake API, never a
 * zero-filled ticker invented from silence.
 *
 * Caller-supplied tickers stay fixture/dark only. Live truth is this port.
 */

import type { TickerFixture } from './data-tools.js';

export type SpotTickersPort = {
  /**
   * Grounded live ticker fixtures. Empty array or throw = unavailable.
   * Never invent last/volume/change inside the port.
   */
  sample(): Promise<readonly TickerFixture[]>;
};

export type LiveSpotTickers =
  { readonly ok: true; readonly tickers: readonly TickerFixture[] } | { readonly ok: false; readonly reason: 'no_live_tickers' };

/**
 * Resolve live ticker samples. Missing port, empty series, or sample failure all
 * collapse to the same named refuse — not an empty board and not invented quotes.
 */
export async function readLiveSpotTickers(port: SpotTickersPort | undefined): Promise<LiveSpotTickers> {
  if (port === undefined) {
    return { ok: false, reason: 'no_live_tickers' };
  }
  try {
    const tickers = await port.sample();
    if (!Array.isArray(tickers) || tickers.length === 0) {
      return { ok: false, reason: 'no_live_tickers' };
    }
    return { ok: true, tickers };
  } catch {
    return { ok: false, reason: 'no_live_tickers' };
  }
}
