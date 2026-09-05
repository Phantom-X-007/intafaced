import type { Sql } from 'postgres';
import { formatAmount, parseAmount, recipes, type Amount, type LedgerClient } from '@intafaced/ledger-client';
import { decimalPriceFromDriver, purchasePriceTermsMatch } from './commerce-price.js';
import {
  affiliateLegAfterMarketPurchase,
  fireAffiliateAccrue,
  NoopAffiliateAccrue,
  type AffiliateAccruePort,
} from '../affiliate-accrue.js';
import { fireAffiliatePayout, NoopAffiliatePayout, type AffiliatePayoutPort } from '../affiliate-payout.js';
import { MarketError, type VendorService } from '../vendor-service.js';

/** Public `listings` page size unpublished. Blank is not 50. */
export const MARKET_PUBLIC_LISTINGS_LIST_LIMIT_UNSET = 'market.public_listings_list_limit_unset' as const;

/** Owner-published public-listings page size. Blank / non-finite / <1 refuses. Never invent 50. */
export function assertPublicListingsListLimit(limit: number | undefined): number {
  if (limit === undefined || typeof limit !== 'number' || !Number.isFinite(limit)) {
    throw new MarketError(MARKET_PUBLIC_LISTINGS_LIST_LIMIT_UNSET, MARKET_PUBLIC_LISTINGS_LIST_LIMIT_UNSET);
  }
  const n = Math.floor(limit);
  if (n < 1) {
    throw new MarketError(MARKET_PUBLIC_LISTINGS_LIST_LIMIT_UNSET, MARKET_PUBLIC_LISTINGS_LIST_LIMIT_UNSET);
  }
  return Math.min(50, n);
}

/**
 * market.commerce — listings + one-time purchase with house commission (§8.7).
 *
 * No second balance book. Price and commission move only via `marketPurchase`.
 * Listing eligibility is re-computed from VendorService on every write that
 * cares — never a stored `is_listed` flag. Stake law stays in VendorService;
 * this class owns the commission half of the vendor→commerce lifecycle.
 *
 * House commission bps is owner-gated (D26-P1-M1 / M2 / D26-P0-10). When the
 * deployment has no rate configured (`commissionBps === null`):
 *   - createListing refuses before insert or slot claim
 *   - publicListings returns [] (shopfront does not advertise unsellable stock)
 *   - purchase refuses before any row or post
 * Never invent a platform rate. Explicit `0` is an owner free-commission
 * decision, not silence. Ledger recipe refuses blank/invalid bps so a
 * miswired caller cannot invent free commission at post time (#1761 owns
 * listing/premium fee recipe deepen — do not dual-edit market.ts here).
 *
 * Stage C3 listing subscriptions: one period is paid with the same
 * `marketPurchase` recipe as a one-time sale. Period seconds come from the
 * listing — never a default month. Cancel is a flag (no reverse recipe).
 * Past-due is computed from the clock vs `access_until`, never a fake paid
 * status. Leftover subscription rows without a period stay unsellable.
 */

export type OfferType = 'one_time' | 'subscription';
export type ListingStatus = 'active' | 'archived';
export type PurchaseStatus = 'pending' | 'settled' | 'rejected';

export interface ListingRecord {
  id: string;
  vendorId: string;
  title: string;
  description: string;
  offerType: OfferType;
  assetId: string;
  /** Decimal string — never a JS number. */
  price: string;
  /**
   * Access window length in whole seconds. Required on subscription listings.
   * Null on one-time listings and on leftover C3-era rows. Never defaulted.
   */
  periodSeconds: number | null;
  status: ListingStatus;
  createdAt: string;
  updatedAt: string;
}

export interface PurchaseRecord {
  id: string;
  listingId: string;
  buyerId: string;
  vendorId: string;
  vendorUserId: string;
  assetId: string;
  price: string;
  commissionBps: number;
  status: PurchaseStatus;
  ledgerTxId: string | null;
  rejectionCode: string | null;
  createdAt: string;
  settledAt: string | null;
  /** Paid access end. Set on settled subscription purchases; null for one-time. */
  accessUntil: string | null;
}

