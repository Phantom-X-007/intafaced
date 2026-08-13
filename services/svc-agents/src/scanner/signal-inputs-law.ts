/**
 * D26-P0-11 — Scanner signal inputs law.
 * D26-P1-A3 — Ranked signals only after P0-11; else refuse (no invent alpha).
 *
 * P0-11 is sealed on tip (`docs/adr/2026-08-12-scanner-signal-inputs-law.md`).
 * Production default is the sealed v1 recipe. Explicit unpublished / null still refuses.
 * Agents must not invent score formulas, "hot" lists, or market alpha.
 */

/** Board id this gate exists to honour. */
export const P0_11_BOARD_ID = 'D26-P0-11' as const;

/** Loud residual — named so ops / tests can grep without reading prose. */
export const SCANNER_SIGNAL_INPUTS_LAW_RESIDUAL =
  'D26-P0-11 scanner signal inputs law is owner-only — refuse-closed (never invent rankings / market alpha)';

/**
 * Named inputs that MAY contribute to a sealed ranking.
 * Owner publishes the set — agents do not extend it mid-flight.
 */
export type ScannerSignalInputKind = 'last' | 'volume24h' | 'change24hBps' | 'spread' | 'funding';

/**
 * Sealed ranking recipes only. The Stage-1 fixture recipe is gated behind this
 * id so a new score formula cannot sneak in without an owner seal.
 */
export type ScannerRankingRecipeId = 'abs_change_x_log_volume';

export type ScannerSignalInputsLaw =
  | { readonly published: false }
  | {
      readonly published: true;
      /** Explicit seal marker — mirrors the board id so greps stay honest. */
      readonly p0_11: 'sealed';
      /** Mutable array shape so tRPC/zod input types accept sealed fixtures. */
      readonly allowedInputs: ScannerSignalInputKind[];
      readonly rankingRecipeId: ScannerRankingRecipeId;
    };

/** Explicit unpublished — still refuse. Not the production default. */
export const UNPUBLISHED_SCANNER_SIGNAL_INPUTS_LAW: ScannerSignalInputsLaw = { published: false };

/**
 * Sealed v1 production law (D26-P0-11 ADR). Allowlist + recipe named there.
 * Omitted law on public doors resolves to this. Do not invent a second recipe.
 */
export const SEALED_ABS_CHANGE_X_LOG_VOLUME_LAW: Extract<ScannerSignalInputsLaw, { published: true }> = {
  published: true,
  p0_11: 'sealed',
  allowedInputs: ['last', 'volume24h', 'change24hBps'] as ScannerSignalInputKind[],
  rankingRecipeId: 'abs_change_x_log_volume',
};

/** Tip / production default after P0-11 sealed — same object as the fixture. */
export const PRODUCTION_SCANNER_SIGNAL_INPUTS_LAW: ScannerSignalInputsLaw = SEALED_ABS_CHANGE_X_LOG_VOLUME_LAW;

/**
 * `undefined` (caller omitted) → production sealed law.
 * `null` or `{ published: false }` → still refuse (explicit unpublished).
 */
export function resolveScannerSignalInputsLaw(law: ScannerSignalInputsLaw | null | undefined): ScannerSignalInputsLaw | null {
  if (law === undefined) return PRODUCTION_SCANNER_SIGNAL_INPUTS_LAW;
  return law;
}

/** Inputs the Stage-1 recipe actually reads — must all be on the sealed allowlist. */
export const ABS_CHANGE_X_LOG_VOLUME_REQUIRED_INPUTS: readonly ScannerSignalInputKind[] = ['last', 'volume24h', 'change24hBps'];

export type ScannerSignalInputsGateOk = {
  readonly status: 'ok';
  readonly allowedInputs: readonly ScannerSignalInputKind[];
  readonly rankingRecipeId: ScannerRankingRecipeId;
};

export type ScannerSignalInputsGateRefuseReason =
  'signal_inputs_law_blank' | 'inputs_empty' | 'ranking_recipe_unknown' | 'required_inputs_missing';

