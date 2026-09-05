/**
 * Paper trading Stage-2 — workbook drill loop (TRK-academy.paper-trading).
 *
 * Academy-side pure loop: requires an explicit paper market flag from trade.
 * Never invents fills, prices, or balances. Live markets refuse the drill.
 * Ledger isolation remains trade service law (Stage-1); this module does not
 * call ledger.
 */

import { AcademyError } from '../errors.js';

export type PaperMarketRef = {
  readonly marketId: string;
  /** Must be true — false or missing refuses (fail closed to live). */
  readonly paper: boolean;
  readonly symbol: string;
};

export type DrillStep = {
  readonly id: string;
  readonly instruction: string;
};

/**
 * Fill reference supplied by trade — academy never invents one.
 *
 * `side`/`price`/`size` are optional and, when present, are decimal strings
 * exactly as trade published them. Optional, because a fill this loop merely
 * counts needs none of the three; decimal strings, because the alternative is a
 * float in a book, and a simulated book is still a book. A drill that is VALUED
 * needs all three — `valueSimulatedDrill` refuses rather than filling a gap in
 * from anywhere (see simulated-result.ts).
 */
export type PaperFillRef = {
  readonly fillId: string;
  readonly marketId: string;
  readonly recordedAt: Date;
  readonly side?: 'buy' | 'sell';
  readonly price?: string;
  readonly size?: string;
};

export type DrillRun = {
  readonly workbookSlug: string;
  readonly marketId: string;
  readonly symbol: string;
  readonly steps: readonly DrillStep[];
  readonly completedStepIds: readonly string[];
  readonly status: 'active' | 'complete' | 'refused';
  readonly refuseReason?: 'not_paper' | 'no_market' | 'unknown_step' | 'bad_fill';
  /** Trade-supplied fill ids only — never academy-invented fills. */
  readonly fillRefs: readonly PaperFillRef[];
  /**
   * Carried on the RUN, not bolted on at the edge. Every projection below
   * (`drillBoardCard`, the status lines, the export) reads from the run, so a
   * drill cannot be rendered anywhere without the fact that it is simulated
   * travelling with it. `startPaperDrill` is the only producer and it is a
   * literal `true` — there is no path that constructs a live-looking run.
   */
  readonly simulated: true;
};

export type DrillResult =
  | { readonly ok: true; readonly run: DrillRun }
  | {
      readonly ok: false;
      readonly reason: 'not_paper' | 'no_market' | 'unknown_step' | 'bad_fill';
      readonly message: string;
    };

/** Default foundations paper workbook outline steps (catalog shell). */
export const FOUNDATIONS_PAPER_STEPS: readonly DrillStep[] = [
  { id: 'size-from-invalidation', instruction: 'Size a risk-first entry from an invalidation level (paper only).' },
  { id: 'limit-cancel', instruction: 'Place a limit that does not fill; cancel cleanly (paper only).' },
  { id: 'prewritten-stop', instruction: 'Hit a stop you wrote before entry (paper only).' },
] as const;

/**
 * Start a workbook drill against a paper market ref from trade.
 * Live market → refuse (never silent live).
 */
export function startPaperDrill(input: { workbookSlug: string; market: PaperMarketRef | null; steps?: readonly DrillStep[] }): DrillResult {
  if (!input.market) {
    return { ok: false, reason: 'no_market', message: 'No market ref — refuse paper drill (fail closed).' };
  }
  if (input.market.paper !== true) {
    return {
      ok: false,
      reason: 'not_paper',
      message: `Market ${input.market.marketId} is not paper — refuse drill (no live risk).`,
    };
  }
  const steps = input.steps ?? FOUNDATIONS_PAPER_STEPS;
  return {
    ok: true,
    run: {
      workbookSlug: input.workbookSlug,
      marketId: input.market.marketId,
      symbol: input.market.symbol,
      steps,
      completedStepIds: [],
      status: 'active',
      fillRefs: [],
      simulated: true,
    },
  };
}

/** Mark a step complete. Unknown step → refuse invent progress. */
export function completeDrillStep(run: DrillRun, stepId: string): DrillResult {
  if (run.status === 'refused') {
    return { ok: false, reason: run.refuseReason ?? 'not_paper', message: 'Run already refused.' };
  }
  if (!run.steps.some((s) => s.id === stepId)) {
    return { ok: false, reason: 'unknown_step', message: `Unknown step ${stepId}` };
  }
  if (run.completedStepIds.includes(stepId)) {
    return { ok: true, run }; // idempotent
  }
  const completedStepIds = [...run.completedStepIds, stepId];
  const status = completedStepIds.length >= run.steps.length ? 'complete' : 'active';
  return {
    ok: true,
    run: { ...run, completedStepIds, status },
  };
}

