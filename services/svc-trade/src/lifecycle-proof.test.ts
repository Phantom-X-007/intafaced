import { describe, expect, it } from 'vitest';
import { decideMarketAction } from './market-lifecycle.js';
import { createLifecycleAdmissionProof, lifecycleAdmissionProofSchema } from './lifecycle-proof.js';
import type { MarketStateSnapshot } from '@intafaced/exchange-contract';

const snapshot: MarketStateSnapshot = {
  marketId: 'market-1',
  ruleVersion: 'rules-1',
  instrumentId: 'instrument-1',
  instrumentVersion: 'instrument-v1',
  state: 'OPEN',
  reasonCategory: 'NORMAL',
  reasonCode: 'trade.lifecycle.ready',
  effectiveAt: '2026-08-24T16:00:00.000Z',
  observedAt: '2026-08-24T16:00:00.000Z',
  lastGoodState: 'OPEN',
  allowedActions: ['PLACE'],
  transitionId: 'transition-1',
  evidenceRefs: ['evidence-1'],
};

describe('svc-trade lifecycle admission proof', () => {
  it('binds action, checkedAt, snapshot, evidence, and transition', () => {
    const proof = createLifecycleAdmissionProof(snapshot, decideMarketAction(snapshot, 'PLACE'), 'PLACE');
    expect(proof).toMatchObject({
      action: 'PLACE',
      decision: 'ELIGIBLE',
      checkedAt: snapshot.observedAt,
      transitionId: snapshot.transitionId,
      evidenceRefs: snapshot.evidenceRefs,
      snapshot,
    });
    expect(lifecycleAdmissionProofSchema.safeParse(proof).success).toBe(true);
  });

  it('refuses schema-shaped tampering of action or checkedAt', () => {
    const proof = createLifecycleAdmissionProof(snapshot, decideMarketAction(snapshot, 'PLACE'), 'PLACE');
    expect(lifecycleAdmissionProofSchema.safeParse({ ...proof, action: 'PLACE_POST_ONLY' }).success).toBe(false);
    expect(lifecycleAdmissionProofSchema.safeParse({ ...proof, checkedAt: '2026-08-24T16:01:00.000Z' }).success).toBe(false);
  });
});
