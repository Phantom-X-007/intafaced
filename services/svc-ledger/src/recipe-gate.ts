/**
 * S2S `/trpc/post` recipe allowlist.
 *
 * Callers still send a PostRequest (ledger-client types have no recipe field).
 * This gate refuses assembled entries whose (module, reason, legs) are not a
 * registry recipe — so a module cannot open a second book on the HTTP door.
 */
import { LedgerError, parseAmount, recipes, type PostRequest, type RecipeName, userAvailable } from '@intafaced/ledger-client';

export const RECIPE_REQUIRED_CODE = 'ledger.recipe_required';

type WireEntry = {
  account: { ownerType: string; kind: string; ownerId?: string; purpose?: string };
  direction: string;
};

type WirePost = {
  module: string;
  reason: string;
  entries: readonly WireEntry[];
};

type CatalogRow = {
  minLegs: number;
  maxLegs: number | undefined;
  signatures: ReadonlySet<string>;
};

const U = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const U2 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const S1 = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const S2 = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const AMT = parseAmount('10');
const QUOTE = parseAmount('100');

/** Reasons whose entry count / owner types vary by input — module+reason+minLegs only. */
const FLEX_REASONS: ReadonlySet<string> = new Set([
  'bank.transfer.manual',
  'bank.transfer.scheduled',
  'bank.business.approval.held',
  'bank.business.approval.released',
  'bank.business.approval.settled',
  'bank.business.payroll.settled',
  'bank.earn.interest',
  'bank.earn.pool.funded',
  'loan.reserve.funded',
  'loan.liquidated',
  'loan.repaid',
  'token.emission',
  'token.burn',
  'trade.fill',
  'trade.fill.mm_maker',
  'p2p.escrow.release',
  'pay.settled',
  'market.purchase',
  'futures.loss.realized',
  'pay.chargeback.opened',
  'pay.chargeback.won',
]);

const VARIABLE_REASON_RECIPES: ReadonlySet<RecipeName> = new Set(['feeCharge', 'rewardPay']);

function purposeHead(purpose: string | undefined): string {
  if (!purpose) return '';
  return purpose.split(':')[0] ?? '';
}

function legSignature(entry: WireEntry): string {
  return `${entry.account.ownerType}|${entry.account.kind}|${entry.direction}|${purposeHead(entry.account.purpose)}`;
}

function postSignature(entries: readonly WireEntry[]): string {
  return entries.map(legSignature).join(';');
}

function recipeError(module: string, reason: string): LedgerError {
  return new LedgerError(
    `POST /trpc/post only accepts ledger-client recipes; '${module}/${reason}' is not a known recipe`,
    RECIPE_REQUIRED_CODE,
  );
}

function isHouseFees(account: WireEntry['account']): boolean {
  return account.ownerType === 'house' && account.kind === 'available' && (account.ownerId ?? '').startsWith('fees:');
}

function isRewardsEngine(account: WireEntry['account']): boolean {
  return account.ownerType === 'house' && account.kind === 'available' && account.ownerId === 'rewards-engine';
}

/** feeCharge: user available credit → house fees debit. Module and reason are caller-chosen. */
function matchesFeeCharge(input: WirePost): boolean {
  if (input.entries.length !== 2) return false;
  const [a, b] = input.entries;
  return (
    a !== undefined &&
    b !== undefined &&
    a.direction === 'credit' &&
    a.account.ownerType === 'user' &&
    a.account.kind === 'available' &&
    b.direction === 'debit' &&
    isHouseFees(b.account)
  );
}

/** rewardPay: rewards engine credit → user available debit. Module is always token; reason is caller-chosen. */
function matchesRewardPay(input: WirePost): boolean {
  if (input.module !== 'token' || input.entries.length !== 2) return false;
  const [a, b] = input.entries;
  return (
    a !== undefined &&
    b !== undefined &&
    a.direction === 'credit' &&
    isRewardsEngine(a.account) &&
    b.direction === 'debit' &&
    b.account.ownerType === 'user' &&
    b.account.kind === 'available'
  );
}

