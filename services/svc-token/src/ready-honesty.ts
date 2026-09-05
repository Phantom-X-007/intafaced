/**
 * GET /ready never sells process liveness as a live ledger or a live job.
 *
 * A nonempty LEDGER_URL is config, not a ping. This door does not fetch
 * svc-ledger. Job flags are env pins, not cron proof. Process readiness
 * stays `ready: true`.
 */
export const TOKEN_LEDGER_UNWIRED = 'token.ledger_unwired' as const;
export const TOKEN_LEDGER_UNPROBED = 'token.ledger_unprobed' as const;

export type TokenLedgerReadyHonesty =
  | { readonly status: 'absent'; readonly code: typeof TOKEN_LEDGER_UNWIRED }
  | { readonly status: 'configured'; readonly code: typeof TOKEN_LEDGER_UNPROBED };

export function tokenLedgerReadyHonesty(ledgerUrl: string | undefined | null): TokenLedgerReadyHonesty {
  if (typeof ledgerUrl !== 'string' || ledgerUrl.trim().length === 0) {
    return { status: 'absent', code: TOKEN_LEDGER_UNWIRED };
  }
  return { status: 'configured', code: TOKEN_LEDGER_UNPROBED };
}

export type TokenReadyHonesty = {
  readonly ready: true;
  readonly ledger: TokenLedgerReadyHonesty;
  readonly emissionsEnabled: boolean;
  readonly emissionsAutoTick: boolean;
  readonly yieldJobEnabled: boolean;
  readonly buybackJobEnabled: boolean;
};

export function tokenReadyHonesty(input: {
  readonly ledgerUrl: string | undefined | null;
  readonly emissionsEnabled: boolean;
  readonly emissionsAutoTick: boolean;
  readonly yieldJobEnabled: boolean;
  readonly buybackJobEnabled: boolean;
}): TokenReadyHonesty {
  return {
    ready: true,
    ledger: tokenLedgerReadyHonesty(input.ledgerUrl),
    emissionsEnabled: input.emissionsEnabled,
    emissionsAutoTick: input.emissionsAutoTick,
    yieldJobEnabled: input.yieldJobEnabled,
    buybackJobEnabled: input.buybackJobEnabled,
  };
}
