# Auth / session security review — D26-P3-06

**Tracker:** D26-P3-06 · **Class:** Judgment · **Date:** 2026-08-15  
**Tip reviewed:** `1723273b` (`origin/main` at worktree cut)  
**Lane:** `denon-d26-p3-06-auth-review`  
**Leverage:** Phase A IN — existing `@intafaced/auth` + `svc-identity` credential plane. No second auth stack. No Vue. No Class X implementation.

**Done-bar this document satisfies:** written review of JWT/session, step-up, API keys, WebAuthn, key kill, and cookie/CORS *interaction*. Residual tickets are named files with failure modes, not “harden later.”

**Not this mountain:**

- **D26-P3-02** threat model — do not rewrite. Fiat / `wallet_rpc` / vendor Java stay there.
- **D26-P3-07** Edge / CORS production origin contract — **cite, do not rewrite.** Current law lives in `services/svc-edge/src/cors.ts` and `services/svc-edge/README.md`. Staging/prod origin lists are a deploy decision; this review only records how auth credentials interact with that door.
- **D26-P3-10** incident runbook — do not rewrite.
- **Class X** — secret values, prod go-live, licence, sanctions content. Rotation of `JWT_ACCESS_SECRET` is named as an owner ticket, not executed here.

**Prior audits this review does not duplicate:** [`docs/audit/2026-08-08-packages-auth.md`](audit/2026-08-08-packages-auth.md) (token `exp` requiredClaims — landed #1078; `sid`/`jti` unread — still true). [`docs/SECURITY-WHEN-PLAIN.md`](SECURITY-WHEN-PLAIN.md) — Track A gates now; Strix later, non-prod only.

---

## 0 · Verdict

The interactive and bot credential planes are **real and mostly honest**. Refresh rotation with reuse-burn is correctly committed outside the failing transaction. Step-up exists and is the only mint of `trade:withdraw`. API keys cannot hold interactive-only scopes at create time **or** in the database CHECK. WebAuthn challenges are kind-bound so a login assertion cannot buy withdraw.

The load-bearing remaining hole is one mechanism, not six:

**`verifyAccessToken` is fully stateless.** Logout, logout-all, freeze, refresh-reuse burn, and API-key revoke all mutate Postgres. None of those mutations are consulted when an already-issued access JWT is presented. `sid` and `jti` are minted, forwarded on the edge principal, and **read by nothing that authorises.** Default access TTL is **900s** (cap **3600s**). A thief, a stolen bot JWT, or a freeze that has already run still has full token authority until `exp`.

That is a policy call (accept / shorten TTL / denylist), not a one-line patch. It is **R-AUTH-01**. Implementing a platform-wide denylist would spend the stateless-authorisation property `packages/auth` is built on. Do not “just add Redis” in a craft PR.

---

## 1 · JWT / session

| Promise | Tip fact | Status |
| ------- | -------- | ------ |
| Short-lived HS256 access JWT; opaque rotating refresh | `packages/auth/src/tokens.ts` + `AuthService.refresh` | **Holds** |
| `exp` required (jose `requiredClaims`) | #1078; `exp <= now` fail-closed | **Holds** |
| Refresh hash only stored (48-byte CSPRNG, sha256) | `generateRefreshToken` / `generateToken(48)` | **Holds** |
| Reuse of a rotated refresh burns **every** session for that user | Revocation committed **outside** the txn so a throw cannot roll it back | **Holds** (correct, non-obvious) |
| Frozen/closed user cannot mint from a still-valid refresh | `auth.account_frozen`; presented session revoked | **Holds** |
| Access JWT checked against session row / denylist | `verifyAccessToken` has no DB | **Broken for kill** — **R-AUTH-01** |
| `sid` / `jti` protect replay or revoke | Claims present; unused at authorise | **Promise-shaped** — same ticket |
| Signing-secret rotation with overlap | One `JWT_ACCESS_SECRET`, no `kid` for signing keys (`kid` = API-key id) | **Class X residual** — **R-AUTH-07** |

Refresh TTL default is 30 days (`JWT_REFRESH_TTL_SECONDS`, max 90 days). That is the long-lived half. Theft of a **refresh** is the serious event; reuse detection is the control. Theft of an **access** JWT is a 15-minute (or up to 60-minute) fully privileged window, including `mfa: true` and whatever scopes were minted — including a step-up `trade:withdraw` token.

Refresh after step-up **drops** `trade:withdraw` (`issueSession` / `refresh` both use `defaultScopes()`). That is the correct fail-closed shape: elevation does not survive rotation.

**Do not** store money in the token. Scopes and KYC `tier` are capability snapshots at issue time; jurisdiction is re-checked per request at the edge (`ctx.region`). That split is load-bearing and should stay.

---

## 2 · Step-up

Tracker `identity.step-up` is `done`. The router is mounted. The note that a TOTP code is “replayable inside its validity window” is **stale on this tip**.

| Control | Tip fact |
| ------- | -------- |
| `trade:withdraw` withheld from `SESSION_SCOPE_LIST` | `WITHHELD_FROM_SESSION` — XSS-stolen ordinary access token cannot drain |
| Mint path | `AuthService.stepUp` — live session + exactly one of TOTP/recovery **or** WebAuthn |
| Session must still be unrevoked and unexpired **at mint** | Logout then step-up with a leftover access JWT is refused (`auth.session_invalid`) |
| Elevated TTL | `min(accessTtl, 300)` seconds |
| Elevated `mfa` | Forced `true` on the new token |
| TOTP replay | `consumeTotpCode` burns `totp_last_step` under `FOR UPDATE`; same code cannot buy login **and** step-up |
| WebAuthn step-up | Challenge kind `step-up`; login assertion cannot be reused (`challenges.take(..., 'step-up')`) |
| Recovery codes | Same `totpCode` field; TOTP tried first so a live authenticator never burns recovery; recovery **is** burned |

**Failure mode that remains:** mint checks the session; **use does not.** If the attacker already holds the five-minute withdraw JWT, `logout` / freeze does not stop withdraw until `exp`. Same as R-AUTH-01, sharper because the token carries `trade:withdraw`.

**Scope hole (named, not “later”):** `WITHHELD_FROM_SESSION['bank:card']` calls it an “interactive-only **step-up** surface.” `STEP_UP_SCOPES` is **only** `trade:withdraw`. Nothing in `svc-identity` mints `bank:card`. Card spend is either unreachable or will be granted later without this ceremony. **R-AUTH-04.**

`pay:payout` is merchant-onboarding + interactive-only, not user step-up. That split is documented and is not a silent hole.

`admin:treasury` stays operator-only. Do not put it on `stepUp`.

---

## 3 · API keys

Tracker `identity.apikeys` is `done` (D26-P1-I1 / D-S-11). Create / list / revoke / exchange are mounted.

| Control | Tip fact | Status |
| ------- | -------- | ------ |
| Shown once; only hash stored | `generateApiKey` — `ifc_` / `ifc_test_` + 24-byte secret | **Holds** |
| Cannot exceed grantor | `assertDelegatableScopes(requested, grantorScopes)` — grantor from **session**, not client body | **Holds** (the old self-KYC via `admin:compliance` on a key is closed) |
| Interactive-only refused in code **and** DB | `assertKeyScopesAllowed` + `api_keys_no_withdraw_ck` (`trade:withdraw`, `admin:treasury`, `bank:card`, `pay:payout`) | **Holds** |
| Exchange mints JWT, `mfa: false`, **no refresh** | Bot re-exchanges; withdraw scopes stay unreachable even if smuggled | **Holds** |
| `key_env` live/sandbox on JWT | Pay public-api routing; absence = live, never silent sandbox upgrade | **Holds** |
| Frozen user cannot exchange | Status check after verify | **Holds** |
| Domain whitelist | Empty = unrestricted (bots). Non-empty + missing Origin = fail-closed | **Mostly holds**; suffix over-grant **R-AUTH-05** |
| `revokeApiKey` / freeze bulk-revoke | Row `revoked = true`; exchange stops | **Holds for new exchange** |
| Already-exchanged access JWT dies on revoke | Stateless verify; `sid` is key id and unused | **Fails** — **R-AUTH-01** |

Freeze bulk-revokes keys **and** sessions. Exchange after freeze fails. Outstanding JWTs do not. The comment on `freezeIdentity` (“Revoke every open session so freeze is not delayed until token expiry”) is **true for refresh** and **false for access**.

---

## 4 · WebAuthn

Tracker `identity.webauthn` is `done` (PR #93). Implementation is in-tree (ES256 only), not a blind `@simplewebauthn` import — same sovereignty reason as TOTP.

| Control | Tip fact | Status |
| ------- | -------- | ------ |
| UV required; attestation `none`; ES256 only | Other algs refused | **Holds** |
| Register requires live session; auth (passwordless) is public | Router split | **Holds** |
| Challenge single-use + kind (`register` / `auth` / `step-up`) | `WebAuthnChallengeStore.take` | **Holds** |
| Counter updated; clone that resets counter fails | `verifyAuthenticationResponse` | **Holds** |
| Kill switch `WEBAUTHN_ENABLED=false` | Router FORBIDDEN | **Holds** |
| Origin on `clientDataJSON` | `WEBAUTHN_ORIGIN` (comma-separated), default `http://localhost:3000` | **Holds locally** |
| Same origin list as browser CORS | **Independent env** from `EDGE_ALLOWED_ORIGINS` | **Drift** — **R-AUTH-03** (P3-07 owns the CORS half) |

`WEBAUTHN_RP_ID` defaults to `localhost`. Staging/prod must set RP ID + origin to the real registrable domain. That is a **deploy** fact, not a code bug. Wrong RP ID in prod is a Class X / ops misconfig: passkeys enrol against the wrong origin and never work — or worse, enrol against a default that an attacker page on localhost cannot actually hit in prod. P3-07’s origin contract should name WebAuthn as a **consumer** of the same production origin set. This review does not write that contract.

---

## 5 · Kill of keys (and sessions)

Surfaces that claim to kill credentials:

| Surface | What it actually kills | What still lives |
| ------- | ---------------------- | ---------------- |
| `auth.logout` | That refresh row | Access JWT until `exp` |
| `auth.logoutAll` | All refresh rows | All outstanding access JWTs |
| Refresh reuse | All sessions + `reuse_detected_at` | Outstanding access JWTs (including step-up) |
| `apiKeys.revoke` | That key row; future `exchange` | JWTs already exchanged from that key |
| `freezeIdentity` | User status, sessions, sub-accounts, API keys | Outstanding access JWTs (operator HTTP on ledger/edge is in this window) |

**Honest operator sentence:** “We killed the key” means “the bot cannot mint a **new** JWT.” It does not mean “the JWT in the wild is dead.”

A middle path already suggested in the 2026-08-08 auth audit: denylist **only** on direct-verify treasury surfaces (`svc-ledger` operator HTTP, `svc-edge` admin). That is still a design decision. Ticket: R-AUTH-01. Do not invent a second auth package to hold the list.

---

## 6 · Cookie / CORS interaction (cite P3-07 — do not rewrite CORS)

**P3-07 mountain:** Edge / CORS production posture — staging/prod origin contract documented ([`DENON-HARD-PARALLEL-BOARD-2026-08-09.md`](DENON-HARD-PARALLEL-BOARD-2026-08-09.md) §7). **This PR does not write that contract and does not edit `svc-edge/src/cors.ts`.**

Auth facts that P3-07 must not contradict:

1. **Today there is no session cookie.** Access tokens live in memory on `apps/web` (HUMAN Vue lane — not edited here) and travel as `Authorization: Bearer`. Edge **never emits** `Access-Control-Allow-Credentials`. Allowlist is never `*`. That pairing is deliberate (`cors.ts` opening comment). The vendored shell `:8090` is same-origin through nginx and is correctly **absent** from CORS defaults.

2. **§13 socket named in edge README:** refresh token in an httpOnly cookie. The day that lands:
   - every browser call becomes credentialed;
   - CORS credentials + exact origin (never `*`) must be re-taken in `cors.ts`;
   - `svc-ws` private upgrade currently does **no Origin check**, which is safe **only** because a memory-held Bearer cannot be caused by a foreign page. Browsers **will** attach cookies on WebSocket upgrade with no preflight.
   - Failure: cross-site websocket hijack of a private positions stream, and CSRF on state-changing tRPC if cookies are ambient.

   Ticket: **R-AUTH-02**. Implementation is blocked on P3-07’s origin contract plus a deliberate cookie PR. **Do not ship the cookie first.**

3. **Private WS already puts the access JWT in `?access_token=`** because browsers cannot set `Authorization` on the upgrade. Query tokens land in access logs, reverse-proxy logs, and `Referer` if mis-linked. That is the cost of “no cookie.” Ticket: **R-AUTH-06**. A cookie would remove the query param **and** create R-AUTH-02. Pick one; do not get both.

4. **API-key `domain_whitelist` is not CORS.** It is a hostname suffix check on `apiKeys.exchange`. CORS is the browser preflight door; whitelist is a bot/browser-key extra. They can disagree. P3-07 should not be asked to make them one list without a written product rule. Suffix over-grant is **R-AUTH-05**.

---

## 7 · What is verified (do not “fix” these)

- Scope implication does not escalate into `trade:withdraw` / `admin:treasury` / `bank:card` / `pay:payout` / `admin:compliance`.
- Interactive-only scopes require `principal.mfa` in `requireScope` against the **required** scope (not the grant list).
- Bearer parser is one regex; both direct consumers use it.
- Preflight is not a route oracle (edge CORS — P3-07’s code, already audited 2026-08-08).
- `/admin/*` is not a CORS surface — operator freeze is not one XSS on a random origin away **today**.

## 8 · Tracker honesty (no `features.mjs` edit)

`identity.step-up` note still claims TOTP replay inside the validity window. Tip burns the step. That is a P4-09 tracker-honesty item, not a security patch. Mountain events only — this review does not thrash the tracker.

## 9 · Class X — named, not done

| Item | Why X | Ticket |
| ---- | ----- | ------ |
| Rotate `JWT_ACCESS_SECRET` in any hosted env | Secret value + blast radius (every access JWT dies at once; no overlap) | R-AUTH-07 · see [`SECRET-ROTATION-READINESS-2026-08-03.md`](SECRET-ROTATION-READINESS-2026-08-03.md) |
| Production `WEBAUTHN_RP_ID` / `WEBAUTHN_ORIGIN` / `EDGE_ALLOWED_ORIGINS` values | Deploy origins are P3-07 + owner | Cite P3-07; do not invent hostnames here |
| Strix / live pentest against auth | [`SECURITY-WHEN-PLAIN.md`](SECURITY-WHEN-PLAIN.md) — later, non-prod, explicit go | Not a residual ticket for agents |

---

## 10 · Residual index

| ID | File | Failure mode (one line) |
| -- | ---- | ----------------------- |
| R-AUTH-01 | [`auth-session-residuals/R-AUTH-01-stateless-jwt-survives-kill.md`](auth-session-residuals/R-AUTH-01-stateless-jwt-survives-kill.md) | Logout / freeze / key-revoke leave access JWTs live until `exp` (up to 3600s; step-up 300s with `trade:withdraw`) |
| R-AUTH-02 | [`auth-session-residuals/R-AUTH-02-httponly-cookie-cors-ws-retake.md`](auth-session-residuals/R-AUTH-02-httponly-cookie-cors-ws-retake.md) | httpOnly refresh cookie without CORS credentials + WS Origin re-take → CSRF + cross-site private-stream hijack |
| R-AUTH-03 | [`auth-session-residuals/R-AUTH-03-webauthn-origin-cors-drift.md`](auth-session-residuals/R-AUTH-03-webauthn-origin-cors-drift.md) | Passkeys enrol on `WEBAUTHN_ORIGIN` while browsers are gated by `EDGE_ALLOWED_ORIGINS` — two lists, two answers |
| R-AUTH-04 | [`auth-session-residuals/R-AUTH-04-bank-card-unminted-step-up.md`](auth-session-residuals/R-AUTH-04-bank-card-unminted-step-up.md) | `bank:card` promised as step-up; nothing mints it — outage or a future grant that skips 2FA |
| R-AUTH-05 | [`auth-session-residuals/R-AUTH-05-api-key-whitelist-suffix-overgrant.md`](auth-session-residuals/R-AUTH-05-api-key-whitelist-suffix-overgrant.md) | Short/parent hostname suffixes (`com`, `co.uk`) allow any matching host on `exchange` |
| R-AUTH-06 | [`auth-session-residuals/R-AUTH-06-private-ws-access-token-query.md`](auth-session-residuals/R-AUTH-06-private-ws-access-token-query.md) | Private WS `?access_token=` leaks JWTs into logs; cookie “fix” is R-AUTH-02 |
| R-AUTH-07 | [`auth-session-residuals/R-AUTH-07-jwt-secret-rotation-overlap.md`](auth-session-residuals/R-AUTH-07-jwt-secret-rotation-overlap.md) | Single signing secret; rotation is instant mass-logout — Class X, no overlap window |
