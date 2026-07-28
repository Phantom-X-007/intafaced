'use client';

import { useEffect, useMemo, useState } from 'react';
import { Panel } from '@intafaced/ui';
import { bookTop, ladder, type DepthBook } from '@intafaced/market-data';
import { DepthController, type DepthState } from '@/lib/market/depth-controller';
import { resolveDepthTransport } from '@/lib/market/depth-source';
import { useDepthOrigin } from '@/lib/providers';
import { decimalsOf, displayAmount, ratio } from '@/lib/money';
import { DepthLadder, type DepthLevel } from '@/components/depth-ladder';
import { SocketPanel } from './socket-panel';
import styles from './terminal.module.css';

/**
 * THE ORDER BOOK.
 *
 * The controller does the hard part (gap → resnapshot; see
 * `lib/market/depth-controller.ts`). This component's only job is to render
 * exactly one of the controller's states and never to invent one — in
 * particular there is no branch here that draws a book while the controller
 * says `resnapshotting`, because the whole point of that state is that the
 * numbers are behind the engine.
 *
 * The transport is `svc-ws` (`lib/market/ws-transport.ts`): a snapshot over
 * HTTP and sequenced deltas over a websocket, both from the same server-side
 * book. When a deployment has no depth origin configured, `resolveDepthTransport`
 * returns unavailable and this renders that reason instead of a ladder.
 */

const copy = {
  title: 'Order book',
  ladder: { price: 'Price', size: 'Size', total: 'Total', spread: 'Spread' },
  connecting: 'Requesting snapshot…',
  resnapshotting: 'Book withheld — resnapshotting after a sequence gap',
  noBook: 'Book is empty on both sides',
  socketTitle: 'Order book · live depth',
} as const;

/** Rows for the ladder. Every string here came out of a bigint. */
function toLevels(book: DepthBook, side: 'bids' | 'asks', priceDp: number, sizeDp: number, limit: number): DepthLevel[] {
  const rows = ladder(book, side, limit);
  const deepest = rows.length > 0 ? rows[rows.length - 1]!.cumulative : 0n;

  const levels = rows.map((row) => ({
    price: displayAmount(row.price, priceDp),
    size: displayAmount(row.quantity, sizeDp),
    total: displayAmount(row.cumulative, sizeDp),
    // A bar width, and the only float in the file. `ladder` already accumulated
    // in bigint, so nothing a user reads was summed as a number.
    depth: ratio(row.cumulative, deepest),
  }));

  // Asks read away from the spread downwards, so the cheapest ask sits nearest
  // the mid — same as every venue a trader has ever used.
  return side === 'asks' ? levels.reverse() : levels;
}

export function LiveOrderBook({ marketId, tickSize, lotSize }: { marketId: string | null; tickSize: string; lotSize: string }) {
  const depthOrigin = useDepthOrigin();
  const availability = useMemo(() => resolveDepthTransport(depthOrigin), [depthOrigin]);
  const [state, setState] = useState<DepthState>({ status: 'idle' });

  useEffect(() => {
    if (!availability.available || !marketId) return;

    const controller = new DepthController({ marketId, transport: availability.transport });
    const unsubscribe = controller.subscribe(setState);
    controller.start();

    return () => {
      unsubscribe();
      controller.stop();
    };
  }, [availability, marketId]);

  if (!availability.available) {
    return <SocketPanel title={copy.socketTitle} reason={availability.reason} blockedBy={availability.blockedBy} />;
  }

  const priceDp = decimalsOf(tickSize);
  const sizeDp = decimalsOf(lotSize);

  return (
    <Panel title={copy.title} live={state.status === 'live'}>
      {state.status === 'live' ? <Book book={state.book} priceDp={priceDp} sizeDp={sizeDp} /> : <BookNotice state={state} />}
    </Panel>
  );
}

function Book({ book, priceDp, sizeDp }: { book: DepthBook; priceDp: number; sizeDp: number }) {
  const top = bookTop(book);
  const asks = toLevels(book, 'asks', priceDp, sizeDp, 12);
  const bids = toLevels(book, 'bids', priceDp, sizeDp, 12);

  if (asks.length === 0 && bids.length === 0) {
    return <p className={styles.socketReason}>{copy.noBook}</p>;
  }

  return (
    <DepthLadder
      asks={asks}
      bids={bids}
      // The mid is the best bid; there is no "last traded price" stream to read,
      // so nothing here claims to be one.
      lastPrice={top.bestBid === null ? '—' : displayAmount(top.bestBid, priceDp)}
      spread={top.spread === null ? '—' : displayAmount(top.spread, priceDp)}
      labels={copy.ladder}
    />
  );
}

function BookNotice({ state }: { state: DepthState }) {
  const message =
    state.status === 'resnapshotting'
      ? `${copy.resnapshotting} — ${state.reason}`
      : state.status === 'unavailable'
        ? state.reason
        : copy.connecting;

  return (
    <div className={styles.socket} data-kind={state.status === 'unavailable' ? 'failure' : 'loading'}>
      <p className={styles.socketReason}>{message}</p>
    </div>
  );
}