/**
 * A published decimal string, or a refusal.
 *
 * `typeof raw !== 'string'` is the load-bearing half. A JSON body carrying
 * `"price": 68412.5` deserialises to a `number`, and coercing it here would put
 * a float into a book — the fact that the book is a practice one changes
 * nothing about what a float does to 0.1. So it is refused at the boundary
 * rather than stringified.
 */
function publishedDecimal(raw: unknown): { ok: true; value: string } | { ok: false; why: string } {
  if (typeof raw !== 'string') return { ok: false, why: `must be a decimal string, got ${typeof raw}` };
  const trimmed = raw.trim();
  if (!trimmed) return { ok: false, why: 'must not be blank' };
  if (!/^\d+(\.\d+)?$/.test(trimmed)) return { ok: false, why: `"${trimmed}" is not a non-negative decimal string` };
  return { ok: true, value: trimmed };
}

/**
 * Attach a trade-supplied fill to the drill run. Idempotent on fillId.
 *
 * Refuses an empty fillId, a market mismatch, and — when the caller supplies
 * them — a side/price/size that trade could not have published in that shape.
 * The figures stay optional: what is refused is a WRONG one, never an absent
 * one, because the absence is answered honestly at valuation time instead.
 */
export function attachPaperFillRef(
  run: DrillRun,
  input: { fillId: string; marketId: string; recordedAt?: Date; side?: unknown; price?: unknown; size?: unknown },
): DrillResult {
  if (run.status === 'refused') {
    return { ok: false, reason: run.refuseReason ?? 'not_paper', message: 'Run already refused.' };
  }
  const fillId = input.fillId?.trim() ?? '';
  if (fillId.length < 1 || fillId.length > 128) {
    return { ok: false, reason: 'bad_fill', message: 'fillId required (1–128 chars) — no invent fill.' };
  }
  if (!input.marketId?.trim()) {
    return { ok: false, reason: 'bad_fill', message: 'marketId required on fill ref.' };
  }
  if (input.marketId !== run.marketId) {
    return {
      ok: false,
      reason: 'bad_fill',
      message: `Fill market ${input.marketId} does not match drill market ${run.marketId}`,
    };
  }

  let side: 'buy' | 'sell' | undefined;
  if (input.side !== undefined) {
    if (input.side !== 'buy' && input.side !== 'sell') {
      return { ok: false, reason: 'bad_fill', message: `Fill ${fillId}: side must be "buy" or "sell".` };
    }
    side = input.side;
  }

  let price: string | undefined;
  if (input.price !== undefined) {
    const parsed = publishedDecimal(input.price);
    if (!parsed.ok) return { ok: false, reason: 'bad_fill', message: `Fill ${fillId}: price ${parsed.why}.` };
    price = parsed.value;
  }

  let size: string | undefined;
  if (input.size !== undefined) {
    const parsed = publishedDecimal(input.size);
    if (!parsed.ok) return { ok: false, reason: 'bad_fill', message: `Fill ${fillId}: size ${parsed.why}.` };
    size = parsed.value;
  }

  const existing = run.fillRefs.find((f) => f.fillId === fillId);
  if (existing) {
    // Same fillId again: true idempotent only when body agrees. A re-send with a
    // different price/size/side would otherwise let paperDrillResult double-count
    // inflated PnL when the wire valued the raw input array instead of the run.
    if (existing.marketId !== input.marketId) {
      return {
        ok: false,
        reason: 'bad_fill',
        message: `Fill ${fillId}: marketId conflicts with prior attach`,
      };
    }
    if (side !== undefined && existing.side !== undefined && side !== existing.side) {
      return {
        ok: false,
        reason: 'bad_fill',
        message: `Fill ${fillId}: side conflicts with prior attach`,
      };
    }
    if (price !== undefined && existing.price !== undefined && price !== existing.price) {
      return {
        ok: false,
        reason: 'bad_fill',
        message: `Fill ${fillId}: price conflicts with prior attach`,
      };
    }
    if (size !== undefined && existing.size !== undefined && size !== existing.size) {
      return {
        ok: false,
        reason: 'bad_fill',
        message: `Fill ${fillId}: size conflicts with prior attach`,
      };
    }
    return { ok: true, run }; // idempotent same body
  }
  const ref: PaperFillRef = {
    fillId,
    marketId: input.marketId,
    recordedAt: input.recordedAt ?? new Date(),
    ...(side ? { side } : {}),
    ...(price ? { price } : {}),
    ...(size ? { size } : {}),
  };
  return {
    ok: true,
    run: { ...run, fillRefs: [...run.fillRefs, ref] },
  };
}

