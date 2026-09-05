import { formatAmount, parseAmount, type Amount } from '@intafaced/ledger-client';
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
 * So the MECHANISM ships and the POLICY does not. Unset still refuses nothing
 * (same as before Stage 2), but it is not the same claim as an owner writing
 * the literal `unlimited`. Clients learn that three-way posture without a
 * refuse-first probe. When an operator sets a figure it takes effect
 * immediately and only `approved` standing earns the merchant slot.
 *
 * ── WHY A CAP AT ALL ─────────────────────────────────────────────────────
 *
 * A P2P offer is a promise to complete a trade of that size. An account with no
 * record promising a very large one is the shape of most exit scams: the offer
 * is the bait, and the reputation to justify it does not exist. The merchant
 * programme is precisely the record that justifies a bigger promise, so the cap
 * and the badge are the same control seen from two sides.
 */

export type OfferLimitMode = 'unset' | 'unlimited' | 'capped';

/** Deployment-level posture. `configured` means at least one band is a number. */
export type OfferLimitsPosture = 'unset' | 'unlimited' | 'configured';

export interface OfferLimitPolicy {
  /**
   * Largest `maxAmt` an ordinary trader may offer, or `null` for no limit.
   * Scaled bigint, like every other amount in this repo.
   */
  readonly standardMaxAmount: Amount | null;
  /** Largest `maxAmt` an APPROVED merchant may offer, or `null` for no limit. */
  readonly merchantMaxAmount: Amount | null;
  /** When omitted, a null amount is treated as `unset` (not owner-confirmed unlimited). */
  readonly standardMode?: OfferLimitMode;
  readonly merchantMode?: OfferLimitMode;
}

/** No policy configured. Identical to the behaviour before Stage 2 existed. */
export const NO_OFFER_LIMITS: OfferLimitPolicy = Object.freeze({
  standardMaxAmount: null,
  merchantMaxAmount: null,
  standardMode: 'unset',
  merchantMode: 'unset',
});

export function bandMode(amount: Amount | null, mode?: OfferLimitMode): OfferLimitMode {
  if (mode) return mode;
  return amount === null ? 'unset' : 'capped';
}

export function offerLimitsPosture(policy: OfferLimitPolicy): OfferLimitsPosture {
  const standard = bandMode(policy.standardMaxAmount, policy.standardMode);
  const merchant = bandMode(policy.merchantMaxAmount, policy.merchantMode);
  if (standard === 'capped' || merchant === 'capped') return 'configured';
  if (standard === 'unlimited' || merchant === 'unlimited') return 'unlimited';
  return 'unset';
}

/**
 * Owner env → policy. Unset / blank stays a null ceiling (`unset` mode).
 *
 * `P2P_OFFER_MAX_STANDARD` / `P2P_OFFER_MAX_MERCHANT` are product law. A
 * default numeric max invented here would start refusing offers that an unset
 * deployment allows today. Armed values are decimal strings; the literal
 * `unlimited` is owner confirmation, not a magnitude.
 */
export function offerLimitsFromEnv(env: {
  P2P_OFFER_MAX_STANDARD?: string | undefined;
  P2P_OFFER_MAX_MERCHANT?: string | undefined;
}): OfferLimitPolicy {
  const standard = bandFromEnv(env.P2P_OFFER_MAX_STANDARD);
  const merchant = bandFromEnv(env.P2P_OFFER_MAX_MERCHANT);
  return {
    standardMaxAmount: standard.maxAmount,
    merchantMaxAmount: merchant.maxAmount,
    standardMode: standard.mode,
    merchantMode: merchant.mode,
  };
}

function bandFromEnv(raw: string | undefined): { mode: OfferLimitMode; maxAmount: Amount | null } {
  if (raw === undefined) return { mode: 'unset', maxAmount: null };
  const trimmed = raw.trim();
  if (trimmed.length === 0) return { mode: 'unset', maxAmount: null };
  if (trimmed.toLowerCase() === 'unlimited') return { mode: 'unlimited', maxAmount: null };
  return { mode: 'capped', maxAmount: parseAmount(trimmed) };
}

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

