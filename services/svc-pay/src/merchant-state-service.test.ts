import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTestDatabase, postgresAvailable, type TestDatabase } from '@intafaced/db';
import { beforeEach, afterAll, describe, expect, it } from 'vitest';
import { MerchantStateError, MerchantStateService } from './merchant-state-service.js';

/**
 * MERCHANT STATE HAS A WRITER AND A HISTORY.
 *
 * `docs/adr/2026-08-04-pay-rails-and-psp-socket.md` (Accepted): *"Merchant state
 * has no history and no writer. `status='suspended'` is read and enforced by a
 * code path that nothing writes… a suspension cannot be explained, dated, or
 * undone, and an operator cannot answer 'why is this merchant suspended' from
 * the database."*
 *
 * THE TEST THAT MATTERS is the ADR's own sentence turned into an assertion:
 * after a suspension, is the answer to "why" in the database. Everything else
 * here defends that one.
 *
 * Postgres is real, and it has to be: the append-only guarantee is a TRIGGER and
 * the non-blank reason is a CHECK. An in-memory fake would have neither and
 * would pass while the deployed schema did not.
 */

const URL = process.env.TEST_DATABASE_URL ?? 'postgres://intafaced_ops:intafaced_ops@localhost:5433/intafaced_test';
const here = dirname(fileURLToPath(import.meta.url));

/**
 * Every forward migration, in order — what production applies. A suite that
 * stands up half a schema is testing a schema nobody deploys, and this table
 * references `pay.merchants` from `0000`.
 */
const drizzle = join(here, '..', 'drizzle');
const migrations = readdirSync(drizzle)
  .filter((f) => f.endsWith('.sql') && !f.endsWith('.down.sql'))
  .sort()
  .map((f) => readFileSync(join(drizzle, f), 'utf8'));

const OPERATOR = '99999999-9999-4999-8999-999999999999';
const OTHER_OPERATOR = '88888888-8888-4888-8888-888888888888';

const available = await postgresAvailable(URL);

