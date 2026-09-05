/**
 * D26-P1-T1d / DIRECTION §1 MVP item 4 — Insurance fund shortfall.
 *
 * Done bar: the fund's **balance** moves by exactly the shortfall (ledger
 * recipe only — no invent capitalisation size/schedule).
 *
 * What this proves that the gap-series / bound / listing-gate suites do not:
 *   · Gap-series asserts the insurance LEG of the posted recipe equals the
 *     shortfall. That is necessary but not the MVP-4 sentence: "the fund's
 *     balance moves by exactly the shortfall."
 *   · insurance-bound parks when the pot is empty; listing-gate refuses list.
 *     Neither proves a funded shortfall actually debits the named pot.
 *   · ledger-client already has a recipe unit that draws the fund; this file
 *     drives the same recipes through `runLiquidationTick` so a regression in
 *     the tick (skipping the post, inventing cover, double-drawing) cannot
 *     green while the recipe unit stays green alone.
 *
 * Money path: seed margin + insurance via existing recipes only
 * (`deposit` → `futuresMarginLock` · `feeCharge` → `futuresInsuranceTopup`),
 * then bankrupt liquidation posts `futuresRealizeLoss({ fromInsurance })`.
 * No invented fund size — the top-up amount is a test seed, not product law.
 */
import { describe, expect, it } from 'vitest';
import {
  formatAmount,
  insuranceFund,
  MemoryLedger,
  parseAmount as amt,
  positionCollateralAccount,
  recipes,
  type Amount,
} from '@intafaced/ledger-client';
import { memoryAcceptedMarkStore } from './accepted-mark.js';
import { recipeInsuranceAccount } from './insurance-bound.js';
import {
  memoryLiquidationAttemptStore,
  runLiquidationTick,
  type LiquidationPositionRow,
  type QuotedMarkSource,
} from './liquidation-tick.js';
import { planLiquidation } from './liquidation-planner.js';
import { deepFullCloseLadder } from './ladder-policy.test-harness.js';

const USER = '11111111-1111-4111-8111-111111111111';
const FEE_PAYER = '22222222-2222-4222-8222-222222222222';
const POSITION_ID = 'pos-shortfall-balance';
const ASSET = 'USDT';

/**
 * entry 100 · size 1 · margin 10 · mark 80 → uPnL -20 · equity -10.
 * Loss 20, fromMargin 10, fromInsurance 10 (the shortfall hole).
 */
function bankruptLong(): LiquidationPositionRow {
  return {
    positionId: POSITION_ID,
    userId: USER,
    side: 'long',
    size: amt('1'),
    entryPrice: amt('100'),
    margin: amt('10'),
    marginAsset: ASSET,
    marketId: 'm1',
    symbol: 'BTC/USDT-PERP',
  };
}

function markAt(price: string): QuotedMarkSource {
  return {
    async markPrice() {
      return price;
    },
    async quote({ marketId, symbol, at }) {
      return { marketId, symbol, price: amt(price), asOf: at, quality: 'mid' as const };
    },
  };
}

async function fundUser(ledger: MemoryLedger, userId: string, amount: string, railRef: string): Promise<void> {
  await ledger.post(
    recipes.deposit({
      userId,
      assetId: ASSET,
      amount: amt(amount),
      rail: 'test',
      railRef,
    }),
  );
}

/**
 * Seed the insurance pot the only way production does — fees into house, then
 * `futuresInsuranceTopup`. Never poke a balance into place.
 */
async function seedInsurance(ledger: MemoryLedger, amount: string, topupId: string): Promise<void> {
  await fundUser(ledger, FEE_PAYER, amount, `fee-seed-${topupId}`);
  await ledger.post(
    recipes.feeCharge({
      chargeId: `fee-${topupId}`,
      userId: FEE_PAYER,
      module: 'trade',
      mode: 'asset',
      assetId: ASSET,
      amount: amt(amount),
    }),
  );
  await ledger.post(recipes.futuresInsuranceTopup({ topupId, assetId: ASSET, amount: amt(amount) }));
}

