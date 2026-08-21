/**
 * OMS book snapshot from svc-trade public REST (`GET /api/v1/orderbook/:symbol`).
 *
 * Venue id `intafaced-spot` is external-cex shaped — not `kind: internal` — so
 * OMS snapshot observation is allowed while house matching stays off the CEX path.
 * Unset TRADE_URL → no map entry → honest observe_failed at call time.
 */

import type { PriceLevel, VenueBookSnapshot } from '@intafaced/venue-contracts';
import type { OmsSnapshotFn } from './oms-snapshot.js';

export const TRADE_BOOK_SNAPSHOT_VENUE_ID = 'intafaced-spot' as const;

export type TradeBookSnapshotOptions = {
  readonly tradeUrl: string;
  readonly venueId?: string;
  readonly fetchImpl?: typeof fetch;
};

const orderBookWireSchema = {
  parse(raw: unknown): { bids: PriceLevel[]; asks: PriceLevel[]; nonce: number | undefined } | null {
    if (raw === null || typeof raw !== 'object') return null;
    const o = raw as Record<string, unknown>;
    if (!Array.isArray(o.bids) || !Array.isArray(o.asks)) return null;
    const levels = (side: 'bids' | 'asks'): PriceLevel[] | null => {
      const out: PriceLevel[] = [];
      for (const row of o[side] as unknown[]) {
        if (!Array.isArray(row) || row.length < 2) return null;
        if (typeof row[0] !== 'string' || typeof row[1] !== 'string') return null;
        out.push([row[0], row[1]]);
      }
      return out;
    };
    const bids = levels('bids');
    const asks = levels('asks');
    if (bids === null || asks === null) return null;
    const nonce = typeof o.nonce === 'number' ? o.nonce : undefined;
    return { bids, asks, nonce };
  },
};

/**
 * Fetch trade orderbook and map to VenueBookSnapshot. Transport/parse failure throws.
 */
export function createTradeBookSnapshotFn(options: TradeBookSnapshotOptions): OmsSnapshotFn {
  const tradeUrl = options.tradeUrl.replace(/\/$/, '');
  const venueId = options.venueId ?? TRADE_BOOK_SNAPSHOT_VENUE_ID;
  const fetchImpl = options.fetchImpl ?? fetch;

  return async (symbol: string, limit?: number) => {
    const params = limit !== undefined ? `?limit=${encodeURIComponent(String(limit))}` : '';
    const url = `${tradeUrl}/api/v1/orderbook/${encodeURIComponent(symbol)}${params}`;
    let response: Response;
    try {
      response = await fetchImpl(url, { method: 'GET', headers: { accept: 'application/json' } });
    } catch {
      throw new Error('trade orderbook unreachable');
    }
    if (!response.ok) throw new Error('trade orderbook unreachable');
    const body: unknown = await response.json().catch(() => null);
    const parsed = orderBookWireSchema.parse(body);
    if (parsed === null) throw new Error('trade orderbook parse failed');
    const sequenced = parsed.nonce !== undefined && parsed.nonce >= 0;
    const snapshot: VenueBookSnapshot = {
      venueId,
      symbol,
      bids: parsed.bids,
      asks: parsed.asks,
      sequence: sequenced ? parsed.nonce! : -1,
      sequenced,
      observedAt: new Date(),
    };
    return snapshot;
  };
}

export function buildTradeBookSnapshotMap(tradeUrl: string | undefined): Readonly<Record<string, OmsSnapshotFn>> {
  if (!tradeUrl) return {};
  return { [TRADE_BOOK_SNAPSHOT_VENUE_ID]: createTradeBookSnapshotFn({ tradeUrl }) };
}
