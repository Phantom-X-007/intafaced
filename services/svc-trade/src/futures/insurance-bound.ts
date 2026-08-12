/**
 * THE INSURANCE SHORTFALL BOUND — a bankrupt rung cannot invent cover the house
 * does not hold.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT WAS WRONG
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `planLiquidation` / `planLadderLiquidation` / `planClose` attribute any loss
 * beyond position margin to `fromInsurance` and hand that number to
 * `futuresRealizeLoss` with no balance read. The ledger's non-negative CHECK on
 * `house:insurance-fund` would eventually refuse an overdraw, but only mid-post
 * — after a recording path has already treated the plan as executable, and with
 * an error about an account the trader has never heard of. A unit test that
 * records posts without a real balance never saw the refuse at all: the
 * shortfall was "covered" on paper while the fund held nothing.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT THIS FILE IS, AND DELIBERATELY IS NOT
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * It is THE MECHANISM: before any insurance leg posts, the named insurance
 * account's balance is the ceiling, and a shortfall larger than that balance
 * refuses / parks instead of overdrawing.
 *
 * It is NOT the fund's target size, share of fees, or capitalisation schedule —
 * those stay owner product law (D4). The DIRECTION:33 listing gate lives in
 * `insurance-listing-gate.ts` and reuses `recipeInsuranceAccount` from here so
 * list refuse and shortfall refuse name the same pot.
 * The account itself is already fixed by the ledger recipe
 * (`insuranceFund` / `house:insurance-fund:available`); this file ASKS the
 * recipe rather than re-stating the pot, so a future recipe change cannot leave
 * the bound guarding a different account than the money leaves.
 *
 * Mirror of `profit-source.ts` `checkProfitBound` — same shape, opposite flow
 * (cover a loss, not pay a profit).
 */
import { formatAmount, recipes, type AccountRef, type Amount, type Balance } from '@intafaced/ledger-client';
import { formatAccountRef } from './profit-source.js';

/**
 * WHICH ACCOUNT DOES `futuresRealizeLoss` DRAW THE INSURANCE LEG FROM?
 *
 * Read off a probe request so this bound cannot drift from the recipe. A
 * `credit` leg is value LEAVING an account — the insurance fund is the credited
 * one when `fromInsurance > 0`.
 */
export function recipeInsuranceAccount(assetId: string): AccountRef {
  const probe = recipes.futuresRealizeLoss({
    positionId: '00000000-0000-4000-8000-000000000000',
    userId: '00000000-0000-4000-8000-000000000000',
    assetId,
    fromMargin: 0n,
    fromInsurance: 1n,
    lossId: 'insurance-bound-probe',
  });
  const credit = probe.entries.find(
    (e) => e.direction === 'credit' && e.account.ownerType === 'house' && e.account.ownerId === 'insurance-fund',
  );
  if (!credit) {
    throw new Error('futuresRealizeLoss has no insurance credit leg — cannot bound the shortfall cover');
  }
  return credit.account;
}

export interface InsuranceBoundCheck {
  readonly ok: boolean;
  readonly account: AccountRef;
  readonly available: Amount;
  readonly reason?: string;
}

/**
 * Is there enough in the named insurance fund to cover this shortfall leg?
 *
 * Read BEFORE anything posts. Zero shortfall is always ok (no insurance leg).
 * Underfunded → refuse: the position parks open / the close aborts; nothing is
 * marked liquidated and no loss recipe runs. Inventing cover the fund does not
 * hold is the failure this unit exists to stop.
 */
export async function checkInsuranceBound(input: {
  assetId: string;
  fromInsurance: Amount;
  balance: (ref: AccountRef) => Promise<Balance>;
}): Promise<InsuranceBoundCheck> {
  const account = recipeInsuranceAccount(input.assetId);
  if (input.fromInsurance <= 0n) {
    return { ok: true, account, available: 0n };
  }

  const { amount: available } = await input.balance(account);
  if (input.fromInsurance > available) {
    return {
      ok: false,
      account,
      available,
      reason:
        `insurance fund ${formatAccountRef(account)} holds ${formatAmount(available)} ${input.assetId} and this shortfall would ` +
        `draw ${formatAmount(input.fromInsurance)} — refusing rather than overdrawing it`,
    };
  }
  return { ok: true, account, available };
}

/** Outcome / error code shared by tick + voluntary close. */
export const INSURANCE_UNDERFUNDED = 'trade.insurance_underfunded' as const;
