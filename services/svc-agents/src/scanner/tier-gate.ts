/**
 * Market Scanner Stage-2 — tier-gated signal depth.
 *
 * Spec: docs/ops/trk/agents.scanner.md Stage 2.
 * Product law for free / staked / invite signal depth is still unsigned.
 * Until a published matrix is supplied by callers, this gate is **refuse-closed**
 * — we do not invent free-tier depth or premium unlocks.
 */

export type ScannerTierGrant = {
  /** Max ranked signals returned for this tier. */
  readonly maxSignals: number;
  /** Tools this tier may invoke. */
  readonly tools: readonly string[];
};

export type ScannerTierLaw =
  | { readonly published: false }
  | {
      readonly published: true;
      /** Caller-supplied matrix: userTier → depth + tools. Never defaulted here. */
      readonly matrix: Readonly<Record<string, ScannerTierGrant>>;
    };

export type ScannerTierGateOk = {
  readonly status: 'ok';
  readonly userTier: string;
  readonly maxSignals: number;
  readonly allowedTools: readonly string[];
};

export type ScannerTierGateRefuse = {
  readonly status: 'refuse';
  readonly reason: 'tier_law_blank' | 'tier_not_granted' | 'depth_invalid';
  readonly userMessageKey: 'agents.scanner.tier_closed';
};

export type ScannerTierGateResult = ScannerTierGateOk | ScannerTierGateRefuse;

/**
 * Gate scanner signal depth on published product-law matrix.
 * Blank / unpublished / empty matrix → refuse-closed (no invent).
 */
export function scannerTierGate(input: { law: ScannerTierLaw | null | undefined; userTier: string }): ScannerTierGateResult {
  const tier = input.userTier.trim();
  const law = input.law;

  if (!law || law.published !== true) {
    return {
      status: 'refuse',
      reason: 'tier_law_blank',
      userMessageKey: 'agents.scanner.tier_closed',
    };
  }

  const keys = Object.keys(law.matrix);
  if (keys.length === 0) {
    return {
      status: 'refuse',
      reason: 'tier_law_blank',
      userMessageKey: 'agents.scanner.tier_closed',
    };
  }

  if (!tier) {
    return {
      status: 'refuse',
      reason: 'tier_not_granted',
      userMessageKey: 'agents.scanner.tier_closed',
    };
  }

  const grant = law.matrix[tier];
  if (!grant) {
    return {
      status: 'refuse',
      reason: 'tier_not_granted',
      userMessageKey: 'agents.scanner.tier_closed',
    };
  }

  if (!Number.isInteger(grant.maxSignals) || grant.maxSignals < 1) {
    return {
      status: 'refuse',
      reason: 'depth_invalid',
      userMessageKey: 'agents.scanner.tier_closed',
    };
  }

  return {
    status: 'ok',
    userTier: tier,
    maxSignals: grant.maxSignals,
    allowedTools: grant.tools,
  };
}

/** True when the gate is open. */
export function isScannerTierGateOk(result: ScannerTierGateResult): result is ScannerTierGateOk {
  return result.status === 'ok';
}

/** Board card for ops / tests. */
export function scannerTierGateBoardCard(result: ScannerTierGateResult): {
  readonly ok: boolean;
  readonly reason: string | null;
  readonly maxSignals: number;
  readonly toolCount: number;
} {
  if (result.status === 'ok') {
    return {
      ok: true,
      reason: null,
      maxSignals: result.maxSignals,
      toolCount: result.allowedTools.length,
    };
  }
  return { ok: false, reason: result.reason, maxSignals: 0, toolCount: 0 };
}
