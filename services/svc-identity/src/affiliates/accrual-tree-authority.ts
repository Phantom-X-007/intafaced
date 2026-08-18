/**
 * D26-P1-O2 — Accrual tree under rate authority.
 *
 * Walks the referral tree and accrues commission rows only when DIRECTION §8
 * fee-share tiers are owner-published (or, for dry-run simulation only,
 * explicitly supplied). Blank / unpublished → refuse-closed.
 *
 * Never invents commission percentages. Never posts ledger — Slice C
 * (`payout-engine.ts`) moves value through existing ledger-client recipes only.
 */

import { accrueWithFreezes } from './freeze.js';
import { accrueCommission, type CommissionRow, type FeeEvent, type TierRate } from './commission.js';
import {
  AccrualRateRefuseError,
  AFFILIATE_ACCRUAL_RATE_RESIDUAL,
  resolveAccrualTiers,
  type AccrualTierLaw,
} from './commission-rate-law.js';

export type AccrueTreeMode = 'dryRun' | 'durable';

export type AccrueTreeUnderAuthorityInput = {
  readonly fee: FeeEvent;
  readonly parent: ReadonlyMap<string, string>;
  readonly law: AccrualTierLaw;
  readonly frozenBeneficiaryIds?: ReadonlySet<string>;
  readonly maxDepth?: number;
  /**
   * Dry-run simulation only — operator what-if tiers.
   * Durable mode never accepts these (would invent commissions into the store).
   */
  readonly simulationTiers?: readonly TierRate[] | null;
  readonly mode: AccrueTreeMode;
};

export type AccrueTreeUnderAuthorityResult = {
  readonly rows: readonly CommissionRow[];
  readonly frozenSkipped: number;
  readonly tiersUsed: readonly TierRate[];
  readonly mode: AccrueTreeMode;
};

/**
 * Resolve tiers under rate authority, then accrue along the tree with freezes.
 *
 * Durable: owner-published law only — refuse `affiliate.accrual.rates_unset`.
 * Dry-run: may use simulationTiers; otherwise same refuse when law unpublished.
 */
export function accrueTreeUnderRateAuthority(input: AccrueTreeUnderAuthorityInput): AccrueTreeUnderAuthorityResult {
  if (input.mode === 'durable' && input.simulationTiers && input.simulationTiers.length > 0) {
    // Closing the invent hole: request tiers must not land in durable store.
    // Payout already refuses non-owner rates; this stops dirty claims at write.
    throw new AccrualRateRefuseError(
      'Durable affiliate accrual refuses per-call tiers — owner-published IDENTITY_AFFILIATE_ACCRUAL_TIERS_JSON only (never invent commissions)',
      'affiliate.accrual.invent_refused',
      AFFILIATE_ACCRUAL_RATE_RESIDUAL,
    );
  }

  const tiers = resolveAccrualTiers({
    requestTiers: input.mode === 'dryRun' ? input.simulationTiers : undefined,
    law: input.law,
  });

  const frozen = input.frozenBeneficiaryIds ?? new Set<string>();
  const without = accrueCommission({
    fee: input.fee,
    parent: input.parent,
    tiers,
    maxDepth: input.maxDepth,
  });
  const rows = accrueWithFreezes({
    fee: input.fee,
    parent: input.parent,
    tiers,
    frozenBeneficiaryIds: frozen,
    maxDepth: input.maxDepth,
  });

  return {
    rows,
    frozenSkipped: Math.max(0, without.length - rows.length),
    tiersUsed: tiers,
    mode: input.mode,
  };
}

/** Ops board — never invents rates into the status string. */
export function accrualTreeAuthorityStatusLine(law: AccrualTierLaw): string {
  if (!law.published) return 'authority=0 published=0 tiers=0';
  return `authority=1 published=1 tiers=${law.tiers.length}`;
}
