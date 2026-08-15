# R-AUTH-04 — `bank:card` is documented as step-up and never minted

**Mountain:** D26-P3-06 residual · **Class:** Judgment (issuance is product law, not a guess)  
**Files:** `packages/auth/src/scopes.ts` (`WITHHELD_FROM_SESSION['bank:card']`, `INTERACTIVE_ONLY_SCOPES`) · `services/svc-identity/src/auth/auth-service.ts` (`STEP_UP_SCOPES = ['trade:withdraw']` only)

## Failure mode

The withheld table says card spend is an “interactive-only **step-up** surface (§9, §18).” The only step-up mint adds `trade:withdraw`. Nothing in `svc-identity` (or a grep of the repo) issues `bank:card` to a principal.

Two ways this goes wrong later:

1. **Outage with a comment.** Card spend guards `requireScope(..., 'bank:card')` forever. The product looks “2FA gated” and is actually unreachable. Same class of bug step-up was built to close for withdraw.
2. **Unsafe grant.** A later PR, seeing the outage, adds `bank:card` to `SESSION_SCOPE_LIST` or to an API key / merchant grant **without** the TOTP/WebAuthn ceremony. Interactive-only still demands `mfa: true`, but login MFA is not the same as a five-minute elevate: a long-lived MFA session JWT (900–3600s) then spends the card without a fresh challenge.

`pay:payout` is **not** this bug — it is merchant onboarding, withheld from user sessions on purpose.

## Done-bar for a future PR

Denon picks one, in writing:

- **A.** Extend `STEP_UP_SCOPES` (or a named `stepUp` input allowlist) to include `bank:card` when §18 card issuance is live, same 300s TTL + live session + burned second factor; tests that a default session cannot hit the card door.
- **B.** Change the withheld reason to “not issued until §18 ships; not a step-up surface” so the comment stops lying.

Do not invent card product behaviour in an auth-only PR. Do not grant `bank:card` to API keys (DB CHECK already forbids it).
