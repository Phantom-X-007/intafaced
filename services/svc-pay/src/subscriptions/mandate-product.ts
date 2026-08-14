/**
 * MANDATE PRODUCT LAW (D26-P1-P6 / SPEC §4 / board Done bar).
 *
 * Merchant surface, due runner, and Done-bar suites share this module so card
 * and crypto cannot drift into invented rails or invented "notified" events:
 *
 *  - crypto_invoice → open an invoice (never invent an on-chain pull)
 *  - card / card_mandate → refuse `pay.mandate_rail_absent` (`socket.psp-partners`)
 *  - pre-charge notify → named §13 gap (`socket.pay-precharge-notify`); fire
 *    acknowledges the gap before openInvoice; `notified` is never true here
 *  - dunning → MAX_ATTEMPTS_PER_CYCLE then named stall (`arrears`), reachable
 *    from the fire path (not a docs-only bound)
 *
 * SPEC Done bar: mandate exists, charge traces to it, cancel is immediate,
 * price/terms change without re-consent is refused in code.
 * Board Done bar: mandates product-complete; notify gaps honest.
 */

import type { Amount } from '@intafaced/ledger-client';
import { PayError } from '../payment-service.js';
import { MAX_ATTEMPTS_PER_CYCLE, type StallReason } from './charge-cycle.js';

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

/** Stall reason when bounded dunning spends every attempt on a period. */
export const DUNNING_STALL_REASON: StallReason = 'arrears';

export type MandateChargeDisposition =
  { kind: 'open_crypto_invoice' } | { kind: 'refuse'; code: 'pay.mandate_rail_absent'; socket: typeof CARD_MANDATE_CHARGE_SOCKET };

export interface MandatePathRow {
  path: SubscriptionPath;
  /** What fire does with money. */
  charge: MandateChargeDisposition['kind'];
  /** Human-readable posture — never "done" for absent rails. */
  posture: string;
  /** Whether this path may open a payment today. */
  opensMoney: boolean;
}

/** Product matrix for subscription fire — both halves named, neither invented. */
export const MANDATE_PATH_MATRIX: readonly MandatePathRow[] = [
  {
    path: 'crypto_invoice',
    charge: 'open_crypto_invoice',
    opensMoney: true,
    posture: 'invoice-and-watch — opens a payment; customer pays; capture settles the period',
  },
  {
    path: 'card',
    charge: 'refuse',
    opensMoney: false,
    posture: `absent charge-against-mandate — refuse pay.mandate_rail_absent until ${CARD_MANDATE_CHARGE_SOCKET}`,
  },
] as const;

export type PreChargeNotifyGap = {
  status: 'absent';
  socket: typeof PRECHARGE_NOTIFY_SOCKET;
  inventForbidden: true;
  /** Merchants must never read this as a successful pre-charge delivery. */
  notified: false;
  merchantReadable: 'Pre-charge notify is not delivered. Post-payment webhooks may fire after money-path work. Closing needs socket.pay-precharge-notify.';
};

/** Pre-charge notify is not wired. Merchants get post-payment webhooks only. */
export function preChargeNotifyGap(): PreChargeNotifyGap {
  return {
    status: 'absent',
    socket: PRECHARGE_NOTIFY_SOCKET,
    inventForbidden: true,
    notified: false,
    merchantReadable:
      'Pre-charge notify is not delivered. Post-payment webhooks may fire after money-path work. Closing needs socket.pay-precharge-notify.',
  };
}

/**
 * Fire-path acknowledge — call BEFORE openInvoice.
 *
 * Returns the honest gap. Never invents `notified: true`. Does not call
 * merchant webhooks, svc-notify, or enqueue. Wiring a real delivery path later
 * replaces this body; inventing a silent success here is forbidden.
 */