/**
 * Replay a whole drill from the caller's record of it, in one call.
 *
 * Academy holds no run state — that is deliberate and unchanged. What was
 * missing is that the loop's later halves (`completeDrillStep`,
 * `attachPaperFillRef`) had no way to be reached at all, so a workbook could be
 * STARTED over the wire and never finished. A stateless replay closes that
 * without inventing a store: the caller holds the events, academy holds the
 * RULES, and every refusal the step-by-step path would have raised is raised
 * here in the same order.
 *
 * It is not a shortcut past the gate. The market check, the workbook-kind
 * check, unknown steps and bad fills all still refuse, and a refusal anywhere
 * in the replay is the result of the whole replay.
 */
export function replayPaperDrill(input: {
  slug: string;
  kind: string | null | undefined;
  market: PaperMarketRef | null;
  completedStepIds?: readonly string[];
  fills?: readonly { fillId: string; marketId: string; recordedAt?: Date; side?: unknown; price?: unknown; size?: unknown }[];
  steps?: readonly DrillStep[];
}): DrillResult {
  const started = startPaperDrillForCatalogItem({
    slug: input.slug,
    kind: input.kind,
    market: input.market,
    ...(input.steps ? { steps: input.steps } : {}),
  });
  if (!started.ok) return started;

  let run = started.run;
  for (const stepId of input.completedStepIds ?? []) {
    const stepped = completeDrillStep(run, stepId);
    if (!stepped.ok) return stepped;
    run = stepped.run;
  }
  for (const fill of input.fills ?? []) {
    const attached = attachPaperFillRef(run, fill);
    if (!attached.ok) return attached;
    run = attached.run;
  }
  return { ok: true, run };
}

/** Read-only fill history — ids only, no PnL invent. */
export function listPaperFillRefs(run: DrillRun): readonly PaperFillRef[] {
  return run.fillRefs;
}

/**
 * L3 — pure drill progress snapshot (no invent complete status).
 * ratio is fixed 4dp decimal string; refused runs report ratio "0.0000".
 */
export type DrillProgress = {
  readonly simulated: true;
  readonly realMoney: false;
  readonly workbookSlug: string;
  readonly status: DrillRun['status'];
  readonly stepCount: number;
  readonly completedCount: number;
  readonly ratio: string;
  readonly fillCount: number;
};

export function drillProgress(run: DrillRun): DrillProgress {
  const stepCount = run.steps.length;
  const completedCount = run.status === 'refused' ? 0 : run.completedStepIds.length;
  const ratio = stepCount === 0 ? '0.0000' : (completedCount / stepCount).toFixed(4);
  return {
    simulated: true,
    realMoney: false,
    workbookSlug: run.workbookSlug,
    status: run.status,
    stepCount,
    completedCount,
    ratio,
    fillCount: run.fillRefs.length,
  };
}

/** Catalog kind gate — only workbook slugs may start paper drills. */
export function assertWorkbookKind(kind: string | null | undefined): boolean {
  return kind === 'workbook';
}

export function startPaperDrillForCatalogItem(input: {
  slug: string;
  kind: string | null | undefined;
  market: PaperMarketRef | null;
  steps?: readonly DrillStep[];
}): DrillResult {
  if (!assertWorkbookKind(input.kind)) {
    return {
      ok: false,
      reason: 'unknown_step',
      message: `Catalog item ${input.slug} is not a workbook — refuse paper drill invent.`,
    };
  }
  return startPaperDrill({
    workbookSlug: input.slug,
    market: input.market,
    steps: input.steps,
  });
}

/**
 * L3 — remaining step ids (not completed). Refused run → all step ids still remaining.
 * Never invents steps not on the run.
 */
export function remainingStepIds(run: DrillRun): readonly string[] {
  if (run.status === 'refused') return run.steps.map((s) => s.id);
  const done = new Set(run.completedStepIds);
  return run.steps.map((s) => s.id).filter((id) => !done.has(id));
}

/** L3 — true only when every step completed and status is complete. */
export function isDrillComplete(run: DrillRun): boolean {
  return run.status === 'complete' && remainingStepIds(run).length === 0;
}

/**
 * L3 — completed step count. Refused run → 0 (never invent progress).
 */
export function completedStepCount(run: DrillRun): number {
  if (run.status === 'refused') return 0;
  return run.completedStepIds.length;
}