function samplePosts(): Array<{ name: RecipeName; post: PostRequest }> {
  const hold = { orderId: 'o1', userId: U, assetId: 'USDT', amount: AMT };
  const mmHold = { orderId: 'o1', assetId: 'USDT', amount: AMT };
  const fill = {
    fillId: 'f1',
    makerId: U2,
    takerId: U,
    makerOrderId: 'mo',
    takerOrderId: 'to',
    baseAsset: 'BTC',
    quoteAsset: 'USDT',
    qty: AMT,
    quoteAmount: QUOTE,
    takerSide: 'buy' as const,
  };
  const withdraw = { userId: U, assetId: 'USDT', amount: AMT, rail: 'crypto-native', withdrawalId: 'w1' };
  const escrow = { tradeId: 't1', sellerId: U, buyerId: U2, assetId: 'USDT', amount: AMT };
  const capture = {
    paymentId: 'p1',
    merchantId: 'm1',
    assetId: 'USDT',
    amount: AMT,
    rail: 'card-sandbox',
    railRef: 'r1',
  };
  const refund = {
    refundId: 'rf1',
    paymentId: 'p1',
    merchantId: 'm1',
    merchantUserId: U,
    assetId: 'USDT',
    amount: AMT,
    rail: 'card-sandbox',
    source: 'clearing' as const,
  };
  const chargeback = {
    disputeId: 'd1',
    paymentId: 'p1',
    merchantId: 'm1',
    merchantUserId: U,
    assetId: 'USDT',
    rail: 'card-sandbox',
    fromClearing: AMT,
    fromMerchantBalance: 0n,
  };
  const shortfall = {
    disputeId: 'd1',
    paymentId: 'p1',
    merchantId: 'm1',
    assetId: 'USDT',
    rail: 'card-sandbox',
    amount: AMT,
  };
  const stakeIn = { stakeId: 's1', userId: U, assetId: 'IFC', amount: AMT, tier: 'flex' as const };
  const earn = { positionId: 'ep1', poolId: 'pool1', userId: U, assetId: 'USDT', amount: AMT };
  const loanCol = { loanId: 'ln1', userId: U, collateralAssetId: 'BTC', amount: AMT, sequence: 0 };
  const fromAvail = userAvailable(U, 'USDT');
  const toAvail = userAvailable(U2, 'USDT');

  return [
    { name: 'deposit', post: recipes.deposit({ userId: U, assetId: 'USDT', amount: AMT, rail: 'crypto-native', railRef: 'tx1' }) },
    { name: 'marketMakerSeedFund', post: recipes.marketMakerSeedFund({ assetId: 'USDT', amount: AMT, seedId: 'seed1' }) },
    { name: 'withdrawHold', post: recipes.withdrawHold(withdraw) },
    { name: 'withdrawSettle', post: recipes.withdrawSettle(withdraw) },
    { name: 'withdrawReverse', post: recipes.withdrawReverse(withdraw) },
    { name: 'tradeFill', post: recipes.tradeFill({ ...fill, makerFeeBps: 0, takerFeeBps: 0 }) },
    { name: 'tradeFill', post: recipes.tradeFill({ ...fill, makerFeeBps: 10, takerFeeBps: 10 }) },
    { name: 'orderHold', post: recipes.orderHold(hold) },
    { name: 'orderHoldRelease', post: recipes.orderHoldRelease(hold) },
    { name: 'marketMakerOrderHold', post: recipes.marketMakerOrderHold(mmHold) },
    { name: 'marketMakerOrderHoldRelease', post: recipes.marketMakerOrderHoldRelease(mmHold) },
    { name: 'marketMakerMakerFill', post: recipes.marketMakerMakerFill({ ...fill, makerFeeBps: 0, takerFeeBps: 0 }) },
    { name: 'futuresMarginLock', post: recipes.futuresMarginLock({ positionId: 'pos1', userId: U, assetId: 'USDT', amount: AMT }) },
    {
      name: 'futuresMarginAdd',
      post: recipes.futuresMarginAdd({ positionId: 'pos1', userId: U, assetId: 'USDT', amount: AMT, sequence: 1 }),
    },
    { name: 'futuresMarginRelease', post: recipes.futuresMarginRelease({ positionId: 'pos1', userId: U, assetId: 'USDT', amount: AMT }) },
    {
      name: 'futuresRealizeLoss',
      post: recipes.futuresRealizeLoss({
        positionId: 'pos1',
        userId: U,
        assetId: 'USDT',
        fromMargin: AMT,
        fromInsurance: 0n,
        lossId: 'l1',
      }),
    },
    {
      name: 'futuresRealizeLoss',
      post: recipes.futuresRealizeLoss({
        positionId: 'pos1',
        userId: U,
        assetId: 'USDT',
        fromMargin: 0n,
        fromInsurance: AMT,
        lossId: 'l2',
      }),
    },
    {
      name: 'futuresRealizeProfit',
      post: recipes.futuresRealizeProfit({ positionId: 'pos1', userId: U, assetId: 'USDT', amount: AMT, profitId: 'pr1' }),
    },
    {
      name: 'futuresFundingPay',
      post: recipes.futuresFundingPay({
        fundingId: 'fund1',
        payerUserId: U,
        payerPositionId: 'p1',
        payeeUserId: U2,
        payeePositionId: 'p2',
        assetId: 'USDT',
        amount: AMT,
      }),
    },
    { name: 'futuresInsuranceTopup', post: recipes.futuresInsuranceTopup({ topupId: 'tu1', assetId: 'USDT', amount: AMT }) },
    { name: 'escrowLock', post: recipes.escrowLock(escrow) },
    { name: 'escrowRelease', post: recipes.escrowRelease(escrow) },
    { name: 'escrowRelease', post: recipes.escrowRelease({ ...escrow, feeBps: 50 }) },
    { name: 'escrowRefund', post: recipes.escrowRefund(escrow) },
    { name: 'paymentCapture', post: recipes.paymentCapture(capture) },
    {
      name: 'merchantSettlement',
      post: recipes.merchantSettlement({
        merchantId: 'm1',
        merchantUserId: U,
        window: '2026-07-27',
        assetId: 'USDT',
        gross: QUOTE,
        fee: 0n,
      }),
    },
    {
      name: 'merchantSettlement',
      post: recipes.merchantSettlement({
        merchantId: 'm1',
        merchantUserId: U,
        window: '2026-07-27',
        assetId: 'USDT',
        gross: QUOTE,
        fee: AMT,
      }),
    },
    { name: 'paymentRefund', post: recipes.paymentRefund(refund) },
    { name: 'paymentRefund', post: recipes.paymentRefund({ ...refund, source: 'settled' }) },
    { name: 'paymentRefundReverse', post: recipes.paymentRefundReverse(refund) },
    { name: 'paymentRefundReverse', post: recipes.paymentRefundReverse({ ...refund, source: 'settled' }) },
    { name: 'chargebackOpen', post: recipes.chargebackOpen(chargeback) },
    { name: 'chargebackOpen', post: recipes.chargebackOpen({ ...chargeback, fromClearing: 0n, fromMerchantBalance: AMT }) },
    { name: 'chargebackShortfall', post: recipes.chargebackShortfall(shortfall) },
    { name: 'chargebackWon', post: recipes.chargebackWon(chargeback) },
    { name: 'chargebackShortfallRecovered', post: recipes.chargebackShortfallRecovered(shortfall) },
    { name: 'stake', post: recipes.stake(stakeIn) },
    { name: 'unstake', post: recipes.unstake(stakeIn) },
    {
      name: 'mintEmission',
      post: recipes.mintEmission({ epoch: 1, assetId: 'IFC', amount: AMT, destination: userAvailable(U, 'IFC') }),
    },
    { name: 'burn', post: recipes.burn({ runId: 'b1', assetId: 'IFC', amount: AMT, from: userAvailable(U, 'IFC') }) },
    {
      name: 'feeCharge',
      post: recipes.feeCharge({ chargeId: 'c1', userId: U, module: 'trade', mode: 'asset', assetId: 'USDT', amount: AMT }),
    },
    {
      name: 'sweepFeesToRewards',
      post: recipes.sweepFeesToRewards({ windowId: 'w1', sourceModule: 'trade', assetId: 'USDT', amount: AMT }),
    },
    {
      name: 'rewardPay',
      post: recipes.rewardPay({ rewardId: 'rw1', userId: U, assetId: 'USDT', amount: AMT, reason: 'token.yield.distributed' }),
    },
    { name: 'loanCollateralLock', post: recipes.loanCollateralLock(loanCol) },
    { name: 'loanCollateralRelease', post: recipes.loanCollateralRelease(loanCol) },
    { name: 'loanDraw', post: recipes.loanDraw({ loanId: 'ln1', userId: U, debtAssetId: 'USDT', principal: AMT }) },
    {
      name: 'loanRepay',
      post: recipes.loanRepay({ loanId: 'ln1', userId: U, debtAssetId: 'USDT', principal: AMT, interest: 0n, sequence: 1 }),
    },
    {
      name: 'loanRepay',
      post: recipes.loanRepay({ loanId: 'ln1', userId: U, debtAssetId: 'USDT', principal: AMT, interest: AMT, sequence: 1 }),
    },
    {
      name: 'loanLiquidate',
      post: recipes.loanLiquidate({
        loanId: 'ln1',
        userId: U,
        tranche: 0,
        collateralAssetId: 'BTC',
        collateralSold: AMT,
        debtAssetId: 'USDT',
        proceeds: QUOTE,
        principalRepaid: QUOTE,
        interestRepaid: 0n,
        penalty: 0n,
        surplusToBorrower: 0n,
        buyer: { collateralTo: userAvailable(U2, 'BTC'), proceedsFrom: userAvailable(U2, 'USDT') },
        markPrice: QUOTE,
      }),
    },
    { name: 'loanBadDebt', post: recipes.loanBadDebt({ loanId: 'ln1', debtAssetId: 'USDT', shortfall: AMT }) },
    { name: 'loanReserveFund', post: recipes.loanReserveFund({ fundingId: 'f1', debtAssetId: 'USDT', amount: AMT }) },
    {
      name: 'bankTransfer',
      post: recipes.bankTransfer({ transferId: 'tr1', occurrence: 0, from: fromAvail, to: toAvail, amount: AMT, kind: 'manual' }),
    },
    {
      name: 'bankTransfer',
      post: recipes.bankTransfer({ transferId: 'tr1', occurrence: 1, from: fromAvail, to: toAvail, amount: AMT, kind: 'scheduled' }),
    },
    { name: 'earnDeposit', post: recipes.earnDeposit(earn) },
    { name: 'earnWithdraw', post: recipes.earnWithdraw(earn) },
    { name: 'earnPoolFund', post: recipes.earnPoolFund({ poolId: 'pool1', fundingId: 'f1', assetId: 'USDT', amount: AMT }) },
    {
      name: 'earnInterest',
      post: recipes.earnInterest({ poolId: 'pool1', date: '2026-07-27', assetId: 'USDT', payouts: [{ userId: U, amount: AMT }] }),
    },
    { name: 'businessApprovalHold', post: recipes.businessApprovalHold({ approvalId: 'ap1', from: fromAvail, amount: AMT }) },
    { name: 'businessApprovalRelease', post: recipes.businessApprovalRelease({ approvalId: 'ap1', from: fromAvail, amount: AMT }) },
    {
      name: 'businessApprovalSettle',
      post: recipes.businessApprovalSettle({ approvalId: 'ap1', from: fromAvail, to: toAvail, amount: AMT }),
    },
    {
      name: 'businessPayroll',
      post: recipes.businessPayroll({ payrollId: 'pr1', from: fromAvail, recipients: [{ to: toAvail, amount: AMT }] }),
    },
    {
      name: 'subAccountTransfer',
      post: recipes.subAccountTransfer({ transferId: 'st1', fromSubAccountId: S1, toSubAccountId: S2, assetId: 'USDT', amount: AMT }),
    },
    {
      name: 'marketPurchase',
      post: recipes.marketPurchase({
        purchaseId: 'mp1',
        listingId: 'l1',
        buyerId: U,
        vendorUserId: U2,
        assetId: 'USDT',
        price: QUOTE,
        commissionBps: 0,
      }),
    },
    {
      name: 'marketListingFee',
      post: recipes.marketListingFee({ listingId: 'l1', vendorUserId: U, assetId: 'USDT', amount: AMT }),
    },
    {
      name: 'marketPremiumPlacement',
      post: recipes.marketPremiumPlacement({ placementId: 'pl1', listingId: 'l1', vendorUserId: U, assetId: 'USDT', amount: AMT }),
    },
  ];
}

