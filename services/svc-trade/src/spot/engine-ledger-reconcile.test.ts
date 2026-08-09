import { describe, expect, it, vi } from 'vitest';
import { parseAmount } from '@intafaced/ledger-client';
import {
  mapOrderStatusToCounterpartState,
  planLocalActions,
  runEngineLedgerReconcileTick,
  toCounterpartOrder,
  type TradeOrderClaim,
} from './engine-ledger-reconcile.js';
import type { ReconcileReport } from './matching-client.js';

const MARKET = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const USER = '11111111-1111-4111-8111-111111111111';

function claim(partial: Partial<TradeOrderClaim> & Pick<TradeOrderClaim, 'orderId' | 'status'>): TradeOrderClaim {
  return {
    marketId: MARKET,
    remaining: '1',
    userId: USER,
    holdAsset: 'USDT',
    holdAmount: 0n,
    ...partial,
  };
}

describe('mapOrderStatusToCounterpartState', () => {
  it('maps trade six-status enum to matching three-state wire', () => {
    expect(mapOrderStatusToCounterpartState('pending')).toBe('pending');
    expect(mapOrderStatusToCounterpartState('open')).toBe('open');
    expect(mapOrderStatusToCounterpartState('filled')).toBe('terminal');
    expect(mapOrderStatusToCounterpartState('cancelled')).toBe('terminal');
    expect(mapOrderStatusToCounterpartState('rejected')).toBe('terminal');
    expect(mapOrderStatusToCounterpartState('expired')).toBe('terminal');
  });
});

describe('toCounterpartOrder — funded from live hold, never invent', () => {
  it('open + positive hold → funded true (the money-stranding shape)', () => {
    const c = toCounterpartOrder(
      claim({
        orderId: 'ord-funded',
        status: 'open',
        holdAmount: parseAmount('100.5'),
        remaining: '2',
      }),
    );
    expect(c).toMatchObject({
      orderId: 'ord-funded',
      marketId: MARKET,
      state: 'open',
      remaining: '2',
      funded: true,
    });
    expect(c.detail).toContain('hold=100.5');
  });

  it('pending + zero hold → funded false (auto-delete candidate)', () => {
    const c = toCounterpartOrder(claim({ orderId: 'ord-orphan', status: 'pending', holdAmount: 0n }));
    expect(c.funded).toBe(false);
    expect(c.state).toBe('pending');
  });
});

describe('planLocalActions — refuse never becomes a write', () => {
  it('open+hold no engine (refuse) → finding kept, zero deletes', () => {
    const orderId = 'stranded-open';
    const claims = new Map<string, TradeOrderClaim>([[orderId, claim({ orderId, status: 'open', holdAmount: parseAmount('50') })]]);
    const report: ReconcileReport = {
      checked: 1,
      agreed: 0,
      refusals: 1,
      ok: false,
      findings: [
        {
          orderId,
          case: 'counterpart_open_engine_missing',
          verdict: 'refuse',
          engine: 'engine: NOT LIVE',
          counterpart: 'counterpart: OPEN funded=true',
          reason: 'value is held for an order the engine is not working',
        },
      ],
    };

    const plan = planLocalActions(report, claims);

    expect(plan.refusals).toHaveLength(1);
    expect(plan.refusals[0]!.case).toBe('counterpart_open_engine_missing');
    expect(plan.deleteUnfundedPendingIds).toEqual([]);
    expect(plan.autoNonDelete).toEqual([]);
  });

  it('unfunded pending (auto) → delete list only — no refuse path', () => {
    const orderId = 'orphan-pending';
    const claims = new Map<string, TradeOrderClaim>([[orderId, claim({ orderId, status: 'pending', holdAmount: 0n })]]);
    const report: ReconcileReport = {
      checked: 1,
      agreed: 0,
      refusals: 0,
      ok: true,
      findings: [
        {
          orderId,
          case: 'counterpart_unfunded_engine_missing',
          verdict: 'auto',
          engine: 'engine: NOT LIVE',
          counterpart: 'counterpart: PENDING funded=false',
          reason: 'intent row the ledger never funded',
        },
      ],
    };

    const plan = planLocalActions(report, claims);
    expect(plan.deleteUnfundedPendingIds).toEqual([orderId]);
    expect(plan.refusals).toEqual([]);
  });

  it('open + unfunded marked auto by engine → still not deleted (pending-only rule)', () => {
    const orderId = 'open-unfunded';
    const claims = new Map<string, TradeOrderClaim>([[orderId, claim({ orderId, status: 'open', holdAmount: 0n })]]);
    const report: ReconcileReport = {
      checked: 1,
      agreed: 0,
      refusals: 0,
      ok: true,
      findings: [
        {
          orderId,
          case: 'counterpart_unfunded_engine_missing',
          verdict: 'auto',
          engine: 'engine: NOT LIVE',
          counterpart: 'counterpart: OPEN funded=false',
          reason: 'unfunded',
        },
      ],
    };

    const plan = planLocalActions(report, claims);
    expect(plan.deleteUnfundedPendingIds).toEqual([]);
    expect(plan.autoNonDelete).toHaveLength(1);
  });
});

