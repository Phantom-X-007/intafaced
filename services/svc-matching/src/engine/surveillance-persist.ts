/**
 * Persist open surveillance cases (PX-S03 / M16 / PTX-M16-R01–R09).
 * Named cases stay open evidence. Spoofing/layering refuse auto-adjudicate.
 * Missing owner thresholds disable that detector with an explicit gap — never threshold 0.
 * Hitch: imported from index.ts so MatchingEngine is wrapped without recutting engine.ts.
 */
import { MatchingEngine } from './engine.js';
import {
  closeSurveillanceCase,
  fineSurveillanceCase,
  openSurveillanceCase,
  punishSurveillanceCase,
  type OpenSurveillanceCaseResult,
  type SurveillanceRefuse,
} from './surveillance-case.js';
import type { EngineOrder, EngineSurveillanceCase, MarketId, SubmitResult } from './types.js';

export const AUTO_ADJUDICATE_FORBIDDEN = 'auto_adjudicate_forbidden' as const;
export const DETECTOR_GAP = 'detector_gap' as const;

export const AUTO_ADJUDICATE_FORBIDDEN_MESSAGE =
  'auto-adjudicate is forbidden; spoofing, layering, and self_trade stay named open evidence';
export const DETECTOR_GAP_MESSAGE =
  'owner surveillance thresholds are unpublished; the detector is disabled — never a live zero band';

const FLAG = Symbol.for('intafaced.matching.surveillance-persist');
const casesByEngine = new WeakMap<MatchingEngine, Map<string, EngineSurveillanceCase>>();

export type AdjudicateRefuse = {
  readonly ok: false;
  readonly code: typeof AUTO_ADJUDICATE_FORBIDDEN;
  readonly message: string;
};

export type DetectorStatus = {
  readonly enabled: false;
  readonly gap: typeof DETECTOR_GAP;
  readonly reason: string;
  readonly threshold: null;
};

export type DetectorRunRefuse = DetectorStatus & {
  readonly ok: false;
  readonly code: typeof DETECTOR_GAP;
  readonly message: string;
};

export type OpenSurveillanceCaseInput = {
  readonly accountId?: string | null;
  readonly marketId?: string | null;
  readonly reason?: string | null;
};

type BookWithCases = {
  openSurveillanceCases(): readonly EngineSurveillanceCase[];
};

type Host = MatchingEngine & {
  openSurveillanceCases: () => readonly EngineSurveillanceCase[];
  submit: (marketId: MarketId, order: EngineOrder, proof?: unknown) => Promise<SubmitResult>;
  recover: () => { records: number; markets: number };
  existingBook: (marketId: MarketId) => BookWithCases | null;
};

function caseKey(opened: { readonly accountId: string; readonly marketId: string; readonly reason: string }): string {
  return `${opened.accountId}\0${opened.marketId}\0${opened.reason}`;
}

function asOpen(opened: EngineSurveillanceCase): EngineSurveillanceCase {
  return {
    accountId: opened.accountId,
    marketId: opened.marketId,
    reason: opened.reason,
    status: 'open',
  };
}

function storeOf(engine: MatchingEngine): Map<string, EngineSurveillanceCase> {
  let store = casesByEngine.get(engine);
  if (!store) {
    store = new Map();
    casesByEngine.set(engine, store);
  }
  return store;
}

function remember(engine: MatchingEngine, opened: EngineSurveillanceCase): void {
  storeOf(engine).set(caseKey(opened), asOpen(opened));
}

function snapshotBookCases(engine: MatchingEngine, book: BookWithCases | null | undefined): void {
  if (book == null) return;
  for (const opened of book.openSurveillanceCases()) remember(engine, opened);
}

function unionCases(stored: Iterable<EngineSurveillanceCase>, fromBook: readonly EngineSurveillanceCase[]): EngineSurveillanceCase[] {
  const merged = new Map<string, EngineSurveillanceCase>();
  for (const opened of stored) merged.set(caseKey(opened), asOpen(opened));
  for (const opened of fromBook) merged.set(caseKey(opened), asOpen(opened));
  return [...merged.values()];
}

/**
 * Owner spoofing/layering magnitudes. No env on this process publishes them.
 * MATCHING_SURVEILLANCE_* is not added — a default number would invent a live zero band.
 * UNSET is the live product — missing thresholds disable that detector with an explicit gap.
 */