export type ScannerSignalInputsGateRefuse = {
  readonly status: 'refuse';
  readonly reason: ScannerSignalInputsGateRefuseReason;
  readonly userMessageKey: 'agents.scanner.tier_closed';
  readonly residual: typeof SCANNER_SIGNAL_INPUTS_LAW_RESIDUAL;
  readonly boardId: typeof P0_11_BOARD_ID;
};

export type ScannerSignalInputsGateResult = ScannerSignalInputsGateOk | ScannerSignalInputsGateRefuse;

/**
 * Gate ranked signals on sealed P0-11 signal-inputs law.
 * Blank / unpublished / empty allowlist / unknown recipe / missing required
 * inputs for the named recipe → refuse-closed (no invent rankings).
 */
export function scannerSignalInputsGate(law: ScannerSignalInputsLaw | null | undefined): ScannerSignalInputsGateResult {
  if (!law || law.published !== true || law.p0_11 !== 'sealed') {
    return {
      status: 'refuse',
      reason: 'signal_inputs_law_blank',
      userMessageKey: 'agents.scanner.tier_closed',
      residual: SCANNER_SIGNAL_INPUTS_LAW_RESIDUAL,
      boardId: P0_11_BOARD_ID,
    };
  }

  if (law.allowedInputs.length === 0) {
    return {
      status: 'refuse',
      reason: 'inputs_empty',
      userMessageKey: 'agents.scanner.tier_closed',
      residual: SCANNER_SIGNAL_INPUTS_LAW_RESIDUAL,
      boardId: P0_11_BOARD_ID,
    };
  }

  if (law.rankingRecipeId !== 'abs_change_x_log_volume') {
    return {
      status: 'refuse',
      reason: 'ranking_recipe_unknown',
      userMessageKey: 'agents.scanner.tier_closed',
      residual: SCANNER_SIGNAL_INPUTS_LAW_RESIDUAL,
      boardId: P0_11_BOARD_ID,
    };
  }

  const allowed = new Set(law.allowedInputs);
  for (const required of ABS_CHANGE_X_LOG_VOLUME_REQUIRED_INPUTS) {
    if (!allowed.has(required)) {
      return {
        status: 'refuse',
        reason: 'required_inputs_missing',
        userMessageKey: 'agents.scanner.tier_closed',
        residual: SCANNER_SIGNAL_INPUTS_LAW_RESIDUAL,
        boardId: P0_11_BOARD_ID,
      };
    }
  }

  return {
    status: 'ok',
    allowedInputs: law.allowedInputs,
    rankingRecipeId: law.rankingRecipeId,
  };
}

export function isScannerSignalInputsGateOk(result: ScannerSignalInputsGateResult): result is ScannerSignalInputsGateOk {
  return result.status === 'ok';
}

/** Ops / test board card — never invents a green open when P0-11 is blank. */
export function scannerSignalInputsGateBoardCard(result: ScannerSignalInputsGateResult): {
  readonly ok: boolean;
  readonly reason: string | null;
  readonly boardId: typeof P0_11_BOARD_ID;
  readonly recipeId: string | null;
  readonly inputCount: number;
} {
  if (result.status === 'ok') {
    return {
      ok: true,
      reason: null,
      boardId: P0_11_BOARD_ID,
      recipeId: result.rankingRecipeId,
      inputCount: result.allowedInputs.length,
    };
  }
  return {
    ok: false,
    reason: result.reason,
    boardId: P0_11_BOARD_ID,
    recipeId: null,
    inputCount: 0,
  };
}

export function scannerSignalInputsGateStatusLine(result: ScannerSignalInputsGateResult): string {
  if (result.status === 'ok') {
    return `ok=1 board=${P0_11_BOARD_ID} recipe=${result.rankingRecipeId} inputs=${result.allowedInputs.length}`;
  }
  return `ok=0 board=${P0_11_BOARD_ID} reason=${result.reason} residual=D26-P0-11_refuse_closed`;
}
