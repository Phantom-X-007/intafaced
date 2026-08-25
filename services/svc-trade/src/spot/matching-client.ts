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
 * amend (PATCH), depth, the non-destructive live-order list (GET), and
 * scheduled reconcile. It does not import matching source (§15.2).
 */

export type EngineOrderType = 'market' | 'limit' | 'stop' | 'stop_limit';
export type EngineSide = 'buy' | 'sell';
export type EngineTif = 'GTC' | 'IOC' | 'FOK' | 'PO' | 'GTD' | 'GTT';

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
  /** Caller expire instant for GTD/GTT. The engine does not invent one. */
  readonly expireAt?: string;
  /** Caller reduce-only. Matching refuses would_increase_position. Trade does not invent a mark. */
  readonly reduceOnly?: boolean;
  /** Linked TP+SL sibling. Matching cancels the other on first fill. */
  readonly ocoSiblingId?: string;
  /** Exact PX-S01 admission evidence used before the hold and this submit. */
  readonly lifecycleProof?: LifecycleAdmissionProof;
}
