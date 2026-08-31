import { serviceAuthHeadersForBody } from '@intafaced/contracts';
import type { LifecycleAdmissionProof } from '../lifecycle-proof.js';

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
 * What this port exposes for money-safe recovery: submit, cancel, native
 * amend (PATCH), mass-cancel by account owner, depth, the non-destructive
 * live-order list (GET), and scheduled reconcile. It does not import matching
 * source (§15.2). Mass-cancel owner is accountId. Session is not a field —
 * this client never sends one.
 */

export type EngineOrderType = 'market' | 'limit' | 'stop' | 'stop_limit' | 'option';
export type EngineSide = 'buy' | 'sell';
export type EngineTif = 'GTC' | 'IOC' | 'FOK' | 'PO' | 'GTD' | 'GTT';

export interface EngineSubmitRequest {
  readonly orderId: string;
  /**
   * §5.1: "it speaks in account IDs". This service passes the USER id. Matching
   * fillableQty/FOK stops at own rest (`self_trade`) — incoming does not rest,
   * resting stays, no self-fill. Empty accountIds still fill. Sub-accounts are
   * a reporting dimension here, not separate trading identities. Trade does
   * not invent STP modes.
   */
  readonly accountId: string;
  readonly type: EngineOrderType;
  readonly side: EngineSide;
  readonly qty: string;
  readonly price?: string | null;
  readonly stopPrice?: string | null;
  /** Caller stop trigger. Matching refuses missing. Trade does not invent a trigger. */
  readonly stopPx?: string | null;
  readonly tif: EngineTif;
  /** Caller expire instant for GTD/GTT. The engine does not invent one. */
  readonly expireAt?: string;
  /** Caller reduce-only. Matching refuses would_increase_position. Trade does not invent a mark. */
  readonly reduceOnly?: boolean;
  /** Visible peak for an iceberg. Matching refuses missing/not-smaller. Trade does not invent a display. */
  readonly iceberg?: boolean;
  readonly displayQty?: string | null;
  /** Trail distance. Matching refuses missing. Trade does not invent a distance. */
  readonly trail?: string | null;
  /** Injected mark the trail walks with. Matching refuses missing. Trade does not invent a mark. */
  readonly mark?: string | null;
  /** Minimum fill qty. Missing or zero is not set. Trade does not invent a default. */
  readonly minQty?: string | null;
  /** All-or-none. Missing or false is a normal place. Trade does not invent AON. */
  readonly aon?: boolean;
  /** Peg / midpoint / relative. Matching refuses true. Trade does not invent a mid. */
  readonly peg?: boolean;
  readonly midpoint?: boolean;
  readonly relative?: boolean;
  /** Auction / benchmark. Matching refuses true. Trade does not invent an auction price. */
  readonly auction?: boolean;
  readonly benchmark?: boolean;
  /**
   * Price collar. Matching refuses missing min/max (`missing_collar`) and a
   * submit outside the band (`outside_collar`). Trade does not invent last or mid.
   */
  readonly collar?: boolean;
  readonly min?: string | null;
  readonly max?: string | null;
  /** Option strike. Matching refuses missing. Trade does not invent a mark. */
  readonly strike?: string | null;
  /** Option expiry. Matching refuses missing. Trade does not invent an expiry. */
  readonly expiry?: string | null;
  /** Exercise a long option at strike. Matching refuses missing strike/expiry. Trade does not invent a mark. */
  readonly exercise?: boolean;
  /** Exact PX-S01 admission evidence used before the hold and this submit. */
  readonly lifecycleProof?: LifecycleAdmissionProof;
}
