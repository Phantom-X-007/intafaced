import { createHash } from 'node:crypto';
import type { Sql } from 'postgres';
import {
  decideMarketAdmission,
  marketAdmissionDossierSchema,
  marketStateSnapshotSchema,
  marketTransitionRecordSchema,
  correctionLinkSchema,
  type AdmissionReadiness,
  type AuthorityEvidence,
  type MarketAction,
  type MarketAdmissionDossier,
  type MarketAdmissionDecision,
  type MarketLifecycleState,
  type MarketStateSnapshot,
  type MarketTransitionRecord,
  type CorrectionLink,
} from '@intafaced/exchange-contract';
import { isScheduleKey, isScheduleOpen, TRADING_SCHEDULES } from '@intafaced/contracts';
import type { Market } from './spot/types.js';

/**
 * PX-S01 authority boundary for svc-trade.
 *
 * This module deliberately owns no market rows, balances, or matching book.
 * It only turns the market row plus published authority/readiness evidence into
 * one immutable snapshot. A missing input is a named refusal, never a default
 * OPEN. The port is optional at the service boundary while the upstream
 * authority publisher is being deployed; callers that install it get the
 * refuse-closed gate on both projection and order admission.
 */

export const MARKET_LIFECYCLE_REASON = {
  AUTHORITY_UNAVAILABLE: 'trade.lifecycle_authority_unavailable',
  DOSSIER_REQUIRED: 'trade.lifecycle_dossier_required',
  DOSSIER_INVALID: 'trade.lifecycle_dossier_invalid',
  READINESS_SOCKET: 'trade.lifecycle_readiness_socket',
  UNKNOWN_SCHEDULE: 'trade.unknown_schedule',
  MARKET_CLOSED: 'trade.market_closed',
  MARKET_HALTED: 'trade.market_halted',
  MARKET_SUSPENDED: 'trade.market_suspended',
  TRANSITION_PARTIAL: 'trade.lifecycle_transition_partial',
  TRANSITION_UNKNOWN: 'trade.lifecycle_transition_unknown',
  RECOVERY_REQUIRED: 'trade.lifecycle_recovery_required',
} as const;

export type MarketLifecycleReason = (typeof MARKET_LIFECYCLE_REASON)[keyof typeof MARKET_LIFECYCLE_REASON];

export interface MarketLifecycleReadiness {
  /** The same schedule authority used by risk.assertMarketOpen. */
  readonly schedule: AdmissionReadiness;
  /** Risk/limits readiness; a socket keeps the market closed to new risk. */
  readonly risk: AdmissionReadiness;
  /** Matching transport/writer readiness; a socket keeps PLACE closed. */
  readonly matching: AdmissionReadiness;
}

export interface MarketLifecycleEvidence {
  readonly dossier?: MarketAdmissionDossier | null;
  readonly authority?: AuthorityEvidence | null;
  readonly readiness?: Partial<MarketLifecycleReadiness> | null;
  /** An unresolved transition never becomes OPEN by accident. */
  readonly transition?: MarketTransitionRecord | null;
}

export interface MarketLifecycleSnapshotOptions {
  readonly now?: string;
  readonly effectiveAt?: string;
  readonly evidence?: MarketLifecycleEvidence;
}

export interface MarketLifecyclePort {
  snapshot(market: Market, options?: MarketLifecycleSnapshotOptions): MarketStateSnapshot;
  admit(snapshot: MarketStateSnapshot, action: MarketAction): MarketActionDecision;
}

export interface MarketActionDecision {
  readonly decision: 'ELIGIBLE' | 'REFUSED';
  readonly action: MarketAction;
  readonly state: MarketLifecycleState;
  readonly checkedAt: string;
  readonly reasonCode: string | null;
  readonly evidenceRefs: readonly string[];
  readonly recovery: boolean;
}

const allReady = (readiness: AdmissionReadiness | undefined): boolean => readiness?.status === 'READY';

function stableId(namespace: string, value: string): string {
  return `${namespace}:${createHash('sha256').update(value).digest('hex').slice(0, 32)}`;
}

export function lifecycleTransitionId(marketId: string, expectedState: string, requestedState: string, idempotencyKey: string): string {
  return stableId('trade.lifecycle.transition', `${marketId}|${expectedState}|${requestedState}|${idempotencyKey}`);
}

export function lifecycleReconciliationKey(marketId: string, transitionId: string): string {
  return stableId('trade.lifecycle.reconcile', `${marketId}|${transitionId}`);
}

