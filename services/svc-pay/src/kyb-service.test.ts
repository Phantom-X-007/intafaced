import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTestDatabase, postgresAvailable, type TestDatabase } from '@intafaced/db';
import { beforeEach, afterAll, describe, expect, it } from 'vitest';
import { KybError, KybService } from './kyb-service.js';

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
 * DIGITAL KYB durability — the live operator path `decideKybStub` points at.
 * Postgres required: append-only is a TRIGGER.
 */

const URL = process.env.TEST_DATABASE_URL ?? 'postgres://intafaced_ops:intafaced_ops@localhost:5433/intafaced_test';
const here = dirname(fileURLToPath(import.meta.url));
const drizzle = join(here, '..', 'drizzle');
const migrations = readdirSync(drizzle)
  .filter((f) => f.endsWith('.sql') && !f.endsWith('.down.sql'))
  .sort()
  .map((f) => readFileSync(join(drizzle, f), 'utf8'));

const OPERATOR = '99999999-9999-4999-8999-999999999999';
const MERCHANT_USER = '11111111-1111-4111-8111-111111111111';

const available = await postgresAvailable(URL);

if (!available) {
  describe.skip('svc-pay digital KYB (Postgres unavailable — start docker compose)', () => {
    it('skipped', () => undefined);
  });
} else {
  const db: TestDatabase = await createTestDatabase({ service: 'pay', url: URL, migrations });
  const sql = db.sql;
  let kyb: KybService;

  beforeEach(async () => {
    await sql`TRUNCATE pay.merchant_kyb_events, pay.merchant_pricing_events, pay.merchant_status_events, pay.merchants RESTART IDENTITY CASCADE`;
    kyb = new KybService(sql);
  });

  afterAll(async () => {
    await db.drop();
  }, 30_000);

  async function merchant(mode: 'gateway' | 'psp' | 'payfac' = 'psp'): Promise<string> {
    const [row] = await sql<Array<{ id: string }>>`
      INSERT INTO pay.merchants (user_id, mode, status, pricing)
      VALUES (${`u-${Math.random().toString(36).slice(2)}`}, ${mode}, 'active', ${sql.json({ feeBps: 250 } as never)})
      RETURNING id
    `;
    if (!row) throw new Error('inserting a merchant returned no row');
    return row.id;
  }

  describe('why was this merchant approved', () => {
    it('IS ANSWERABLE FROM THE DATABASE after operator decide', async () => {
      const id = await merchant();
      await kyb.submit({
        merchantId: id,
        kybRef: 'dossier-acme-1',
        actorId: MERCHANT_USER,
        actorScope: 'pay:write',
      });
      await kyb.decide({
        merchantId: id,
        decision: 'approved',
        reason: 'incorporation + UBO match; no sanctions hit',
        actorId: OPERATOR,
        actorScope: 'admin:compliance',
      });

      const event = at(await kyb.history(id), 0, 'history');
      expect(event.toStatus).toBe('approved');
      expect(event.fromStatus).toBe('pending');
      expect(event.reason).toBe('incorporation + UBO match; no sanctions hit');
      expect(event.actorId).toBe(OPERATOR);
      expect(event.actorScope).toBe('admin:compliance');
      expect(event.kybRef).toBe('dossier-acme-1');
      expect((await kyb.currentStatus(id)).kybStatus).toBe('approved');
    });

    it('records submit then reject, and allows resubmit after reject', async () => {
      const id = await merchant();
      await kyb.submit({ merchantId: id, kybRef: 'd1', actorId: MERCHANT_USER, actorScope: 'pay:write' });
      await kyb.decide({
        merchantId: id,
        decision: 'rejected',
        reason: 'missing beneficial owner affidavit',
        actorId: OPERATOR,
        actorScope: 'admin:compliance',
      });
      expect((await kyb.currentStatus(id)).kybStatus).toBe('rejected');

      await kyb.submit({ merchantId: id, kybRef: 'd2', actorId: MERCHANT_USER, actorScope: 'pay:write' });
      expect((await kyb.currentStatus(id)).kybStatus).toBe('pending');
      expect((await kyb.history(id)).map((e) => e.toStatus)).toEqual(['pending', 'rejected', 'pending']);
    });
  });

  describe('append-only', () => {
    it('REFUSES UPDATE and DELETE on KYB history', async () => {
      const id = await merchant();
      await kyb.submit({ merchantId: id, kybRef: 'd1', actorId: MERCHANT_USER, actorScope: 'pay:write' });
      await expect(sql`UPDATE pay.merchant_kyb_events SET reason = 'rewritten'`).rejects.toThrow(/append-only/);
      await expect(sql`DELETE FROM pay.merchant_kyb_events`).rejects.toThrow(/append-only/);
    });
  });

  describe('refuses', () => {
    it('blank decide reason', async () => {
      const id = await merchant();
      await kyb.submit({ merchantId: id, kybRef: 'd1', actorId: MERCHANT_USER, actorScope: 'pay:write' });
      const err = await rejection(
        kyb.decide({ merchantId: id, decision: 'approved', reason: '   ', actorId: OPERATOR, actorScope: 'admin:compliance' }),
        KybError,
      );
      expect(err.code).toBe('pay.kyb_reason_required');
    });

    it('decide when not pending', async () => {
      const id = await merchant();
      const err = await rejection(
        kyb.decide({ merchantId: id, decision: 'approved', reason: 'too early', actorId: OPERATOR, actorScope: 'admin:compliance' }),
        KybError,
      );
      expect(err.code).toBe('pay.kyb_invalid');
    });

    it('double submit while pending', async () => {
      const id = await merchant();
      await kyb.submit({ merchantId: id, kybRef: 'd1', actorId: MERCHANT_USER, actorScope: 'pay:write' });
      const err = await rejection(kyb.submit({ merchantId: id, kybRef: 'd2', actorId: MERCHANT_USER, actorScope: 'pay:write' }), KybError);
      expect(err.code).toBe('pay.kyb_invalid');
    });
  });
}