/** L3 — paper fill ref count. Never invents fills. */
export function fillRefCount(run: DrillRun): number {
  return run.fillRefs.length;
}

/** L3 — true when drill was refused (no invent progress). */
export function isDrillRefused(run: DrillRun): boolean {
  return run.status === 'refused';
}

/** L3 — remaining step count. Refused → all steps remaining. */
export function remainingStepCount(run: DrillRun): number {
  return remainingStepIds(run).length;
}

/** L3 — total step count on the run (never invents steps). */
export function totalStepCount(run: DrillRun): number {
  return run.steps.length;
}

/**
 * L3 — true when run is open (in_progress) with remaining steps.
 * Refused / complete → false.
 */
export function isDrillInProgress(run: DrillRun): boolean {
  return run.status === 'active' && remainingStepIds(run).length > 0;
}

/** L3 — true when drill status is complete. */
export function isDrillStatusComplete(run: DrillRun): boolean {
  return run.status === 'complete';
}

/** L3 — true when drill status is active. */
export function isDrillStatusActive(run: DrillRun): boolean {
  return run.status === 'active';
}

/**
 * L3 — completed/total as fixed 4dp. Refused → "0.0000". Zero steps → "0.0000".
 */
export function drillCompletionRatio(run: DrillRun): string {
  return drillProgress(run).ratio;
}

/** L3 — market id on the run (never invent). */
export function drillMarketId(run: DrillRun): string {
  return run.marketId;
}

/** L3 — true when drill has zero fill refs. */
export function hasNoFillRefs(run: DrillRun): boolean {
  return run.fillRefs.length === 0;
}

/** L3 — symbol on the run (never invent). */
export function drillSymbol(run: DrillRun): string {
  return run.symbol;
}

/** L3 — workbook slug on the run. */
export function drillWorkbookSlug(run: DrillRun): string {
  return run.workbookSlug;
}

/**
 * L3 — true when active with at least one completed step (partial progress).
 */
export function hasPartialProgress(run: DrillRun): boolean {
  return run.status === 'active' && completedStepCount(run) > 0 && remainingStepCount(run) > 0;
}

/** L3 — true when fill refs exist. */
export function hasFillRefs(run: DrillRun): boolean {
  return run.fillRefs.length > 0;
}

/** L3 — first remaining step id. None → null. */
export function firstRemainingStepId(run: DrillRun): string | null {
  const rem = remainingStepIds(run);
  return rem[0] ?? null;
}

/** L3 — last remaining step id. None → null. */
export function lastRemainingStepId(run: DrillRun): string | null {
  const rem = remainingStepIds(run);
  return rem.length ? rem[rem.length - 1]! : null;
}

/**
 * L3 — progress ratio as number 0..1 from fixed string. Pure parse of drillProgress.
 */
export function drillCompletionRatioNumber(run: DrillRun): number {
  return Number(drillProgress(run).ratio);
}

/** L3 — first completed step id. None → null. */
export function firstCompletedStepId(run: DrillRun): string | null {
  return run.completedStepIds[0] ?? null;
}

/** L3 — last completed step id. None → null. */
export function lastCompletedStepId(run: DrillRun): string | null {
  const ids = run.completedStepIds;
  return ids.length ? ids[ids.length - 1]! : null;
}

/** L3 — true when no steps remain (complete or empty steps). */
export function hasNoRemainingSteps(run: DrillRun): boolean {
  return remainingStepCount(run) === 0;
}

/** L3 — true when zero steps on the run. */
export function isStepListEmpty(run: DrillRun): boolean {
  return run.steps.length === 0;
}

/** L3 — true when completion ratio number is 0. */
export function isDrillUntouched(run: DrillRun): boolean {
  return drillCompletionRatioNumber(run) === 0 && run.status === 'active';
}

/** L3 — true when completion ratio number is 1. */
export function isDrillFullyRatioed(run: DrillRun): boolean {
  return drillCompletionRatioNumber(run) === 1;
}

/** L3 — completed/total as percent integer 0..100 (UI only, not money). */
export function drillCompletionPercent(run: DrillRun): number {
  return Math.round(drillCompletionRatioNumber(run) * 100);
}

/** L3 — remaining/total as fixed 4dp. Zero steps → "0.0000". */
export function remainingStepRatio(run: DrillRun): string {
  const total = run.steps.length;
  if (total === 0) return '0.0000';
  return (remainingStepCount(run) / total).toFixed(4);
}

/** L3 — step count label. */
export function totalStepCountLabel(run: DrillRun): string {
  return String(totalStepCount(run));
}

/** L3 — completed count label. */
export function completedStepCountLabel(run: DrillRun): string {
  return String(completedStepCount(run));
}