function clockNow(value?: string): string {
  return value ?? new Date().toISOString();
}

function evidenceId(market: Market, suffix: string): string {
  return stableId('trade.lifecycle.evidence', `${market.id}|${suffix}`);
}

function scheduleReadiness(market: Market, at: string): AdmissionReadiness {
  if (!isScheduleKey(market.schedule)) {
    return {
      status: 'SOCKET',
      socketId: evidenceId(market, 'schedule'),
      reasonCode: MARKET_LIFECYCLE_REASON.UNKNOWN_SCHEDULE,
      evidenceRefs: [],
    };
  }
  const schedule = TRADING_SCHEDULES[market.schedule];
  if (!schedule) {
    return {
      status: 'SOCKET',
      socketId: evidenceId(market, 'schedule'),
      reasonCode: MARKET_LIFECYCLE_REASON.UNKNOWN_SCHEDULE,
      evidenceRefs: [],
    };
  }
  if (!isScheduleOpen(schedule, new Date(at))) {
    return {
      status: 'SOCKET',
      socketId: evidenceId(market, 'session'),
      reasonCode: MARKET_LIFECYCLE_REASON.MARKET_CLOSED,
      evidenceRefs: [],
    };
  }
  return { status: 'READY', evidenceRefs: [evidenceId(market, `schedule:${market.schedule}`)] };
}

function allowedActions(state: MarketLifecycleState, safeRecovery = false): MarketAction[] {
  if (safeRecovery || state === 'HALTED' || state === 'REDUCE_ONLY' || state === 'EXPIRING' || state === 'DELISTING') {
    return ['CANCEL', 'REDUCE', 'CLOSE'];
  }
  if (state === 'CANCEL_ONLY') return ['CANCEL'];
  if (state === 'POST_ONLY') return ['PLACE_POST_ONLY', 'AMEND', 'CANCEL', 'REDUCE', 'CLOSE', 'QUOTE'];
  if (state === 'OPEN') return ['PLACE', 'PLACE_POST_ONLY', 'AMEND', 'CANCEL', 'REDUCE', 'CLOSE', 'TRIGGER', 'QUOTE', 'RFQ'];
  return [];
}

function refusalState(
  market: Market,
  reasonCode: string,
  now: string,
  lastGoodState: MarketLifecycleState | null,
  evidenceRefs: readonly string[],
  transitionId: string,
  safeRecovery = false,
): MarketStateSnapshot {
  const state = safeRecovery && lastGoodState !== null ? lastGoodState : 'REFUSED';
  return marketStateSnapshotSchema.parse({
    marketId: market.id,
    ruleVersion: stableId('trade.lifecycle.rules', market.id),
    instrumentId: market.id,
    instrumentVersion: stableId('trade.lifecycle.instrument', market.id),
    state,
    reasonCategory: reasonCode.includes('closed') ? 'NORMAL' : 'TECHNICAL',
    reasonCode,
    effectiveAt: now,
    observedAt: now,
    lastGoodState,
    allowedActions: allowedActions(state, safeRecovery),
    transitionId,
    evidenceRefs: evidenceRefs.length > 0 ? [...evidenceRefs] : [evidenceId(market, 'refusal')],
  });
}

