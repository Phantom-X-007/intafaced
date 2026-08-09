import { randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTestDatabase, postgresAvailable, type TestDatabase } from '@intafaced/db';
import { MemoryLedger, formatAmount, parseAmount as amt, houseFees, userAvailable, recipes } from '@intafaced/ledger-client';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { MARKET_OPS_SCOPE, MarketError, VendorService } from '../vendor-service.js';
import type { SlotEntitlementSource, VendorEntitlement } from '../stake-source.js';
import { CommerceService } from './commerce-service.js';

/**
 * market.commerce — listings + one-time purchase + house commission.
 *
 * Proves: blank commission refuses; eligibility from vendors (no is_listed);
 * purchase posts marketPurchase once; suspended/unstaked refuse; money strings.
 */

const URL = process.env.TEST_DATABASE_URL ?? 'postgres://intafaced_ops:intafaced_ops@localhost:5433/intafaced_test';
const here = dirname(fileURLToPath(import.meta.url));
const drizzle = join(here, '..', '..', 'drizzle');
const migrations = readdirSync(drizzle)
  .filter((f) => f.endsWith('.sql') && !f.endsWith('.down.sql'))
  .sort()
  .map((f) => readFileSync(join(drizzle, f), 'utf8'));

const VENDOR_USER = '11111111-1111-4111-8111-111111111111';
const BUYER = '22222222-2222-4222-8222-222222222222';
const OPERATOR = '33333333-3333-4333-8333-333333333333';

class FixedEntitlement implements SlotEntitlementSource {
  constructor(public vendorSlots = 3) {}
  async entitlementOf(): Promise<VendorEntitlement> {
    return { tierName: 'Operator', vendorSlots: this.vendorSlots };
  }
}

const available = await postgresAvailable(URL);

