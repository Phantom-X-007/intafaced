'use client';

import { useEffect, useMemo, useState } from 'react';
import type { TradePrint } from '@intafaced/market-data';
import { Panel } from '@intafaced/ui';
import { DataTable, type DataTableColumn, type DataTableRow } from '@/components/data-table';
import { resolveTradeTransport } from '@/lib/market/trade-source';
import { useDepthOrigin } from '@/lib/providers';
import { SocketPanel } from './socket-panel';
import styles from './terminal.module.css';

/**
 * PUBLIC TRADE TAPE — svc-ws `channel=trades`.
 *
 * Not the blotter. The blotter is *your* fills via `trade.fills.mine` (auth,
 * per-principal). This panel is the public market print stream: price, size,
 * time, engine sequence — order ids stripped server-side before the frame left
 * the bus (`packages/market-data` `tradePrintFromFill`).
 *
 * No candles. No last-price inventing. Empty tape while quiet is a real empty
 * market, not a loading failure — those two states stay separate below.
 *
 * The origin is the same `NEXT_PUBLIC_WS_URL` depth uses (`useDepthOrigin`).
 * Depth and trades share one public process on purpose.
 */

const copy = {
  title: 'Trade tape',
  socketTitle: 'Trade tape · public prints',
  connecting: 'Opening public trade stream…',
  empty: 'No public prints yet for this market',
  noMarket: 'Select a market to stream its public tape',
  columns: {
    time: 'Time',
    price: 'Price',
    size: 'Size',
    seq: 'Seq',
  },
} as const;

/** How many prints to keep on screen. Matches svc-ws default recent ring (50). */
const TAPE_LIMIT = 50;

const columns: DataTableColumn[] = [
  { key: 'time', label: copy.columns.time, secondary: true },
  { key: 'price', label: copy.columns.price, align: 'right', numeric: true },
  { key: 'size', label: copy.columns.size, align: 'right', numeric: true },
  { key: 'seq', label: copy.columns.seq, align: 'right', numeric: true, secondary: true },
];

type TapeState =
  | { readonly status: 'idle' }
  | { readonly status: 'connecting' }
  | { readonly status: 'live'; readonly prints: readonly TradePrint[] }
  | { readonly status: 'unavailable'; readonly reason: string };

function formatTime(iso: string): string {
  // Render the server's timestamp; do not invent a local "now". Bad parse → show raw.
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toISOString().slice(11, 19);
}

function toRows(prints: readonly TradePrint[]): DataTableRow[] {
  // Newest first — a tape reads down from the last print.
  return prints.map((p) => ({
    id: `${p.marketId}:${p.sequence}`,
    cells: {
      time: formatTime(p.ts),
      price: p.price,
      size: p.quantity,
      seq: String(p.sequence),
    },
  }));
}

export function LiveTradeTape({ marketId }: { marketId: string | null }) {
  const wsOrigin = useDepthOrigin();
  const availability = useMemo(() => resolveTradeTransport(wsOrigin), [wsOrigin]);
  const [state, setState] = useState<TapeState>({ status: 'idle' });

  useEffect(() => {
    if (!availability.available || !marketId) {
      setState({ status: 'idle' });
      return;
    }

    setState({ status: 'connecting' });

    // sequence → print, insertion order newest-first via unshift after dedupe.
    const bySequence = new Map<number, TradePrint>();
    const order: number[] = [];

    const snapshot = (): TradePrint[] => order.map((seq) => bySequence.get(seq)!);

    const push = (print: TradePrint) => {
      if (print.marketId !== marketId) return;
      if (bySequence.has(print.sequence)) return;
      bySequence.set(print.sequence, print);
      order.unshift(print.sequence);
      while (order.length > TAPE_LIMIT) {
        const dropped = order.pop();
        if (dropped !== undefined) bySequence.delete(dropped);
      }
      setState({ status: 'live', prints: snapshot() });
    };

    // Open (not first print) leaves "connecting": the hub may replay zero
    // prints for a quiet market, and inventing a last price would be worse.
    const unsubscribe = availability.transport.subscribe(
      marketId,
      (print) => push(print),
      (err) => setState({ status: 'unavailable', reason: err.message }),
      () => setState({ status: 'live', prints: snapshot() }),
    );

    return () => {
      unsubscribe();
    };
  }, [availability, marketId]);

  if (!availability.available) {
    return <SocketPanel title={copy.socketTitle} reason={availability.reason} blockedBy={availability.blockedBy} />;
  }

  if (!marketId) {
    return (
      <Panel title={copy.title}>
        <p className={styles.socketReason}>{copy.noMarket}</p>
      </Panel>
    );
  }

  return (
    <Panel title={copy.title} live={state.status === 'live'}>
      {state.status === 'live' ? (
        <DataTable columns={columns} rows={toRows(state.prints)} emptyLabel={copy.empty} />
      ) : state.status === 'unavailable' ? (
        <div className={styles.socket} data-kind="failure">
          <p className={styles.socketReason}>{state.reason}</p>
        </div>
      ) : (
        <div className={styles.socket} data-kind="loading">
          <p className={styles.socketReason}>{copy.connecting}</p>
        </div>
      )}
    </Panel>
  );
}