/** Pure mapping of existing schedule/status/risk facts into PX-S01. */
export function deriveMarketLifecycleSnapshot(market: Market, options: MarketLifecycleSnapshotOptions = {}): MarketStateSnapshot {
  const now = clockNow(options.now);
  const effectiveAt = options.effectiveAt ?? now;
  const evidence = options.evidence ?? {};
  const transition = evidence.transition ?? null;
  const transitionId = transition?.transitionId ?? stableId('trade.lifecycle.snapshot', `${market.id}|${now}`);
  const lastGoodState = transition?.expectedState ?? null;

  if (transition !== null) {
    const parsed = marketTransitionRecordSchema.safeParse(transition);
    if (!parsed.success)
      return refusalState(
        market,
        MARKET_LIFECYCLE_REASON.RECOVERY_REQUIRED,
        now,
        lastGoodState,
        [evidenceId(market, 'transition-invalid')],
        transitionId,
      );
    if (parsed.data.outcome.outcome === 'PARTIAL' || parsed.data.outcome.outcome === 'OUTCOME_UNKNOWN') {
      return refusalState(
        market,
        parsed.data.outcome.outcome === 'PARTIAL' ? MARKET_LIFECYCLE_REASON.TRANSITION_PARTIAL : MARKET_LIFECYCLE_REASON.TRANSITION_UNKNOWN,
        now,
        parsed.data.expectedState,
        [...parsed.data.outcome.unresolvedTargets, ...parsed.data.recoveryEvidenceRefs],
        parsed.data.transitionId,
        true,
      );
    }
  }

  const authority = evidence.authority;
  if (authority == null || authority.decision !== 'AUTHORIZED') {
    return refusalState(
      market,
      MARKET_LIFECYCLE_REASON.AUTHORITY_UNAVAILABLE,
      now,
      lastGoodState,
      [evidenceId(market, 'authority')],
      transitionId,
    );
  }

  const dossier = evidence.dossier;
  if (dossier == null)
    return refusalState(
      market,
      MARKET_LIFECYCLE_REASON.DOSSIER_REQUIRED,
      now,
      lastGoodState,
      [evidenceId(market, 'dossier')],
      transitionId,
    );
  const parsedDossier = marketAdmissionDossierSchema.safeParse(dossier);
  if (!parsedDossier.success)
    return refusalState(
      market,
      MARKET_LIFECYCLE_REASON.DOSSIER_INVALID,
      now,
      lastGoodState,
      [evidenceId(market, 'dossier-invalid')],
      transitionId,
    );
  const admission = decideMarketAdmission(parsedDossier.data, now);
  if (admission.decision === 'REFUSED') {
    return refusalState(market, MARKET_LIFECYCLE_REASON.READINESS_SOCKET, now, lastGoodState, admission.blockingSockets, transitionId);
  }

  const readiness = evidence.readiness ?? {};
  const schedule = readiness.schedule ?? scheduleReadiness(market, now);
  const risk =
    readiness.risk ??
    ({
      status: 'SOCKET',
      socketId: evidenceId(market, 'risk'),
      reasonCode: MARKET_LIFECYCLE_REASON.READINESS_SOCKET,
      evidenceRefs: [],
    } as const);
  const matching =
    readiness.matching ??
    ({
      status: 'SOCKET',
      socketId: evidenceId(market, 'matching'),
      reasonCode: MARKET_LIFECYCLE_REASON.READINESS_SOCKET,
      evidenceRefs: [],
    } as const);
  const sockets = [schedule, risk, matching].flatMap((item) => (item?.status === 'SOCKET' ? [item.socketId] : []));
  if (sockets.length > 0 || !allReady(schedule) || !allReady(risk) || !allReady(matching)) {
    return refusalState(market, MARKET_LIFECYCLE_REASON.READINESS_SOCKET, now, lastGoodState, sockets, transitionId);
  }

  let state: MarketLifecycleState;
  if (market.status === 'halted') state = 'HALTED';
  else if (market.status === 'delisted') state = 'DELISTING';
  else if (market.status === 'pending') state = 'PRELAUNCH';
  else state = 'OPEN';

  return marketStateSnapshotSchema.parse({
    marketId: market.id,
    ruleVersion: parsedDossier.data.ruleVersion,
    instrumentId: market.id,
    instrumentVersion: parsedDossier.data.instrumentVersion,
    state,
    reasonCategory: state === 'OPEN' ? 'NORMAL' : 'OPERATOR',
    reasonCode: state === 'OPEN' ? 'trade.lifecycle.ready' : `trade.market_${market.status}`,
    effectiveAt,
    observedAt: now,
    lastGoodState: state === 'OPEN' ? 'OPEN' : null,
    allowedActions: allowedActions(state),
    transitionId,
    evidenceRefs: [
      ...parsedDossier.data.approvalRefs,
      ...schedule.evidenceRefs,
      ...(risk?.evidenceRefs ?? []),
      ...(matching?.evidenceRefs ?? []),
      ...(authority.decision === 'AUTHORIZED' ? [authority.grantId] : []),
    ],
  });
}

export function decideMarketAction(
  snapshot: MarketStateSnapshot,
  action: MarketAction,
  checkedAt = snapshot.observedAt,
): MarketActionDecision {
  const parsed = marketStateSnapshotSchema.parse(snapshot);
  const eligible = parsed.allowedActions.includes(action);
  return {
    decision: eligible ? 'ELIGIBLE' : 'REFUSED',
    action,
    state: parsed.state,
    checkedAt,
    reasonCode: eligible ? null : parsed.reasonCode,
    evidenceRefs: parsed.evidenceRefs,
    recovery: parsed.state !== 'OPEN' && parsed.state !== 'POST_ONLY',
  };
}

