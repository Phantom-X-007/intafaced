import { mulBps, sub, type Amount } from '../money.js';
import type { EntryInput, PostRequest } from '../types.js';
import { InvalidEntryError } from '../types.js';
import { houseFees, userAvailable } from '../accounts.js';

/**
 * MARKET COMMERCE RECIPES (§8.7).
 *
 * ⚠ SHARED-PACKAGE CHANGE — flagged deliberately.
 *
 * One-time purchase with a disclosed house commission. Buyer pays the listing
 * price from `userAvailable`; vendor receives net; house takes commission into
 * `houseFees('market', asset)`.
 *
 * Commission bps is an INPUT, not invented here. The service refuses before
 * calling this recipe when the deployment has no configured rate
 * (`market.commission_not_configured`). This file still refuses a blank/invalid
 * bps so a miswired caller cannot post a free-for-all (0 is a real rate: free
 * commission is allowed only when the owner sets 0 explicitly).
 *
 * Rounding: **floor** on the commission (customer favour). Spec pack left
 * rounding unspecified; closeout + DIRECTION: round in the customer's favour
 * and mark it. Vendor + house always sum exactly to the price (no remainder).
 */

const debit = (account: ReturnType<typeof userAvailable>, amount: Amount): EntryInput => ({
  account,
  direction: 'debit',
  amount,
});
const credit = (account: ReturnType<typeof userAvailable>, amount: Amount): EntryInput => ({
  account,
  direction: 'credit',
  amount,
});

function requirePositive(name: string, value: Amount): void {
  if (value <= 0n) throw new InvalidEntryError(`${name} must be positive`);
}

export interface MarketPurchaseInput {
  /** Client-supplied purchase id — the whole idempotency story. */
  purchaseId: string;
  listingId: string;
  buyerId: string;
  vendorUserId: string;
  assetId: string;
  /** Gross price the buyer pays — decimal-scaled Amount, never a JS number. */
  price: Amount;
  /**
   * House commission in basis points (0..9999). Required at the recipe layer so
   * a missing config cannot silently become zero by defaulting.
   */
  commissionBps: number;
}

/**
 * Buyer → vendor (net) + house commission.
 *
 * Idempotency key: `market.purchase:<purchaseId>` — never a UUID from the
 * clock, never a second post for the same purchaseId.
 */
export function marketPurchase(input: MarketPurchaseInput): PostRequest {
  requirePositive('purchase price', input.price);
  if (!Number.isInteger(input.commissionBps) || input.commissionBps < 0 || input.commissionBps > 9_999) {
    throw new InvalidEntryError(`market commissionBps must be an integer in 0..9999, got ${input.commissionBps}`);
  }
  if (!input.purchaseId || !input.purchaseId.trim()) {
    throw new InvalidEntryError('purchaseId is required for market.purchase idempotency');
  }
  if (input.buyerId === input.vendorUserId) {
    throw new InvalidEntryError('buyer and vendor must be different users');
  }

  // Floor — customer favour. ceil would invent house revenue the buyer did not
  // agree to pay beyond the listed price split.
  const commission = mulBps(input.price, input.commissionBps, 'floor');
  const vendorNet = sub(input.price, commission);
  if (vendorNet <= 0n) {
    throw new InvalidEntryError('Commission leaves the vendor with nothing — check commission bps');
  }

  const entries: EntryInput[] = [
    credit(userAvailable(input.buyerId, input.assetId), input.price),
    debit(userAvailable(input.vendorUserId, input.assetId), vendorNet),
    ...(commission > 0n ? [debit(houseFees('market', input.assetId), commission)] : []),
  ];

  return {
    idempotencyKey: `market.purchase:${input.purchaseId}`,
    module: 'market',
    reason: 'market.purchase',
    meta: {
      purchaseId: input.purchaseId,
      listingId: input.listingId,
      commissionBps: input.commissionBps,
      commission: commission.toString(),
      vendorNet: vendorNet.toString(),
    },
    entries,
  };
}
