import { describe, expect, it } from 'vitest';
import { fakeMarket } from './public-rest.js';
import type { AuthorityEvidence, MarketAdmissionDossier, MarketTransitionRecord } from '@intafaced/exchange-contract';
import { MarketLifecycleAuthority, deriveMarketLifecycleSnapshot, decideMarketAction } from './market-lifecycle.js';

const ready = (ref: string) => ({ status: 'READY' as const, evidenceRefs: [ref] });

function dossier(marketId: string): MarketAdmissionDossier {
  return {
    dossierId: `dossier:${marketId}`,
    marketId,
    ruleVersion: 'rules:v1',
    instrumentVersion: 'instrument:v1',
    legalEntityAndJurisdiction: ready('legal'),
    counterpartyRole: ready('counterparty'),
    deterministicSettlement: ready('settlement'),
    custodyAndTransferSupport: ready('custody'),
    oracleIndexAndDisruption: ready('oracle'),
    liquidityAndMarketQuality: ready('liquidity'),
    surveillanceAndRetention: ready('surveillance'),
    riskAndLimits: ready('risk'),
    operationsAndIncidentOwner: ready('operations'),
    windDownAndResiduals: ready('winddown'),
    approvedAt: '2026-08-24T12:00:00.000Z',
    approvalRefs: ['approval'],
  };
}

const authority: AuthorityEvidence = {
  decision: 'AUTHORIZED',
  reasonCode: null,
  legalOwnerId: 'owner',
  accountId: 'account',
  subAccountId: 'subaccount',
  actorId: 'actor',
  origin: 'OPERATOR',
  sessionId: 'session',
  credentialId: null,
  grantId: 'grant',
  grantVersion: 'grant:v1',
  mandateId: 'mandate',
  decidedAt: '2026-08-24T12:00:00.000Z',
  freshnessAt: '2026-08-24T12:00:00.000Z',
};

function readyEvidence(marketId: string) {
  return {
    dossier: dossier(marketId),
    authority,
    readiness: { schedule: ready('schedule'), risk: ready('risk-live'), matching: ready('matching') },
  };
}

describe('svc-trade PX-S01 lifecycle authority', () => {
  it('maps published readiness into OPEN and permits the same PLACE action the gate uses', () => {
    const market = fakeMarket({ id: 'market-1' });
    const snapshot = deriveMarketLifecycleSnapshot(market, {
      now: '2026-08-24T12:01:00.000Z',
      evidence: readyEvidence(market.id),
    });
    expect(snapshot.state).toBe('OPEN');
    expect(decideMarketAction(snapshot, 'PLACE').decision).toBe('ELIGIBLE');
    expect(snapshot.allowedActions).toContain('PLACE');
  });

  it('refuses missing authority and dossier instead of inventing OPEN', () => {
    const market = fakeMarket({ id: 'market-2' });
    expect(deriveMarketLifecycleSnapshot(market, { now: '2026-08-24T12:01:00.000Z' })).toMatchObject({
      state: 'REFUSED',
      reasonCode: 'trade.lifecycle_authority_unavailable',
    });
    expect(deriveMarketLifecycleSnapshot(market, { now: '2026-08-24T12:01:00.000Z', evidence: { authority } })).toMatchObject({
      state: 'REFUSED',
      reasonCode: 'trade.lifecycle_dossier_required',
    });
  });

  it('keeps unknown schedule and failed readiness as named sockets', () => {
    const market = fakeMarket({ id: 'market-3', schedule: 'unknown-schedule' as never });
    const unknown = deriveMarketLifecycleSnapshot(market, { now: '2026-08-24T12:01:00.000Z', evidence: readyEvidence(market.id) });
    expect(unknown.reasonCode).toBe('trade.unknown_schedule');
    expect(decideMarketAction(unknown, 'PLACE').decision).toBe('REFUSED');

    const failed = deriveMarketLifecycleSnapshot(market, {
      now: '2026-08-24T12:01:00.000Z',
      evidence: {
        ...readyEvidence(market.id),
        readiness: {
          schedule: ready('schedule'),
          risk: { status: 'SOCKET', socketId: 'risk.socket', reasonCode: 'risk.down', evidenceRefs: [] },
          matching: ready('matching'),
        },
      },
    });
    expect(failed.reasonCode).toBe('trade.lifecycle_readiness_socket');
  });

  it('halts new risk while retaining reduction actions', () => {
    const market = fakeMarket({ id: 'market-4', status: 'halted' });
    const snapshot = deriveMarketLifecycleSnapshot(market, { now: '2026-08-24T12:01:00.000Z', evidence: readyEvidence(market.id) });
    expect(snapshot.state).toBe('HALTED');
    expect(snapshot.allowedActions).toEqual(['CANCEL', 'REDUCE', 'CLOSE']);
    expect(decideMarketAction(snapshot, 'PLACE').decision).toBe('REFUSED');
    expect(decideMarketAction(snapshot, 'CANCEL').decision).toBe('ELIGIBLE');
  });

  it('does not collapse partial or unknown reopen outcomes to OPEN', () => {
    const market = fakeMarket({ id: 'market-5' });
    const base = {
      transitionId: 'transition:5',
      idempotencyKey: 'market:5:reopen',
      marketId: market.id,
      expectedState: 'HALTED' as const,
      expectedRuleVersion: 'rules:v1',
      requestedState: 'OPEN' as const,
      resolvedState: null,
      reasonCategory: 'TECHNICAL' as const,
      reasonCode: 'matching.reopen.unknown',
      actorId: 'actor',
      authorityRef: 'grant',
      approvalRefs: [],
      requestedAt: '2026-08-24T12:00:00.000Z',
      effectiveAt: null,
      expiresAt: null,
      recoveryEvidenceRefs: ['recovery-check'],
    };
    for (const outcome of [
      { outcome: 'PARTIAL' as const, appliedTargets: ['market'], unresolvedTargets: ['matching'] },
      { outcome: 'OUTCOME_UNKNOWN' as const, appliedTargets: [], unresolvedTargets: ['matching'] },
    ]) {
      const snapshot = deriveMarketLifecycleSnapshot(market, {
        now: '2026-08-24T12:01:00.000Z',
        evidence: { transition: { ...base, outcome } as MarketTransitionRecord },
      });
      expect(snapshot.state).toBe('HALTED');
      expect(snapshot.allowedActions).not.toContain('PLACE');
      expect(snapshot.reasonCode).toMatch(/^trade\.lifecycle_transition_/);
    }
  });

  it('shares one authoritative snapshot between projection and order admission', () => {
    const market = fakeMarket({ id: 'market-6' });
    const authorityPort = new MarketLifecycleAuthority(() => readyEvidence(market.id));
    const snapshot = authorityPort.snapshot(market, { now: '2026-08-24T12:01:00.000Z' });
    expect(authorityPort.admit(snapshot, 'PLACE')).toEqual(decideMarketAction(snapshot, 'PLACE'));
  });
});
