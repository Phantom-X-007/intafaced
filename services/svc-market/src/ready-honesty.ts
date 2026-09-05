/**
 * GET /ready never probes Postgres, ledger, token, or identity.
 *
 * `{ ready: true }` next to a constructed client sold process liveness as a
 * live shop. A URL + `postgres()` / HTTP client is config. This door does not
 * SELECT 1 or fetch. Process `ready: true` stays liveness.
 *
 * `market.stake_unavailable` matches stake-source — same refuse, this door
 * does not import it. `market.commission_not_configured` matches commerce.
 */

export const MARKET_PG_UNAVAILABLE = 'market.pg_unavailable' as const;
export const MARKET_PG_UNPROBED = 'market.pg_unprobed' as const;
export const MARKET_LEDGER_UNAVAILABLE = 'market.ledger_unavailable' as const;
export const MARKET_LEDGER_UNPROBED = 'market.ledger_unprobed' as const;
export const MARKET_STAKE_UNAVAILABLE = 'market.stake_unavailable' as const;
export const MARKET_TOKEN_UNPROBED = 'market.token_unprobed' as const;
export const MARKET_IDENTITY_UNWIRED = 'market.identity_unwired' as const;
export const MARKET_IDENTITY_UNPROBED = 'market.identity_unprobed' as const;
export const MARKET_COMMISSION_NOT_CONFIGURED = 'market.commission_not_configured' as const;

export type MarketDepHonesty =
  | {
      readonly status: 'absent';
      readonly code:
        typeof MARKET_PG_UNAVAILABLE | typeof MARKET_LEDGER_UNAVAILABLE | typeof MARKET_STAKE_UNAVAILABLE | typeof MARKET_IDENTITY_UNWIRED;
    }
  | {
      readonly status: 'configured';
      readonly code:
        typeof MARKET_PG_UNPROBED | typeof MARKET_LEDGER_UNPROBED | typeof MARKET_TOKEN_UNPROBED | typeof MARKET_IDENTITY_UNPROBED;
    };

export type MarketCommissionHonesty =
  { readonly status: 'configured' } | { readonly status: 'unset'; readonly code: typeof MARKET_COMMISSION_NOT_CONFIGURED };

function urlIsSet(url: string | undefined): boolean {
  return (url?.trim() ?? '').length > 0;
}

export function pgHonesty(configured: boolean): MarketDepHonesty {
  if (!configured) return { status: 'absent', code: MARKET_PG_UNAVAILABLE };
  return { status: 'configured', code: MARKET_PG_UNPROBED };
}

export function ledgerHonesty(configured: boolean): MarketDepHonesty {
  if (!configured) return { status: 'absent', code: MARKET_LEDGER_UNAVAILABLE };
  return { status: 'configured', code: MARKET_LEDGER_UNPROBED };
}

export function tokenHonesty(configured: boolean): MarketDepHonesty {
  if (!configured) return { status: 'absent', code: MARKET_STAKE_UNAVAILABLE };
  return { status: 'configured', code: MARKET_TOKEN_UNPROBED };
}

export function identityHonesty(configured: boolean): MarketDepHonesty {
  if (!configured) return { status: 'absent', code: MARKET_IDENTITY_UNWIRED };
  return { status: 'configured', code: MARKET_IDENTITY_UNPROBED };
}

export function commissionHonesty(configured: boolean): MarketCommissionHonesty {
  if (!configured) return { status: 'unset', code: MARKET_COMMISSION_NOT_CONFIGURED };
  return { status: 'configured' };
}

export type MarketReadyHonesty = {
  readonly ready: true;
  readonly stage: 'commerce-subscriptions';
  readonly pg: MarketDepHonesty;
  readonly ledger: MarketDepHonesty;
  readonly token: MarketDepHonesty;
  readonly identity: MarketDepHonesty;
  readonly commission: MarketCommissionHonesty;
};

export function marketReadyHonesty(input: {
  readonly databaseUrl?: string;
  readonly ledgerUrl?: string;
  readonly tokenUrl?: string;
  readonly identityUrl?: string;
  readonly commissionConfigured: boolean;
}): MarketReadyHonesty {
  return {
    ready: true,
    stage: 'commerce-subscriptions',
    pg: pgHonesty(urlIsSet(input.databaseUrl)),
    ledger: ledgerHonesty(urlIsSet(input.ledgerUrl)),
    token: tokenHonesty(urlIsSet(input.tokenUrl)),
    identity: identityHonesty(urlIsSet(input.identityUrl)),
    commission: commissionHonesty(input.commissionConfigured),
  };
}