async function seedPositionMargin(ledger: MemoryLedger, positionId: string, amount: string): Promise<void> {
  await fundUser(ledger, USER, amount, `margin-${positionId}`);
  await ledger.post(
    recipes.futuresMarginLock({
      positionId,
      userId: USER,
      assetId: ASSET,
      amount: amt(amount),
    }),
  );
}

async function fundBalance(ledger: MemoryLedger): Promise<Amount> {
  return (await ledger.balance(insuranceFund(ASSET))).amount;
}

describe('D26-P1-T1d — insurance fund balance moves exactly by shortfall', () => {
  it('bankrupt tick debits house:insurance-fund by exactly fromInsurance (recipe only)', async () => {
    const ledger = new MemoryLedger();
    const row = bankruptLong();

    // Hand-check the planner so the expected shortfall is not a magic string.
    const plan = planLiquidation({
      liquidationId: 'liq-shortfall-balance',
      position: row,
      markPrice: '80',
    });
    expect(plan.liquidate).toBe(true);
    if (!plan.liquidate) throw new Error('expected liquidate');
    expect(formatAmount(plan.fromMargin)).toBe('10');
    expect(formatAmount(plan.fromInsurance)).toBe('10');
    const shortfall = plan.fromInsurance;

    await seedPositionMargin(ledger, row.positionId, '10');
    await seedInsurance(ledger, '50', 'ins-shortfall-1');
    expect(formatAmount(await fundBalance(ledger))).toBe('50');
    expect(formatAmount((await ledger.balance(positionCollateralAccount(USER, ASSET, row.positionId))).amount)).toBe('10');

    // Bound and recipe name the same pot — regression if either drifts.
    expect(recipeInsuranceAccount(ASSET)).toEqual(insuranceFund(ASSET));

    const closed: string[] = [];
    const before = await fundBalance(ledger);
    const result = await runLiquidationTick({
      marks: markAt('80'),
      positions: {
        async listOpen() {
          return closed.length > 0 ? [] : [row];
        },
      },
      closer: {
        async markLiquidated(id) {
          closed.push(id);
        },
      },
      attempts: memoryLiquidationAttemptStore(),
      acceptedMarks: memoryAcceptedMarkStore(),
      ledger,
      liquidationIdFor: () => 'liq-shortfall-balance',
      ladder: deepFullCloseLadder(),
    });

    expect(result.liquidated).toBe(1);
    expect(result.items[0]!.outcome).toBe('liquidated');
    expect(closed).toEqual([POSITION_ID]);

    const after = await fundBalance(ledger);
    // THE DONE BAR: balance delta === shortfall, to the unit. Not "some draw",
    // not "at least the shortfall", not a meta field on a recording stub.
    expect(formatAmount(before - after)).toBe(formatAmount(shortfall));
    expect(formatAmount(after)).toBe('40');
    expect(formatAmount((await ledger.balance(positionCollateralAccount(USER, ASSET, row.positionId))).amount)).toBe('0');
    expect(ledger.reconcile()).toEqual({ ok: true });
  });

  it('margin-only loss (no shortfall) leaves the insurance fund untouched', async () => {
    const ledger = new MemoryLedger();
    /**
     * entry 100 · size 1 · margin 30 · mark 80 → loss 20, equity 10 ≤ maint 15
     * → liquidates, but loss < margin so fromInsurance = 0 (residual release 10).
     * (Margin 50 at the same mark stays healthy — equity 30 > maint 25.)
     */
    const row: LiquidationPositionRow = {
      ...bankruptLong(),
      positionId: 'pos-margin-only',
      margin: amt('30'),
    };
    const plan = planLiquidation({
      liquidationId: 'liq-margin-only',
      position: row,
      markPrice: '80',
      maintenanceBps: 5000, // fixture — not product law (D3)
    });
    expect(plan.liquidate).toBe(true);
    if (!plan.liquidate) throw new Error('expected liquidate');
    expect(plan.fromInsurance).toBe(0n);
    expect(formatAmount(plan.fromMargin)).toBe('20');

    await seedPositionMargin(ledger, row.positionId, '30');
    await seedInsurance(ledger, '50', 'ins-margin-only');
    const before = await fundBalance(ledger);

    const closed: string[] = [];
    const result = await runLiquidationTick({
      marks: markAt('80'),
      positions: {
        async listOpen() {
          return closed.length > 0 ? [] : [row];
        },
      },
      closer: {
        async markLiquidated(id) {
          closed.push(id);
        },
      },
      attempts: memoryLiquidationAttemptStore(),
      acceptedMarks: memoryAcceptedMarkStore(),
      ledger,
      liquidationIdFor: () => 'liq-margin-only',
      ladder: deepFullCloseLadder({
        policy: {
          tiers: [{ uptoDepthBps: Number.MAX_SAFE_INTEGER, maintenanceBps: 5000 }],
          marginCallBps: 12_000,
          targetBps: 15_000,
          maxTrancheBps: 10_000,
        },
        reducer: {
          async reduce() {
            /* equity still positive — ladder may partial rather than flatten */
          },
        },
      }),
    });

    expect(result.liquidated + result.partial).toBeGreaterThan(0);
    expect(await fundBalance(ledger)).toBe(before);
    expect(formatAmount(await fundBalance(ledger))).toBe('50');
    expect(ledger.reconcile()).toEqual({ ok: true });
  });

  it('underfunded fund parks — balance unchanged, no invent cover', async () => {
    const ledger = new MemoryLedger();
    const row = bankruptLong();
    await seedPositionMargin(ledger, row.positionId, '10');
    // Fund holds 5; shortfall is 10 → bound must refuse before any post.
    await seedInsurance(ledger, '5', 'ins-underfunded');
    const before = await fundBalance(ledger);
    expect(formatAmount(before)).toBe('5');

    const closed: string[] = [];
    const result = await runLiquidationTick({
      marks: markAt('80'),
      positions: {
        async listOpen() {
          return [row];
        },
      },
      closer: {
        async markLiquidated(id) {
          closed.push(id);
        },
      },
      attempts: memoryLiquidationAttemptStore(),
      acceptedMarks: memoryAcceptedMarkStore(),
      ledger,
      liquidationIdFor: () => 'liq-underfunded-balance',
      ladder: deepFullCloseLadder(),
    });

    expect(result.liquidated).toBe(0);
    expect(result.items[0]!.outcome).toBe('skipped_insurance_underfunded');
    expect(closed).toHaveLength(0);
    expect(await fundBalance(ledger)).toBe(before);
    expect(formatAmount((await ledger.balance(positionCollateralAccount(USER, ASSET, row.positionId))).amount)).toBe('10');
    expect(ledger.reconcile()).toEqual({ ok: true });
  });

  it('exact fund cover draws the pot to zero — still exactly the shortfall', async () => {
    const ledger = new MemoryLedger();
    const row = bankruptLong();
    await seedPositionMargin(ledger, row.positionId, '10');
    await seedInsurance(ledger, '10', 'ins-exact-cover');

    const plan = planLiquidation({
      liquidationId: 'liq-exact-cover',
      position: row,
      markPrice: '80',
    });
    expect(plan.liquidate).toBe(true);
    if (!plan.liquidate) throw new Error('expected liquidate');
    expect(plan.fromInsurance).toBe(amt('10'));

    const closed: string[] = [];
    const before = await fundBalance(ledger);
    const result = await runLiquidationTick({
      marks: markAt('80'),
      positions: {
        async listOpen() {
          return closed.length > 0 ? [] : [row];
        },
      },
      closer: {
        async markLiquidated(id) {
          closed.push(id);
        },
      },
      attempts: memoryLiquidationAttemptStore(),
      acceptedMarks: memoryAcceptedMarkStore(),
      ledger,
      liquidationIdFor: () => 'liq-exact-cover',
      ladder: deepFullCloseLadder(),
    });

    expect(result.liquidated).toBe(1);
    const after = await fundBalance(ledger);
    expect(formatAmount(before - after)).toBe(formatAmount(plan.fromInsurance));
    expect(formatAmount(after)).toBe('0');
    expect(ledger.reconcile()).toEqual({ ok: true });
  });
});
