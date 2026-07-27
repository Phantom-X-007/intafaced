# svc-identity

**One account, one verification, one rank — the key that opens every room (§4.1).**

Owns accounts, credentials, sessions, KYC state, and the rank graph. It is the **only writer to `rank_state`**; every other module emits XP and reads perks.

**What this service is not:** it does not decide what a rank is _worth_. It publishes a machine-readable perk table and each module applies what it cares about — svc-trade reads `feeDiscountBps`, svc-p2p reads `p2pLimitMultiplier`. That indirection is why the ladder can be re-tuned without touching a second service.

---

## API

| Procedure                            | Scope                     | Notes                                                |
| ------------------------------------ | ------------------------- | ---------------------------------------------------- |
| `auth.register`                      | —                         | Creates user, profile, rank row; awards 50 XP        |
| `auth.login`                         | —                         | Handle or email; requires TOTP once enrolled         |
| `auth.refresh`                       | —                         | Rotates the refresh token                            |
| `auth.logout` / `auth.logoutAll`     | — / session               | Revokes one or all sessions                          |
| `totp.enrol` / `totp.confirm`        | session                   | Two-step; secret persists only on confirm            |
| `rank.get`                           | `identity:read`           | Rank, XP, XP to next tier                            |
| `rank.perks`                         | `identity:read`           | **The hot path** — every module calls this           |
| `rank.awardXp`                       | service                   | Modules award XP here, never by writing `rank_state` |
| `apiKeys.create` / `list` / `revoke` | `identity:write` / `read` | Key returned once, never retrievable                 |
| `subAccounts.create`                 | `identity:write`          | Ledger-visible; real separate balances               |

HTTP: `GET /health` · `GET /ready` (reports whether argon2id is active).

---

## Events

**Publishes**

| Subject                           | When                      |
| --------------------------------- | ------------------------- |
| `intafaced.identity.user.created` | registration              |
| `intafaced.identity.kyc.approved` | verification tier granted |
| `intafaced.identity.rank.updated` | **rank changes only**     |

`rank.updated` fires on rank change, not on every XP award. Every module caches perks; an event per award would be a cache-invalidation storm for no benefit.

**Consumes** — nothing yet. In Phase 2 it consumes `intafaced.identity.xp.earned` from every module; today modules call `rank.awardXp` directly.

---

## Ledger

**This service holds no balances and posts no ledger transactions.**

It is one of the three shared systems (Doctrine §0.3) but it is the _identity_ one. The only connection to money is that `sub_accounts.id` is what the ledger's `subaccount` owner type keys on.

---

## Security decisions worth knowing

**Passwords — argon2id, scrypt fallback.** §9 specifies argon2id. `@node-rs/argon2` is a native module, and a failed native install must not stop a developer running tests — so scrypt is the fallback. Both are memory-hard; there is no path here that reaches a fast hash. In production `assertArgon2Available()` runs at boot and the process refuses to start without argon2id. A scrypt hash upgrades to argon2id silently on next login, so nobody needs a reset.

> scrypt at N=2¹⁵, r=8 needs exactly Node's 32 MiB default `maxmem` and therefore fails without raising it. Found by a test. Without it, every password hash on a machine lacking argon2 would throw.

**Password policy — length, not composition.** 12 characters minimum, no character-class rules. Composition requirements push people to `Password1!`; NIST dropped them for that reason.

**Login timing.** An unknown account is compared against a _real_ hash of a random string, so it costs the same time as a wrong password. A hand-written fake would return early and leak the difference — that is an account-enumeration oracle.

**TOTP — RFC 6238, implemented here.** ~60 lines of well-specified arithmetic, which lets the tests run the RFC's own published vectors. A dependency in the authentication path we cannot check against the spec is one we would be trusting blind. Constant-time comparison; ±1 step drift window.

**Enrolment is two-step.** The secret is not persisted until a valid code proves the user actually scanned it — otherwise abandoning enrolment halfway locks you out.

**Refresh rotation with reuse detection.** Every refresh issues a new token and revokes the old. If a rotated token is presented again, two parties hold it and we cannot tell which is the owner — so **every session for that user is revoked**. Losing a login beats an undetected takeover.

> The revocation is committed in a _separate_ statement, outside the transaction that detected it. Throwing from inside would roll it back, and the thief's replay would revoke nothing. There is a test for exactly this.

**API keys cannot withdraw.** `trade:withdraw`, `admin:treasury`, and `bank:card` are refused on key creation by the service **and** by a database CHECK constraint. A leaked bot key must not be able to move value off the platform (§9).

**Handles are citext.** `Handle` and `handle` are the same account. Impersonation by casing is a real attack.

---

## Concurrency

`awardXp` takes `FOR UPDATE` on the user's `rank_state` row **before** any write, then runs at READ COMMITTED. Same reasoning as svc-ledger's chain-tip lock: when a lock already establishes the ordering, SERIALIZABLE only adds aborts.

Ordering matters — inserting the XP event first created a read/write conflict that made concurrent awards abort each other. Locking per user is the right granularity: two users earning XP have nothing to do with one another.

---

## Kill-switch

`REGISTRATION_OPEN=false` closes registration; existing users are unaffected. §11 gates this behind the drop sequence (drop IV opens it fully).

---

## Running it

```bash
docker compose up -d
pnpm --filter @intafaced/svc-identity db:migrate
pnpm --filter @intafaced/svc-identity test
pnpm --filter @intafaced/svc-identity dev
```

## Tests

93 tests. TOTP is verified against **RFC 4226 Appendix D and RFC 6238 Appendix B** vectors. The Postgres suite carries the **§4.4 Phase 1 exit criteria**:

- full auth lifecycle — register → TOTP enrol → login with 2FA → refresh → scoped API key call
- XP event → rank recalculation → perks visible to a second service
- a verified user passing the jurisdiction matrix that an unverified one fails

Skips cleanly when Postgres is unreachable.
