import { formatAmount, type Amount } from '@intafaced/ledger-client';
import { isActiveMerchant, type MerchantStatus } from './merchant-programme.js';

/**
 * WHAT A MERCHANT BADGE IS ACTUALLY WORTH — offer limits.
 *
 * `TRK-p2p.merchants.md` Stage 2: "Enforce limits on offer create". Stage 1
 * shipped the membership record; this is the first thing membership BUYS, and
 * it is what makes the badge more than decoration.
 *
 * ── WHY THE DEFAULT IS NO LIMIT ──────────────────────────────────────────
 *
 * The numbers are open product law. The spec's own §5 asks "badge tiers and
 * numeric limits — product law?" and the research pack forbids inventing them.
 *
 * That leaves two honest options and one dishonest one. The dishonest one is to
 * pick numbers that feel about right and ship them as though somebody decided:
 * a cap invented here would start refusing real offers from real traders on a
 * live market, and the person who eventually sets the real figure would be
 * arguing against a status quo nobody chose.
 *
 * So the MECHANISM ships and the POLICY does not. Unset means unlimited, which
 * is exactly today's behaviour — this PR cannot change what any existing offer
 * is allowed to do. When an operator sets a figure it takes effect immediately
 * and merchants get the higher one. `describeLimits` exists so the deployment
 * says which of the two states it is in, rather than leaving an operator to
 * infer it from an offer that did or did not refuse.
 *
 * ── WHY A CAP AT ALL ─────────────────────────────────────────────────────
 *
 * A P2P offer is a promise to complete a trade of that size. An account with no
 * record promising a very large one is the shape of most exit scams: the offer
 * is the bait, and the reputation to justify it does not exist. The merchant
 * programme is precisely the record that justifies a bigger promise, so the cap
 * and the badge are the same control seen from two sides.
 */

export interface OfferLimitPolicy {
  /**
   * Largest `maxAmt` an ordinary trader may offer, or `null` for no limit.
   * Scaled bigint, like every other amount in this repo.
   */
  readonly standardMaxAmount: Amount | null;
  /** Largest `maxAmt` an APPROVED merchant may offer, or `null` for no limit. */
  readonly merchantMaxAmount: Amount | null;
}

/** No policy configured. Identical to the behaviour before Stage 2 existed. */
export const NO_OFFER_LIMITS: OfferLimitPolicy = Object.freeze({
  standardMaxAmount: null,
  merchantMaxAmount: null,
});

/**
 * The ceiling that applies to one maker, or `null` for none.
 *
 * `null` status means "not in the programme" — which is the common case and
 * must never be an error. Only `approved` earns the merchant ceiling: an
 * application under review, or a suspended merchant, is on the standard one.
 * That is the whole point of suspension being reversible in Stage 1 — it has to
 * actually take something away.
 */
export function limitFor(status: MerchantStatus | null, policy: OfferLimitPolicy): Amount | null {
  if (status !== null && isActiveMerchant(status)) return policy.merchantMaxAmount;
  return policy.standardMaxAmount;
}

export type LimitVerdict = { readonly withinLimit: true } | { readonly withinLimit: false; readonly reason: string };

/**
 * May this maker offer up to `maxAmt`?
 *
 * The refusal names the ceiling and says how to raise it, because "limit
 * exceeded" tells a trader nothing they can act on — and the action here is a
 * real one: apply to the programme.
 */
export function checkOfferLimit(input: {
  status: MerchantStatus | null;
  maxAmt: Amount;
  asset: string;
  policy: OfferLimitPolicy;
}): LimitVerdict {
  const ceiling = limitFor(input.status, input.policy);
  if (ceiling === null) return { withinLimit: true };
  if (input.maxAmt <= ceiling) return { withinLimit: true };

  const over = `${formatAmount(input.maxAmt)} ${input.asset} exceeds the ${formatAmount(ceiling)} ${input.asset} ceiling`;
  if (input.status !== null && isActiveMerchant(input.status)) {
    return { withinLimit: false, reason: `${over} for merchant offers.` };
  }
  const route =
    input.policy.merchantMaxAmount === null || input.policy.merchantMaxAmount > ceiling
      ? ' Approved merchants may offer more — see the merchant programme.'
      : '';
  return { withinLimit: false, reason: `${over} for this account.${route}` };
}

/** One line for the boot log, so a deployment states which posture it is in. */
export function describeLimits(policy: OfferLimitPolicy): { level: 'info' | 'warn'; summary: string } {
  if (policy.standardMaxAmount === null && policy.merchantMaxAmount === null) {
    return {
      level: 'warn',
      summary:
        'p2p offer limits: NONE CONFIGURED — any account may offer any size, and the merchant badge buys nothing. ' +
        'Set P2P_OFFER_MAX_STANDARD / P2P_OFFER_MAX_MERCHANT to arm this.',
    };
  }
  const standard = policy.standardMaxAmount === null ? 'unlimited' : formatAmount(policy.standardMaxAmount);
  const merchant = policy.merchantMaxAmount === null ? 'unlimited' : formatAmount(policy.merchantMaxAmount);
  return { level: 'info', summary: `p2p offer limits: standard ${standard} · approved merchant ${merchant}` };
}
