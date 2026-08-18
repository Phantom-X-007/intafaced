/**
 * Paper trading Stage-3 — ops enable/kill without touching live trade
 * (TRK-academy.paper-trading).
 *
 * Academy consumer kill-switch only. Live markets / placeOrder stay on trade.
 * No prices, fills, balances, or ledger posts here.
 */

export const PAPER_OPS_ENV_KEY = 'ACADEMY_PAPER_TRADING_ENABLED' as const;
export const PAPER_OPS_FLAG_ID = 'academy.paper-trading' as const;

export type PaperOpsStatus = {
  readonly enabled: boolean;
  readonly flagId: typeof PAPER_OPS_FLAG_ID;
  readonly envKey: typeof PAPER_OPS_ENV_KEY;
  /** Live trade path is never gated by this flag. */
  readonly liveTradeUnaffected: true;
  /** D26-P1-C4 — this surface is paper ops, never live money. */
  readonly simulated: true;
  readonly venue: 'paper';
  readonly realMoney: false;
};

/** Default true — missing / undefined means drills are on. */
export function isPaperOpsEnabled(enabled: boolean | undefined): boolean {
  return enabled !== false;
}

export function paperOpsStatus(enabled: boolean | undefined): PaperOpsStatus {
  return {
    enabled: isPaperOpsEnabled(enabled),
    flagId: PAPER_OPS_FLAG_ID,
    envKey: PAPER_OPS_ENV_KEY,
    liveTradeUnaffected: true,
    simulated: true,
    venue: 'paper',
    realMoney: false,
  };
}

export function paperOpsDisabledMessage(): string {
  return 'Paper trading drills are disabled by ops — live trade unchanged.';
}