export class MarketLifecycleAuthority implements MarketLifecyclePort {
  constructor(private readonly evidenceFor: (market: Market) => MarketLifecycleEvidence | null | undefined) {}

  snapshot(market: Market, options: MarketLifecycleSnapshotOptions = {}): MarketStateSnapshot {
    return deriveMarketLifecycleSnapshot(market, { ...options, evidence: options.evidence ?? this.evidenceFor(market) ?? undefined });
  }

  admit(snapshot: MarketStateSnapshot, action: MarketAction): MarketActionDecision {
    return decideMarketAction(snapshot, action);
  }
}

/** Immutable local evidence log for transition/correction reconciliation. */
export class AppendOnlyMarketLifecycleLog {
  private readonly records: MarketTransitionRecord[] = [];
  private readonly corrections: CorrectionLink[] = [];

  append(record: MarketTransitionRecord): MarketTransitionRecord {
    const parsed = marketTransitionRecordSchema.parse(record);
    const existing = this.records.find((item) => item.transitionId === parsed.transitionId);
    if (existing) return existing;
    this.records.push(parsed);
    return parsed;
  }

  list(marketId?: string): readonly MarketTransitionRecord[] {
    return this.records.filter((record) => marketId === undefined || record.marketId === marketId);
  }

  appendCorrection(correction: CorrectionLink): CorrectionLink {
    const parsed = correctionLinkSchema.parse(correction);
    const existing = this.corrections.find((item) => item.correctionId === parsed.correctionId);
    if (existing) return existing;
    this.corrections.push(parsed);
    return parsed;
  }

  listCorrections(): readonly CorrectionLink[] {
    return this.corrections;
  }
}

/** Durable append-only adapter used by the service process when SQL is available. */
export class SqlMarketLifecycleEvidenceStore {
  constructor(private readonly sql: Sql) {}

  async appendTransition(record: MarketTransitionRecord): Promise<MarketTransitionRecord> {
    const parsed = marketTransitionRecordSchema.parse(record);
    const reconciliationKey =
      parsed.outcome.outcome === 'OUTCOME_UNKNOWN' || parsed.outcome.outcome === 'PARTIAL'
        ? lifecycleReconciliationKey(parsed.marketId, parsed.transitionId)
        : null;
    await this.sql`
      INSERT INTO trade.market_lifecycle_evidence
        (evidence_id, market_id, evidence_kind, transition, correction, causal_predecessor_id, reconciliation_key, observed_at)
      VALUES
        (${parsed.transitionId}, ${parsed.marketId}, 'TRANSITION', ${JSON.stringify(parsed)}::jsonb, NULL,
         ${parsed.authorityRef}, ${reconciliationKey}, ${parsed.requestedAt}::timestamptz)
      ON CONFLICT (evidence_id) DO NOTHING
    `;
    return parsed;
  }

  async appendCorrection(correction: CorrectionLink): Promise<CorrectionLink> {
    const parsed = correctionLinkSchema.parse(correction);
    await this.sql`
      INSERT INTO trade.market_lifecycle_evidence
        (evidence_id, market_id, evidence_kind, transition, correction, causal_predecessor_id, reconciliation_key, observed_at)
      VALUES
        (${parsed.correctionId}, NULL, 'CORRECTION', NULL, ${JSON.stringify(parsed)}::jsonb,
         ${parsed.causalPredecessorId}, NULL, ${parsed.correctedAt}::timestamptz)
      ON CONFLICT (evidence_id) DO NOTHING
    `;
    return parsed;
  }
}

export function marketAdmissionDecisionFor(
  snapshot: MarketStateSnapshot,
  action: MarketAction,
  checkedAt = snapshot.observedAt,
): MarketAdmissionDecision {
  const decision = decideMarketAction(snapshot, action, checkedAt);
  return decision.decision === 'ELIGIBLE'
    ? { decision: 'ELIGIBLE', dossierId: snapshot.transitionId, checkedAt, blockingSockets: [] }
    : {
        decision: 'REFUSED',
        dossierId: snapshot.transitionId,
        checkedAt,
        blockingSockets: [decision.reasonCode ?? 'trade.lifecycle.refused'],
      };
}
