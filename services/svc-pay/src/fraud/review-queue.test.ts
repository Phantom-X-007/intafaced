import { describe, expect, it } from 'vitest';
import { evaluateFraud } from './evaluate.js';
import { FraudReviewError, MemoryFraudReviewQueue } from './review-queue.js';

describe('D26-P1-P5 fraud review queue', () => {
  it('enqueues only review outcomes with reasons', () => {
    const q = new MemoryFraudReviewQueue();
    const decision = evaluateFraud({
      merchantId: 'm1',
      amount: '100',
      assetId: 'USDT',
      recentPaymentCount: 12,
      thresholds: { maxPaymentsInWindow: 5 },
    });
    expect(decision.outcome).toBe('review');

    const c = q.enqueue({
      id: 'rev-1',
      merchantId: 'm1',
      amount: '100',
      assetId: 'USDT',
      decision,
    });
    expect(c.status).toBe('open');
    expect(c.decision.reasons.length).toBeGreaterThan(0);
    expect(q.listOpen('m1')).toHaveLength(1);
  });

  it('refuses allow/decline enqueue (no silent queue pollution)', () => {
    const q = new MemoryFraudReviewQueue();
    const allow = evaluateFraud({ merchantId: 'm1', amount: '1', assetId: 'USDT' });
    expect(allow.outcome).toBe('allow');
    expect(() => q.enqueue({ id: 'x', merchantId: 'm1', amount: '1', assetId: 'USDT', decision: allow })).toThrowError(FraudReviewError);
  });

  it('resolve requires actor and is idempotent-closed after first decision', () => {
    const q = new MemoryFraudReviewQueue();
    const decision = evaluateFraud({
      merchantId: 'm1',
      amount: '100',
      assetId: 'USDT',
      recentPaymentCount: 9,
      thresholds: { maxPaymentsInWindow: 2 },
    });
    q.enqueue({ id: 'rev-2', merchantId: 'm1', amount: '100', assetId: 'USDT', decision });
    const closed = q.resolve({ id: 'rev-2', outcome: 'allow', actorId: 'ops-1', note: 'vip' });
    expect(closed.status).toBe('allowed');
    expect(closed.resolvedBy).toBe('ops-1');
    expect(() => q.resolve({ id: 'rev-2', outcome: 'decline', actorId: 'ops-2' })).toThrowError(/already allowed/);
  });
});
