import { checkAccess, tierSatisfies, type AccessDecision, type KycTier, type RegionCode } from '@intafaced/config';
import type { Amount } from '@intafaced/ledger-client';

/**
 * CARD PROGRAMME POLICY (§18, §22, §8.1).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WE DO NOT ISSUE CARDS, AND THAT IS THE ENTIRE REASON THIS FILE EXISTS.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * §18 calls the card "adapter-isolated": it "rides the existing
 * CardIssuerAdapter — issuer risk is a swappable module". That is not a
 * convenience, it is a description of the only structure this product can have.
 * A card that spends on a scheme is issued by a licensed institution, under
 * that institution's programme, subject to that institution's regulator. We are
 * the programme MANAGER. The issuer carries the obligation.
 *
 * The consequence, and the thing this file encodes: **we do not set the KYC
 * floor on a card. The issuer does, and their regulator sets theirs.** So the
 * floor cannot be a constant in our source — it is a per-programme,
 * per-issuer, per-region, counsel-reviewed row, exactly as
 * `docs/decisions/kyc-posture.md` (owner-directed) requires:
 *
 *   > "the tier thresholds are an issuer negotiation, not an engineering
 *   >  decision… they should be a configured parameter, not a constant, because
 *   >  the first issuer will change them and the second will disagree."
 *
 * ── WHAT A "ZERO-KYC CARD" IS, PRECISELY ────────────────────────────────────
 *
 * §18 does not say "no verification". It says: "minimal-verification low-limit
 * tier **where issuer jurisdiction lawfully allows simplified due diligence**;
 * higher limits step up verification. Friction-tiering, not compliance-
 * skipping — this is why the card is still alive in year three."
 *
 * So a programme with `requiredTier: 'none'` is representable here. It is not
 * reachable until an issuer has signed a programme that supports it AND counsel
 * has signed the row. Both are enforced below, not documented below.
 *
 * ── THE ONE INVARIANT THAT MATTERS ──────────────────────────────────────────
 *
 * A zero-KYC CUSTODIAL card is not a product, it is an unlicensed money
 * transmission problem wearing a product's clothes. §22 is unambiguous — zero
 * KYC follows custody — so a programme that asks for no verification must be
 * one where we hold nothing: `fundingSource: 'self_custody'`. `assertProgramme`
 * refuses the other combination outright, which makes the dangerous card
 * unrepresentable rather than merely discouraged.
 */

/** Where the money behind a swipe comes from. */
export const CARD_FUNDING_SOURCES = [
  /**
   * The user's own ledger balance, held at authorisation and released or
   * captured as the scheme decides. Custodial: we hold it, so §22 says a tier
   * applies and the matrix says which.
   */
  'ledger',
  /**
   * §18: "funds live in the user's smart account until the authorization
   * moment; spend pulls exact fiat equivalent via just-in-time conversion."
   * We hold nothing, which is what makes a minimal-verification tier lawful
   * where the issuer's regulator allows it.
   */
  'self_custody',
] as const;
export type CardFundingSource = (typeof CARD_FUNDING_SOURCES)[number];

export const CARD_PROGRAMME_STATUSES = ['draft', 'live', 'suspended'] as const;
export type CardProgrammeStatus = (typeof CARD_PROGRAMME_STATUSES)[number];

/**
 * One issuer's programme, in one region, at one verification tier.
 *
 * Every number here is a POLICY LIMIT — what the issuer will let us do. None of
 * them is a balance, and none accumulates. "How much has this card spent today"
 * is a SUM over authorisation records, computed when asked.
 */
export interface CardProgramme {
  readonly id: string;
  /** Operator-facing label, e.g. 'sovereign', 'verified'. Not a magic value. */
  readonly code: string;
  /** The `CardIssuerAdapter.id` that runs it. Decides the ledger boundary account. */
  readonly issuerId: string;
  /** ISO-3166 alpha-2, or '*' for the issuer's default programme. */
  readonly region: RegionCode;
  readonly fundingSource: CardFundingSource;
  /**
   * The verification floor THE ISSUER requires for this programme. Never our
   * choice, and never below what the JURISDICTION_MATRIX independently demands
   * — `resolveCardAccess` applies both and the stricter one wins.
   */
  readonly requiredTier: KycTier;
  readonly perAuthorizationLimit: Amount;
  readonly dailyLimit: Amount;
  readonly monthlyLimit: Amount;
  readonly atmEnabled: boolean;
  readonly onlineEnabled: boolean;
  readonly crossBorderEnabled: boolean;
  /** §18 "cashback in IFC". Paid by `rewardPay`; this is only the rate. */
  readonly cashbackBps: number;
  readonly status: CardProgrammeStatus;
  /** Counsel sign-off, mirroring `assertReviewed` on the matrix. */
  readonly reviewedBy: string | null;
  readonly reviewedAt: Date | null;
}

export type CardProgrammeFault =
  | 'programme.zero_tier_requires_self_custody'
  | 'programme.limits_not_positive'
  | 'programme.limits_out_of_order'
  | 'programme.cashback_out_of_range'
  | 'programme.live_without_review';

export class CardProgrammeError extends Error {
  constructor(
    readonly code: CardProgrammeFault,
    message: string,
  ) {
    super(message);
    this.name = 'CardProgrammeError';
  }
}

/**
 * Every rule a programme row must satisfy before it can exist.
 *
 * Called on write and on read. On read as well, because a row that was legal
 * when it was inserted and is not legal now — because someone edited it in
 * psql, or because a migration back-filled a column — must fail closed at the
 * moment it would otherwise authorise a payment.
 */
