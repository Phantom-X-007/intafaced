/**
 * D26-P1-O3 — identity grounding is either wired or a named refuse.
 *
 * Unwired INTERNAL_SERVICE_SECRET is not `plane_dark`. Dark means identity was
 * pointed at and did not answer. Unwired means the S2S secret was never
 * supplied, so every account would look unread. That must say
 * `support.identity_grounding_unwired` — not silent dark, not `/health` ok.
 *
 * Compose that lists IDENTITY_URL (the grounding loop) without
 * `*internal-secret` / INTERNAL_SERVICE_SECRET is the same lie at deploy.
 */

export const IDENTITY_GROUNDING_UNWIRED = 'support.identity_grounding_unwired' as const;

export class IdentityGroundingUnwiredError extends Error {
  readonly code = IDENTITY_GROUNDING_UNWIRED;
  constructor() {
    super(
      'identity grounding unwired: INTERNAL_SERVICE_SECRET missing (named refuse, not plane_dark)',
    );
    this.name = 'IdentityGroundingUnwiredError';
  }
}

export type IdentityGroundingProof =
  | { readonly wired: true; readonly refuse: null }
  | { readonly wired: false; readonly refuse: typeof IDENTITY_GROUNDING_UNWIRED };

export function identityGroundingProof(secret: string | undefined | null): IdentityGroundingProof {
  const wired = typeof secret === 'string' && secret.trim().length > 0;
  return wired
    ? { wired: true, refuse: null }
    : { wired: false, refuse: IDENTITY_GROUNDING_UNWIRED };
}

/**
 * True when a svc-support compose block claims the identity grounding loop
 * (IDENTITY_URL) but does not pass the S2S secret. Tests must fail the real
 * file when this is true.
 */
export function composePretendsGroundingLoopServing(svcSupportBlock: string): boolean {
  const claimsIdentityLoop = /^\s+IDENTITY_URL\s*:/m.test(svcSupportBlock);
  const hasSecret =
    /\*internal-secret/.test(svcSupportBlock) || /^\s+INTERNAL_SERVICE_SECRET\s*:/m.test(svcSupportBlock);
  return claimsIdentityLoop && !hasSecret;
}