/** L3 — remaining count label. */
export function remainingStepCountLabel(run: DrillRun): string {
  return String(remainingStepCount(run));
}

/** L3 — fill ref count label. */
export function fillRefCountLabel(run: DrillRun): string {
  return String(fillRefCount(run));
}

/** L3 — remaining step ids joined. Empty → "". */
export function remainingStepIdsJoined(run: DrillRun): string {
  return remainingStepIds(run).join(',');
}

/** L3 — completed step ids joined. Empty → "". */
export function completedStepIdsJoined(run: DrillRun): string {
  return run.completedStepIds.join(',');
}

/** L3 — status label string. */
export function drillStatusLabel(run: DrillRun): string {
  return run.status;
}

/** L3 — progress ratio label (fixed 4dp from drillProgress). */
export function drillRatioLabel(run: DrillRun): string {
  return drillProgress(run).ratio;
}

/** L3 — market id label. */
export function drillMarketIdLabel(run: DrillRun): string {
  return drillMarketId(run);
}

/** L3 — symbol label. */
export function drillSymbolLabel(run: DrillRun): string {
  return drillSymbol(run);
}

/** L3 — workbook slug label. */
export function drillWorkbookSlugLabel(run: DrillRun): string {
  return drillWorkbookSlug(run);
}

/** L3 — completion percent label. */
export function drillCompletionPercentLabel(run: DrillRun): string {
  return String(drillCompletionPercent(run));
}

/** L3 — progress snapshot for operator UI. */
export function drillProgressSnapshot(run: DrillRun): {
  readonly simulated: true;
  readonly realMoney: false;
  readonly status: DrillRun['status'];
  readonly total: number;
  readonly completed: number;
  readonly remaining: number;
  readonly ratio: string;
  readonly percent: number;
  readonly fills: number;
} {
  return {
    simulated: true,
    realMoney: false,
    status: run.status,
    total: totalStepCount(run),
    completed: completedStepCount(run),
    remaining: remainingStepCount(run),
    ratio: drillProgress(run).ratio,
    percent: drillCompletionPercent(run),
    fills: fillRefCount(run),
  };
}

/** L3 — true when completed + remaining equals total (refused: remaining = total). */
export function drillStepCountsConsistent(run: DrillRun): boolean {
  const s = drillProgressSnapshot(run);
  return s.total === s.completed + s.remaining || run.status === 'refused';
}

/** L3 — identity snapshot. */
export function drillIdentitySnapshot(run: DrillRun): {
  readonly simulated: true;
  readonly realMoney: false;
  readonly marketId: string;
  readonly symbol: string;
  readonly workbookSlug: string;
} {
  return {
    simulated: true,
    realMoney: false,
    marketId: run.marketId,
    symbol: run.symbol,
    workbookSlug: run.workbookSlug,
  };
}

/** L3 — true when drill is active with zero completion. */
export function isFreshActiveDrill(run: DrillRun): boolean {
  return run.status === 'active' && completedStepCount(run) === 0;
}

/**
 * L3 — drill board card.
 *
 * `simulated` is first and is a literal `true`. `realMoney` is literal `false`
 * (D26-P1-C4). Every other projection in this file is built from this card, so
 * there is no card, bar, status line or export that can be rendered without
 * both bits.
 */
export function drillBoardCard(run: DrillRun): {
  readonly simulated: true;
  readonly realMoney: false;
  readonly status: DrillRun['status'];
  readonly workbookSlug: string;
  readonly marketId: string;
  readonly symbol: string;
  readonly total: number;
  readonly completed: number;
  readonly remaining: number;
  readonly percent: number;
  readonly ratio: string;
  readonly fills: number;
  readonly fresh: boolean;
  readonly complete: boolean;
  readonly refused: boolean;
} {
  const snap = drillProgressSnapshot(run);
  return {
    simulated: run.simulated,
    realMoney: false,
    status: snap.status,
    workbookSlug: run.workbookSlug,
    marketId: run.marketId,
    symbol: run.symbol,
    total: snap.total,
    completed: snap.completed,
    remaining: snap.remaining,
    percent: snap.percent,
    ratio: snap.ratio,
    fills: snap.fills,
    fresh: isFreshActiveDrill(run),
    complete: isDrillComplete(run),
    refused: isDrillRefused(run),
  };
}