export function assertProgramme(p: CardProgramme): void {
  /**
   * THE RULE. §22: zero-KYC follows custody.
   *
   * A programme that asks nothing of the user is only defensible where we hold
   * nothing of theirs. Inverted, this is the sentence that has to stay false in
   * this codebase: "we take custody of your money and we never asked who you
   * are." There is no jurisdiction in which that is a product.
   */
  if (p.requiredTier === 'none' && p.fundingSource !== 'self_custody') {
    throw new CardProgrammeError(
      'programme.zero_tier_requires_self_custody',
      `Programme "${p.code}" asks for no verification while funding from ${p.fundingSource}. ` +
        'Zero KYC follows custody (§22): a minimal-verification tier is only lawful on a card we do not fund from a balance we hold.',
    );
  }

  if (p.perAuthorizationLimit <= 0n || p.dailyLimit <= 0n || p.monthlyLimit <= 0n) {
    throw new CardProgrammeError(
      'programme.limits_not_positive',
      `Programme "${p.code}" has a non-positive limit. A limit of zero is a card that cannot spend; express that as status 'suspended'.`,
    );
  }

  // A per-transaction cap above the daily cap is not a cap, and the arithmetic
  // in `decideAuthorization` would silently never reach the tighter one.
  if (p.perAuthorizationLimit > p.dailyLimit || p.dailyLimit > p.monthlyLimit) {
    throw new CardProgrammeError(
      'programme.limits_out_of_order',
      `Programme "${p.code}" limits must satisfy perAuthorization ≤ daily ≤ monthly.`,
    );
  }

  if (!Number.isInteger(p.cashbackBps) || p.cashbackBps < 0 || p.cashbackBps >= 10_000) {
    throw new CardProgrammeError('programme.cashback_out_of_range', `Programme "${p.code}" cashback must be 0–9999 bps.`);
  }

  /**
   * The same gate `assertReviewed` puts on a launch market, for the same
   * reason. A live card programme is a set of claims about what an issuer's
   * regulator permits in a region. Nobody in this repo is qualified to make
   * those claims, so a programme cannot go live without a name and a date
   * against it.
   */
  if (p.status === 'live' && (!p.reviewedBy || !p.reviewedAt)) {
    throw new CardProgrammeError(
      'programme.live_without_review',
      `Programme "${p.code}" cannot be live without reviewedBy and reviewedAt. ` +
        'A card programme encodes what an issuer’s regulator permits; that needs counsel sign-off, not a deploy.',
    );
  }
}

export type CardAccessCode =
  | 'allowed'
  /** The JURISDICTION_MATRIX refused. Carries the underlying decision. */
  | 'denied.jurisdiction'
  | 'denied.programme_not_live'
  | 'denied.programme_unreviewed'
  | 'denied.programme_tier';

export interface CardAccessDecision {
  readonly allowed: boolean;
  readonly code: CardAccessCode;
  /** What the caller must reach to proceed — the actionable half. */
  readonly requiredTier?: KycTier;
  /** Present whenever the matrix was the thing that refused. */
  readonly jurisdiction?: AccessDecision;
  readonly reason: string;
}

export interface CardAccessQuery {
  readonly programme: CardProgramme;
  readonly region: RegionCode;
  readonly kycTier: KycTier;
}

/**
 * May this caller hold a card on this programme?
 *
 * TWO GATES, AND THE STRICTER ONE WINS. This function cannot be used to reach a
 * card the matrix would refuse, because it asks the matrix first and returns
 * its refusal unchanged. It only ever ADDS the issuer's floor on top.
 *
 * That ordering is the safety property. `bank` is `OPEN_FULL` in
 * `DEFAULT_MODULE_RULES` today, so a programme row saying `requiredTier: 'none'`
 * changes nothing on its own — a tier-`none` user is still refused, by the
 * matrix, with `denied.kyc_required`. Making the sovereign tier actually
 * reachable is a JURISDICTION_MATRIX change signed by counsel, in a file this
 * service does not own. That is the correct place for it to be blocked, and
 * `policy.test.ts` asserts it stays blocked.
 */
export function resolveCardAccess(q: CardAccessQuery): CardAccessDecision {
  const { programme } = q;
  assertProgramme(programme);

  // Gate 1: the matrix. Region blocks, module blocks, and the module's own tier
  // floor. `bank` is Fiat Plane only — a card touches scheme rails, so §22 puts
  // it here and `plane: 'fiat'` is not a parameter anyone gets to pass in.
  const jurisdiction = checkAccess({ module: 'bank', plane: 'fiat', region: q.region, kycTier: q.kycTier });
  if (!jurisdiction.allowed) {
    return {
      allowed: false,
      code: 'denied.jurisdiction',
      ...(jurisdiction.requiredTier ? { requiredTier: jurisdiction.requiredTier } : {}),
      jurisdiction,
      reason: jurisdiction.reason,
    };
  }

  // Gate 2: the issuer's programme.
  if (programme.status !== 'live') {
    return {
      allowed: false,
      code: 'denied.programme_not_live',
      reason: `Card programme "${programme.code}" is ${programme.status}`,
    };
  }

  if (!programme.reviewedBy || !programme.reviewedAt) {
    return {
      allowed: false,
      code: 'denied.programme_unreviewed',
      reason: `Card programme "${programme.code}" has no counsel sign-off`,
    };
  }

  if (!tierSatisfies(q.kycTier, programme.requiredTier)) {
    return {
      allowed: false,
      code: 'denied.programme_tier',
      requiredTier: programme.requiredTier,
      reason: `Issuer programme "${programme.code}" requires verification tier "${programme.requiredTier}"`,
    };
  }

  return { allowed: true, code: 'allowed', reason: 'Permitted by matrix and issuer programme' };
}
