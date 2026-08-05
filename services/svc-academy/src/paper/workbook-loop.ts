/**
 * Paper trading Stage-2 — workbook drill loop (TRK-academy.paper-trading).
 *
 * Academy-side pure loop: requires an explicit paper market flag from trade.
 * Never invents fills, prices, or balances. Live markets refuse the drill.
 * Ledger isolation remains trade service law (Stage-1); this module does not
 * call ledger.
 */

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
 * Opaque fill reference supplied by trade — academy never invents price/size.
 * amount/price fields are intentionally absent here (money truth stays on trade).
 */
export type PaperFillRef = {
  readonly fillId: string;
  readonly marketId: string;
  readonly recordedAt: Date;
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
 * Attach a trade-supplied fill id to the drill run.
 * Refuses empty fillId, market mismatch, and invent of amount/price (not in type).
 * Idempotent on fillId.
 */
export function attachPaperFillRef(run: DrillRun, input: { fillId: string; marketId: string; recordedAt?: Date }): DrillResult {
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
  if (run.fillRefs.some((f) => f.fillId === fillId)) {
    return { ok: true, run }; // idempotent
  }
  const ref: PaperFillRef = {
    fillId,
    marketId: input.marketId,
    recordedAt: input.recordedAt ?? new Date(),
  };
  return {
    ok: true,
    run: { ...run, fillRefs: [...run.fillRefs, ref] },
  };
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
