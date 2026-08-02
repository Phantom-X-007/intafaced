'use client';

import { useCallback } from 'react';
import { Panel, Ticker } from '@intafaced/ui';
import { fetchTickers, tickersInOrder, tradedCount, type TickerMap } from '@/lib/api/tickers';
import { useAnonymousEdge } from '@/lib/providers';
import { useService, type Load } from '@/lib/use-service';
import { FailureNotice, LoadingNotice } from '@/components/terminal/socket-panel';
import terminalStyles from '@/components/terminal/terminal.module.css';
import styles from './market-pulse.module.css';

/**
 * MARKET PULSE — the panel that used to lie.
 *
 * What stood here was a five-row array of string literals: `BTC/USDT` at
 * `68,412.50`, `ETH/USDT` at `3,284.10`, and three more, under a `live` Panel
 * and a "Streaming" badge. A source comment said "Every value below is mock".
 * That comment is not served to a browser. The numbers were, on the default
 * page of the platform, to every first-time visitor, with no word anywhere in
 * the DOM to say they were invented.
 *
 * They were not stale, or approximate, or a placeholder for a feed that was
 * nearly ready. `/api/v1/tickers` answers for those same symbols right now, and
 * for BTC/USDT it says `last: null` — the market has never traded. There was no
 * version of reality in which `68,412.50` was the price of anything here.
 *
 * ── What it does instead ────────────────────────────────────────────────────
 *
 * It asks svc-trade what is listed and what has traded, and renders that. All
 * four answers it can get are drawn, and none of them is a number this file
 * chose:
 *
 *   · reading            → a labelled wait, no rows
 *   · edge/service down  → the failure, naming the service and the path
 *   · nothing listed     → said plainly
 *   · listed, untraded   → the symbol, and "Not traded" where a price would be
 *
 * The last one is today's real answer for all sixteen listed markets, and it is
 * the one that mattered: an empty market has to look empty. A `0.00`, a dash
 * after a currency symbol, or a spinner that never resolves would each put a
 * shape where a price goes and let a visitor read a value into it.
 *
 * ── Why this panel is never `live` ──────────────────────────────────────────
 *
 * It is one REST read on mount, not a subscription. `live` on `<Panel>` sets
 * `data-live="true"` and lights the accent bloom, which is the visual grammar
 * this app uses for a socket that is pushing frames — see `live-tape.tsx`,
 * where it is bound to the transport's actual state. Claiming it for a snapshot
 * is a smaller version of the same lie, so the header says "Snapshot" and names
 * the route it came from. When there is a tickers stream, this becomes a
 * subscription and earns the badge.
 *
 * The edge client is the anonymous one: this is public market data and there is
 * no reason for a landing page to attach a session bearer to it.
 */

const copy = {
  title: 'Market pulse',
  /** Provenance, not decoration — the reader can go and check this. */
  source: 'Snapshot · svc-trade /api/v1/tickers',
  loading: 'Reading listed markets…',
  noMarkets: 'svc-trade lists no markets.',
  noneTraded: 'No listed market has traded yet, so there is no last price to show.',
  notTraded: 'Not traded',
  allMarkets: 'All markets',
} as const;

/**
 * The pure view — every state, no fetching.
 *
 * Split from the container so the states can be rendered and asserted directly.
 * The bug this component exists to fix survived because nothing in this app
 * ever rendered a component in a test; a container that can only be observed
 * through an effect would have rebuilt exactly that blind spot.
 */
export function MarketPulseView({ state }: { state: Load<TickerMap> }) {
  const actions = <span className={styles.source}>{copy.source}</span>;

  if (state.status === 'idle') {
    return (
      <Panel title={copy.title} actions={actions}>
        <p className={terminalStyles.socketReason}>{state.reason}</p>
      </Panel>
    );
  }

  if (state.status === 'loading') {
    return (
      <Panel title={copy.title} actions={actions}>
        <LoadingNotice label={copy.loading} />
      </Panel>
    );
  }

  if (state.status === 'failed') {
    return (
      <Panel title={copy.title} actions={actions}>
        <FailureNotice failure={state.failure} />
      </Panel>
    );
  }

  const tickers = tickersInOrder(state.value);

  if (tickers.length === 0) {
    return (
      <Panel title={copy.title} actions={actions}>
        <p className={terminalStyles.socketReason}>{copy.noMarkets}</p>
      </Panel>
    );
  }

  return (
    <Panel title={copy.title} actions={actions}>
      {tradedCount(tickers) === 0 && <p className={terminalStyles.socketReason}>{copy.noneTraded}</p>}
      <ul className={styles.tape}>
        {tickers.map((ticker) => (
          <li key={ticker.symbol} className={styles.tapeRow}>
            {ticker.last === null ? (
              // Not a `<Ticker>` with a blank price: that primitive reserves a
              // numeric slot, and an empty numeric slot reads as a value that
              // failed to load rather than as a market that has never traded.
              <>
                <span className={styles.symbol}>{ticker.symbol}</span>
                <span className={styles.absent}>{copy.notTraded}</span>
              </>
            ) : (
              <Ticker
                symbol={ticker.symbol}
                // Verbatim decimal string off the wire. Not parsed, not
                // reformatted, not grouped — see `lib/api/tickers.ts`.
                price={ticker.last}
                change={ticker.percentage ?? undefined}
                // `changeLabel` is passed explicitly because `Ticker` prepends
                // its own `+` to an unlabelled positive change, and svc-trade
                // already signs the string — the default renders `++2.41%`.
                changeLabel={ticker.percentage === null ? undefined : `${ticker.percentage}%`}
              />
            )}
          </li>
        ))}
      </ul>
    </Panel>
  );
}

export function MarketPulse() {
  const edge = useAnonymousEdge();
  const call = useCallback(() => fetchTickers(edge), [edge]);
  const { state } = useService(call, 'public.tickers');

  return <MarketPulseView state={state} />;
}
