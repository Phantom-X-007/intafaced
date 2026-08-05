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

export type DrillRun = {
  readonly workbookSlug: string;
  readonly marketId: string;
  readonly symbol: string;
  readonly steps: readonly DrillStep[];
  readonly completedStepIds: readonly string[];
  readonly status: 'active' | 'complete' | 'refused';
  readonly refuseReason?: 'not_paper' | 'no_market' | 'unknown_step';
};

export type DrillResult =
  | { readonly ok: true; readonly run: DrillRun }
  | { readonly ok: false; readonly reason: 'not_paper' | 'no_market' | 'unknown_step'; readonly message: string };

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