/** L3 — step progress bar fields only — still carries the money ban bits. */
export function drillStepBar(run: DrillRun): {
  readonly simulated: true;
  readonly realMoney: false;
  readonly completed: number;
  readonly remaining: number;
  readonly total: number;
  readonly percent: number;
} {
  const c = drillBoardCard(run);
  return {
    simulated: true,
    realMoney: false,
    completed: c.completed,
    remaining: c.remaining,
    total: c.total,
    percent: c.percent,
  };
}

/** L3 — true when drill card is refused. */
export function drillCardIsRefused(run: DrillRun): boolean {
  return drillBoardCard(run).refused;
}

/** L3 — true when drill card is fresh active. */
export function drillCardIsFresh(run: DrillRun): boolean {
  return drillBoardCard(run).fresh;
}

/** L3 — filter remaining step ids by substring. Empty needle → []. */
export function filterRemainingStepIds(run: DrillRun, needle: string): readonly string[] {
  const n = needle.trim();
  if (!n) return [];
  return remainingStepIds(run).filter((id) => id.includes(n));
}

/** L3 — filter completed step ids by substring. Empty needle → []. */
export function filterCompletedStepIds(run: DrillRun, needle: string): readonly string[] {
  const n = needle.trim();
  if (!n) return [];
  return run.completedStepIds.filter((id) => id.includes(n));
}

/** L3 — true when any remaining step matches needle. */
export function remainingStepsMatch(run: DrillRun, needle: string): boolean {
  return filterRemainingStepIds(run, needle).length > 0;
}

/** L3 — true when any completed step matches needle. */
export function completedStepsMatch(run: DrillRun, needle: string): boolean {
  return filterCompletedStepIds(run, needle).length > 0;
}

/** Owner-published page size. Blank / non-finite / <1 refuses. Never invent all.length. */
export function assertPaperListPageLimit(limit: number | null | undefined): number {
  if (limit === undefined || limit === null || typeof limit !== 'number' || !Number.isFinite(limit)) {
    throw new AcademyError('Paper drill list limit is unset — pass limit (never invent all.length)', 'academy.paper_list_limit_unset');
  }
  const n = Math.floor(limit);
  if (n < 1) {
    throw new AcademyError('Paper drill list limit is unset — pass limit (never invent all.length)', 'academy.paper_list_limit_unset');
  }
  return Math.min(200, n);
}

/** L3 — page remaining step ids. Limit must be published. Empty → []. */
export function pageRemainingStepIds(run: DrillRun, options: { offset?: number; limit?: number } = {}): readonly string[] {
  const all = remainingStepIds(run);
  const offset = Math.max(0, Math.floor(options.offset ?? 0));
  const limit = assertPaperListPageLimit(options.limit);
  return all.slice(offset, offset + limit);
}

/** L3 — page completed step ids. Limit must be published. Empty → []. */
export function pageCompletedStepIds(run: DrillRun, options: { offset?: number; limit?: number } = {}): readonly string[] {
  const all = run.completedStepIds;
  const offset = Math.max(0, Math.floor(options.offset ?? 0));
  const limit = assertPaperListPageLimit(options.limit);
  return all.slice(offset, offset + limit);
}

/** L3 — remaining steps page count. */
export function remainingStepsPageCount(run: DrillRun, pageSize: number): number {
  if (!Number.isFinite(pageSize) || pageSize < 1) return 0;
  const n = remainingStepCount(run);
  if (n === 0) return 0;
  return Math.ceil(n / Math.floor(pageSize));
}

/** L3 — reverse remaining step ids. Empty → []. */
export function reverseRemainingStepIds(run: DrillRun): readonly string[] {
  return [...remainingStepIds(run)].reverse();
}

/** L3 — remaining steps only in left run vs right remaining set. */
export function remainingStepsOnlyLeft(left: DrillRun, right: DrillRun): readonly string[] {
  const r = new Set(remainingStepIds(right));
  return remainingStepIds(left).filter((id) => !r.has(id));
}

/** L3 — completed steps only in left run. */
export function completedStepsOnlyLeft(left: DrillRun, right: DrillRun): readonly string[] {
  const r = new Set(right.completedStepIds);
  return left.completedStepIds.filter((id) => !r.has(id));
}

/** L3 — completion percent delta (left - right). */
export function drillPercentDelta(left: DrillRun, right: DrillRun): number {
  return drillCompletionPercent(left) - drillCompletionPercent(right);
}

/** L3 — true when both drills same status. */
export function drillsSameStatus(left: DrillRun, right: DrillRun): boolean {
  return left.status === right.status;
}

