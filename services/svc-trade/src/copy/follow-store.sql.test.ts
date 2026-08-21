import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestDb, postgresAvailable, rewriteSchemaSql } from '@intafaced/db';
import { parseAmount } from '@intafaced/ledger-client';
import { CopyError } from './errors.js';
import { SqlCopyFollowStore, type StoredSettledFeeShare } from './follow-store.js';
import type { CopyFollow } from './follows.js';

/**
 * SQL unique fill_id is the crash-safe once-key. Memory exclusive never
 * survives process death; these tests hit the real index.
 */

const URL = process.env.TEST_DATABASE_URL ?? 'postgres://intafaced_ops:intafaced_ops@localhost:5433/intafaced_test';
const here = dirname(fileURLToPath(import.meta.url));
const drizzleDir = join(here, '..', '..', 'drizzle');
const COPY_MIGRATIONS = ['0011_copy_follows.sql', '0022_copy_settled_fee_shares.sql', '0031_copy_settled_fee_shares_fill_unique.sql'].map(
  (f) => readFileSync(join(drizzleDir, f), 'utf8'),
);

const FOLLOWER = '00000000-0000-4000-8000-000000000001';
const LEADER = '00000000-0000-4000-8000-000000000002';
const LEADER_B = '00000000-0000-4000-8000-000000000003';
const FOLLOW_A = 'aaaa1111-1111-4111-8111-111111111111';
const FOLLOW_B = 'bbbb2222-2222-4222-8222-222222222222';
const FILL = 'fill-sql-claim-before-post';

function follow(followId: string, leaderId: string): CopyFollow {
  return {
    followId,
    followerId: FOLLOWER,
    leaderId,
    envelope: {
      permittedMarkets: ['BTC-USDT'],
      maxNotionalPerOrder: parseAmount('100'),
      maxAggregateExposure: parseAmount('1000'),
      expiresAt: new Date('2026-12-01T00:00:00.000Z'),
    },
    region: 'SG',
    createdAt: new Date('2026-08-14T00:00:00.000Z'),
    feeShareKilled: false,
  };
}

function share(followId: string, fillId: string, leaderId: string): StoredSettledFeeShare {
  return {
    fillId,
    followId,
    leaderId,
    followerId: FOLLOWER,
    assetId: 'USDT',
    protocolFee: parseAmount('1'),
    appliedShareBps: 5000,
    grossLeaderShare: parseAmount('0.5'),
    cappedLeaderShare: parseAmount('0.5'),
    skippedReason: null,
    settled: true,
  };
}

const available = await postgresAvailable(URL);

