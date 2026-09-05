/**
 * GET /ready must not hide KYC vault / ledger payout behind argon2.
 *
 * Blank IDENTITY_KYC_DOC_KEY / LEDGER_URL is named unwired — procedures already
 * refuse `kyc_doc.unwired` and `affiliate.payout.ledger_unwired`. A nonempty
 * key or URL is config, not a live vault or ledger. This door does not fetch.
 * Same class as support secret-set (#4026).
 */
export const KYC_VAULT_UNWIRED = 'kyc_doc.unwired' as const;
export const KYC_VAULT_UNPROBED = 'kyc_doc.unprobed' as const;
export const LEDGER_PAYOUT_UNWIRED = 'affiliate.payout.ledger_unwired' as const;
export const LEDGER_PAYOUT_UNPROBED = 'affiliate.payout.ledger_unprobed' as const;

function materialPresent(value: string | undefined | null): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

export type IdentityPlaneHonesty<Unwired extends string, Unprobed extends string> =
  { readonly status: 'absent'; readonly code: Unwired } | { readonly status: 'configured'; readonly code: Unprobed };

export type KycVaultHonesty = IdentityPlaneHonesty<typeof KYC_VAULT_UNWIRED, typeof KYC_VAULT_UNPROBED>;
export type LedgerPayoutHonesty = IdentityPlaneHonesty<typeof LEDGER_PAYOUT_UNWIRED, typeof LEDGER_PAYOUT_UNPROBED>;

/** Key presence only. /ready never opens the vault. */
export function kycVaultHonesty(keyMaterial: string | undefined | null): KycVaultHonesty {
  if (!materialPresent(keyMaterial)) return { status: 'absent', code: KYC_VAULT_UNWIRED };
  return { status: 'configured', code: KYC_VAULT_UNPROBED };
}

/** URL presence only. /ready never posts payout or pings svc-ledger. */
export function ledgerPayoutHonesty(ledgerUrl: string | undefined | null): LedgerPayoutHonesty {
  if (!materialPresent(ledgerUrl)) return { status: 'absent', code: LEDGER_PAYOUT_UNWIRED };
  return { status: 'configured', code: LEDGER_PAYOUT_UNPROBED };
}

export type IdentityReadyHonesty = {
  readonly ready: true;
  readonly kycVault: KycVaultHonesty;
  readonly ledgerPayout: LedgerPayoutHonesty;
};

export function identityReadyHonesty(input: {
  readonly kycDocKey: string | undefined | null;
  readonly ledgerUrl: string | undefined | null;
}): IdentityReadyHonesty {
  return {
    ready: true,
    kycVault: kycVaultHonesty(input.kycDocKey),
    ledgerPayout: ledgerPayoutHonesty(input.ledgerUrl),
  };
}
