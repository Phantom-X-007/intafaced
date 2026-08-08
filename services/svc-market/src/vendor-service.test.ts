import { describe, expect, it } from 'vitest';
import type { Sql } from 'postgres';
import { MarketError, VendorService } from './vendor-service.js';

/**
 * The refusals, proved to happen BEFORE the database is touched.
 *
 * The `sql` handed in is a Proxy that throws on any property access, so these
 * tests do not need Postgres and — more usefully — they fail if a guard is ever
 * moved to after the first query. A validation that runs inside the transaction
 * is a validation that has already opened one.
 */
const noDatabase = new Proxy(
  {},
  {
    get(_target, property) {
      throw new Error(`svc-market reached the database (.${String(property)}) before refusing — the guard ran too late`);
    },
    apply() {
      throw new Error('svc-market reached the database before refusing — the guard ran too late');
    },
  },
) as unknown as Sql;

const VENDOR = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OPERATOR = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

const vendors = new VendorService(noDatabase);

describe('vet — nothing in svc-market decides an application', () => {
  it('refuses a caller who does not hold the operator scope', async () => {
    await expect(
      vendors.vet({ vendorId: VENDOR, decision: 'approved', reason: 'looks fine', actorId: OPERATOR, actorScope: 'market:write' }),
    ).rejects.toMatchObject({ code: 'market.vet_operator_required' });
  });

  // The one that matters most: a policy engine, a cron or an internal tool
  // reaching this method with no scope at all must be refused by NAME, not
  // silently allowed to write an approval nobody made.
  it('refuses a caller with no scope at all', async () => {
    await expect(
      vendors.vet({ vendorId: VENDOR, decision: 'rejected', reason: 'automated', actorId: OPERATOR, actorScope: '' }),
    ).rejects.toBeInstanceOf(MarketError);
  });

  it('refuses a decision with a blank reason', async () => {
    await expect(
      vendors.vet({ vendorId: VENDOR, decision: 'rejected', reason: '   ', actorId: OPERATOR, actorScope: 'market:ops' }),
    ).rejects.toMatchObject({ code: 'market.vet_reason_required' });
  });
});

describe('apply — the fields an operator has to read cannot be blank', () => {
  it('refuses a blank display name', async () => {
    await expect(vendors.applyAsVendor({ userId: OPERATOR, displayName: '  ', description: 'I sell things' })).rejects.toMatchObject({
      code: 'market.vendor_display_name_required',
    });
  });

  it('refuses a blank description', async () => {
    await expect(vendors.applyAsVendor({ userId: OPERATOR, displayName: 'Acme', description: '\n\t ' })).rejects.toMatchObject({
      code: 'market.vendor_description_required',
    });
  });
});
