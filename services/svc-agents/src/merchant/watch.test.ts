import { describe, expect, it } from 'vitest';
import { watchApprovalFixtures, type ApprovalRatePoint } from './watch.js';

const NOW = new Date('2026-08-05T12:00:00.000Z');

function pt(partial: Partial<ApprovalRatePoint> & Pick<ApprovalRatePoint, 'railId'>): ApprovalRatePoint {
  return {
    approvalRate: '0.95',
    attempts: 100,
    asOf: '2026-08-05T11:59:00.000Z',
    maxAgeMs: 120_000,
    ...partial,
  };
}

describe('merchant watchApprovalFixtures (Stage-1 fixtures)', () => {
  it('returns empty when no points — no invented rails', () => {
    const r = watchApprovalFixtures([], { now: NOW });
    expect(r).toEqual({ status: 'empty', userMessageKey: 'agents.merchant.empty' });
  });

  it('alerts when rate is below threshold — does not change rails', () => {
    const r = watchApprovalFixtures(
      [pt({ railId: 'card-a', approvalRate: '0.70', attempts: 200 }), pt({ railId: 'card-b', approvalRate: '0.99' })],
      { now: NOW, threshold: '0.85' },
    );
    expect(r.status).toBe('ok');
    if (r.status !== 'ok') return;
    expect(r.alerts).toHaveLength(1);
    expect(r.alerts[0]).toMatchObject({
      railId: 'card-a',
      kind: 'below_threshold',
      threshold: '0.85',
      approvalRate: '0.70',
      attempts: 200,
    });
  });

  it('never zero-fills missing rates into a green board', () => {
    const r = watchApprovalFixtures([pt({ railId: 'x', approvalRate: null, attempts: null })], { now: NOW });
    expect(r).toEqual({
      status: 'unavailable',
      userMessageKey: 'agents.merchant.unavailable',
      reason: 'no_metrics',
    });
  });

  it('refuses stale series', () => {
    const r = watchApprovalFixtures([pt({ railId: 'x', asOf: '2026-08-05T10:00:00.000Z', maxAgeMs: 60_000 })], { now: NOW });
    expect(r).toEqual({
      status: 'unavailable',
      userMessageKey: 'agents.merchant.unavailable',
      reason: 'stale',
    });
  });

  it('rejects invented non-fraction rates', () => {
    const r = watchApprovalFixtures([pt({ railId: 'x', approvalRate: '1.5' })], { now: NOW });
    expect(r.status).toBe('unavailable');
  });

  it('Stage-2: pay plane dark → refuse without inventing rates', () => {
    const r = watchApprovalFixtures([pt({ railId: 'card-a' })], { now: NOW, payPlane: 'dark' });
    expect(r).toEqual({
      status: 'unavailable',
      userMessageKey: 'agents.merchant.unavailable',
      reason: 'pay_plane_dark',
    });
  });
});
