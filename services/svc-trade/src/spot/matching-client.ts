import { serviceAuthHeaders } from '@intafaced/contracts';

/**
 * THE ENGINE, AS SEEN FROM HERE (§5.1 / §5.2).
 *
 * svc-matching is a separate service with its own process, its own journal and
 * its own tests. §15.2 forbids reaching into it: cross-service work goes over
 * an interface, never over an import of the other service's source. So this
 * file declares the narrow port svc-trade needs and an HTTP implementation of
 * it, shaped exactly to the routes svc-matching's README publishes.
 *
 * EVERY AMOUNT HERE IS A DECIMAL STRING. That is the engine's wire format and
 * it is not negotiable — a JSON number would round the 18th decimal place away
 * silently, and the 18th decimal place is where a book stops reconciling. The
 * strings are parsed into `Amount` the moment they cross into `trade-service.ts`
 * and never travel further as strings.
 *
 * What this port deliberately does NOT expose: anything that would let this
 * service reason about the book's contents. It submits, it cancels, and it asks
 * for the best ask so a market buy can be funded. The book is svc-matching's.
 */

export type EngineOrderType = 'market' | 'limit' | 'stop' | 'stop_limit';
export type EngineSide = 'buy' | 'sell';
export type EngineTif = 'GTC' | 'IOC' | 'FOK' | 'PO';

export interface EngineSubmitRequest {
  readonly orderId: string;
  /**
   * §5.1: "it speaks in account IDs". This service passes the USER id, so
   * self-trade prevention is per user — a user cannot cross their own resting
   * order, including from a different sub-account. Sub-accounts are a reporting
   * dimension in this service, not separate trading identities.
   */
  readonly accountId: string;
  readonly type: EngineOrderType;
  readonly side: EngineSide;
  readonly qty: string;
  readonly price?: string | null;
  readonly stopPrice?: string | null;
  readonly tif: EngineTif;
}

export interface EngineFill {
  readonly sequence: number;
  readonly makerOrderId: string;
  readonly makerAccountId: string;
  readonly takerOrderId: string;
  readonly takerAccountId: string;
  readonly takerSide: EngineSide;
  readonly price: string;
  readonly qty: string;
}

export interface EngineResting {
  readonly kind: 'book' | 'stop';
  readonly orderId: string;
  readonly accountId: string;
  readonly side: EngineSide;
  readonly price: string;
  readonly remaining: string;
  readonly sequence: number;
}

/**
 * Quantity that left the engine without filling — an IOC remainder, a market
 * remainder, a self-trade-prevention pull, or an explicit cancel.
 *
 * svc-matching unifies these into one shape because svc-trade does the same
 * thing with all of them: release what is left of the hold.
 */
export interface EngineCancellation {
  readonly orderId: string;
  readonly accountId: string;
  readonly remainingQty: string;
  readonly sequence: number;
  readonly reason: string;
}

export interface EngineRejection {
  readonly code: string;
  readonly message: string;
}

export interface EngineTriggerOutcome {
  readonly orderId: string;
  readonly sequence: number;
  readonly fills: readonly EngineFill[];
  readonly resting: EngineResting | null;
  readonly cancellations: readonly EngineCancellation[];
  readonly rejected: EngineRejection | null;
}

export interface EngineSubmitResult {
  readonly accepted: boolean;
  readonly sequence: number | null;
  readonly fills: readonly EngineFill[];
  readonly resting: EngineResting | null;
  readonly rejected: EngineRejection | null;
  readonly cancellations: readonly EngineCancellation[];
  readonly triggered: readonly EngineTriggerOutcome[];
}

export interface EngineCancelResult {
  readonly cancelled: boolean;
  readonly orderId: string;
  readonly sequence: number | null;
  readonly cancellation: EngineCancellation | null;
}

export interface EngineDepth {
  readonly bids: ReadonlyArray<readonly [string, string]>;
  readonly asks: ReadonlyArray<readonly [string, string]>;
  readonly sequence: number;
}

export interface MatchingClient {
  submit(marketId: string, request: EngineSubmitRequest): Promise<EngineSubmitResult>;
  cancel(marketId: string, orderId: string): Promise<EngineCancelResult>;
  depth(marketId: string, limit?: number): Promise<EngineDepth>;
}

