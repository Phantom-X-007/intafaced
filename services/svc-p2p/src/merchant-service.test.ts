import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { assertTestDatabase, postgresAvailable } from '@intafaced/db';
import { MemoryEventBus } from '@intafaced/events';
import { MemoryLedger } from '@intafaced/ledger-client';
import { InstrumentService } from './instrument-service.js';
import { MerchantService } from './merchant-service.js';
import { P2pError, P2pService } from './p2p-service.js';

/**
 * First approval must re-read live reputation the same way unfreeze already
 * does. Apply-time eligibility is not a voucher that survives a later dispute
 * loss while the row sits at `applied`.
 */

const URL = process.env.TEST_DATABASE_URL_P2P ?? 'postgres://svc_p2p:svc_p2p@localhost:5433/intafaced_test';
const here = dirname(fileURLToPath(import.meta.url));
const P2P_MIGRATION_LOCK = 8_140_702;
const APPLICANT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OPERATOR = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

const available = await postgresAvailable(URL);

if (!available) {
  describe.skip('merchant-service first-approval eligibility (Postgres unavailable)', () => {
    it('skipped', () => undefined);
  });
} else {
  const sql = postgres(URL, {
    max: 8,
    connection: { search_path: 'p2p,public', application_name: 'svc-p2p-merchant-service-test' },
    onnotice: () => undefined,
  });

  await assertTestDatabase(sql, 'svc-p2p merchant-service');

  await sql.begin(async (tx) => {
    await tx`SELECT pg_advisory_xact_lock(${P2P_MIGRATION_LOCK})`;
    await tx.unsafe(readFileSync(join(here, '..', 'drizzle', '0000_p2p_init.sql'), 'utf8'));
    await tx.unsafe(readFileSync(join(here, '..', 'drizzle', '0004_p2p_merchant_programme.sql'), 'utf8'));
  });

  const instruments = new InstrumentService(sql);
  const ledger = new MemoryLedger();
  const bus = new MemoryEventBus('svc-p2p');
  const p2p = new P2pService(sql, ledger, bus, { instruments });
  const merchants = new MerchantService(sql, p2p);

  async function seedReputation(over: { disputed?: number; disputesLost?: number } = {}): Promise<void> {
    const disputed = over.disputed ?? 0;
    const disputesLost = over.disputesLost ?? 0;
    await sql`
      INSERT INTO p2p.p2p_reputation (
        user_id, trades_total, completed, cancelled, disputed, disputes_lost,
        completion_rate, total_release_secs, release_samples, avg_release_secs, badges
      )
      VALUES (
        ${APPLICANT}, 20, 20, 0, ${disputed}, ${disputesLost},
        1, 200, 20, 10, '{}'::text[]
      )
      ON CONFLICT (user_id) DO UPDATE SET
        disputed = EXCLUDED.disputed,
        disputes_lost = EXCLUDED.disputes_lost,
        updated_at = now()
    `;
  }

  beforeEach(async () => {
    await sql`
      TRUNCATE p2p.p2p_merchant_events, p2p.p2p_merchants, p2p.p2p_reputation RESTART IDENTITY CASCADE
    `;
  });

  afterAll(async () => {
    await sql.end({ timeout: 5 });
  });

  describe('first approval — live reputation, not the apply-time snapshot', () => {
    it('REFUSES applied → approved after a dispute loss that apply would now refuse', async () => {
      await seedReputation();
      const applied = await merchants.apply(APPLICANT, 'p2p:write');
      expect(applied.status).toBe('applied');

      await seedReputation({ disputed: 1, disputesLost: 1 });

      await expect(
        merchants.transition({
          userId: APPLICANT,
          to: 'approved',
          by: 'operator',
          reason: 'operator first approve',
          actorId: OPERATOR,
          actorScope: 'admin:compliance',
        }),
      ).rejects.toMatchObject({ code: 'p2p.merchant_ineligible' });

      expect((await merchants.get(APPLICANT))?.status).toBe('applied');
    });

    it('approves when the live snapshot still meets the apply rule', async () => {
      await seedReputation();
      await merchants.apply(APPLICANT, 'p2p:write');

      const approved = await merchants.transition({
        userId: APPLICANT,
        to: 'approved',
        by: 'operator',
        reason: 'operator first approve',
        actorId: OPERATOR,
        actorScope: 'admin:compliance',
      });

      expect(approved.status).toBe('approved');
      expect(approved.decidedAt).not.toBeNull();
    });

    it('still refuses unfreeze after a moderated loss — same sentence family', async () => {
      await seedReputation();
      await merchants.apply(APPLICANT, 'p2p:write');
      await merchants.transition({
        userId: APPLICANT,
        to: 'approved',
        by: 'operator',
        reason: 'operator first approve',
        actorId: OPERATOR,
        actorScope: 'admin:compliance',
      });
      await merchants.transition({
        userId: APPLICANT,
        to: 'suspended',
        by: 'operator',
        reason: 'operator freeze',
        actorId: OPERATOR,
        actorScope: 'admin:compliance',
      });

      await seedReputation({ disputed: 1, disputesLost: 1 });

      await expect(
        merchants.transition({
          userId: APPLICANT,
          to: 'approved',
          by: 'operator',
          reason: 'operator unfreeze',
          actorId: OPERATOR,
          actorScope: 'admin:compliance',
        }),
      ).rejects.toBeInstanceOf(P2pError);
    });
  });
}