describe('runEngineLedgerReconcileTick — no silent release of funded missing', () => {
  it('open+hold no engine → refuse finding; never posts ledger; never deletes', async () => {
    const orderId = 'funded-missing';
    const holdAmt = parseAmount('200');

    const sql = Object.assign(async (strings: TemplateStringsArray, ..._values: unknown[]) => {
      const text = strings.join('?');
      if (text.includes('FROM trade.orders') && text.includes('SELECT')) {
        return [
          {
            id: orderId,
            user_id: USER,
            market_id: MARKET,
            status: 'open' as const,
            qty: '1',
            filled_qty: '0',
            hold_asset: 'USDT',
          },
        ];
      }
      if (text.includes('DELETE')) {
        throw new Error('DELETE must not run on refuse path');
      }
      return [];
    }, {}) as unknown as import('postgres').Sql;

    const ledgerPost = vi.fn();
    const ledger = {
      balance: vi.fn(async () => ({
        account: { ownerType: 'user' as const, ownerId: USER, assetId: 'USDT', kind: 'hold' as const },
        accountId: 'acc',
        amount: holdAmt,
      })),
      post: ledgerPost,
    };

    const reconcile = vi.fn(async (orders: readonly { orderId: string; funded: boolean; state: string }[]) => {
      expect(orders).toHaveLength(1);
      expect(orders[0]).toMatchObject({ orderId, funded: true, state: 'open' });
      return {
        checked: 1,
        agreed: 0,
        refusals: 1,
        ok: false,
        findings: [
          {
            orderId,
            case: 'counterpart_open_engine_missing',
            verdict: 'refuse' as const,
            engine: 'engine: NOT LIVE',
            counterpart: 'counterpart: OPEN funded=true',
            reason: 'stranded',
          },
        ],
      } satisfies ReconcileReport;
    });

    const result = await runEngineLedgerReconcileTick({
      sql,
      ledger,
      matching: { reconcile },
    });

    expect(result.plan.refusals).toHaveLength(1);
    expect(result.plan.refusals[0]!.case).toBe('counterpart_open_engine_missing');
    expect(result.deleted).toEqual([]);
    expect(result.ledgerPosts).toEqual([]);
    expect(ledgerPost).not.toHaveBeenCalled();
    expect(reconcile).toHaveBeenCalledTimes(1);
  });

  it('unfunded pending → DELETE only when engine marks auto; still no ledger post', async () => {
    const orderId = 'orphan-1';
    let deleted = false;

    const sql = Object.assign(async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const text = strings.join('?');
      if (text.includes('FROM trade.orders') && text.includes('SELECT')) {
        return [
          {
            id: orderId,
            user_id: USER,
            market_id: MARKET,
            status: 'pending' as const,
            qty: '1',
            filled_qty: '0',
            hold_asset: 'USDT',
          },
        ];
      }
      if (text.includes('DELETE')) {
        expect(values[0]).toBe(orderId);
        deleted = true;
        return [{ id: orderId }];
      }
      return [];
    }, {}) as unknown as import('postgres').Sql;

    const ledgerPost = vi.fn();
    const ledger = {
      balance: vi.fn(async () => ({
        account: { ownerType: 'user' as const, ownerId: USER, assetId: 'USDT', kind: 'hold' as const },
        accountId: 'acc',
        amount: 0n,
      })),
      post: ledgerPost,
    };

    const result = await runEngineLedgerReconcileTick({
      sql,
      ledger,
      matching: {
        reconcile: async () => ({
          checked: 1,
          agreed: 0,
          refusals: 0,
          ok: true,
          findings: [
            {
              orderId,
              case: 'counterpart_unfunded_engine_missing',
              verdict: 'auto',
              engine: 'engine: NOT LIVE',
              counterpart: 'counterpart: PENDING funded=false',
              reason: 'intent',
            },
          ],
        }),
      },
    });

    expect(deleted).toBe(true);
    expect(result.deleted).toEqual([orderId]);
    expect(ledgerPost).not.toHaveBeenCalled();
    expect(result.ledgerPosts).toEqual([]);
  });
});
