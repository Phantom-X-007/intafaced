/**
 * Tournament Stage-3 — IFC prize pools refuse-closed (TRK-academy.tournaments).
 *
 * Class N honesty gate. Ledger fund/payout recipes are Class M and do not exist
 * on this path. Academy never invents prize balances, pool amounts, or IFC
 * credits. Every prize-shaped intent refuses closed until a Class M PR lands.
 */

import { TournamentError } from './ladder.js';

export const PRIZE_REFUSE_CODE = 'academy.prize_refuse_closed' as const;

export type PrizeIntentKind = 'fund_pool' | 'payout' | 'escrow' | 'clawback' | 'invent_balance';

export type PrizeRefuse = {
  readonly status: 'refuse';
  readonly code: typeof PRIZE_REFUSE_CODE;
  readonly kind: PrizeIntentKind;
  readonly message: string;
  /** Always false — academy holds no prize book. */
  readonly academyHoldsPrizeBalance: false;
  /** Always false — no ledger recipe on this Stage. */
  readonly ledgerRecipeReady: false;
};

export type PrizeDecision = PrizeRefuse;

const MESSAGE = 'IFC prize pools are refuse-closed — no invent pools, no academy balances, Class M ledger recipes only';

/**
 * Decide any prize-shaped intent. Always refuse — never invent a pool or payout.
 */
export function decidePrizeIntent(kind: PrizeIntentKind): PrizeDecision {
  return {
    status: 'refuse',
    code: PRIZE_REFUSE_CODE,
    kind,
    message: MESSAGE,
    academyHoldsPrizeBalance: false,
    ledgerRecipeReady: false,
  };
}

/** Fund a prize pool — refuse-closed. */
export function refuseFundPrizePool(): PrizeDecision {
  return decidePrizeIntent('fund_pool');
}

/** Pay winners from a pool — refuse-closed. */
export function refusePrizePayout(): PrizeDecision {
  return decidePrizeIntent('payout');
}

/** Escrow IFC for a season — refuse-closed. */
export function refusePrizeEscrow(): PrizeDecision {
  return decidePrizeIntent('escrow');
}

/** Clawback after re-rank — refuse-closed (no prior pay to invent). */
export function refusePrizeClawback(): PrizeDecision {
  return decidePrizeIntent('clawback');
}

/** Invent an IFC / prize balance row in academy — refuse-closed. */
export function refuseInventPrizeBalance(): PrizeDecision {
  return decidePrizeIntent('invent_balance');
}

/**
 * Hard assert for lifecycle edges (freeze / end). Throws if a caller tries to
 * attach prize amounts — never silently drop money fields.
 */
export function assertNoPrizeAttachment(payload: unknown): void {
  if (payload == null || typeof payload !== 'object') return;
  const o = payload as Record<string, unknown>;
  const banned = ['prize', 'prizePool', 'prizeAmount', 'ifcPrize', 'payout', 'escrowAmount', 'poolBalance'] as const;
  for (const key of banned) {
    if (key in o && o[key] != null) {
      throw new TournamentError(MESSAGE, 'academy.season_invalid');
    }
  }
}

/** True when a decision is the closed refuse (always, for this Stage). */
export function isPrizeRefuseClosed(decision: PrizeDecision): boolean {
  return decision.status === 'refuse' && decision.code === PRIZE_REFUSE_CODE && decision.ledgerRecipeReady === false;
}

/** Operator-facing one-liner. */
export function prizeRefuseStatusLine(): string {
  return `prizes=refuse_closed code=${PRIZE_REFUSE_CODE} ledger=0`;
}