export class MatchingUnavailableError extends Error {
  constructor(
    message: string,
    readonly code = 'trade.matching_unavailable',
  ) {
    super(message);
    this.name = 'MatchingUnavailableError';
  }
}

/**
 * HTTP implementation.
 *
 * A rejection is a 200 with `accepted: false` — post-only refusing to cross is
 * the feature working, not an outage. Only transport failures and malformed
 * bodies throw, and when one does the caller must treat the submission as
 * INDETERMINATE: the engine may have accepted it. `trade-service.ts` handles
 * that case explicitly rather than assuming a failed request means a failed
 * order.
 */
export function createMatchingClient(baseUrl: string, internalSecret: string): MatchingClient {
  const url = baseUrl.replace(/\/$/, '');

  /**
   * Order WRITES to the engine are service-only (§2, §5.1).
   *
   * The engine is allowed to be pure precisely because it never sees an
   * unfunded order — and that holds only while svc-trade is the only thing able
   * to submit one. Those routes accepted anyone at all until this change.
   */
  const authHeaders = () => serviceAuthHeaders('svc-trade', internalSecret);

  async function call<T>(path: string, init: RequestInit): Promise<T> {
    let response: Response;
    try {
      response = await fetch(`${url}${path}`, init);
    } catch (err) {
      throw new MatchingUnavailableError(`svc-matching ${path} is unreachable: ${(err as Error).message}`);
    }

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new MatchingUnavailableError(`svc-matching ${path} failed (${response.status}): ${detail}`);
    }

    return (await response.json()) as T;
  }

  return {
    async submit(marketId, request) {
      return call<EngineSubmitResult>(`/markets/${encodeURIComponent(marketId)}/orders`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...authHeaders() },
        body: JSON.stringify(request),
      });
    },

    async cancel(marketId, orderId) {
      const path = `/markets/${encodeURIComponent(marketId)}/orders/${encodeURIComponent(orderId)}`;
      let response: Response;
      try {
        response = await fetch(`${url}${path}`, { method: 'DELETE', headers: authHeaders() });
      } catch (err) {
        throw new MatchingUnavailableError(`svc-matching ${path} is unreachable: ${(err as Error).message}`);
      }

      // 404 means the order is not live in the book — it already filled, or it
      // was already cancelled. That is an answer, not a failure: the caller
      // still has to reconcile the hold, and throwing here would leave it held.
      if (response.status === 404) {
        return { cancelled: false, orderId, sequence: null, cancellation: null };
      }
      if (!response.ok) {
        throw new MatchingUnavailableError(`svc-matching ${path} failed (${response.status})`);
      }

      return (await response.json()) as EngineCancelResult;
    },

    /**
     * AN EMPTY BOOK IS NOT AN UNAVAILABLE ENGINE.
     *
     * svc-matching answers 404 for a market it holds no book for, which is the
     * correct answer and a completely normal state: a listed market that has
     * never traded has no book. `call` treats every `!response.ok` as
     * `MatchingUnavailableError`, so that 404 was being reported as "the
     * matching engine is unavailable" and surfacing as **502 on the public CCXT
     * contract** — `/api/v1/ticker/:symbol` and `/api/v1/orderbook/:symbol`
     * returned 502 for every market that had not traded, which right now is all
     * of them. `/api/v1/trades` and `/api/v1/tickers` were fine only because
     * they do not read depth.
     *
     * "No orders yet" and "the engine is down" need different answers, because a
     * caller can act on the first and must retry the second.
     */
    async depth(marketId, limit = 1) {
      const path = `/markets/${encodeURIComponent(marketId)}/depth?limit=${limit}`;
      let response: Response;
      try {
        response = await fetch(`${url}${path}`, { method: 'GET', headers: authHeaders() });
      } catch (err) {
        throw new MatchingUnavailableError(`svc-matching ${path} is unreachable: ${(err as Error).message}`);
      }

      // The one status that means "asked and answered: nothing here".
      if (response.status === 404) return { bids: [], asks: [], sequence: 0 } satisfies EngineDepth;

      if (!response.ok) {
        const detail = await response.text().catch(() => '');
        throw new MatchingUnavailableError(`svc-matching ${path} failed (${response.status}): ${detail}`);
      }

      return (await response.json()) as EngineDepth;
    },
  };
}