if (!available) {
  describe.skip('svc-pay merchant state (Postgres unavailable — start docker compose)', () => {
    it('skipped', () => undefined);
  });
} else {
  const db: TestDatabase = await createTestDatabase({ service: 'pay', url: URL, migrations });
  const sql = db.sql;

  let state: MerchantStateService;

  beforeEach(async () => {
    await sql`TRUNCATE pay.merchant_status_events, pay.merchants RESTART IDENTITY CASCADE`;
    state = new MerchantStateService(sql);
  });

  afterAll(async () => {
    await db.drop();
  }, 30_000);

  /** A merchant row, in whatever state the test needs to start from. */
  async function merchant(status: 'pending' | 'active' | 'suspended' | 'closed' = 'active'): Promise<string> {
    const [row] = await sql<Array<{ id: string }>>`
      INSERT INTO pay.merchants (user_id, status)
      VALUES (${`u-${Math.random().toString(36).slice(2)}`}, ${status}::pay.merchant_status)
      RETURNING id
    `;
    return row.id;
  }

  const statusOf = async (merchantId: string) =>
    (await sql<Array<{ status: string }>>`SELECT status FROM pay.merchants WHERE id = ${merchantId}`)[0].status;

  // ══ THE ADR'S SENTENCE, AS AN ASSERTION ═══════════════════════════════════

  describe('why is this merchant suspended', () => {
    it('IS ANSWERABLE FROM THE DATABASE — who, when, why, and from what', async () => {
      const id = await merchant('active');

      await state.setStatus({
        merchantId: id,
        to: 'suspended',
        reason: 'chargeback rate 4.1% over 30 days, three schemes',
        actorId: OPERATOR,
        actorScope: 'admin:write',
      });

      const [event] = await state.history(id);

      expect(event.toStatus).toBe('suspended');
      expect(event.fromStatus).toBe('active');
      expect(event.reason).toBe('chargeback rate 4.1% over 30 days, three schemes');
      expect(event.actorId).toBe(OPERATOR);
      expect(event.actorScope).toBe('admin:write');
      expect(event.createdAt).toBeInstanceOf(Date);
    });

    it('actually suspends them — the column PaymentService enforces on is the one that moved', async () => {
      // The history is worthless if it describes something that did not happen.
      // `payment-service.ts` refuses `payment.create` and the hosted checkout on
      // `merchants.status !== 'active'`, reading this exact column.
      const id = await merchant('active');
      await state.setStatus({ merchantId: id, to: 'suspended', reason: 'fraud review', actorId: OPERATOR, actorScope: 'admin:write' });

      expect(await statusOf(id)).toBe('suspended');
      expect(await state.currentStatus(id)).toBe('suspended');
    });

    it('can be UNDONE, and the undoing is itself explained and dated', async () => {
      const id = await merchant('active');
      await state.setStatus({
        merchantId: id,
        to: 'suspended',
        reason: 'suspected fraud ring',
        actorId: OPERATOR,
        actorScope: 'admin:write',
      });
      await state.setStatus({
        merchantId: id,
        to: 'active',
        reason: 'investigation closed — the disputes were one issuer’s error, all won',
        actorId: OTHER_OPERATOR,
        actorScope: 'admin:write',
      });

      expect(await statusOf(id)).toBe('active');

      const history = await state.history(id);
      // Newest first, because the question is almost always about the CURRENT
      // state and the row that explains it is the last one written.
      expect(history.map((e) => e.toStatus)).toEqual(['active', 'suspended']);
      // Both rows survive. A suspension that was wrong is corrected by a new
      // row, not by editing the old one — the way a ledger reverses a posting.
      expect(history[0].fromStatus).toBe('suspended');
      expect(history[0].actorId).toBe(OTHER_OPERATOR);
      expect(history[1].reason).toBe('suspected fraud ring');
    });
  });

  // ══ THE HISTORY IS EVIDENCE, SO IT CANNOT BE EDITED ═══════════════════════

  describe('append-only, enforced by the database', () => {
    it('REFUSES an UPDATE to a recorded reason', async () => {
      const id = await merchant('active');
      await state.setStatus({ merchantId: id, to: 'suspended', reason: 'the real reason', actorId: OPERATOR, actorScope: 'admin:write' });

      // A history that can be edited is worse than none: it looks like evidence
      // and is not.
      await expect(sql`UPDATE pay.merchant_status_events SET reason = 'a nicer reason'`).rejects.toThrow(/append-only/);
      expect((await state.history(id))[0].reason).toBe('the real reason');
    });

    it('REFUSES a DELETE', async () => {
      const id = await merchant('active');
      await state.setStatus({ merchantId: id, to: 'suspended', reason: 'the real reason', actorId: OPERATOR, actorScope: 'admin:write' });

      await expect(sql`DELETE FROM pay.merchant_status_events`).rejects.toThrow(/append-only/);
      expect(await state.history(id)).toHaveLength(1);
    });

    it('orders by seq, not by timestamp — two changes in one transaction share a clock', async () => {
      const id = await merchant('pending');
      await state.setStatus({ merchantId: id, to: 'active', reason: 'onboarding complete', actorId: OPERATOR, actorScope: 'admin:write' });
      await state.setStatus({ merchantId: id, to: 'suspended', reason: 'kyb lapsed', actorId: OPERATOR, actorScope: 'admin:write' });

      const history = await state.history(id);
      expect(BigInt(history[0].seq) > BigInt(history[1].seq)).toBe(true);
      // A string, never a number: it is a `bigserial` ordering key, and a
      // `number` would put a 2^53 ceiling on an append-only log for no benefit.
      expect(typeof history[0].seq).toBe('string');
    });
  });

  // ══ WHAT THE WRITER REFUSES ══════════════════════════════════════════════

  describe('the writer refuses what would make the history useless', () => {
    it('refuses a blank reason, in the service, with a sentence', async () => {
      const id = await merchant('active');
      const err = await state
        .setStatus({ merchantId: id, to: 'suspended', reason: '   ', actorId: OPERATOR, actorScope: 'admin:write' })
        .catch((e: unknown) => e as MerchantStateError);

      expect(err).toBeInstanceOf(MerchantStateError);
      expect(err.code).toBe('pay.merchant_status_reason_required');
      expect(await statusOf(id)).toBe('active');
    });

    it('refuses a blank reason in the DATABASE too, for anything that does not come through the service', async () => {
      // Two checks, because the first is for the operator and the second is the
      // guarantee. A `psql` session or a future writer bypasses the first.
      const id = await merchant('active');
      await expect(sql`
        INSERT INTO pay.merchant_status_events (merchant_id, from_status, to_status, reason, actor_id, actor_scope)
        VALUES (${id}, 'active'::pay.merchant_status, 'suspended'::pay.merchant_status, '  ', ${OPERATOR}, 'admin:write')
      `).rejects.toThrow(/merchant_status_events_reason_not_blank/);
    });

    it('refuses an unknown merchant rather than writing an orphan row', async () => {
      const err = await state
        .setStatus({
          merchantId: '00000000-0000-4000-8000-000000000000',
          to: 'suspended',
          reason: 'anything',
          actorId: OPERATOR,
          actorScope: 'admin:write',
        })
        .catch((e: unknown) => e as MerchantStateError);

      expect(err.code).toBe('pay.merchant_not_found');
    });

    it('writes NOTHING for a no-op, so the real rows stay findable', async () => {
      const id = await merchant('active');
      const result = await state.setStatus({
        merchantId: id,
        to: 'active',
        reason: 'clicked twice',
        actorId: OPERATOR,
        actorScope: 'admin:write',
      });

      // Not an error — an operator clicking twice is not a fault. But a history
      // full of `active → active` is a history nobody reads, and a history
      // nobody reads is how the real rows get missed.
      expect(result.changed).toBe(false);
      expect(result.event).toBeNull();
      expect(await state.history(id)).toHaveLength(0);
    });
  });

  // ══ WHAT IT DELIBERATELY DOES NOT DECIDE ═════════════════════════════════

  describe('recording who, when and why is not deciding when', () => {
    it('permits any transition between any two statuses, INCLUDING out of closed', async () => {
      // This looks lax and is the deliberate half. A transition map is a POLICY:
      // it rules that closure is final, that a pending merchant may be suspended
      // before approval, and half a dozen other things nobody has decided.
      // `payments` has a transition map because §6.1 states one. Merchant state
      // does not have one yet, and inventing it inside an audit-trail change
      // would smuggle product law in under a logging PR.
      const id = await merchant('closed');
      await state.setStatus({
        merchantId: id,
        to: 'active',
        reason: 'closed in error, merchant re-signed',
        actorId: OPERATOR,
        actorScope: 'admin:write',
      });

      expect(await statusOf(id)).toBe('active');
      // And the strange transition is attributable and dated, which is the whole
      // thing this change buys.
      expect((await state.history(id))[0].fromStatus).toBe('closed');
    });

    it('has no automatic suspension anywhere — nothing calls this on a rule', async () => {
      // Asserted as a property of the API surface rather than by grep: the only
      // way to change a merchant's status is to name the target and a reason.
      // There is no threshold parameter, no policy object, and no evaluate().
      const keys = Object.getOwnPropertyNames(MerchantStateService.prototype).filter((k) => k !== 'constructor');
      expect(keys.sort()).toEqual(['currentStatus', 'history', 'setStatus']);
    });
  });

  // ══ CONCURRENCY ══════════════════════════════════════════════════════════

  describe('two operators at once', () => {
    it('records two changes out of two DIFFERENT states, not two out of the same one', async () => {
      const id = await merchant('active');

      // FOR UPDATE serialises these. Without it both would read `active` and the
      // log would claim two changes out of one state — which would make the
      // chain unreadable exactly when somebody is trying to reconstruct an
      // incident.
      await Promise.all([
        state.setStatus({ merchantId: id, to: 'suspended', reason: 'operator one', actorId: OPERATOR, actorScope: 'admin:write' }),
        state.setStatus({ merchantId: id, to: 'closed', reason: 'operator two', actorId: OTHER_OPERATOR, actorScope: 'admin:write' }),
      ]);

      const history = await state.history(id);
      expect(history).toHaveLength(2);

      // The chain is intact: the newer row's `from` is the older row's `to`.
      expect(history[0].fromStatus).toBe(history[1].toStatus);
      expect(history[1].fromStatus).toBe('active');
      expect(await statusOf(id)).toBe(history[0].toStatus);
    });
  });
}
