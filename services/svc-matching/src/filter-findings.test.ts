import { describe, expect, it } from 'vitest';
import { filterFindingsByCase, type ReconcileReport } from './reconcile.js';

const report: ReconcileReport = {
  checked: 2,
  agreed: 0,
  refusals: 2,
  ok: false,
  findings: [
    {
      orderId: 'a',
      case: 'engine_only',
      verdict: 'refuse',
      engine: 'LIVE',
      counterpart: 'UNKNOWN',
      reason: 'incomplete counterpart view',
    },
    {
      orderId: 'b',
      case: 'quantity_disagreement',
      verdict: 'refuse',
      engine: 'remaining=1',
      counterpart: 'remaining=2',
      reason: 'quantities disagree',
    },
  ],
};

describe('filterFindingsByCase L3', () => {
  it('empty allowlist → empty not invent full list', () => {
    expect(filterFindingsByCase(report, [])).toEqual([]);
  });

  it('filters to selected cases only', () => {
    const only = filterFindingsByCase(report, ['engine_only']);
    expect(only).toHaveLength(1);
    expect(only[0]!.orderId).toBe('a');
    expect(filterFindingsByCase(report, ['market_disagreement'])).toEqual([]);
  });
});
