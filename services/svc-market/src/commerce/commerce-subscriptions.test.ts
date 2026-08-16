import { randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTestDatabase, postgresAvailable, type TestDatabase } from '@intafaced/db';
import { MemoryLedger, formatAmount, parseAmount as amt, houseFees, userAvailable, recipes } from '@intafaced/ledger-client';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { MARKET_OPS_SCOPE, VendorService } from '../vendor-service.js';
import type { SlotEntitlementSource, VendorEntitlement } from '../stake-source.js';
import { CommerceService } from './commerce-service.js';

/**
 * market.commerce Stage C3 — listing subscriptions.
 *
 * Period from the listing (no default month). One period posts existing
 * marketPurchase. Cancel stops new access without a reverse recipe. Past-due
 * is a named refuse, not a fake paid state. Catalogue is honest.
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
const PERIOD = 3_600;

class FixedEntitlement implements SlotEntitlementSource {
  constructor(public vendorSlots = 3) {}
  async entitlementOf(): Promise<VendorEntitlement> {
    return { tierName: 'Operator', vendorSlots: this.vendorSlots };
  }
}

const available = await postgresAvailable(URL);

if (!available) {
  describe.skip('market.commerce C3 subscriptions (Postgres unavailable)', () => {
    it('skipped', () => undefined);
  });
} else {
  const db: TestDatabase = await createTestDatabase({ service: 'market', url: URL, migrations });
  const sql = db.sql;

  let stakes: FixedEntitlement;
  let vendors: VendorService;
  let ledger: MemoryLedger;
  let clock: Date;
  let commerce: CommerceService;

  async function approvedVendor(): Promise<void> {
    const v = await vendors.applyAsVendor({
      userId: VENDOR_USER,
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
  }

  async function fundBuyer(): Promise<void> {
    await ledger.post(
      recipes.deposit({
        userId: BUYER,
        assetId: 'USDT',
        amount: amt('1000'),
        rail: 'test',
        railRef: `buyer-seed-${randomUUID()}`,
      }),
    );
  }

  beforeEach(async () => {
    await sql`
      TRUNCATE market.subscription_state, market.purchases, market.listings, market.vendor_slots,
               market.vendor_status_events, market.vendors
      RESTART IDENTITY CASCADE
    `;
    stakes = new FixedEntitlement(3);
    vendors = new VendorService(sql, stakes);
    ledger = new MemoryLedger();
    clock = new Date('2026-08-16T00:00:00.000Z');
    commerce = new CommerceService(sql, vendors, ledger, {
      commissionBps: 500,
      now: () => new Date(clock.getTime()),
    });
  });

  afterAll(async () => {
    await db.drop();
  }, 30_000);

  describe('Stage C3 listing subscriptions', () => {
    it('purchases a subscription period via marketPurchase and grants time-bounded access', async () => {
      await approvedVendor();
      await fundBuyer();
      const listing = await commerce.createListing({
        userId: VENDOR_USER,
        title: 'Feed',
        description: 'hourly access',
        offerType: 'subscription',
        assetId: 'USDT',
        price: '100',
        periodSeconds: PERIOD,
      });
      expect(listing.periodSeconds).toBe(PERIOD);
      expect((await commerce.publicListings()).map((l) => l.id)).toContain(listing.id);

      const bought = await commerce.purchase({ buyerId: BUYER, listingId: listing.id, purchaseId: randomUUID() });
      expect(bought.status).toBe('settled');
      expect(bought.accessUntil).toBe(new Date(clock.getTime() + PERIOD * 1000).toISOString());
      expect(formatAmount((await ledger.balance(userAvailable(BUYER, 'USDT'))).amount)).toBe('900');
      expect(formatAmount((await ledger.balance(userAvailable(VENDOR_USER, 'USDT'))).amount)).toBe('95');
      expect(formatAmount((await ledger.balance(houseFees('market', 'USDT'))).amount)).toBe('5');

      const access = await commerce.subscriptionAccess({ buyerId: BUYER, listingId: listing.id });
      expect(access.granted).toBe(true);
      expect(access.accessUntil).toBe(bought.accessUntil);
    });

    it('refuses subscription purchase when commission is blank', async () => {
      await approvedVendor();
      const listing = await commerce.createListing({
        userId: VENDOR_USER,
        title: 'Feed',
        description: 'hourly',
        offerType: 'subscription',
        assetId: 'USDT',
        price: '10',
        periodSeconds: PERIOD,
      });
      const blank = new CommerceService(sql, vendors, ledger, { commissionBps: null, now: () => clock });
      await expect(blank.purchase({ buyerId: BUYER, listingId: listing.id, purchaseId: randomUUID() })).rejects.toMatchObject({
        code: 'market.commission_not_configured',
      });
      expect(formatAmount((await ledger.balance(userAvailable(BUYER, 'USDT'))).amount)).toBe('0');
    });

    it('refuses access as past-due after the paid window — not a fake paid state', async () => {
      await approvedVendor();
      await fundBuyer();
      const listing = await commerce.createListing({
        userId: VENDOR_USER,
        title: 'Feed',
        description: 'hourly',
        offerType: 'subscription',
        assetId: 'USDT',
        price: '10',
        periodSeconds: PERIOD,
      });
      await commerce.purchase({ buyerId: BUYER, listingId: listing.id, purchaseId: randomUUID() });
      clock = new Date(clock.getTime() + (PERIOD + 1) * 1000);
      await expect(commerce.subscriptionAccess({ buyerId: BUYER, listingId: listing.id })).rejects.toMatchObject({
        code: 'market.subscription_past_due',
      });
    });

    it('cancel stops new access and does not reverse the ledger', async () => {
      await approvedVendor();
      await fundBuyer();
      const listing = await commerce.createListing({
        userId: VENDOR_USER,
        title: 'Feed',
        description: 'hourly',
        offerType: 'subscription',
        assetId: 'USDT',
        price: '100',
        periodSeconds: PERIOD,
      });
      await commerce.purchase({ buyerId: BUYER, listingId: listing.id, purchaseId: randomUUID() });
      const houseAfterPay = formatAmount((await ledger.balance(houseFees('market', 'USDT'))).amount);

      const cancelled = await commerce.cancelSubscription({ buyerId: BUYER, listingId: listing.id });
      expect(cancelled.cancelledAt).toBeTruthy();
      // Paid window still grants access — cancel is not a silent refund.
      await expect(commerce.subscriptionAccess({ buyerId: BUYER, listingId: listing.id })).resolves.toMatchObject({
        granted: true,
      });
      expect(formatAmount((await ledger.balance(houseFees('market', 'USDT'))).amount)).toBe(houseAfterPay);
      expect(formatAmount((await ledger.balance(userAvailable(BUYER, 'USDT'))).amount)).toBe('900');

      await expect(commerce.purchase({ buyerId: BUYER, listingId: listing.id, purchaseId: randomUUID() })).rejects.toMatchObject({
        code: 'market.subscription_cancelled',
      });

      clock = new Date(clock.getTime() + (PERIOD + 1) * 1000);
      await expect(commerce.subscriptionAccess({ buyerId: BUYER, listingId: listing.id })).rejects.toMatchObject({
        code: 'market.subscription_cancelled',
      });
    });
  });
}