function buildCatalog(): { catalog: Map<string, CatalogRow>; sampled: ReadonlySet<RecipeName> } {
  const catalog = new Map<string, { minLegs: number; maxLegs: number; signatures: Set<string> }>();
  const sampled = new Set<RecipeName>();

  for (const { name, post } of samplePosts()) {
    sampled.add(name);
    if (VARIABLE_REASON_RECIPES.has(name)) continue;
    const key = `${post.module}::${post.reason}`;
    const existing = catalog.get(key);
    const sig = postSignature(post.entries);
    if (!existing) {
      catalog.set(key, {
        minLegs: post.entries.length,
        maxLegs: post.entries.length,
        signatures: new Set([sig]),
      });
      continue;
    }
    existing.minLegs = Math.min(existing.minLegs, post.entries.length);
    existing.maxLegs = Math.max(existing.maxLegs, post.entries.length);
    existing.signatures.add(sig);
  }

  const frozen = new Map<string, CatalogRow>();
  for (const [key, row] of catalog) {
    const reason = key.split('::')[1] ?? '';
    frozen.set(key, {
      minLegs: row.minLegs,
      maxLegs: FLEX_REASONS.has(reason) ? undefined : row.maxLegs,
      signatures: row.signatures,
    });
  }
  return { catalog: frozen, sampled };
}

const { catalog: RECIPE_CATALOG, sampled: SAMPLED_RECIPES } = buildCatalog();

/** Every `recipes` registry key must have a sample (or the allowlist can drift). */
export function unsampledRecipeNames(): readonly RecipeName[] {
  return (Object.keys(recipes) as RecipeName[]).filter((name) => !SAMPLED_RECIPES.has(name)).sort();
}

export function assertKnownRecipePost(input: WirePost): void {
  if (matchesFeeCharge(input) || matchesRewardPay(input)) return;

  const key = `${input.module}::${input.reason}`;
  const spec = RECIPE_CATALOG.get(key);
  if (!spec) throw recipeError(input.module, input.reason);

  if (input.entries.length < spec.minLegs) throw recipeError(input.module, input.reason);
  if (spec.maxLegs !== undefined && input.entries.length > spec.maxLegs) throw recipeError(input.module, input.reason);

  if (!FLEX_REASONS.has(input.reason) && !spec.signatures.has(postSignature(input.entries))) {
    throw recipeError(input.module, input.reason);
  }
}
