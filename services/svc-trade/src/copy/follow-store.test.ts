import { describe, expect, it } from 'vitest';
import type { Sql } from 'postgres';
import { parseAmount } from '@intafaced/ledger-client';
import { CopyError } from './errors.js';
import {
  MemoryCopyFollowStore,
  SqlCopyFollowStore,
  isCopyFeeSharePrePostUnclaim,
  rethrowCopyFollowUnique,
  type StoredSettledFeeShare,
} from './follow-store.js';
import type { CopyFollow } from './follows.js';

const FOLLOWER = '00000000-0000-4000-8000-000000000001';
const LEADER = '00000000-0000-4000-8000-000000000002';
const LEADER_B = '00000000-0000-4000-8000-000000000003';
const FOLLOW_A = 'aaaa1111-1111-4111-8111-111111111111';
const FOLLOW_B = 'bbbb2222-2222-4222-8222-222222222222';
const FILL = 'fill-claim-before-post';

function follow(followId: string, leaderId = LEADER): CopyFollow {
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

describe('CopyFollowStore unique (follower, leader)', () => {
  it('memory refuses a second followId for the same pair (SQL unique equivalent)', async () => {
    const store = new MemoryCopyFollowStore();
    await store.saveFollow(follow('aaaa1111-1111-4111-8111-111111111111'));
    await expect(store.saveFollow(follow('bbbb2222-2222-4222-8222-222222222222'))).rejects.toMatchObject({
      name: 'CopyError',
      code: 'trade.copy_already_following',
    });
  });

  it('memory still upserts the same followId (kill / envelope refresh)', async () => {
    const store = new MemoryCopyFollowStore();
    const row = follow('aaaa1111-1111-4111-8111-111111111111');
    await store.saveFollow(row);
    await store.saveFollow({ ...row, feeShareKilled: true });
    expect((await store.getFollow(row.followId))?.feeShareKilled).toBe(true);
  });

  it('rethrowCopyFollowUnique maps 23505 and passes other failures through', () => {
    expect(() => rethrowCopyFollowUnique(Object.assign(new Error('dup'), { code: '23505' }))).toThrow(CopyError);
    expect(() => rethrowCopyFollowUnique(Object.assign(new Error('fk'), { code: '23503' }))).toThrow(/fk/);
    try {
      rethrowCopyFollowUnique(Object.assign(new Error('dup'), { code: '23505' }));
    } catch (err) {
      expect(err).toMatchObject({ code: 'trade.copy_already_following' });
      expect((err as { code: string }).code).not.toBe('23505');
    }
  });

  it('isCopyFeeSharePrePostUnclaim is only expired / pre-follow / not-mirrored', () => {
    expect(isCopyFeeSharePrePostUnclaim(new CopyError('Copy session envelope has expired', 'trade.copy_key_expired'))).toBe(true);
    expect(isCopyFeeSharePrePostUnclaim(new CopyError('Fill predates this follow — refuse fee-share', 'trade.copy_settle_refused'))).toBe(
      true,
    );
    expect(
      isCopyFeeSharePrePostUnclaim(
        new CopyError('Fill is not a copy-mirrored fill for this follow — refuse fee-share', 'trade.copy_settle_refused'),
      ),
    ).toBe(true);
    expect(isCopyFeeSharePrePostUnclaim(new Error('payout threw after sweep'))).toBe(false);
    expect(
      isCopyFeeSharePrePostUnclaim(new CopyError('Fee-share killed for this leader/follow — refuse payout', 'trade.copy_fee_share_killed')),
    ).toBe(false);
    expect(
      isCopyFeeSharePrePostUnclaim(
        new CopyError('Follower fill not found — refuse rather than invent protocolFee from notional×bps', 'trade.copy_settle_refused'),
      ),
    ).toBe(false);
  });
});

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

describe('runFeeShareSettleOnce claim-before-post', () => {
  it('memory claims the fill before run() — second leader never enters run', async () => {
    const store = new MemoryCopyFollowStore();
    await store.saveFollow(follow(FOLLOW_A, LEADER));
    let claimedInsideRun = false;
    const first = await store.runFeeShareSettleOnce(FOLLOW_A, FILL, async () => {
      const seen = await store.getSettledFeeShare(FOLLOW_A, FILL);
      claimedInsideRun = seen !== null && seen.fillId === FILL;
      return share(FOLLOW_A, FILL, LEADER);
    });
    expect(claimedInsideRun).toBe(true);
    expect(first.status).toBe('claimed');
    expect(first.record.settled).toBe(true);

    let ranB = false;
    await expect(
      store.runFeeShareSettleOnce(FOLLOW_B, FILL, async () => {
        ranB = true;
        return share(FOLLOW_B, FILL, LEADER_B);
      }),
    ).rejects.toMatchObject({ name: 'CopyError', code: 'trade.copy_settle_refused' });
    expect(ranB).toBe(false);
  });

  it('memory same-follow redelivery does not re-run', async () => {
    const store = new MemoryCopyFollowStore();
    let runs = 0;
    const first = await store.runFeeShareSettleOnce(FOLLOW_A, FILL, async () => {
      runs += 1;
      return share(FOLLOW_A, FILL, LEADER);
    });
    const second = await store.runFeeShareSettleOnce(FOLLOW_A, FILL, async () => {
      runs += 1;
      return share(FOLLOW_A, FILL, LEADER);
    });
    expect(runs).toBe(1);
    expect(first.status).toBe('claimed');
    expect(second.status).toBe('duplicate');
    expect(second.record.cappedLeaderShare).toBe(first.record.cappedLeaderShare);
  });

  it('memory failed run unclaims so a later follow can still settle', async () => {
    const store = new MemoryCopyFollowStore();
    await expect(
      store.runFeeShareSettleOnce(FOLLOW_A, FILL, async () => {
        throw new CopyError('Fill predates this follow — refuse fee-share', 'trade.copy_settle_refused');
      }),
    ).rejects.toMatchObject({ code: 'trade.copy_settle_refused' });
    expect(await store.getSettledFeeShare(FOLLOW_A, FILL)).toBeNull();

    const later = await store.runFeeShareSettleOnce(FOLLOW_B, FILL, async () => share(FOLLOW_B, FILL, LEADER_B));
    expect(later.status).toBe('claimed');
    expect(later.record.leaderId).toBe(LEADER_B);
  });

  it('memory not-mirrored refuse unclaims so a later follow can still settle', async () => {
    const store = new MemoryCopyFollowStore();
    await expect(
      store.runFeeShareSettleOnce(FOLLOW_A, FILL, async () => {
        throw new CopyError('Fill is not a copy-mirrored fill for this follow — refuse fee-share', 'trade.copy_settle_refused');
      }),
    ).rejects.toMatchObject({ code: 'trade.copy_settle_refused' });
    expect(await store.getSettledFeeShare(FOLLOW_A, FILL)).toBeNull();

    const later = await store.runFeeShareSettleOnce(FOLLOW_B, FILL, async () => share(FOLLOW_B, FILL, LEADER_B));
    expect(later.status).toBe('claimed');
    expect(later.record.leaderId).toBe(LEADER_B);
  });

  it('memory expired-inside-run unclaims so a later follow can still settle', async () => {
    const store = new MemoryCopyFollowStore();
    await expect(
      store.runFeeShareSettleOnce(FOLLOW_A, FILL, async () => {
        throw new CopyError('Copy session envelope has expired', 'trade.copy_key_expired');
      }),
    ).rejects.toMatchObject({ code: 'trade.copy_key_expired' });
    expect(await store.getSettledFeeShare(FOLLOW_A, FILL)).toBeNull();

    const later = await store.runFeeShareSettleOnce(FOLLOW_B, FILL, async () => share(FOLLOW_B, FILL, LEADER_B));
    expect(later.status).toBe('claimed');
    expect(later.record.leaderId).toBe(LEADER_B);
  });

  it('memory post-then-throw keeps unique fill_id — second leader does not run', async () => {
    const store = new MemoryCopyFollowStore();
    await store.saveFollow(follow(FOLLOW_A, LEADER));
    await store.saveFollow(follow(FOLLOW_B, LEADER_B));
    await expect(
      store.runFeeShareSettleOnce(FOLLOW_A, FILL, async () => {
        throw new Error('payout threw after sweep');
      }),
    ).rejects.toThrow(/payout threw after sweep/);
    expect(await store.getSettledFeeShare(FOLLOW_A, FILL)).not.toBeNull();

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

type SettledRow = {
  follow_id: string;
  fill_id: string;
  leader_id: string;
  follower_id: string;
  asset_id: string;
  protocol_fee: string;
  applied_share_bps: number;
  gross_leader_share: string;
  capped_leader_share: string;
  skipped_reason: string | null;
  settled: boolean;
};

/** Tagged-template stand-in — records INSERT vs run() order without Postgres. */
function mockSettleSql(opts?: { uniqueOther?: { followId: string; fillId: string } }) {
  const events: string[] = [];
  const byFill = new Map<string, SettledRow>();
  const uniqueOther = opts?.uniqueOther;
  const sql = (strings: TemplateStringsArray, ...values: unknown[]) => {
    const text = strings.join('?').replace(/\s+/g, ' ').trim().toLowerCase();
    if (text.includes('pg_advisory_lock')) {
      events.push('lock');
      return Promise.resolve([]);
    }
    if (text.includes('pg_advisory_unlock')) {
      events.push('unlock');
      return Promise.resolve([]);
    }
    if (text.includes('insert into copy_settled_fee_shares')) {
      events.push('insert');
      const fillId = String(values[1]);
      if (uniqueOther && fillId === uniqueOther.fillId) {
        return Promise.reject(Object.assign(new Error('duplicate key value'), { code: '23505' }));
      }
      if (byFill.has(fillId)) {
        return Promise.reject(Object.assign(new Error('duplicate key value'), { code: '23505' }));
      }
      const row: SettledRow = {
        follow_id: String(values[0]),
        fill_id: fillId,
        leader_id: String(values[2]),
        follower_id: String(values[3]),
        asset_id: String(values[4]),
        protocol_fee: String(values[5]),
        applied_share_bps: Number(values[6]),
        gross_leader_share: String(values[7]),
        capped_leader_share: String(values[8]),
        skipped_reason: (values[9] as string | null) ?? null,
        settled: values[10] === true,
      };
      byFill.set(fillId, row);
      return Promise.resolve([]);
    }
    if (text.includes('update copy_settled_fee_shares')) {
      events.push('update');
      const fillId = String(values[10]);
      const prev = byFill.get(fillId);
      if (prev && prev.follow_id === String(values[9])) {
        byFill.set(fillId, {
          ...prev,
          leader_id: String(values[0]),
          follower_id: String(values[1]),
          asset_id: String(values[2]),
          protocol_fee: String(values[3]),
          applied_share_bps: Number(values[4]),
          gross_leader_share: String(values[5]),
          capped_leader_share: String(values[6]),
          skipped_reason: (values[7] as string | null) ?? null,
          settled: values[8] === true,
        });
      }
      return Promise.resolve([]);
    }
    if (text.includes('delete from copy_settled_fee_shares')) {
      events.push('delete');
      const fillId = String(values[1]);
      const prev = byFill.get(fillId);
      if (prev && prev.follow_id === String(values[0])) byFill.delete(fillId);
      return Promise.resolve([]);
    }
    if (text.includes('from copy_follows')) {
      events.push('select-follow');
      return Promise.resolve([]);
    }
    if (text.includes('from copy_settled_fee_shares')) {
      if (text.includes('where follow_id')) {
        events.push('select-by-follow-fill');
        const row = byFill.get(String(values[1]));
        return Promise.resolve(row && row.follow_id === String(values[0]) ? [row] : []);
      }
      events.push('select-by-fill');
      const fillId = String(values[0]);
      if (uniqueOther && fillId === uniqueOther.fillId && events.includes('insert')) {
        return Promise.resolve([
          {
            follow_id: uniqueOther.followId,
            fill_id: uniqueOther.fillId,
            leader_id: LEADER,
            follower_id: FOLLOWER,
            asset_id: 'USDT',
            protocol_fee: '1',
            applied_share_bps: 5000,
            gross_leader_share: '0.5',
            capped_leader_share: '0.5',
            skipped_reason: null,
            settled: true,
          } satisfies SettledRow,
        ]);
      }
      const row = byFill.get(fillId);
      return Promise.resolve(row ? [row] : []);
    }
    events.push(`unknown:${text.slice(0, 80)}`);
    return Promise.resolve([]);
  };
  return { sql: sql as unknown as Sql, events, byFill };
}

describe('SqlCopyFollowStore runFeeShareSettleOnce (order, no Postgres)', () => {
  it('INSERT unique fill_id happens before run() — crash after post still has the row', async () => {
    const mock = mockSettleSql();
    const store = new SqlCopyFollowStore(mock.sql, FOLLOW_A);
    let ranAfterInsert = false;
    const once = await store.runFeeShareSettleOnce(FOLLOW_A, FILL, async () => {
      expect(mock.events).toContain('insert');
      expect(mock.byFill.get(FILL)?.follow_id).toBe(FOLLOW_A);
      ranAfterInsert = true;
      return share(FOLLOW_A, FILL, LEADER);
    });
    expect(ranAfterInsert).toBe(true);
    expect(once.status).toBe('claimed');
    expect(once.record.settled).toBe(true);
    expect(mock.events.indexOf('insert')).toBeLessThan(mock.events.indexOf('update'));
    expect(mock.byFill.get(FILL)?.settled).toBe(true);
    expect(mock.byFill.get(FILL)?.leader_id).toBe(LEADER);
  });

  it('unique-violation on claim refuses the second leader without run()', async () => {
    const mock = mockSettleSql({ uniqueOther: { followId: FOLLOW_A, fillId: FILL } });
    const store = new SqlCopyFollowStore(mock.sql, FOLLOW_B);
    let ran = false;
    await expect(
      store.runFeeShareSettleOnce(FOLLOW_B, FILL, async () => {
        ran = true;
        return share(FOLLOW_B, FILL, LEADER_B);
      }),
    ).rejects.toMatchObject({ name: 'CopyError', code: 'trade.copy_settle_refused' });
    expect(ran).toBe(false);
    expect(mock.events).toContain('insert');
    expect(mock.events).not.toContain('update');
  });

  it('failed run deletes the claim so a later follow is not poisoned', async () => {
    const mock = mockSettleSql();
    const store = new SqlCopyFollowStore(mock.sql, FOLLOW_A);
    await expect(
      store.runFeeShareSettleOnce(FOLLOW_A, FILL, async () => {
        throw new CopyError('Fill predates this follow — refuse fee-share', 'trade.copy_settle_refused');
      }),
    ).rejects.toMatchObject({ code: 'trade.copy_settle_refused' });
    expect(mock.events).toContain('insert');
    expect(mock.events).toContain('delete');
    expect(mock.byFill.get(FILL)).toBeUndefined();
  });

  it('post-then-throw does not DELETE unique fill_id — second leader does not run', async () => {
    const mock = mockSettleSql();
    const store = new SqlCopyFollowStore(mock.sql, FOLLOW_A);
    await expect(
      store.runFeeShareSettleOnce(FOLLOW_A, FILL, async () => {
        throw new Error('payout threw after sweep');
      }),
    ).rejects.toThrow(/payout threw after sweep/);
    expect(mock.events).toContain('insert');
    expect(mock.events).not.toContain('delete');
    expect(mock.byFill.get(FILL)?.follow_id).toBe(FOLLOW_A);

    const storeB = new SqlCopyFollowStore(mock.sql, FOLLOW_B);
    let ran = false;
    await expect(
      storeB.runFeeShareSettleOnce(FOLLOW_B, FILL, async () => {
        ran = true;
        return share(FOLLOW_B, FILL, LEADER_B);
      }),
    ).rejects.toMatchObject({ name: 'CopyError', code: 'trade.copy_settle_refused' });
    expect(ran).toBe(false);
  });
});
