/**
 * GET /ready must not hide KYC vault / ledger payout behind argon2,
 * and must not hide registration / waitlist pins behind `{ready:true, argon2}`.
 *
 * Blank IDENTITY_KYC_DOC_KEY / LEDGER_URL is named unwired — procedures already
 * refuse `kyc_doc.unwired` and `affiliate.payout.ledger_unwired`. A nonempty
 * key or URL is config, not a live vault or ledger. This door does not fetch.
 * Same class as support secret-set (#4026).
 *
 * Waitlist / referral flags are the actual `INTAFACED_FLAG_*` env pin
 * (`boolean | null`), not `isEnabled` (that mixes LAUNCH_DROP into the pin).
 * Unset → null (drop clock). Empty / off → false. Same on-list as
 * packages/config `envOverride`. LAUNCH_DROP is the configured drop enum.
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

/** Same drop enum as packages/config `baseEnvSchema.LAUNCH_DROP`. */
export type IdentityLaunchDrop = '0' | 'I' | 'II' | 'III' | 'IV' | 'V';

/**
 * Env pin for `INTAFACED_FLAG_WAITLIST_ENABLED` / `INTAFACED_FLAG_REFERRAL_QUEUE`.
 * Unset/null → null (follow drop). Any other string uses the config on-list.
 * Empty string is a pin-off, matching `envOverride` (not invented drop-on).
 */
export function flagEnvPin(raw: string | undefined | null): boolean | null {
  if (raw === undefined || raw === null) return null;
  return ['1', 'true', 'on', 'yes'].includes(raw.toLowerCase());
}

export type IdentityReadyHonesty = {
  readonly ready: true;
  readonly kycVault: KycVaultHonesty;
  readonly ledgerPayout: LedgerPayoutHonesty;
  /** Env pin. Unset → null (not invented open). Explicit false stays false. */
  readonly registrationOpen: boolean | null;
  readonly waitlistEnabled: boolean | null;
  readonly referralQueue: boolean | null;
  readonly launchDrop: IdentityLaunchDrop;
};

export function identityReadyHonesty(input: {
  readonly kycDocKey: string | undefined | null;
  readonly ledgerUrl: string | undefined | null;
  readonly registrationOpen: boolean | null | undefined;
  readonly waitlistEnabled: string | undefined | null;
  readonly referralQueue: string | undefined | null;
  readonly launchDrop: IdentityLaunchDrop;
}): IdentityReadyHonesty {
  return {
    ready: true,
    kycVault: kycVaultHonesty(input.kycDocKey),
    ledgerPayout: ledgerPayoutHonesty(input.ledgerUrl),
    registrationOpen: input.registrationOpen ?? null,
    waitlistEnabled: flagEnvPin(input.waitlistEnabled),
    referralQueue: flagEnvPin(input.referralQueue),
    launchDrop: input.launchDrop,
  };
}
