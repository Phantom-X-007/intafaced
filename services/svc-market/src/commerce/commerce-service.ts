import type { Sql } from 'postgres';
import { formatAmount, parseAmount, recipes, type LedgerClient } from '@intafaced/ledger-client';
import { MarketError, type VendorService } from '../vendor-service.js';

/**
 * market.commerce — listings + one-time purchase with house commission (§8.7).
 *
 * No second balance book. Price and commission move only via `marketPurchase`.
 * Listing eligibility is re-computed from VendorService on every write that
 * cares — never a stored `is_listed` flag.
 *
 * House commission bps is owner-gated. When the deployment has no rate
 * configured (`commissionBps === null`), every purchase refuses
 * `market.commission_not_configured` before any row or post.
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
}

interface ListingRow {
  id: string;
  vendor_id: string;
  title: string;
  description: string;
  offer_type: OfferType;
  asset_id: string;
  price: string;
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
  price: string;
  commission_bps: number;
  status: PurchaseStatus;
  ledger_tx_id: string | null;
  rejection_code: string | null;
  created_at: Date;
  settled_at: Date | null;
}

function toListing(row: ListingRow): ListingRecord {
  return {
    id: row.id,
    vendorId: row.vendor_id,
    title: row.title,
    description: row.description,
    offerType: row.offer_type,
    assetId: row.asset_id,
    // postgres.js returns numeric as string when configured; coerce safely.
    price: typeof row.price === 'string' ? row.price : formatAmount(parseAmount(String(row.price))),
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
    price: typeof row.price === 'string' ? row.price : formatAmount(parseAmount(String(row.price))),
    commissionBps: row.commission_bps,
    status: row.status,
    ledgerTxId: row.ledger_tx_id,
    rejectionCode: row.rejection_code,
    createdAt: row.created_at.toISOString(),
    settledAt: row.settled_at ? row.settled_at.toISOString() : null,
  };
}

export interface CommerceConfig {
  /**
   * House commission in bps, or `null` when the owner has not set a rate.
   * Null is the refuse-closed default — never silently 0.
   */
  commissionBps: number | null;
}

export class CommerceService {
  constructor(
    private readonly sql: Sql,
    private readonly vendors: VendorService,
    private readonly ledger: LedgerClient,
    private readonly config: CommerceConfig,
  ) {}

  /** What this deployment's commission rate is — including that it is not one. */
  programme(): { commissionBps: number | null; commissionConfigured: boolean } {
    return {
      commissionBps: this.config.commissionBps,
      commissionConfigured: this.config.commissionBps !== null,
    };
  }

