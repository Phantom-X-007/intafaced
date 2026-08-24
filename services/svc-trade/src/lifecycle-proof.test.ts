import { describe, expect, it } from 'vitest';
import { decideMarketAction } from './market-lifecycle.js';
import { createLifecycleAdmissionProof, lifecycleAdmissionProofSchema } from './lifecycle-proof.js';
import {
  createMarketLifecycleAdmissionProof,
  marketLifecycleAdmissionProofSchema,
  snapshotIdFor,
  type MarketStateSnapshot,
} from '@intafaced/exchange-contract';

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
    const decision = decideMarketAction(snapshot, 'PLACE');
    const proof = createLifecycleAdmissionProof(snapshot, decision, 'PLACE');
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

  it('emits the canonical constructor wire, hash, and JSON bytes', () => {
    const decision = decideMarketAction(snapshot, 'PLACE');
    const serviceProof = createLifecycleAdmissionProof(snapshot, decision, 'PLACE');
    const sharedProof = createMarketLifecycleAdmissionProof(snapshot, 'PLACE', decision.checkedAt);

    expect(serviceProof).toEqual(sharedProof);
    expect(snapshotIdFor(snapshot)).toBe('trade.lifecycle.snapshot:4846f0a4c779eb6058e60a6b6afa70a9099555ee5bac1b9e654f23872b7e3381');
    expect(JSON.stringify(serviceProof)).toBe(
      '{"action":"PLACE","decision":"ELIGIBLE","checkedAt":"2026-08-24T16:00:00.000Z","snapshotId":"trade.lifecycle.snapshot:4846f0a4c779eb6058e60a6b6afa70a9099555ee5bac1b9e654f23872b7e3381","transitionId":"transition-1","evidenceRefs":["evidence-1"],"snapshot":{"marketId":"market-1","ruleVersion":"rules-1","instrumentId":"instrument-1","instrumentVersion":"instrument-v1","state":"OPEN","reasonCategory":"NORMAL","reasonCode":"trade.lifecycle.ready","effectiveAt":"2026-08-24T16:00:00.000Z","observedAt":"2026-08-24T16:00:00.000Z","lastGoodState":"OPEN","allowedActions":["PLACE"],"transitionId":"transition-1","evidenceRefs":["evidence-1"]}}',
    );
    expect(marketLifecycleAdmissionProofSchema.parse(serviceProof)).toEqual(serviceProof);
  });

  it('retries retain the original proof bytes', () => {
    const decision = decideMarketAction(snapshot, 'PLACE');
    const original = createLifecycleAdmissionProof(snapshot, decision, 'PLACE');
    const retry = createLifecycleAdmissionProof(JSON.parse(JSON.stringify(original.snapshot)), decision, 'PLACE');

    expect(JSON.stringify(retry)).toBe(JSON.stringify(original));
  });

  it('refuses schema-shaped tampering of action or checkedAt', () => {
    const proof = createLifecycleAdmissionProof(snapshot, decideMarketAction(snapshot, 'PLACE'), 'PLACE');
    expect(lifecycleAdmissionProofSchema.safeParse({ ...proof, action: 'PLACE_POST_ONLY' }).success).toBe(false);
    expect(lifecycleAdmissionProofSchema.safeParse({ ...proof, checkedAt: '2026-08-24T16:01:00.000Z' }).success).toBe(false);
  });
});
