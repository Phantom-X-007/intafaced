'use client';

import { useCallback } from 'react';
import { Panel } from '@intafaced/ui';
import { myFills, openOrders } from '@/lib/api/services';
import type { Market } from '@/lib/api/wire';
import { useEdge, useSession } from '@/lib/providers';
import { useService } from '@/lib/use-service';
import { DataTable, type DataTableColumn, type DataTableRow } from '@/components/data-table';
import { FailureNotice, GatedNotice, LoadingNotice } from './socket-panel';

/**
 * OPEN ORDERS AND FILLS — svc-trade, `trade:read`.
 *
 * Both are real reads against real procedures. Both are also the clearest place
 * the empty-state rule bites: `orders.open` returning `[]` and `orders.open`
 * failing look identical if a component renders `state.value ?? []`. They are
 * opposite facts — "you have no orders" versus "we could not find out" — and a
 * trader will act on the first one. `useService` makes them different types, so
 * the distinction cannot be lost by accident.
 *
 * Every amount below is a decimal string straight from svc-trade, rendered as
 * text. Nothing in this file does arithmetic on money at all.
 */

const copy = {
  orders: 'Open orders',
  fills: 'Recent fills',
  signIn: 'Sign in to see your orders — this plane is custodial, so the platform knows which are yours.',
  loading: 'Loading…',
  noOrders: 'No open orders',
  noFills: 'No fills yet',
  columns: {
    market: 'Market',
    side: 'Side',
    type: 'Type',
    price: 'Price',
    qty: 'Qty',
    filled: 'Filled',
    status: 'Status',
    hold: 'Hold',
    fee: 'Fee',
    time: 'Time',
    liquidity: 'Liq.',
  },
} as const;

const orderColumns: DataTableColumn[] = [
  { key: 'market', label: copy.columns.market },
  { key: 'side', label: copy.columns.side },
  { key: 'type', label: copy.columns.type, secondary: true },
  { key: 'price', label: copy.columns.price, align: 'right', numeric: true },
  { key: 'qty', label: copy.columns.qty, align: 'right', numeric: true },
  { key: 'filled', label: copy.columns.filled, align: 'right', numeric: true },
  { key: 'hold', label: copy.columns.hold, align: 'right', numeric: true, secondary: true },
  { key: 'status', label: copy.columns.status, align: 'right' },
];

const fillColumns: DataTableColumn[] = [
  { key: 'market', label: copy.columns.market },
  { key: 'side', label: copy.columns.side },
  { key: 'price', label: copy.columns.price, align: 'right', numeric: true },
  { key: 'amount', label: copy.columns.qty, align: 'right', numeric: true },
  { key: 'fee', label: copy.columns.fee, align: 'right', numeric: true, secondary: true },
  { key: 'liquidity', label: copy.columns.liquidity, align: 'right', secondary: true },
  { key: 'time', label: copy.columns.time, align: 'right', numeric: true },
];

/** Symbol for a market id, or the id — never a blank cell that reads as "none". */
function symbolOf(markets: Market[], marketId: string): string {
  return markets.find((m) => m.id === marketId)?.symbol ?? marketId.slice(0, 8);
}

function timeOf(ms: number): string {
  return new Date(ms).toISOString().slice(11, 19);
}

export function Blotter({ markets }: { markets: Market[] }) {
  const edge = useEdge();
  const session = useSession();
  const authenticated = session.status === 'authenticated';

  const ordersCall = useCallback(() => openOrders(edge), [edge]);
  const fillsCall = useCallback(() => myFills(edge, 25), [edge]);

  const orders = useService(authenticated ? ordersCall : null, `orders:${session.userId ?? 'anon'}`, copy.signIn);
  const fills = useService(authenticated ? fillsCall : null, `fills:${session.userId ?? 'anon'}`, copy.signIn);

  return (
    <>
      <Panel title={copy.orders}>
        {orders.state.status === 'idle' && <GatedNotice reason={orders.state.reason} />}
        {orders.state.status === 'loading' && <LoadingNotice label={copy.loading} />}
        {orders.state.status === 'failed' && <FailureNotice failure={orders.state.failure} />}
        {orders.state.status === 'ok' && (
          <DataTable
            columns={orderColumns}
            emptyLabel={copy.noOrders}
            rows={orders.state.value.map<DataTableRow>((order) => ({
              id: order.id,
              cells: {
                market: symbolOf(markets, order.marketId),
                side: order.side,
                type: order.type,
                price: order.price ?? '—',
                qty: order.qty,
                filled: order.filled,
                hold: `${order.holdAmount} ${order.holdAsset}`,
                status: order.status,
              },
              tones: { side: order.side === 'buy' ? 'long' : 'short' },
            }))}
          />
        )}
      </Panel>

      <Panel title={copy.fills}>
        {fills.state.status === 'idle' && <GatedNotice reason={fills.state.reason} />}
        {fills.state.status === 'loading' && <LoadingNotice label={copy.loading} />}
        {fills.state.status === 'failed' && <FailureNotice failure={fills.state.failure} />}
        {fills.state.status === 'ok' && (
          <DataTable
            columns={fillColumns}
            emptyLabel={copy.noFills}
            rows={fills.state.value.map<DataTableRow>((fill) => ({
              id: fill.id,
              cells: {
                market: symbolOf(markets, fill.marketId),
                side: fill.side,
                price: fill.price,
                amount: fill.amount,
                fee: `${fill.fee.cost} ${fill.fee.currency}`,
                liquidity: fill.takerOrMaker,
                time: timeOf(fill.timestamp),
              },
              tones: { side: fill.side === 'buy' ? 'long' : 'short' },
            }))}
          />
        )}
      </Panel>
    </>
  );
}