  async createListing(input: {
    userId: string;
    title: string;
    description: string;
    offerType: OfferType;
    assetId: string;
    /** Decimal string. */
    price: string;
  }): Promise<ListingRecord> {
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

    const eligibility = await this.vendors.listingEligibility({ userId: input.userId });
    if (!eligibility.listed || !eligibility.vendorId) {
      throw new MarketError(
        eligibility.reason ?? 'Vendor is not eligible to create listings',
        eligibility.code ?? 'market.vendor_not_approved',
      );
    }

    const priceStr = formatAmount(price);

    // Insert listing first so the id can name the slot claim (idempotent ref).
    const inserted = await this.sql<ListingRow[]>`
      INSERT INTO market.listings (vendor_id, title, description, offer_type, asset_id, price, status)
      VALUES (
        ${eligibility.vendorId},
        ${title},
        ${description},
        ${input.offerType},
        ${assetId},
        ${priceStr}::numeric,
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
   */
  async publicListings(opts?: { limit?: number }): Promise<ListingRecord[]> {
    const limit = Math.min(opts?.limit ?? 50, 50);
    const rows = await this.sql<ListingRow[]>`
      SELECT * FROM market.listings
       WHERE status = 'active'
       ORDER BY created_at DESC
       LIMIT ${limit * 3}
    `;
    const out: ListingRecord[] = [];
    for (const row of rows) {
      if (out.length >= limit) break;
      const elig = await this.vendors.listingEligibility({ vendorId: row.vendor_id });
      if (elig.listed) out.push(toListing(row));
    }
    return out;
  }

  /**
   * One-time purchase. Subscription listings refuse by name until Stage 3.
   *
   * Order: eligibility → commission configured → claim row → post → settle.
   * Crash after post before settle: re-drive posts the same key and finishes.
   */
  async purchase(input: { buyerId: string; listingId: string; purchaseId: string }): Promise<PurchaseRecord> {
    if (!input.purchaseId?.trim()) {
      throw new MarketError('purchaseId is required', 'market.purchase_id_required');
    }

    if (this.config.commissionBps === null) {
      throw new MarketError(
        'House commission rate is not configured — purchases refuse until the owner sets MARKET_HOUSE_COMMISSION_BPS',
        'market.commission_not_configured',
      );
    }
    const commissionBps = this.config.commissionBps;

    const listing = await this.getListing(input.listingId);
    if (!listing || listing.status !== 'active') {
      throw new MarketError('No active listing with that id', 'market.listing_not_found');
    }
    if (listing.offerType === 'subscription') {
      throw new MarketError('Subscription purchase is not built yet (market.commerce Stage 3 residual)', 'market.subscription_not_built');
    }

    const eligibility = await this.vendors.listingEligibility({ vendorId: listing.vendorId });
    if (!eligibility.listed) {
      throw new MarketError(eligibility.reason ?? 'Vendor is not eligible to sell', eligibility.code ?? 'market.vendor_not_approved');
    }

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
    if (claimed.status === 'settled') return claimed;
    if (claimed.status === 'rejected') {
      throw new MarketError(claimed.rejectionCode ?? 'Purchase previously rejected', 'market.purchase_conflict');
    }

    try {
      const tx = await this.ledger.post(
        recipes.marketPurchase({
          purchaseId: input.purchaseId,
          listingId: listing.id,
          buyerId: input.buyerId,
          vendorUserId: vendorRow.user_id,
          assetId: listing.assetId,
          price,
          commissionBps,
        }),
      );

      const settledRows = await this.sql<PurchaseRow[]>`
        UPDATE market.purchases
           SET status = 'settled',
               ledger_tx_id = ${tx.id},
               settled_at = now()
         WHERE id = ${input.purchaseId}
        RETURNING *
      `;
      const settled = settledRows[0];
      if (!settled) throw new MarketError('Purchase settle returned no row', 'market.purchase_not_written');
      return toPurchase(settled);
    } catch (err) {
      const code =
        err && typeof err === 'object' && 'code' in err && typeof (err as { code: unknown }).code === 'string'
          ? (err as { code: string }).code
          : 'market.purchase_failed';
      // Insufficient funds and friends — mark rejected so a retry with the same
      // id does not silently re-post after a different outcome. Ledger keys are
      // still unique so a partial post cannot double-charge.
      if (code.includes('insufficient') || code === 'ledger.insufficient_balance') {
        await this.sql`
          UPDATE market.purchases
             SET status = 'rejected', rejection_code = ${code}
           WHERE id = ${input.purchaseId} AND status = 'pending'
        `;
        throw new MarketError('Insufficient balance for this purchase', 'market.insufficient_funds');
      }
      throw err;
    }
  }

  async purchasesOf(buyerId: string): Promise<PurchaseRecord[]> {
    const rows = await this.sql<PurchaseRow[]>`
      SELECT * FROM market.purchases WHERE buyer_id = ${buyerId} ORDER BY created_at DESC
    `;
    return rows.map(toPurchase);
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
      const termsMatch =
        row.listing_id === input.listingId &&
        row.buyer_id === input.buyerId &&
        row.vendor_id === input.vendorId &&
        row.asset_id === input.assetId &&
        row.commission_bps === input.commissionBps &&
        formatAmount(parseAmount(String(row.price))) === input.price;
      if (!termsMatch) {
        throw new MarketError(`Purchase id ${input.purchaseId} was already used with different terms`, 'market.purchase_conflict');
      }
      return toPurchase(row);
    }
  }
}
