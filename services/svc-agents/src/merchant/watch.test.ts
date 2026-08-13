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

  it('D26-P1-A4: mixed missing + usable rates refuse — no partial ok board', () => {
    const r = watchApprovalFixtures(
      [pt({ railId: 'card-a', approvalRate: '0.70', attempts: 200 }), pt({ railId: 'card-b', approvalRate: null, attempts: null })],
      { now: NOW, threshold: '0.85' },
    );
    expect(r).toEqual({
      status: 'unavailable',
      userMessageKey: 'agents.merchant.unavailable',
      reason: 'no_metrics',
    });
  });

  it('D26-P1-A4: null rate alone among good siblings refuses (no invent completeness)', () => {
    const r = watchApprovalFixtures(
      [pt({ railId: 'good', approvalRate: '0.99', attempts: 100 }), pt({ railId: 'hole', approvalRate: null, attempts: 50 })],
      { now: NOW, threshold: '0.85' },
    );
    expect(r.status).toBe('unavailable');
    if (r.status !== 'unavailable') return;
    expect(r.reason).toBe('no_metrics');
  });

  it('D26-P1-A4: null attempts alone among good siblings refuses', () => {
    const r = watchApprovalFixtures(
      [pt({ railId: 'good', approvalRate: '0.99', attempts: 100 }), pt({ railId: 'hole', approvalRate: '0.50', attempts: null })],
      { now: NOW, threshold: '0.85' },
    );
    expect(r).toMatchObject({ status: 'unavailable', reason: 'no_metrics' });
  });

  it('refuses stale series', () => {
    const r = watchApprovalFixtures([pt({ railId: 'x', asOf: '2026-08-05T10:00:00.000Z', maxAgeMs: 60_000 })], { now: NOW });
    expect(r).toEqual({
      status: 'unavailable',
      userMessageKey: 'agents.merchant.unavailable',
      reason: 'stale',
    });
  });

  it('D26-P1-A4 deepen: mixed stale + fresh refuses — no partial ok board', () => {
    const r = watchApprovalFixtures(
      [
        pt({ railId: 'fresh', approvalRate: '0.70', attempts: 200 }),
        pt({ railId: 'stale', asOf: '2026-08-05T10:00:00.000Z', maxAgeMs: 60_000, approvalRate: '0.50', attempts: 100 }),
      ],
      { now: NOW, threshold: '0.85' },
    );
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

  it('Stage-2 L3: rail allowlist scopes watch — no invent out-of-scope alerts', () => {
    const r = watchApprovalFixtures([pt({ railId: 'card-a', approvalRate: '0.5' }), pt({ railId: 'card-b', approvalRate: '0.5' })], {
      now: NOW,
      railAllowlist: ['card-b'],
      threshold: '0.85',
    });
    expect(r.status).toBe('ok');
    if (r.status !== 'ok') return;
    expect(r.alerts.map((a) => a.railId)).toEqual(['card-b']);
    expect(r.skippedIncomplete).toBe(1);
  });

  it('never alerts on zero attempts — empty sample is not a rail failure', () => {
    const r = watchApprovalFixtures(
      [pt({ railId: 'ghost', approvalRate: '0.00', attempts: 0 }), pt({ railId: 'real', approvalRate: '0.99', attempts: 100 })],
      { now: NOW, threshold: '0.85' },
    );
    expect(r.status).toBe('ok');
    if (r.status !== 'ok') return;
    expect(r.alerts).toEqual([]);
    expect(r.skippedLowSample).toBe(1);
  });

  it('zero-sample-only series is unavailable (no invent green/red board)', () => {
    const r = watchApprovalFixtures([pt({ railId: 'ghost', approvalRate: '0.00', attempts: 0 })], {
      now: NOW,
      threshold: '0.85',
    });
    expect(r).toEqual({
      status: 'unavailable',
      userMessageKey: 'agents.merchant.unavailable',
      reason: 'no_metrics',
    });
  });

  it('minAttempts floor skips low samples — no invent alert from n=1 noise', () => {
    const r = watchApprovalFixtures(
      [pt({ railId: 'tiny', approvalRate: '0.00', attempts: 1 }), pt({ railId: 'solid', approvalRate: '0.70', attempts: 200 })],
      { now: NOW, threshold: '0.85', minAttempts: 30 },
    );
    expect(r.status).toBe('ok');
    if (r.status !== 'ok') return;
    expect(r.skippedLowSample).toBe(1);
    expect(r.alerts.map((a) => a.railId)).toEqual(['solid']);
  });
});