export function spoofingThresholdUnset(): boolean {
  return true;
}

export function layeringThresholdUnset(): boolean {
  return true;
}

export function detectorGap(reason: string): DetectorStatus {
  return {
    enabled: false,
    gap: DETECTOR_GAP,
    reason,
    threshold: null,
  };
}

export function detectorStatus(reason: string): DetectorStatus {
  return detectorGap(reason);
}

export function runDetector(reason: string, ..._args: unknown[]): DetectorRunRefuse {
  return {
    ...detectorGap(reason),
    ok: false,
    code: DETECTOR_GAP,
    message: DETECTOR_GAP_MESSAGE,
  };
}

export function adjudicateSurveillanceCase(_input: { readonly reason?: string | null } = {}): AdjudicateRefuse {
  return {
    ok: false,
    code: AUTO_ADJUDICATE_FORBIDDEN,
    message: AUTO_ADJUDICATE_FORBIDDEN_MESSAGE,
  };
}

export function persistOpenSurveillanceCase(engine: MatchingEngine, input: OpenSurveillanceCaseInput): OpenSurveillanceCaseResult {
  const result = openSurveillanceCase(input);
  if (result.ok) remember(engine, result.case);
  return result;
}

export function installSurveillancePersist(ctor: typeof MatchingEngine = MatchingEngine): void {
  const proto = ctor.prototype as {
    openSurveillanceCases: Host['openSurveillanceCases'];
    submit: Host['submit'];
    recover: Host['recover'];
    existingBook: Host['existingBook'];
    openSurveillanceCase?: (input: OpenSurveillanceCaseInput) => OpenSurveillanceCaseResult;
    adjudicateSurveillanceCase?: (input?: { readonly reason?: string | null }) => AdjudicateRefuse;
    detectorStatus?: (reason: string) => DetectorStatus;
    runDetector?: (reason: string, ...args: unknown[]) => DetectorRunRefuse;
    closeSurveillanceCase?: () => SurveillanceRefuse;
    fineSurveillanceCase?: () => SurveillanceRefuse;
    punishSurveillanceCase?: () => SurveillanceRefuse;
    [FLAG]?: true;
  };
  if (proto[FLAG]) return;
  proto[FLAG] = true;

  const origOpen = proto.openSurveillanceCases;
  const origSubmit = proto.submit;
  const origRecover = proto.recover;

  proto.openSurveillanceCases = function (this: MatchingEngine) {
    return unionCases(storeOf(this).values(), origOpen.call(this));
  };

  proto.recover = function (this: MatchingEngine) {
    const recovered = origRecover.call(this);
    for (const opened of origOpen.call(this)) remember(this, opened);
    return recovered;
  };

  proto.submit = async function (this: MatchingEngine, marketId: MarketId, order: EngineOrder, proof?: unknown) {
    const result = await origSubmit.call(this, marketId, order, proof);
    snapshotBookCases(this, (this as Host).existingBook(marketId));
    if (result.surveillanceCases) {
      for (const opened of result.surveillanceCases) remember(this, opened);
    }
    return result;
  };

  proto.openSurveillanceCase = function (this: MatchingEngine, input: OpenSurveillanceCaseInput) {
    return persistOpenSurveillanceCase(this, input);
  };

  proto.adjudicateSurveillanceCase = function (this: MatchingEngine, input?: { readonly reason?: string | null }) {
    return adjudicateSurveillanceCase(input ?? {});
  };

  proto.detectorStatus = function (this: MatchingEngine, reason: string) {
    return detectorStatus(reason);
  };

  proto.runDetector = function (this: MatchingEngine, reason: string, ...args: unknown[]) {
    return runDetector(reason, ...args);
  };

  proto.closeSurveillanceCase = function (this: MatchingEngine) {
    return closeSurveillanceCase();
  };

  proto.fineSurveillanceCase = function (this: MatchingEngine) {
    return fineSurveillanceCase();
  };

  proto.punishSurveillanceCase = function (this: MatchingEngine) {
    return punishSurveillanceCase();
  };
}

try {
  installSurveillancePersist();
} catch {
  queueMicrotask(() => installSurveillancePersist());
}
