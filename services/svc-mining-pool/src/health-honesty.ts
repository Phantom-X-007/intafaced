/**
 * Health never probes ledger or Postgres. submitShare / epoch jobs do.
 *
 * `ledger: 'wired'` / `pg: 'wired'` sold a constructed client (env URL + secret)
 * as a live book. Configured is not wired. Process liveness stays `ok: true`.
 *
 * `mining.pg_unavailable` matches window-store — same refuse, this door does not import it.
 */
export const MINING_LEDGER_UNAVAILABLE = 'mining.ledger_unavailable' as const;
export const MINING_LEDGER_UNPROBED = 'mining.ledger_unprobed' as const;
export const MINING_PG_UNAVAILABLE = 'mining.pg_unavailable' as const;
export const MINING_PG_UNPROBED = 'mining.pg_unprobed' as const;

export type MiningDepHonesty =
  | { readonly status: 'absent'; readonly code: typeof MINING_LEDGER_UNAVAILABLE | typeof MINING_PG_UNAVAILABLE }
  | { readonly status: 'configured'; readonly code: typeof MINING_LEDGER_UNPROBED | typeof MINING_PG_UNPROBED };

export type MiningHealthHonesty = {
  readonly ok: true;
  readonly service: 'svc-mining-pool';
  readonly ledger: MiningDepHonesty;
  readonly pg: MiningDepHonesty;
  readonly jobs: readonly string[];
};

export function ledgerHonesty(configured: boolean): MiningDepHonesty {
  if (!configured) return { status: 'absent', code: MINING_LEDGER_UNAVAILABLE };
  return { status: 'configured', code: MINING_LEDGER_UNPROBED };
}

export function pgHonesty(configured: boolean): MiningDepHonesty {
  if (!configured) return { status: 'absent', code: MINING_PG_UNAVAILABLE };
  return { status: 'configured', code: MINING_PG_UNPROBED };
}

export function miningHealthHonesty(input: {
  readonly ledgerConfigured: boolean;
  readonly pgConfigured: boolean;
  readonly jobs?: readonly string[];
}): MiningHealthHonesty {
  return {
    ok: true,
    service: 'svc-mining-pool',
    ledger: ledgerHonesty(input.ledgerConfigured),
    pg: pgHonesty(input.pgConfigured),
    jobs: [...(input.jobs ?? [])],
  };
}