/** L3 — safe page remaining steps with clamped bounds. */
export function safePageRemainingStepIds(run: DrillRun, offset: number, limit: number): readonly string[] {
  if (!Number.isFinite(offset) || !Number.isFinite(limit)) return [];
  const all = remainingStepIds(run);
  const o = Math.max(0, Math.min(all.length, Math.floor(offset)));
  const l = Math.max(0, Math.min(all.length - o, Math.floor(limit)));
  return all.slice(o, o + l);
}

/** L3 — clamp remaining-steps page index. */
export function clampRemainingStepsPageIndex(run: DrillRun, pageIndex: number, pageSize: number): number {
  const pages = remainingStepsPageCount(run, pageSize);
  if (pages === 0) return 0;
  if (!Number.isFinite(pageIndex)) return 0;
  return Math.max(0, Math.min(pages - 1, Math.floor(pageIndex)));
}

/** L3 — remaining step ids at clamped page. */
export function remainingStepIdsAtPage(run: DrillRun, pageIndex: number, pageSize: number): readonly string[] {
  if (!Number.isFinite(pageSize) || pageSize < 1) return [];
  const idx = clampRemainingStepsPageIndex(run, pageIndex, pageSize);
  const size = Math.floor(pageSize);
  return safePageRemainingStepIds(run, idx * size, size);
}

/** L3 — true when remaining-steps page is valid. */
export function isValidRemainingStepsPage(run: DrillRun, pageIndex: number, pageSize: number): boolean {
  const pages = remainingStepsPageCount(run, pageSize);
  if (pages === 0) return false;
  if (!Number.isFinite(pageIndex)) return false;
  const i = Math.floor(pageIndex);
  return i >= 0 && i < pages;
}

/** L3 — export lines for remaining steps: stepId,state=remaining. Empty → []. */
export function remainingStepsExportLines(run: DrillRun): readonly string[] {
  return remainingStepIds(run).map((id) => `${id},remaining`);
}

/** L3 — export lines for completed steps. Empty → []. */
export function completedStepsExportLines(run: DrillRun): readonly string[] {
  return run.completedStepIds.map((id) => `${id},completed`);
}

/** L3 — drill steps export header. */
export function drillStepsExportHeader(): string {
  return 'stepId,state';
}

/**
 * L3 — the label a drill export leads with.
 *
 * A `#` comment so it is not a data row, but ahead of the header so it is the
 * first thing a human opening the file reads. An export outlives the screen it
 * was downloaded from; the label has to outlive it too.
 */
export function drillStepsExportLabelLine(): string {
  return '# simulated=1 venue=paper realMoney=0 — paper trading drill, no value moved';
}

/** L3 — full drill steps export (label, header, completed then remaining). */
export function drillStepsExportText(run: DrillRun): string {
  return [drillStepsExportLabelLine(), drillStepsExportHeader(), ...completedStepsExportLines(run), ...remainingStepsExportLines(run)].join(
    '\n',
  );
}

/**
 * L3 — parse "stepId,state". Invalid → null.
 */
export function parseDrillStepsExportLine(line: string): { readonly stepId: string; readonly state: 'remaining' | 'completed' } | null {
  const t = line.trim();
  if (!t || t.startsWith('#') || t === drillStepsExportHeader()) return null;
  const parts = t.split(',');
  if (parts.length !== 2) return null;
  const stepId = parts[0]!.trim();
  const state = parts[1]!.trim();
  if (!stepId) return null;
  if (state !== 'remaining' && state !== 'completed') return null;
  return { stepId, state };
}

/** L3 — count valid drill steps export data lines. */
export function countDrillStepsExportDataLines(text: string): number {
  return text
    .split('\n')
    .map((l) => parseDrillStepsExportLine(l))
    .filter((r) => r !== null).length;
}

/** L3 — true when drill steps export has header (past any leading `#` label). */
export function drillStepsExportHasHeader(text: string): boolean {
  const first =
    text
      .split('\n')
      .map((l) => l.trim())
      .find((l) => l && !l.startsWith('#')) ?? '';
  return first === drillStepsExportHeader();
}

/** L3 — true when the export still carries its simulated label. */
export function drillStepsExportIsLabelled(text: string): boolean {
  return text.split('\n')[0]?.trim() === drillStepsExportLabelLine();
}

/** L3 — round-trip drill steps export (completed+remaining+header). */
export function drillStepsExportRoundTripOk(run: DrillRun): boolean {
  const expected = 1 + completedStepCount(run) + remainingStepCount(run);
  return expected === 1 + countDrillStepsExportDataLines(drillStepsExportText(run));
}

/**
 * L3 — one-line drill status.
 *
 * Leads with `simulated=1 realMoney=0`. A status line is the thing that gets
 * pasted into a ticket, and a pasted line arrives with no surrounding screen
 * to explain it — so the label has to survive the copy, or it was never a label.
 */