interface ListingRow {
  id: string;
  vendor_id: string;
  title: string;
  description: string;
  offer_type: OfferType;
  asset_id: string;
  /** Driver may yield a JS number if numeric is not text-mode — refuse, never String(). */
  price: unknown;
  period_seconds: number | string | null;
  status: ListingStatus;
  created_at: Date;
  updated_at: Date;
}

interface PurchaseRow {
  id: string;
  listing_id: string;
  buyer_id: string;
  vendor_id: string;
  vendor_user_id: string;
  asset_id: string;
  price: unknown;
  commission_bps: number;
  status: PurchaseStatus;
  ledger_tx_id: string | null;
  rejection_code: string | null;
  created_at: Date;
  settled_at: Date | null;
  access_until: Date | null;
}

function toListing(row: ListingRow): ListingRecord {
  return {
    id: row.id,
    vendorId: row.vendor_id,
    title: row.title,
    description: row.description,
    offerType: row.offer_type,
    assetId: row.asset_id,
    price: decimalPriceFromDriver(row.price),
    periodSeconds: row.period_seconds == null || row.period_seconds === '' ? null : Number(row.period_seconds),
    status: row.status,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

function toPurchase(row: PurchaseRow): PurchaseRecord {
  return {
    id: row.id,
    listingId: row.listing_id,
    buyerId: row.buyer_id,
    vendorId: row.vendor_id,
    vendorUserId: row.vendor_user_id,
    assetId: row.asset_id,
    price: decimalPriceFromDriver(row.price),
    commissionBps: row.commission_bps,
    status: row.status,
    ledgerTxId: row.ledger_tx_id,
    rejectionCode: row.rejection_code,
    createdAt: row.created_at.toISOString(),
    settledAt: row.settled_at ? row.settled_at.toISOString() : null,
    accessUntil: row.access_until ? row.access_until.toISOString() : null,
  };
}

export interface SubscriptionAccess {
  granted: true;
  listingId: string;
  buyerId: string;
  accessUntil: string;
}

function addSeconds(from: Date, seconds: number): Date {
  return new Date(from.getTime() + seconds * 1000);
}

export interface CommerceConfig {
  /**
   * House commission in bps, or `null` when the owner has not set a rate.
   * Null is the refuse-closed default — never silently 0.
   */
  commissionBps: number | null;
  /** Identity accrue after house commission posts. Default noop without IDENTITY_URL. */
  affiliateAccrue?: AffiliateAccruePort;
  /** Identity payout after accrue. Default noop without IDENTITY_URL. */
  affiliatePayout?: AffiliatePayoutPort;
  /** Clock for access windows. Tests inject; production uses wall time. */
  now?: () => Date;
}

export class CommerceService {
  private readonly affiliateAccrue: AffiliateAccruePort;
  private readonly affiliatePayout: AffiliatePayoutPort;

  constructor(
    private readonly sql: Sql,
    private readonly vendors: VendorService,
    private readonly ledger: LedgerClient,
    private readonly config: CommerceConfig,
  ) {
    this.affiliateAccrue = config.affiliateAccrue ?? new NoopAffiliateAccrue();
    this.affiliatePayout = config.affiliatePayout ?? new NoopAffiliatePayout();
  }

  private now(): Date {
    return this.config.now?.() ?? new Date();
  }

  /** What this deployment's commission rate is — including that it is not one. */
  programme(): { commissionBps: number | null; commissionConfigured: boolean } {
    return {
      commissionBps: this.config.commissionBps,
      commissionConfigured: this.config.commissionBps !== null,
    };
  }

  /**
   * Refuse-closed commission gate for every money-adjacent commerce door.
   * Blank env is not free commission — that requires an explicit owner `0`.
   */
  private requireCommissionConfigured(): number {
    if (this.config.commissionBps === null) {
      throw new MarketError(
        'House commission rate is not configured — marketplace commerce refuses until the owner sets MARKET_HOUSE_COMMISSION_BPS',
        'market.commission_not_configured',
      );
    }
    return this.config.commissionBps;
  }

  async createListing(input: {
    userId: string;
    title: string;
    description: string;
    offerType: OfferType;
    assetId: string;
    /** Decimal string. */
    price: string;
    /** Whole seconds. Required for subscription; forbidden for one-time. No default. */
    periodSeconds?: number | null;
  }): Promise<ListingRecord> {
    // Commission law before stake burn: a blank rate must not consume a slot
    // for inventory that can never settle (D26-P1-M2). Same door for
    // subscription listings — C3 does not invent a free-cut shopfront.
    this.requireCommissionConfigured();

    const periodSeconds = this.resolveCreatePeriod(input.offerType, input.periodSeconds);

    const title = input.title.trim();
    const description = input.description.trim();
    const assetId = input.assetId.trim();
    if (!title) throw new MarketError('A listing needs a title', 'market.listing_title_required');
    if (!description) throw new MarketError('A listing needs a description', 'market.listing_description_required');
    if (!assetId) throw new MarketError('A listing needs an asset id', 'market.listing_asset_required');

    let price;
    try {
      price = parseAmount(input.price);
    } catch {
      throw new MarketError('Listing price must be a positive decimal string', 'market.listing_invalid_price');
    }
    if (price <= 0n) {
      throw new MarketError('Listing price must be positive', 'market.listing_invalid_price');
    }

    // Create gate ≠ public "listed". A vendor is listed only AFTER they hold a
    // usable slot; the first listing is what claims that slot. Using
    // listingEligibility here would refuse every first listing with
    // market.slot_required (chicken-and-egg). Create requires: approved vendor
    // + claimSlot success (stake capacity / not exhausted). Public catalogue and
    // purchase still re-read listingEligibility so unstaked vendors drop out.
    const vendor = await this.vendors.myVendor(input.userId);
    if (!vendor) {
      throw new MarketError('You have not applied to be a vendor', 'market.vendor_not_found');
    }
    if (vendor.status !== 'approved') {
      throw new MarketError('Only an approved vendor can create listings', 'market.vendor_not_approved');
    }

    const priceStr = formatAmount(price);

    // Insert listing first so the id can name the slot claim (idempotent ref).
    const inserted = await this.sql<ListingRow[]>`
      INSERT INTO market.listings (vendor_id, title, description, offer_type, asset_id, price, period_seconds, status)
      VALUES (
        ${vendor.id},
        ${title},
        ${description},
        ${input.offerType},
        ${assetId},
        ${priceStr}::numeric,
        ${periodSeconds},
        'active'
      )
      RETURNING *
    `;
    const row = inserted[0];
    if (!row) throw new MarketError('Listing insert returned no row', 'market.listing_not_written');

    try {
      await this.vendors.claimSlot({ userId: input.userId, ref: row.id });
    } catch (err) {
      // Roll the orphan listing back — a listing without a slot must not stay active.
      await this.sql`DELETE FROM market.listings WHERE id = ${row.id}`;
      throw err;
    }

    return toListing(row);
  }

  async archiveListing(input: { userId: string; listingId: string }): Promise<ListingRecord> {
    const listing = await this.requireOwnedListing(input.userId, input.listingId);
    if (listing.status === 'archived') return listing;

    const updated = await this.sql<ListingRow[]>`
      UPDATE market.listings
         SET status = 'archived', updated_at = now()
       WHERE id = ${input.listingId}
      RETURNING *
    `;
    const row = updated[0];
    if (!row) throw new MarketError('No listing with that id', 'market.listing_not_found');
    // Free the slot so capacity returns — release is idempotent on missing.
    try {
      await this.vendors.releaseSlot({ userId: input.userId, ref: input.listingId });
    } catch {
      // Slot may already be released (e.g. vendor suspended). Archive still stands.
    }
    return toListing(row);
  }

  async myListings(userId: string): Promise<ListingRecord[]> {
    const mine = await this.vendors.myVendor(userId);
    if (!mine) return [];
    const rows = await this.sql<ListingRow[]>`
      SELECT * FROM market.listings
       WHERE vendor_id = ${mine.id}
       ORDER BY created_at DESC
    `;
    return rows.map(toListing);
  }

  async getListing(listingId: string): Promise<ListingRecord | null> {
    const [row] = await this.sql<ListingRow[]>`SELECT * FROM market.listings WHERE id = ${listingId}`;
    return row ? toListing(row) : null;
  }

  /**
   * Public catalogue of active listings whose vendor is currently listed.
   * Eligibility is re-checked; a stored active flag alone is not enough.
   * A listing without a live slot `ref = listing.id` is dropped (crash orphan
   * after insert-before-claim must not sell). Stake outages drop the row like
   * `listedVendors` — nobody rather than a 500 for the whole page.
   *
   * Blank house commission → `[]`. Advertising inventory that purchase will
   * refuse invents a working marketplace; empty is the refuse-closed shopfront.
   *
   * Subscription listings appear only when they carry a period — leftover rows
   * without one cannot be sold, so they stay off the shopfront.
   *
   * Order is registration (`created_at ASC`), same boring rule as `listed`
   * vendors — ranking / featured / newest-first is DIRECTION §8 and owner-only.
   * Oldest-first also matches over-capacity prune (entitled slots keep the
   * earliest listings).
   *
   * Page size is owner-published — omit is not 50.
   */
  async publicListings(opts?: { limit?: number }): Promise<ListingRecord[]> {
    const limit = assertPublicListingsListLimit(opts?.limit);
    // Blank commission → empty shopfront. Do not advertise inventory that
    // purchase will refuse; that would invent a working marketplace.
    if (this.config.commissionBps === null) return [];
    const rows = await this.sql<ListingRow[]>`
      SELECT * FROM market.listings
       WHERE status = 'active'
         AND (
           offer_type = 'one_time'
           OR (offer_type = 'subscription' AND period_seconds IS NOT NULL)
         )
       ORDER BY created_at ASC, id ASC
       LIMIT ${limit * 3}
    `;
    const out: ListingRecord[] = [];
    for (const row of rows) {
      if (out.length >= limit) break;
      try {
        const elig = await this.vendors.listingEligibility({ vendorId: row.vendor_id });
        if (!elig.listed) continue;
        if (!(await this.listingHoldsLiveSlot(row.id, row.vendor_id))) continue;
        // Over-held after unstake: only the oldest usable slots stay shopfront.
        const entitled = await this.vendors.entitledListingRefs(row.vendor_id);
        if (!entitled.has(row.id)) continue;
        out.push(toListing(row));
      } catch (err) {
        // stake_unavailable and friends — drop this vendor's rows, keep the page.
        if (err instanceof MarketError && err.code === 'market.stake_unavailable') continue;
        throw err;
      }
    }
    return out;
  }

  /**
   * Automatic recurring charge is not a second recipe. One period is `purchase`.
   * Named refuse so this door cannot be mistaken for a silent scheduler.
   */
  async subscribe(_input?: { listingId?: string }): Promise<never> {
    throw new MarketError(
      'Automatic recurring subscribe is not built — buy one period with purchase',
      'market.subscription_recurring_not_built',
    );
  }

  /**
   * One-time or one-period subscription purchase via `marketPurchase`.
   *
   * Order: commission configured → eligibility → claim row → re-check sell
   * gates → post from the claim snapshot → settle only while still pending.
   * Crash after post before settle: re-drive posts the same key and finishes
   * using the purchase row's price/bps (not a live config that may have changed).
   */
  async purchase(input: { buyerId: string; listingId: string; purchaseId: string }): Promise<PurchaseRecord> {
    if (!input.purchaseId?.trim()) {
      throw new MarketError('purchaseId is required', 'market.purchase_id_required');
    }

    const commissionBps = this.requireCommissionConfigured();

    const listing = await this.getListing(input.listingId);
    if (!listing || listing.status !== 'active') {
      throw new MarketError('No active listing with that id', 'market.listing_not_found');
    }
    if (listing.offerType === 'subscription') {
      this.requireSubscriptionPeriod(listing);
      await this.assertNotCancelled(listing.id, input.buyerId);
    }

    await this.assertListingSellable(listing);

    // Resolve vendor user id for the ledger leg.
    const [vendorRow] = await this.sql<Array<{ user_id: string }>>`
      SELECT user_id FROM market.vendors WHERE id = ${listing.vendorId}
    `;
    if (!vendorRow) {
      throw new MarketError('No vendor for that listing', 'market.vendor_not_found');
    }
    if (vendorRow.user_id === input.buyerId) {
      throw new MarketError('You cannot buy your own listing', 'market.purchase_self');
    }

    const price = parseAmount(listing.price);

    // Claim / idempotent resume.
    const claimed = await this.claimPurchase({
      purchaseId: input.purchaseId,
      listingId: listing.id,
      buyerId: input.buyerId,
      vendorId: listing.vendorId,
      vendorUserId: vendorRow.user_id,
      assetId: listing.assetId,
      price: formatAmount(price),
      commissionBps,
    });
    if (claimed.status === 'settled') {
      return this.ensureSubscriptionAccess(claimed, listing);
    }
    if (claimed.status === 'rejected') {
      throw new MarketError(claimed.rejectionCode ?? 'Purchase previously rejected', 'market.purchase_conflict');
    }

    // Re-check after claim so a stake drop / suspend between claim and post cannot sell.
    const liveListing = await this.getListing(claimed.listingId);
    if (!liveListing || liveListing.status !== 'active') {
      throw new MarketError('No active listing with that id', 'market.listing_not_found');
    }
    await this.assertListingSellable(liveListing);
    if (liveListing.offerType === 'subscription') {
      this.requireSubscriptionPeriod(liveListing);
      await this.assertNotCancelled(liveListing.id, claimed.buyerId);
    }

    // Post only from the claim snapshot — never re-read live env bps or a
    // price that may have changed under a different write path later.
    const snapshotPrice = parseAmount(claimed.price);
    const snapshotBps = claimed.commissionBps;

    try {
      const tx = await this.ledger.post(
        recipes.marketPurchase({
          purchaseId: claimed.id,
          listingId: claimed.listingId,
          buyerId: claimed.buyerId,
          vendorUserId: claimed.vendorUserId,
          assetId: claimed.assetId,
          price: snapshotPrice,
          commissionBps: snapshotBps,
        }),
      );

      await this.notifyMarketAffiliateAccrue(claimed, snapshotPrice, snapshotBps);
      await this.notifyMarketAffiliatePayout(claimed, snapshotPrice, snapshotBps);

      const settledAtIso = this.now().toISOString();
      const settledRows = await this.sql<PurchaseRow[]>`
        UPDATE market.purchases
           SET status = 'settled',
               ledger_tx_id = ${tx.id},
               settled_at = ${settledAtIso}::timestamptz
         WHERE id = ${claimed.id}
           AND status = 'pending'
        RETURNING *
      `;
      const settled = settledRows[0];
      if (settled) return this.ensureSubscriptionAccess(toPurchase(settled), liveListing);

      // Another resume may have settled first, or a race rejected the row.
      const [reload] = await this.sql<PurchaseRow[]>`
        SELECT * FROM market.purchases WHERE id = ${claimed.id}
      `;
      if (reload?.status === 'settled') return this.ensureSubscriptionAccess(toPurchase(reload), liveListing);
      if (reload?.status === 'rejected') {
        throw new MarketError(reload.rejection_code ?? 'Purchase previously rejected', 'market.purchase_conflict');
      }
      throw new MarketError('Purchase settle returned no row', 'market.purchase_not_written');
    } catch (err) {
      if (err instanceof MarketError) throw err;
      const code =
        err && typeof err === 'object' && 'code' in err && typeof (err as { code: unknown }).code === 'string'
          ? (err as { code: string }).code
          : 'market.purchase_failed';
      // Insufficient funds and friends — mark rejected so a retry with the same
      // id does not silently re-post after a different outcome. Ledger keys are
      // still unique so a partial post cannot double-charge.
      if (code.includes('insufficient') || code === 'ledger.insufficient_funds') {
        await this.sql`
          UPDATE market.purchases
             SET status = 'rejected', rejection_code = ${code}
           WHERE id = ${claimed.id} AND status = 'pending'
        `;
        throw new MarketError('Insufficient balance for this purchase', 'market.insufficient_funds');
      }
      throw err;
    }
  }

  /** Best-effort; never throws. marketPurchase already posted. */
  private async notifyMarketAffiliateAccrue(claimed: PurchaseRecord, snapshotPrice: Amount, snapshotBps: number): Promise<void> {
    await fireAffiliateAccrue(
      this.affiliateAccrue,
      affiliateLegAfterMarketPurchase({
        purchaseId: claimed.id,
        vendorUserId: claimed.vendorUserId,
        snapshotPrice,
        snapshotBps,
        feeAsset: claimed.assetId,
      }),
    );
  }

  /** Best-effort payout after accrue; never throws. marketPurchase already posted. */
  private async notifyMarketAffiliatePayout(claimed: PurchaseRecord, snapshotPrice: Amount, snapshotBps: number): Promise<void> {
    await fireAffiliatePayout(
      this.affiliatePayout,
      affiliateLegAfterMarketPurchase({
        purchaseId: claimed.id,
        vendorUserId: claimed.vendorUserId,
        snapshotPrice,
        snapshotBps,
        feeAsset: claimed.assetId,
      }),
    );
  }

  async purchasesOf(buyerId: string): Promise<PurchaseRecord[]> {
    const rows = await this.sql<PurchaseRow[]>`
      SELECT * FROM market.purchases WHERE buyer_id = ${buyerId} ORDER BY created_at DESC
    `;
    return rows.map(toPurchase);
  }

  /**
   * Buyer cancel. Stops new paid windows. Does not post a reverse recipe —
   * remaining time until `access_until` still grants access; after that the
   * named code is cancelled, not past-due.
   */
  async cancelSubscription(input: {
    buyerId: string;
    listingId: string;
  }): Promise<{ listingId: string; buyerId: string; cancelledAt: string }> {
    const listing = await this.getListing(input.listingId);
    if (!listing || listing.offerType !== 'subscription') {
      throw new MarketError('No subscription listing with that id', 'market.listing_not_found');
    }
    const paidUntil = await this.maxAccessUntil(listing.id, input.buyerId);
    if (!paidUntil) {
      throw new MarketError('No paid subscription to cancel', 'market.subscription_no_access');
    }
    const [existing] = await this.sql<Array<{ cancelled_at: Date | null }>>`
      SELECT cancelled_at FROM market.subscription_state
       WHERE listing_id = ${listing.id} AND buyer_id = ${input.buyerId}
    `;
    if (existing?.cancelled_at) {
      return { listingId: listing.id, buyerId: input.buyerId, cancelledAt: existing.cancelled_at.toISOString() };
    }
    const at = this.now();
    await this.sql`
      INSERT INTO market.subscription_state (listing_id, buyer_id, cancelled_at, updated_at)
      VALUES (${listing.id}, ${input.buyerId}, ${at.toISOString()}::timestamptz, ${at.toISOString()}::timestamptz)
      ON CONFLICT (listing_id, buyer_id) DO UPDATE
        SET cancelled_at = COALESCE(market.subscription_state.cancelled_at, EXCLUDED.cancelled_at),
            updated_at = EXCLUDED.updated_at
    `;
    const [row] = await this.sql<Array<{ cancelled_at: Date }>>`
      SELECT cancelled_at FROM market.subscription_state
       WHERE listing_id = ${listing.id} AND buyer_id = ${input.buyerId}
    `;
    if (!row?.cancelled_at) {
      throw new MarketError('Cancel did not persist', 'market.subscription_cancel_failed');
    }
    return { listingId: listing.id, buyerId: input.buyerId, cancelledAt: row.cancelled_at.toISOString() };
  }

  /**
   * Time-bounded access. Past-due is a named refuse, never a fake paid row.
   */
  async subscriptionAccess(input: { buyerId: string; listingId: string }): Promise<SubscriptionAccess> {
    const listing = await this.getListing(input.listingId);
    if (!listing || listing.offerType !== 'subscription') {
      throw new MarketError('No subscription listing with that id', 'market.listing_not_found');
    }
    const paidUntil = await this.maxAccessUntil(listing.id, input.buyerId);
    if (!paidUntil) {
      throw new MarketError('No paid subscription access', 'market.subscription_no_access');
    }
    const cancelledAt = await this.cancelledAt(listing.id, input.buyerId);
    const now = this.now();
    if (now >= paidUntil) {
      if (cancelledAt) {
        throw new MarketError('Subscription was cancelled and the paid window has ended', 'market.subscription_cancelled');
      }
      throw new MarketError('Subscription access is past due', 'market.subscription_past_due');
    }
    return {
      granted: true,
      listingId: listing.id,
      buyerId: input.buyerId,
      accessUntil: paidUntil.toISOString(),
    };
  }

  private resolveCreatePeriod(offerType: OfferType, periodSeconds?: number | null): number | null {
    if (offerType === 'one_time') {
      if (periodSeconds != null) {
        throw new MarketError('One-time listings do not take a subscription period', 'market.period_not_applicable');
      }
      return null;
    }
    if (periodSeconds == null || !Number.isInteger(periodSeconds) || periodSeconds <= 0) {
      throw new MarketError(
        'Subscription listings need a period in whole seconds — no default cadence is invented',
        'market.subscription_period_unset',
      );
    }
    return periodSeconds;
  }

  private requireSubscriptionPeriod(listing: ListingRecord): number {
    if (listing.periodSeconds == null || !Number.isInteger(listing.periodSeconds) || listing.periodSeconds <= 0) {
      throw new MarketError(
        'This subscription listing has no period — it cannot be sold until the vendor sets one',
        'market.subscription_period_unset',
      );
    }
    return listing.periodSeconds;
  }

  private async assertNotCancelled(listingId: string, buyerId: string): Promise<void> {
    const cancelledAt = await this.cancelledAt(listingId, buyerId);
    if (cancelledAt) {
      throw new MarketError('This subscription was cancelled — new access is stopped', 'market.subscription_cancelled');
    }
  }

  private async cancelledAt(listingId: string, buyerId: string): Promise<Date | null> {
    const [row] = await this.sql<Array<{ cancelled_at: Date | null }>>`
      SELECT cancelled_at FROM market.subscription_state
       WHERE listing_id = ${listingId} AND buyer_id = ${buyerId}
    `;
    return row?.cancelled_at ?? null;
  }

  private async maxAccessUntil(listingId: string, buyerId: string): Promise<Date | null> {
    const [row] = await this.sql<Array<{ until: Date | null }>>`
      SELECT max(access_until) AS until
        FROM market.purchases
       WHERE listing_id = ${listingId}
         AND buyer_id = ${buyerId}
         AND status = 'settled'
         AND access_until IS NOT NULL
    `;
    return row?.until ?? null;
  }

  /**
   * Stamp `access_until` from the listing period. Idempotent on the same
   * purchase id so a crash re-drive cannot stack extra time.
   */
  private async ensureSubscriptionAccess(purchase: PurchaseRecord, listing: ListingRecord): Promise<PurchaseRecord> {
    if (listing.offerType !== 'subscription') return purchase;
    if (purchase.accessUntil) return purchase;
    const period = this.requireSubscriptionPeriod(listing);
    const now = purchase.settledAt ? new Date(purchase.settledAt) : this.now();
    const previous = await this.maxAccessUntilExcluding(listing.id, purchase.buyerId, purchase.id);
    const base = previous && previous > now ? previous : now;
    const until = addSeconds(base, period);
    const untilIso = until.toISOString();
    const updated = await this.sql<PurchaseRow[]>`
      UPDATE market.purchases
         SET access_until = ${untilIso}::timestamptz
       WHERE id = ${purchase.id}
         AND access_until IS NULL
      RETURNING *
    `;
    const row = updated[0];
    if (row) return toPurchase(row);
    const [reload] = await this.sql<PurchaseRow[]>`SELECT * FROM market.purchases WHERE id = ${purchase.id}`;
    return reload ? toPurchase(reload) : purchase;
  }

  private async maxAccessUntilExcluding(listingId: string, buyerId: string, exceptPurchaseId: string): Promise<Date | null> {
    const [row] = await this.sql<Array<{ until: Date | null }>>`
      SELECT max(access_until) AS until
        FROM market.purchases
       WHERE listing_id = ${listingId}
         AND buyer_id = ${buyerId}
         AND status = 'settled'
         AND access_until IS NOT NULL
         AND id <> ${exceptPurchaseId}
    `;
    return row?.until ?? null;
  }

  private async requireOwnedListing(userId: string, listingId: string): Promise<ListingRecord> {
    const listing = await this.getListing(listingId);
    if (!listing) throw new MarketError('No listing with that id', 'market.listing_not_found');
    const mine = await this.vendors.myVendor(userId);
    if (!mine || mine.id !== listing.vendorId) {
      throw new MarketError('That listing is not yours', 'market.listing_not_owned');
    }
    return listing;
  }

  /**
   * True when this listing id is the `ref` of an unreleased vendor slot.
   * Create writes the listing then claims; if claim never ran, sell/catalogue refuse.
   */
  private async listingHoldsLiveSlot(listingId: string, vendorId: string): Promise<boolean> {
    const rows = await this.sql<Array<{ id: string }>>`
      SELECT id FROM market.vendor_slots
       WHERE vendor_id = ${vendorId}
         AND ref = ${listingId}
         AND released_at IS NULL
       LIMIT 1
    `;
    return rows.length > 0;
  }

  /**
   * Vendor still listed + this listing still holds its own open slot + the
   * listing is inside the usable stake quota (oldest open slots first).
   * Used before claim and again immediately before ledger post (TOCTOU close).
   */
  private async assertListingSellable(listing: ListingRecord): Promise<void> {
    const eligibility = await this.vendors.listingEligibility({ vendorId: listing.vendorId });
    if (!eligibility.listed) {
      throw new MarketError(eligibility.reason ?? 'Vendor is not eligible to sell', eligibility.code ?? 'market.vendor_not_approved');
    }
    if (!(await this.listingHoldsLiveSlot(listing.id, listing.vendorId))) {
      throw new MarketError(
        'This listing has no live slot — it cannot be sold until the vendor reclaims one',
        'market.listing_slot_missing',
      );
    }
    const entitled = await this.vendors.entitledListingRefs(listing.vendorId);
    if (!entitled.has(listing.id)) {
      throw new MarketError(
        'This listing is outside the vendor stake quota — only the oldest live slots remain sellable',
        'market.listing_over_capacity',
      );
    }
  }

  private async claimPurchase(input: {
    purchaseId: string;
    listingId: string;
    buyerId: string;
    vendorId: string;
    vendorUserId: string;
    assetId: string;
    price: string;
    commissionBps: number;
  }): Promise<PurchaseRecord> {
    try {
      const inserted = await this.sql<PurchaseRow[]>`
        INSERT INTO market.purchases (
          id, listing_id, buyer_id, vendor_id, vendor_user_id,
          asset_id, price, commission_bps, status
        ) VALUES (
          ${input.purchaseId}, ${input.listingId}, ${input.buyerId}, ${input.vendorId},
          ${input.vendorUserId}, ${input.assetId}, ${input.price}::numeric, ${input.commissionBps}, 'pending'
        )
        RETURNING *
      `;
      const row = inserted[0];
      if (!row) throw new MarketError('Purchase claim returned no row', 'market.purchase_not_written');
      return toPurchase(row);
    } catch (err) {
      // Unique violation → load existing and compare terms.
      const existing = await this.sql<PurchaseRow[]>`
        SELECT * FROM market.purchases WHERE id = ${input.purchaseId}
      `;
      if (existing.length === 0) throw err;
      const row = existing[0]!;
      // Commission bps is NOT part of the client-facing terms match: it was
      // snapshotted on first claim. Re-drive after an env bps change must settle
      // the original split, not stuck as purchase_conflict or re-split.
      const termsMatch =
        row.listing_id === input.listingId &&
        row.buyer_id === input.buyerId &&
        row.vendor_id === input.vendorId &&
        row.asset_id === input.assetId &&
        purchasePriceTermsMatch(row.price, input.price);
      if (!termsMatch) {
        throw new MarketError(`Purchase id ${input.purchaseId} was already used with different terms`, 'market.purchase_conflict');
      }
      return toPurchase(row);
    }
  }
}