if (!available) {
  describe.skip('market.commerce (Postgres unavailable)', () => {
    it('skipped', () => undefined);
  });
} else {
  const db: TestDatabase = await createTestDatabase({ service: 'market', url: URL, migrations });
  const sql = db.sql;

  let stakes: FixedEntitlement;
  let vendors: VendorService;
  let ledger: MemoryLedger;
  let commerce: CommerceService;

  async function approvedVendor(userId: string): Promise<string> {
    const v = await vendors.applyAsVendor({
      userId,
      displayName: 'Acme Bots',
      description: 'I sell trading bots',
    });
    await vendors.vet({
      vendorId: v.id,
      decision: 'approved',
      reason: 'looks fine',
      actorId: OPERATOR,
      actorScope: MARKET_OPS_SCOPE,
    });
    return v.id;
  }

  beforeEach(async () => {
    await sql`
      TRUNCATE market.purchases, market.listings, market.vendor_slots,
               market.vendor_status_events, market.vendors
      RESTART IDENTITY CASCADE
    `;
    stakes = new FixedEntitlement(3);
    vendors = new VendorService(sql, stakes);
    ledger = new MemoryLedger();
    commerce = new CommerceService(sql, vendors, ledger, { commissionBps: 500 });
  });

  afterAll(async () => {
    await db.drop();
  }, 30_000);

  describe('refuse-closed commission', () => {
    it('refuses purchase when commission bps is not configured', async () => {
      await approvedVendor(VENDOR_USER);
      const blank = new CommerceService(sql, vendors, ledger, { commissionBps: null });
      // Need a listing first under a configured service, then purchase under blank.
      const listing = await commerce.createListing({
        userId: VENDOR_USER,
        title: 'Bot pack',
        description: 'A useful bot',
        offerType: 'one_time',
        assetId: 'USDT',
        price: '10',
      });
      await expect(blank.purchase({ buyerId: BUYER, listingId: listing.id, purchaseId: randomUUID() })).rejects.toMatchObject({
        code: 'market.commission_not_configured',
      });
      // Nothing moved.
      expect(formatAmount((await ledger.balance(userAvailable(BUYER, 'USDT'))).amount)).toBe('0');
    });

    it('programme reports unconfigured when null', () => {
      const blank = new CommerceService(sql, vendors, ledger, { commissionBps: null });
      expect(blank.programme()).toEqual({ commissionBps: null, commissionConfigured: false });
    });
  });

  describe('listings', () => {
    it('refuses create when vendor is not eligible', async () => {
      await vendors.applyAsVendor({
        userId: VENDOR_USER,
        displayName: 'Acme',
        description: 'pending',
      });
      await expect(
        commerce.createListing({
          userId: VENDOR_USER,
          title: 'Bot',
          description: 'desc',
          offerType: 'one_time',
          assetId: 'USDT',
          price: '5',
        }),
      ).rejects.toMatchObject({ code: 'market.vendor_not_approved' });
    });

    it('creates a listing and claims a slot named by listing id', async () => {
      await approvedVendor(VENDOR_USER);
      const listing = await commerce.createListing({
        userId: VENDOR_USER,
        title: 'Bot pack',
        description: 'A useful bot',
        offerType: 'one_time',
        assetId: 'USDT',
        price: '25.50',
      });
      expect(listing.status).toBe('active');
      expect(listing.price).toMatch(/^25\.5/);
      const slots = await vendors.slotStatus(VENDOR_USER);
      expect(slots.held).toBe(1);
      expect(slots.slots[0]?.ref).toBe(listing.id);
    });

    it('drops a listing from the public catalogue when the vendor unstakes', async () => {
      await approvedVendor(VENDOR_USER);
      await commerce.createListing({
        userId: VENDOR_USER,
        title: 'Bot pack',
        description: 'A useful bot',
        offerType: 'one_time',
        assetId: 'USDT',
        price: '10',
      });
      expect((await commerce.publicListings()).length).toBe(1);
      stakes.vendorSlots = 0;
      expect((await commerce.publicListings()).length).toBe(0);
    });
  });

  describe('purchase — Class M money path', () => {
    async function liveListing() {
      await approvedVendor(VENDOR_USER);
      return commerce.createListing({
        userId: VENDOR_USER,
        title: 'Bot pack',
        description: 'A useful bot',
        offerType: 'one_time',
        assetId: 'USDT',
        price: '100',
      });
    }

    it('settles buyer → vendor net + house commission once', async () => {
      const listing = await liveListing();
      await ledger.post(
        recipes.deposit({
          userId: BUYER,
          assetId: 'USDT',
          amount: amt('1000'),
          rail: 'test',
          railRef: 'buyer-seed',
        }),
      );

      const purchaseId = randomUUID();
      const first = await commerce.purchase({ buyerId: BUYER, listingId: listing.id, purchaseId });
      expect(first.status).toBe('settled');
      expect(first.commissionBps).toBe(500);
      expect(first.ledgerTxId).toBeTruthy();

      const second = await commerce.purchase({ buyerId: BUYER, listingId: listing.id, purchaseId });
      expect(second.id).toBe(first.id);
      expect(second.ledgerTxId).toBe(first.ledgerTxId);

      expect(formatAmount((await ledger.balance(userAvailable(BUYER, 'USDT'))).amount)).toBe('900');
      expect(formatAmount((await ledger.balance(userAvailable(VENDOR_USER, 'USDT'))).amount)).toBe('95');
      expect(formatAmount((await ledger.balance(houseFees('market', 'USDT'))).amount)).toBe('5');
    });

    it('refuses when the vendor is no longer listed (stake dropped)', async () => {
      const listing = await liveListing();
      await ledger.post(
        recipes.deposit({
          userId: BUYER,
          assetId: 'USDT',
          amount: amt('1000'),
          rail: 'test',
          railRef: 'buyer-seed-2',
        }),
      );
      stakes.vendorSlots = 0;
      await expect(commerce.purchase({ buyerId: BUYER, listingId: listing.id, purchaseId: randomUUID() })).rejects.toMatchObject({
        code: 'market.stake_required',
      });
    });

    it('refuses self-purchase', async () => {
      const listing = await liveListing();
      await expect(commerce.purchase({ buyerId: VENDOR_USER, listingId: listing.id, purchaseId: randomUUID() })).rejects.toMatchObject({
        code: 'market.purchase_self',
      });
    });

    it('refuses subscription listings until Stage 3', async () => {
      await approvedVendor(VENDOR_USER);
      const listing = await commerce.createListing({
        userId: VENDOR_USER,
        title: 'Sub',
        description: 'monthly',
        offerType: 'subscription',
        assetId: 'USDT',
        price: '10',
      });
      await expect(commerce.purchase({ buyerId: BUYER, listingId: listing.id, purchaseId: randomUUID() })).rejects.toMatchObject({
        code: 'market.subscription_not_built',
      });
    });

    it('refuses a conflicting reuse of the same purchaseId', async () => {
      const listing = await liveListing();
      await ledger.post(
        recipes.deposit({
          userId: BUYER,
          assetId: 'USDT',
          amount: amt('1000'),
          rail: 'test',
          railRef: 'buyer-seed-3',
        }),
      );
      const purchaseId = randomUUID();
      await commerce.purchase({ buyerId: BUYER, listingId: listing.id, purchaseId });

      const other = await commerce.createListing({
        userId: VENDOR_USER,
        title: 'Other',
        description: 'other bot',
        offerType: 'one_time',
        assetId: 'USDT',
        price: '50',
      });
      await expect(commerce.purchase({ buyerId: BUYER, listingId: other.id, purchaseId })).rejects.toMatchObject({
        code: 'market.purchase_conflict',
      });
    });
  });

  describe('schema honesty', () => {
    it('has no balance-shaped columns on market listings/purchases', async () => {
      const cols = await sql<Array<{ table_name: string; column_name: string }>>`
        SELECT table_name, column_name
          FROM information_schema.columns
         WHERE table_schema = 'market'
           AND table_name IN ('listings', 'purchases')
      `;
      const banned = /balance|total|running|cached|available|held|accrued|outstanding/i;
      for (const c of cols) {
        expect(c.column_name).not.toMatch(banned);
      }
      // price/commission exist as intent records, not balances — listed explicitly.
      expect(cols.some((c) => c.column_name === 'price')).toBe(true);
    });
  });
}
