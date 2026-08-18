import { readdirSync, readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { createTestDatabase, postgresAvailable, type TestDatabase } from '@intafaced/db';
import { beforeEach, afterAll, describe, expect, it } from 'vitest';
import {
  assertNoThirdPartyMoneyLibrary,
  assertPspMerchant,
  FORBIDDEN_THIRD_PARTY_MONEY_LIBS,
  PspModeError,
  PspModeService,
} from './psp-mode.js';

function at<T>(rows: readonly T[], index: number, what: string): T {
  const row = rows[index];
  if (row === undefined) throw new Error(`expected ${what}[${index}], but only ${rows.length} row(s) came back`);
  return row;
}

async function rejection<E>(promise: Promise<unknown>, kind: abstract new (...args: never[]) => E): Promise<E> {
  try {
    await promise;
  } catch (err) {
    if (err instanceof kind) return err;
    throw err;
  }
  throw new Error(`expected ${kind.name}, but the call resolved`);
}

/**
 * PSP mode — no third-party money library + custom pricing durability.
 */

describe('PSP path without third-party money library (D-S-10)', () => {
  it('svc-pay package.json does not depend on forbidden money / orchestrator libs', () => {
    expect(() => assertNoThirdPartyMoneyLibrary()).not.toThrow();
    expect(FORBIDDEN_THIRD_PARTY_MONEY_LIBS).toContain('hyperswitch');
    expect(FORBIDDEN_THIRD_PARTY_MONEY_LIBS).toContain('stripe');
  });

  it('refuses when a forbidden lib is present in a package.json fixture', () => {
    const dir = mkdtempSync(join(tmpdir(), 'pay-psp-'));
    const path = join(dir, 'package.json');
    writeFileSync(path, JSON.stringify({ dependencies: { hyperswitch: '1.0.0', zod: '3.0.0' } }));
    try {
      expect(() => assertNoThirdPartyMoneyLibrary(path)).toThrow(/hyperswitch/);
      try {
        assertNoThirdPartyMoneyLibrary(path);
      } catch (err) {
        expect(err).toBeInstanceOf(PspModeError);
        expect((err as PspModeError).code).toBe('pay.psp_third_party_money_lib_forbidden');
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('assertPspMerchant requires mode=psp and explicit feeBps', () => {
    expect(assertPspMerchant({ mode: 'psp', pricing: { feeBps: 150 } })).toBe(150);
    expect(() => assertPspMerchant({ mode: 'gateway', pricing: { feeBps: 150 } })).toThrow(/psp/);
    expect(() => assertPspMerchant({ mode: 'psp', pricing: {} })).toThrow(/feeBps/);
  });
});

const URL = process.env.TEST_DATABASE_URL ?? 'postgres://intafaced_ops:intafaced_ops@localhost:5433/intafaced_test';
const here = dirname(fileURLToPath(import.meta.url));
const drizzle = join(here, '..', 'drizzle');
const migrations = readdirSync(drizzle)
  .filter((f) => f.endsWith('.sql') && !f.endsWith('.down.sql'))
  .sort()
  .map((f) => readFileSync(join(drizzle, f), 'utf8'));

const OPERATOR = '99999999-9999-4999-8999-999999999999';
const available = await postgresAvailable(URL);

if (!available) {
  describe.skip('svc-pay PSP pricing durability (Postgres unavailable)', () => {
    it('skipped', () => undefined);
  });
} else {
  const db: TestDatabase = await createTestDatabase({ service: 'pay', url: URL, migrations });
  const sql = db.sql;
  let psp: PspModeService;

  beforeEach(async () => {
    await sql`TRUNCATE pay.merchant_kyb_events, pay.merchant_pricing_events, pay.merchant_status_events, pay.merchants RESTART IDENTITY CASCADE`;
    psp = new PspModeService(sql);
  });

  afterAll(async () => {
    await db.drop();
  }, 30_000);

  async function merchant(mode: 'gateway' | 'psp' = 'gateway', feeBps = 250): Promise<string> {
    const [row] = await sql<Array<{ id: string }>>`
      INSERT INTO pay.merchants (user_id, mode, status, pricing)
      VALUES (${`u-${Math.random().toString(36).slice(2)}`}, ${mode}, 'active', ${sql.json({ feeBps } as never)})
      RETURNING id
    `;
    if (!row) throw new Error('insert failed');
    return row.id;
  }

  describe('custom pricing durability', () => {
    it('records who changed feeBps and why', async () => {
      const id = await merchant('psp', 250);
      await psp.setPricing({
        merchantId: id,
        feeBps: 180,
        reason: 'negotiated enterprise band for volume tier A',
        actorId: OPERATOR,
        actorScope: 'admin:write',
      });
      const event = at(await psp.pricingHistory(id), 0, 'history');
      expect(event.fromFeeBps).toBe(250);
      expect(event.toFeeBps).toBe(180);
      expect(event.reason).toMatch(/enterprise/);
      expect(event.actorId).toBe(OPERATOR);

      const [row] = await sql<Array<{ pricing: { feeBps: number } }>>`
        SELECT pricing FROM pay.merchants WHERE id = ${id}
      `;
      expect(row?.pricing.feeBps).toBe(180);
    });

    it('no-ops when feeBps unchanged — no history row', async () => {
      const id = await merchant('psp', 250);
      const result = await psp.setPricing({
        merchantId: id,
        feeBps: 250,
        reason: 'same rate again',
        actorId: OPERATOR,
        actorScope: 'admin:write',
      });
      expect(result.changed).toBe(false);
      expect(await psp.pricingHistory(id)).toHaveLength(0);
    });

    it('REFUSES blank reason and invent-range feeBps', async () => {
      const id = await merchant();
      const blank = await rejection(
        psp.setPricing({ merchantId: id, feeBps: 100, reason: 'x', actorId: OPERATOR, actorScope: 'admin:write' }),
        PspModeError,
      );
      expect(blank.code).toBe('pay.pricing_reason_required');
      const range = await rejection(
        psp.setPricing({ merchantId: id, feeBps: 10001, reason: 'too high', actorId: OPERATOR, actorScope: 'admin:write' }),
        PspModeError,
      );
      expect(range.code).toBe('pay.merchant_pricing_invalid');
    });

    it('append-only on pricing events', async () => {
      const id = await merchant();
      await psp.setPricing({
        merchantId: id,
        feeBps: 200,
        reason: 'initial cut',
        actorId: OPERATOR,
        actorScope: 'admin:write',
      });
      await expect(sql`UPDATE pay.merchant_pricing_events SET reason = 'nope'`).rejects.toThrow(/append-only/);
    });
  });

  describe('enable PSP mode', () => {
    it('flips gateway → psp when feeBps is explicit', async () => {
      const id = await merchant('gateway', 250);
      const result = await psp.enablePspMode({
        merchantId: id,
        reason: 'merchant contract signed — own-the-merchant PSP',
        actorId: OPERATOR,
        actorScope: 'admin:write',
      });
      expect(result).toMatchObject({ mode: 'psp', feeBps: 250, changed: true });
      const [row] = await sql<Array<{ mode: string }>>`SELECT mode FROM pay.merchants WHERE id = ${id}`;
      expect(row?.mode).toBe('psp');
    });

    it('refuses when feeBps missing — no invent fees', async () => {
      const [row] = await sql<Array<{ id: string }>>`
        INSERT INTO pay.merchants (user_id, mode, status, pricing)
        VALUES (${`u-${Math.random().toString(36).slice(2)}`}, 'gateway', 'active', ${sql.json({} as never)})
        RETURNING id
      `;
      if (!row) throw new Error('insert failed');
      const err = await rejection(
        psp.enablePspMode({
          merchantId: row.id,
          reason: 'want psp',
          actorId: OPERATOR,
          actorScope: 'admin:write',
        }),
        PspModeError,
      );
      expect(err.code).toBe('pay.merchant_pricing_invalid');
    });
  });
}
