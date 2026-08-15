# R-AUTH-07 — JWT signing secret has no overlap window (Class X)

**Mountain:** D26-P3-06 residual · **Class X — do not implement in an agent PR**  
**Owner doc:** [`docs/SECRET-ROTATION-READINESS-2026-08-03.md`](../SECRET-ROTATION-READINESS-2026-08-03.md) §2.3  
**Files:** `packages/config/src/env.ts` (`JWT_ACCESS_SECRET`) · `packages/auth/src/tokens.ts` (`kid` is API-key id, not a signing-key id)

## Failure mode

There is one HS256 secret. `verifyAccessToken` accepts that secret only. Rotation:

- **Immediate invalidation** of every outstanding access JWT (refresh still works; next refresh mints under the new secret). Interactive users see a mass blip up to TTL. Fine if planned.
- **No dual-verify window.** A rolling fleet where some pods have the new secret and some the old will 401 apparently randomly until the roll finishes. Operators delay rotation because of that, which is how disclosed `dev-only-*` values survive (SECRET-ROTATION OWNER-8).
- `kid` in the access JWT means **which API key minted it**, not which signing key. Reusing `kid` for rotation would collide with leak-tracing. A future overlap design needs a **different claim** (or a key set in config), not a silent reuse of `kid`.

This is secret-handling + production cutover. Agents do not generate, paste, or rotate the value. They do not add a second default.

## Done-bar (owner)

Follow SECRET-ROTATION: confirm no hosted env runs `dev-only-*`; rotate `JWT_ACCESS_SECRET` in lockstep on **every** verifier (`svc-identity` mint, `svc-edge` verify, `svc-ledger` / `svc-ws` if they verify). Optional later: dual-secret accept list with an expiry — still Class X to enable in prod.

## Agent stop line

If a PR to “add JWT key rotation” appears without the owner: close it or strip it to a design ADR. No secret material in git.
