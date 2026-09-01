import { describe, expect, it } from 'vitest';
import { parseAmount } from '@intafaced/ledger-client';
import { executeOmsRoute, type OmsSubmitFn } from './oms-execute.js';
import { InMemoryEmsOrderStore } from './oms-ems-store.js';
import {
  EXECUTION_SOR_HONEST_GAPS,
  executionSorMountVsTrackerBoardCard,
  executionSorTrackerBackendDoneBarMet,
} from './mount-vs-tracker.js';
import { latencyGradeWire, planOmsRoute, type OmsPlanVenue } from './oms-plan.js';

function completeVenue(over: Partial<OmsPlanVenue> & Pick<OmsPlanVenue, 'id' | 'price'>): OmsPlanVenue {
  return {
    kind: 'external-cex',
    amount: '10',
    feeBps: 10,
    costTerms: {
      feeBps: 10,
      expectedImpactBps: 5,
      transferCostBps: 2,
      latencyGrade: latencyGradeWire(over.id),
    },
    ...over,
  };
}

describe('execution.sor unknown venue ≠ fill pin', () => {
  it('blank / unknown venue refuses — never an invented fill or mid', async () => {
    const blank = await planOmsRoute({
      symbol: 'BTC/USDT',
      side: 'buy',
      amount: '1',
      venues: [completeVenue({ id: '', price: '100' })],
    });
    expect(blank).toMatchObject({ ok: false, reason: 'unknown_venue' });
    expect(blank).not.toMatchObject({ ok: true });
    if (blank.ok) return;
    expect(blank.executions).toEqual([]);

    const unknownKind = await planOmsRoute({
      symbol: 'BTC/USDT',
      side: 'buy',
      amount: '1',
      venues: [completeVenue({ id: 'ghost', price: '100', kind: 'not-a-venue' as OmsPlanVenue['kind'] })],
    });
    expect(unknownKind).toMatchObject({ ok: false, reason: 'unknown_venue', executions: [] });
  });

  it('missing best-ex evidence refuses rather than ranking on an invented mid', async () => {
    const missingFee = await planOmsRoute({
      symbol: 'BTC/USDT',
      side: 'buy',
      amount: '1',
      venues: [
        completeVenue({
          id: 'street',
          price: '100',
          costTerms: {
            feeBps: null,
            expectedImpactBps: 5,
            transferCostBps: 2,
            latencyGrade: latencyGradeWire('street'),
          },
        }),
      ],
    });
    expect(missingFee).toMatchObject({ ok: false, reason: 'missing_best_ex', executions: [] });

    const zeroMid = await planOmsRoute({
      symbol: 'BTC/USDT',
      side: 'buy',
      amount: '1',
      venues: [completeVenue({ id: 'street', price: '0' })],
    });
    expect(zeroMid).toMatchObject({ ok: false, reason: 'missing_best_ex', executions: [] });
  });

  it('execute does not submit or invent a fill when the venue is unknown', async () => {
    const calls: unknown[] = [];
    const submit: OmsSubmitFn = async (req) => {
      calls.push(req);
      return {
        venueId: 'ghost',
        venueOrderId: 'should-not-exist',
        filledAmount: req.amount,
        averagePrice: req.limitPrice ?? parseAmount('0'),
        feeAmount: parseAmount('0'),
        feeAsset: 'USDT',
        status: 'filled',
        executedAt: new Date('2026-09-01T00:00:00.000Z'),
      };
    };
    const result = await executeOmsRoute({
      symbol: 'BTC/USDT',
      side: 'buy',
      amount: '1',
      parentClientOrderId: 'parent-unknown',
      venues: [completeVenue({ id: '   ', price: '100' })],
      submitByVenue: { '   ': submit },
      emsStore: new InMemoryEmsOrderStore(),
    });
    expect(result).toMatchObject({ ok: false, reason: 'unknown_venue' });
    expect(calls).toHaveLength(0);
    if (result.ok) return;
    expect(result.executions).toEqual([]);
  });

  it('tracker pin stays honest — unknown≠fill is real, not a fake done bar', () => {
    expect(EXECUTION_SOR_HONEST_GAPS).toEqual([]);
    expect(executionSorTrackerBackendDoneBarMet()).toBe(true);
    expect(executionSorMountVsTrackerBoardCard().gaps).toBe(0);
  });
});