export function drillStatusLine(run: DrillRun): string {
  const c = drillBoardCard(run);
  return `simulated=1 realMoney=0 status=${c.status} done=${c.completed}/${c.total} percent=${c.percent}`;
}

/** L3 — true when drill is fresh (0%). */
export function drillStatusLineIsFresh(run: DrillRun): boolean {
  return drillStatusLine(run).includes('percent=0') && run.status === 'active';
}

/** L3 — detailed drill status. */
export function drillStatusLineDetailed(run: DrillRun): string {
  const c = drillBoardCard(run);
  return `simulated=1 realMoney=0 status=${c.status} workbook=${c.workbookSlug} market=${c.marketId} done=${c.completed}/${c.total} fills=${c.fills} refused=${c.refused ? '1' : '0'}`;
}

/** L3 — token count on detailed drill status. */
export function drillStatusLineTokenCount(run: DrillRun): number {
  return drillStatusLineDetailed(run).split(/\s+/).filter(Boolean).length;
}

/**
 * L3 — parse "simulated=1 realMoney=0 status=S done=C/T percent=P". Invalid → null.
 *
 * Both `simulated=1` and `realMoney=0` are REQUIRED. A line missing either is
 * not a drill status line this parser will accept — which means a stripped
 * label fails to round-trip rather than being read as a live figure.
 */
export function parseDrillStatusLine(line: string): {
  readonly simulated: true;
  readonly realMoney: false;
  readonly status: string;
  readonly completed: number;
  readonly total: number;
  readonly percent: number;
} | null {
  const m = line.trim().match(/^simulated=1 realMoney=0 status=(\S+) done=(\d+)\/(\d+) percent=(\d+)$/);
  if (!m) return null;
  return {
    simulated: true,
    realMoney: false,
    status: m[1]!,
    completed: Number(m[2]),
    total: Number(m[3]),
    percent: Number(m[4]),
  };
}

/** L3 — true when status line matches run. */
export function drillStatusLineMatches(run: DrillRun): boolean {
  const p = parseDrillStatusLine(drillStatusLine(run));
  if (!p) return false;
  const c = drillBoardCard(run);
  return p.status === c.status && p.completed === c.completed && p.total === c.total && p.percent === c.percent;
}

/** L3 — parse detailed drill status. Invalid → null. */
export function parseDrillStatusLineDetailed(line: string): {
  readonly simulated: true;
  readonly realMoney: false;
  readonly status: string;
  readonly workbook: string;
  readonly market: string;
  readonly completed: number;
  readonly total: number;
  readonly fills: number;
  readonly refused: boolean;
} | null {
  const m = line
    .trim()
    .match(/^simulated=1 realMoney=0 status=(\S+) workbook=(\S+) market=(\S+) done=(\d+)\/(\d+) fills=(\d+) refused=([01])$/);
  if (!m) return null;
  return {
    simulated: true,
    realMoney: false,
    status: m[1]!,
    workbook: m[2]!,
    market: m[3]!,
    completed: Number(m[4]),
    total: Number(m[5]),
    fills: Number(m[6]),
    refused: m[7] === '1',
  };
}

/** L3 — true when done counts are within total. */
export function drillStatusLineConsistent(line: string): boolean {
  const p = parseDrillStatusLine(line);
  if (!p) return false;
  return p.completed <= p.total && p.percent >= 0 && p.percent <= 100;
}

/** L3 — true when remaining step count is within [min,max]. Invalid → false. */
export function remainingStepCountInRange(run: DrillRun, min: number, max: number): boolean {
  if (!Number.isFinite(min) || !Number.isFinite(max) || min > max) return false;
  const n = remainingStepCount(run);
  return n >= min && n <= max;
}

/** L3 — true when completion percent is at least threshold. */
export function drillPercentAtLeast(run: DrillRun, percent: number): boolean {
  if (!Number.isFinite(percent)) return false;
  return drillCompletionPercent(run) >= percent;
}

/** L3 — clamp remaining-steps page size into [1, remaining] (empty → 1). */
export function clampRemainingStepsPageSize(run: DrillRun, pageSize: number): number {
  if (!Number.isFinite(pageSize)) return 1;
  const total = Math.max(1, remainingStepCount(run));
  return Math.max(1, Math.min(total, Math.floor(pageSize)));
}

/** L3 — true when fill count is at most n. */
export function fillCountAtMost(run: DrillRun, n: number): boolean {
  if (!Number.isFinite(n)) return false;
  return fillRefCount(run) <= n;
}
