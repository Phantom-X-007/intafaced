/**
 * MANDATE PRODUCT PATHS (D26-P1-P6 / SPEC §4).
 *
 * The merchant surface already stores mandates and runs the cycle. This module
 * is the product law those call sites share so card and crypto stay honest:
 *
 *  - crypto_invoice → open an invoice (never invent an on-chain pull)
 *  - card / card_mandate → refuse `pay.mandate_rail_absent` (rail port has
 *    createMandate/revokeMandate and no charge-against-mandate operation)
 *  - pre-charge notify → named §13 gap (`socket.pay-precharge-notify`); never
 *    invent a "notified" event before money-path work
 *
 * SPEC Done bar for mandates: mandate exists, charge traces to it, cancel is
 * immediate, price change without re-consent is refused in code. Board Done bar
 * also requires notify gaps honest — that is the socket below, not a stub hook.
 */

import type { Amount } from '@intafaced/ledger-client';
import { PayError } from '../payment-service.js';
import { MAX_ATTEMPTS_PER_CYCLE } from './charge-cycle.js';

/** Paths that may be stored. Anything else is refuse-closed (no silent crypto). */
export const SUBSCRIPTION_PATHS = ['crypto_invoice', 'card'] as const;
export type SubscriptionPath = (typeof SUBSCRIPTION_PATHS)[number];

/**
 * Default `crypto_invoice`. `card_mandate` aliases `card` (fire refuses
 * `pay.mandate_rail_absent`). Unknown strings refuse — they used to open a
 * crypto invoice, which is inventing a rail under a wrong name.
 */
export function normaliseSubscriptionPath(path: string | undefined): SubscriptionPath {
  const raw = (path ?? 'crypto_invoice').trim();
  if (raw === 'crypto_invoice') return 'crypto_invoice';
  if (raw === 'card' || raw === 'card_mandate') return 'card';
  throw new PayError(`Subscription path ${JSON.stringify(raw)} is not supported — use crypto_invoice or card`, 'pay.subscription_invalid', {
    path: raw,
  });
}

/** §13 — SPEC §4 "Every charge is notified before it lands, not after." */
export const PRECHARGE_NOTIFY_SOCKET = 'socket.pay-precharge-notify' as const;

/**
 * Card auto-pull rides the acquiring commercial socket. The rail port can store
 * a mandate reference once an acquirer exists; charge-against-mandate is still
 * not on the port, and inventing it here would invent a second money path.
 */
export const CARD_MANDATE_CHARGE_SOCKET = 'socket.psp-partners' as const;

export type MandateChargeDisposition =
  { kind: 'open_crypto_invoice' } | { kind: 'refuse'; code: 'pay.mandate_rail_absent'; socket: typeof CARD_MANDATE_CHARGE_SOCKET };

export interface MandatePathRow {
  path: SubscriptionPath;
  /** What fire does with money. */
  charge: MandateChargeDisposition['kind'];
  /** Human-readable posture — never "done" for absent rails. */
  posture: string;
}

/** Product matrix for subscription fire — both halves named, neither invented. */
export const MANDATE_PATH_MATRIX: readonly MandatePathRow[] = [
  {
    path: 'crypto_invoice',
    charge: 'open_crypto_invoice',
    posture: 'invoice-and-watch — opens a payment; customer pays; capture settles the period',
  },
  {
    path: 'card',
    charge: 'refuse',
    posture: `absent charge-against-mandate — refuse pay.mandate_rail_absent until ${CARD_MANDATE_CHARGE_SOCKET}`,
  },
] as const;

/** Pre-charge notify is not wired. Merchants get post-payment webhooks only. */
export function preChargeNotifyGap(): {
  status: 'absent';
  socket: typeof PRECHARGE_NOTIFY_SOCKET;
  inventForbidden: true;
} {
  return {
    status: 'absent',
    socket: PRECHARGE_NOTIFY_SOCKET,
    inventForbidden: true,
  };
}

/**
 * Decide what fire may do for a stored subscription path.
 * Unknown paths refuse at create (`normaliseSubscriptionPath`); this is the
 * money-path half so attemptCycle cannot invent a third arm.
 */
export function mandateChargeDisposition(path: string): MandateChargeDisposition {
  const normalised = normaliseSubscriptionPath(path);
  if (normalised === 'crypto_invoice') return { kind: 'open_crypto_invoice' };
  return {
    kind: 'refuse',
    code: 'pay.mandate_rail_absent',
    socket: CARD_MANDATE_CHARGE_SOCKET,
  };
}

/**
 * Traceability for SPEC §4: a charge that cannot name its mandate does not go out.
 * Pure shape check — callers supply the joined row from executions→subscriptions→mandates.
 */
export function assertChargeTracesToMandate(input: {
  executionSubscriptionId: string;
  subscriptionId: string;
  mandateId: string | null | undefined;
  mandateStatus: 'active' | 'cancelled' | 'expired' | null | undefined;
  amount: Amount;
  mandateAmount: Amount | null | undefined;
}): void {
  if (!input.mandateId) {
    throw new PayError('Charge has no mandate — refused', 'pay.mandate_not_found');
  }
  if (input.executionSubscriptionId !== input.subscriptionId) {
    throw new PayError('Execution is not keyed to its subscription', 'pay.subscription_invalid');
  }
  if (input.mandateStatus !== 'active') {
    throw new PayError(`Mandate ${input.mandateId} is ${input.mandateStatus ?? 'missing'}`, 'pay.mandate_inactive');
  }
  if (input.mandateAmount === null || input.mandateAmount === undefined) {
    throw new PayError('Mandate amount missing — refuse charge', 'pay.subscription_invalid');
  }
  if (input.amount !== input.mandateAmount) {
    // Ceiling checks live in assertWithinMandateCeiling; equality here is the
    // "traced amount" pin for the period claim (period amount = mandate amount).
    throw new PayError('Charge amount does not match mandate amount', 'pay.subscription_exceeds_mandate');
  }
}

/** Bounded dunning — same operational bound as the cycle engine. Not invent rates. */
export function mandateDunningBound(): { maxAttemptsPerCycle: number; then: 'stall_named' } {
  return { maxAttemptsPerCycle: MAX_ATTEMPTS_PER_CYCLE, then: 'stall_named' };
}

/** True when a path may open money today without an acquirer socket. */
export function pathOpensMoney(path: string): boolean {
  return mandateChargeDisposition(path).kind === 'open_crypto_invoice';
}