/** True when at least one ceiling is a number. Mirror of `moderationConfigured` for limits. */
export function limitsConfigured(policy: OfferLimitPolicy): boolean {
  return offerLimitsPosture(policy) === 'configured';
}

function bandLabel(amount: Amount | null, mode?: OfferLimitMode): string {
  const resolved = bandMode(amount, mode);
  if (resolved === 'capped' && amount !== null) return formatAmount(amount);
  return resolved;
}

/**
 * Deployment posture on the wire — decimal strings or null (no numeric cap).
 *
 * Boot logs already print this via `describeLimits`. The API must too: a client
 * that only learns a ceiling exists by getting refused is not an honest surface,
 * and an operator dashboard that scrapes process logs is not a product API.
 * Numbers still come only from env; this never invents magnitudes.
 * `posture` distinguishes unset vs owner-confirmed unlimited vs configured.
 */
export function limitsOnWire(policy: OfferLimitPolicy): {
  standardMax: string | null;
  merchantMax: string | null;
  configured: boolean;
  posture: OfferLimitsPosture;
  standardMode: OfferLimitMode;
  merchantMode: OfferLimitMode;
  summary: string;
} {
  const described = describeLimits(policy);
  return {
    standardMax: policy.standardMaxAmount === null ? null : formatAmount(policy.standardMaxAmount),
    merchantMax: policy.merchantMaxAmount === null ? null : formatAmount(policy.merchantMaxAmount),
    configured: limitsConfigured(policy),
    posture: offerLimitsPosture(policy),
    standardMode: bandMode(policy.standardMaxAmount, policy.standardMode),
    merchantMode: bandMode(policy.merchantMaxAmount, policy.merchantMode),
    summary: described.summary,
  };
}

/**
 * The ceiling that binds THIS maker right now, as the client should show it.
 *
 * `band` is which policy slot applied — not a badge claim. An applicant still
 * under review is on the standard band even though they have a merchant row.
 */
export function ceilingOnWire(
  status: MerchantStatus | null,
  policy: OfferLimitPolicy,
): {
  maxAmount: string | null;
  band: 'standard' | 'merchant';
  limitMode: OfferLimitMode;
  merchantStatus: MerchantStatus | null;
} {
  const band: 'standard' | 'merchant' = status !== null && isActiveMerchant(status) ? 'merchant' : 'standard';
  const ceiling = limitFor(status, policy);
  const limitMode =
    band === 'merchant' ? bandMode(policy.merchantMaxAmount, policy.merchantMode) : bandMode(policy.standardMaxAmount, policy.standardMode);
  return {
    maxAmount: ceiling === null ? null : formatAmount(ceiling),
    band,
    limitMode,
    merchantStatus: status,
  };
}

/** One line for the boot log, so a deployment states which posture it is in. */
export function describeLimits(policy: OfferLimitPolicy): { level: 'info' | 'warn'; summary: string } {
  const posture = offerLimitsPosture(policy);
  if (posture === 'unset') {
    return {
      level: 'warn',
      summary:
        'p2p offer limits: NONE CONFIGURED (unset) — any account may offer any size, and the merchant badge buys nothing. ' +
        'Set P2P_OFFER_MAX_STANDARD / P2P_OFFER_MAX_MERCHANT to a decimal string to arm, or the literal unlimited to confirm no ceiling.',
    };
  }
  if (posture === 'unlimited') {
    return {
      level: 'info',
      summary:
        'p2p offer limits: UNLIMITED (owner-confirmed) — any account may offer any size. ' +
        'The merchant badge buys no extra ceiling until a numeric P2P_OFFER_MAX_* is set.',
    };
  }
  const standard = bandLabel(policy.standardMaxAmount, policy.standardMode);
  const merchant = bandLabel(policy.merchantMaxAmount, policy.merchantMode);
  return { level: 'info', summary: `p2p offer limits: standard ${standard} · approved merchant ${merchant}` };
}