export function acknowledgePreChargeNotifyBeforeCharge(input: {
  subscriptionId: string;
  occurrence: number;
  path: string;
}): PreChargeNotifyGap & { subscriptionId: string; occurrence: number; path: SubscriptionPath } {
  const path = normaliseSubscriptionPath(input.path);
  const gap = preChargeNotifyGap();
  return {
    ...gap,
    subscriptionId: input.subscriptionId,
    occurrence: input.occurrence,
    path,
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
export function mandateDunningBound(): {
  maxAttemptsPerCycle: number;
  then: 'stall_named';
  stallReason: 'arrears';
} {
  return {
    maxAttemptsPerCycle: MAX_ATTEMPTS_PER_CYCLE,
    then: 'stall_named',
    stallReason: 'arrears',
  };
}

/** True when attemptCount has spent the product bound (fire path + planner). */
export function dunningAttemptsExhausted(attemptCount: number): boolean {
  return attemptCount >= MAX_ATTEMPTS_PER_CYCLE;
}

/** True when a path may open money today without an acquirer socket. */
export function pathOpensMoney(path: string): boolean {
  return mandateChargeDisposition(path).kind === 'open_crypto_invoice';
}

/**
 * Card mandate door: a `card` / `card_mandate` path must refuse
 * `pay.mandate_rail_absent`. Crypto is not this door — it may open an invoice.
 *
 * Fire already uses `mandateChargeDisposition`. This assertion is the pin a
 * test can call without inventing a pull: if it throws, the card rail opened.
 */
export function assertCardMandateCannotOpenMoney(path: string): void {
  const normalised = normaliseSubscriptionPath(path);
  if (normalised !== 'card') return;
  if (pathOpensMoney(path)) {
    throw new PayError(
      `Card mandate path ${JSON.stringify(path)} opened money — acquiring is ${CARD_MANDATE_CHARGE_SOCKET}`,
      'pay.mandate_rail_absent',
      { path, socket: CARD_MANDATE_CHARGE_SOCKET },
    );
  }
  const d = mandateChargeDisposition(path);
  if (d.kind !== 'refuse' || d.code !== 'pay.mandate_rail_absent') {
    throw new PayError(
      `Card mandate rail must refuse pay.mandate_rail_absent (${CARD_MANDATE_CHARGE_SOCKET})`,
      'pay.mandate_rail_absent',
      { path, socket: CARD_MANDATE_CHARGE_SOCKET },
    );
  }
}

/**
 * Merchant / Ready surface — product posture in one object.
 *
 * Crypto mandate lifecycle is product-complete on tip (invoice-and-watch).
 * Card charge-against-mandate and pre-charge delivery remain named sockets.
 * `notified` is always false here so Ready cannot be read as "customers were told".
 */
export function subscriptionsProductPosture(): {
  mountain: 'pay.subscriptions';
  boardDoneBar: 'Mandates product-complete; notify gaps honest';
  paths: readonly MandatePathRow[];
  crypto: { status: 'product_complete'; charge: 'open_crypto_invoice'; model: 'invoice-and-watch' };
  card: {
    status: 'refuse_closed';
    code: 'pay.mandate_rail_absent';
    socket: typeof CARD_MANDATE_CHARGE_SOCKET;
  };
  dunning: ReturnType<typeof mandateDunningBound>;
  preChargeNotify: PreChargeNotifyGap;
  cancel: { immediacy: 'immediate'; retentionDelayForbidden: true };
  reconsent: { priceOrCeilingChange: 'refuse'; code: 'pay.subscription_reconsent_required' };
} {
  return {
    mountain: 'pay.subscriptions',
    boardDoneBar: 'Mandates product-complete; notify gaps honest',
    paths: MANDATE_PATH_MATRIX,
    crypto: { status: 'product_complete', charge: 'open_crypto_invoice', model: 'invoice-and-watch' },
    card: {
      status: 'refuse_closed',
      code: 'pay.mandate_rail_absent',
      socket: CARD_MANDATE_CHARGE_SOCKET,
    },
    dunning: mandateDunningBound(),
    preChargeNotify: preChargeNotifyGap(),
    cancel: { immediacy: 'immediate', retentionDelayForbidden: true },
    reconsent: { priceOrCeilingChange: 'refuse', code: 'pay.subscription_reconsent_required' },
  };
}