if (!available) {
  describe.skip('SqlCopyFollowStore fee-share claim-before-post (Postgres unavailable)', () => {
    it('skipped', () => undefined);
  });
} else {
  const db = await createTestDb({
    service: 'trade_copy_fee',
    url: URL,
    migrations: COPY_MIGRATIONS.map((body) => (schema: string) => rewriteSchemaSql(body, 'trade', schema)),
  });

  beforeEach(async () => {
    await db.truncateAll();
  });

  afterAll(async () => {
    await db.drop();
  });

  describe('SqlCopyFollowStore fee-share claim-before-post', () => {
    it('INSERT unique fill_id is visible before run() — crash window cannot miss the row', async () => {
      const store = new SqlCopyFollowStore(db.sql);
      await store.saveFollow(follow(FOLLOW_A, LEADER));
      const once = await store.runFeeShareSettleOnce(FOLLOW_A, FILL, async () => {
        const rows = await db.sql<Array<{ follow_id: string; settled: boolean }>>`
          SELECT follow_id, settled FROM copy_settled_fee_shares WHERE fill_id = ${FILL} LIMIT 1
        `;
        expect(rows[0]?.follow_id).toBe(FOLLOW_A);
        expect(rows[0]?.settled).toBe(false);
        return share(FOLLOW_A, FILL, LEADER);
      });
      expect(once.status).toBe('claimed');
      expect(once.record.settled).toBe(true);
      const done = await store.getSettledFeeShare(FOLLOW_A, FILL);
      expect(done?.leaderId).toBe(LEADER);
      expect(done?.cappedLeaderShare).toBe(parseAmount('0.5'));
    });

    it('crash-after-claim leftover unique fill_id refuses a second leader without run()', async () => {
      const store = new SqlCopyFollowStore(db.sql);
      await store.saveFollow(follow(FOLLOW_A, LEADER));
      await store.saveFollow(follow(FOLLOW_B, LEADER_B));
      // Process died after unique INSERT, before ledger post / UPDATE.
      await db.sql`
        INSERT INTO copy_settled_fee_shares (
          follow_id, fill_id, leader_id, follower_id, asset_id,
          protocol_fee, applied_share_bps, gross_leader_share, capped_leader_share,
          skipped_reason, settled, created_at
        ) VALUES (
          ${FOLLOW_A}, ${FILL}, ${LEADER}, ${FOLLOWER}, '',
          0, 0, 0, 0, NULL, false, now()
        )
      `;

      let ran = false;
      await expect(
        store.runFeeShareSettleOnce(FOLLOW_B, FILL, async () => {
          ran = true;
          return share(FOLLOW_B, FILL, LEADER_B);
        }),
      ).rejects.toMatchObject({ name: 'CopyError', code: 'trade.copy_settle_refused' });
      expect(ran).toBe(false);

      const rows = await db.sql<Array<{ follow_id: string }>>`
        SELECT follow_id FROM copy_settled_fee_shares WHERE fill_id = ${FILL}
      `;
      expect(rows).toHaveLength(1);
      expect(rows[0]?.follow_id).toBe(FOLLOW_A);
    });

    it('failed run (pre-follow) deletes the claim — another follow can still settle', async () => {
      const store = new SqlCopyFollowStore(db.sql);
      await store.saveFollow(follow(FOLLOW_A, LEADER));
      await store.saveFollow(follow(FOLLOW_B, LEADER_B));
      await expect(
        store.runFeeShareSettleOnce(FOLLOW_A, FILL, async () => {
          throw new CopyError('Fill predates this follow — refuse fee-share', 'trade.copy_settle_refused');
        }),
      ).rejects.toMatchObject({ code: 'trade.copy_settle_refused' });

      const leftover = await db.sql<Array<{ fill_id: string }>>`
        SELECT fill_id FROM copy_settled_fee_shares WHERE fill_id = ${FILL}
      `;
      expect(leftover).toHaveLength(0);

      const later = await store.runFeeShareSettleOnce(FOLLOW_B, FILL, async () => share(FOLLOW_B, FILL, LEADER_B));
      expect(later.status).toBe('claimed');
      expect(later.record.leaderId).toBe(LEADER_B);
    });

    it('post-then-throw keeps unique fill_id — second leader does not run', async () => {
      const store = new SqlCopyFollowStore(db.sql);
      await store.saveFollow(follow(FOLLOW_A, LEADER));
      await store.saveFollow(follow(FOLLOW_B, LEADER_B));
      await expect(
        store.runFeeShareSettleOnce(FOLLOW_A, FILL, async () => {
          throw new Error('payout threw after sweep');
        }),
      ).rejects.toThrow(/payout threw after sweep/);

      const leftover = await db.sql<Array<{ follow_id: string }>>`
        SELECT follow_id FROM copy_settled_fee_shares WHERE fill_id = ${FILL}
      `;
      expect(leftover).toHaveLength(1);
      expect(leftover[0]?.follow_id).toBe(FOLLOW_A);

      let ran = false;
      await expect(
        store.runFeeShareSettleOnce(FOLLOW_B, FILL, async () => {
          ran = true;
          return share(FOLLOW_B, FILL, LEADER_B);
        }),
      ).rejects.toMatchObject({ name: 'CopyError', code: 'trade.copy_settle_refused' });
      expect(ran).toBe(false);
    });
  });
}
