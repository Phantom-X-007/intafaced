/**
 * D26-P1-O3 — identity grounding is either a named refuse or unprobed.
 *
 * Unwired INTERNAL_SERVICE_SECRET is not `plane_dark`. Dark means identity was
 * pointed at and did not answer. Unwired means the S2S secret was never
 * supplied, so every account would look unread. That must say
 * `support.identity_grounding_unwired` — not silent dark.
 *
 * A nonempty secret is not wired. `/health` never fetches identity. Secret-set
 * is config (same class as ops URL-set ≠ live). Per-request account reads probe;
 * this door does not.
 *
 * Compose that lists IDENTITY_URL (the grounding loop) without
 * `*internal-secret` / INTERNAL_SERVICE_SECRET is the same lie at deploy.
 */

export const IDENTITY_GROUNDING_UNWIRED = 'support.identity_grounding_unwired' as const;
export const IDENTITY_GROUNDING_UNPROBED = 'support.identity_grounding_unprobed' as const;
export const SUPPORT_STORE_UNPROBED = 'support.store_unprobed' as const;

export class IdentityGroundingUnwiredError extends Error {
  readonly code = IDENTITY_GROUNDING_UNWIRED;
  constructor() {
    super('identity grounding unwired: INTERNAL_SERVICE_SECRET missing (named refuse, not plane_dark)');
    this.name = 'IdentityGroundingUnwiredError';
  }
}

export function identitySecretSet(secret: string | undefined | null): boolean {
  return typeof secret === 'string' && secret.trim().length > 0;
}

export type IdentityGroundingHonesty =
  | { readonly status: 'absent'; readonly code: typeof IDENTITY_GROUNDING_UNWIRED }
  | { readonly status: 'configured'; readonly code: typeof IDENTITY_GROUNDING_UNPROBED };

/** Secret presence only. Health never probes; `wired` is always false. */
export function identityGroundingHonesty(secret: string | undefined | null): IdentityGroundingHonesty {
  if (!identitySecretSet(secret)) return { status: 'absent', code: IDENTITY_GROUNDING_UNWIRED };
  return { status: 'configured', code: IDENTITY_GROUNDING_UNPROBED };
}

export type SupportStoreHonesty = {
  readonly status: 'configured';
  readonly code: typeof SUPPORT_STORE_UNPROBED;
};

/** `/ready` does not ping Postgres. Engine is config, not a live store. */
export function supportStoreHonesty(): SupportStoreHonesty {
  return { status: 'configured', code: SUPPORT_STORE_UNPROBED };
}

export type SupportHealthHonesty = {
  readonly ok: true;
  readonly service: string;
  readonly identityGroundingWired: false;
  readonly identitySecretSet: boolean;
  readonly identityGroundingRefuse: typeof IDENTITY_GROUNDING_UNWIRED | null;
  readonly identity: IdentityGroundingHonesty;
};

export function supportHealthHonesty(input: {
  readonly serviceName: string;
  readonly identitySecret: string | undefined | null;
}): SupportHealthHonesty {
  const identity = identityGroundingHonesty(input.identitySecret);
  return {
    ok: true,
    service: input.serviceName,
    identityGroundingWired: false,
    identitySecretSet: identitySecretSet(input.identitySecret),
    identityGroundingRefuse: identity.status === 'absent' ? identity.code : null,
    identity,
  };
}

/**
 * True when a svc-support compose block claims the identity grounding loop
 * (IDENTITY_URL) but does not pass the S2S secret. Tests must fail the real
 * file when this is true.
 */
export function composePretendsGroundingLoopServing(svcSupportBlock: string): boolean {
  const claimsIdentityLoop = /^\s+IDENTITY_URL\s*:/m.test(svcSupportBlock);
  const hasSecret = /\*internal-secret/.test(svcSupportBlock) || /^\s+INTERNAL_SERVICE_SECRET\s*:/m.test(svcSupportBlock);
  return claimsIdentityLoop && !hasSecret;
}
