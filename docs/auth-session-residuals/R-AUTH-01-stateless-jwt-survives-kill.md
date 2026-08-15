# R-AUTH-01 — Access JWT survives session kill and API-key revoke

**Mountain:** D26-P3-06 residual · **Class:** Judgment (implementation is a design fork, not a drive-by patch)  
**Files:** `packages/auth/src/tokens.ts` (`verifyAccessToken`) · `services/svc-identity/src/auth/auth-service.ts` (`logout`, `logoutAll`, `refresh` reuse, `revokeApiKey`, `freezeIdentity`, `stepUp`) · `packages/contracts/src/edge.ts` (forwards `sid`, does not check it)

## Failure mode

An operator or user **successfully** kills the credential in Postgres. Every subsequent **refresh** or **API-key exchange** fails. Every already-issued **access JWT** continues to authorise until `exp`.

Concrete cases:

1. Stolen refresh is reused → all sessions revoked → thief’s **current** access JWT (and the victim’s) still work for up to `JWT_ACCESS_TTL_SECONDS` (default 900, max 3600). If that JWT was a step-up token, it still carries `trade:withdraw` for up to 300s.
2. User hits logout-all after XSS. The XSS-held Bearer still withdraws / trades until expiry.
3. `apiKeys.revoke` or `freezeIdentity` bulk-revoke. Bots cannot `exchange` again. The JWT they already hold — `sid` = key id, `kid` set, `mfa: false` — still opens every scope on the key, including merchant `pay:write` if granted.
4. Highest-value doors that call `verifyAccessToken` **directly** (no extra session lookup): `svc-ledger` operator HTTP (freeze/unfreeze/reconcile) and `svc-edge` admin (kill-switch, treasury). Same window.

`sid` and `jti` exist on the token and on the forwarded principal. Nothing that authorises reads them. They look like revocation hooks. They are not.

## Why this is not an agent “fix” in this PR

Three honest options, costs differ:

1. **Accept** the window. Document it in `verifyAccessToken` (delete or annotate `jti`/`sid` as correlators, not controls). Shorten default TTL if the window is the product.
2. **Sid denylist** (or session-row check) inside `verifyAccessToken` — spends the stateless property every service relies on; needs a store every replica can see (multi-replica kill is already a named §13 park on edge).
3. **Narrow denylist** only on ledger operator HTTP + edge admin. Round-trip is affordable; blast radius is the platform. Still a Denon design call.

Do not add a second book of “revoked tokens” inside a random service. Do not implement Class X secret rotation as a substitute.

## Proof already on tip

- `docs/audit/2026-08-08-packages-auth.md` parked this exact break.
- Identity tests prove reuse burns sessions and revoke stops **exchange**. They do not (and cannot, without a denylist) prove a pre-issued JWT dies.

## Done-bar for a future PR

A test that: mint access JWT → `logout` / `revokeApiKey` / `freezeIdentity` → **same** JWT is refused at `verifyAccessToken` **or** at the two direct-verify doors, with the chosen option written in the PR body. Until then, operator runbooks must say “kill is refresh/exchange, not Bearer.”
