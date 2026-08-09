# LANE STOP — L12 IDENTITY · wave 6 · 2026-08-09

## Operator block

```
LANE: L12 IDENTITY wave 6
shipped (merged this wave):
  #1238 TOTP code can only open the door once (Class M — tip-rebased; keeps domain whitelist + passkey step-up)
  #1272 KYC reject audit trail + re-apply (Class N)
shipped earlier / already on tip (W5 banked — re-verified not re-shipped):
  #1382 passkey unlocks withdraw
  #1326 API key domain list blocks foreign origins
  #1348 encrypted KYC document vault (no vendor)
  #1240 freeze retires API keys
  #1262 WebAuthn remove
  #1280 signup referrer
  #1261 README API matrix
in flight (open — babysit CI then merge):
  #1417 TOTP secrets encrypt at rest (Class P; rebased with #1238 open-before-burn)
  #1441 WebAuthn challenges in Postgres multi-pod (Class P)
  #1448 recovery codes unlock withdraw step-up (Class M; rebased with anti-replay)
parked:
  · pending TOTP enrolment durability (multi-pod Map) — residual after encrypt
  · login/exchange rate limit — design fork edge vs identity
  · fee-event → XP accrue — already wired via subscribeXpEvents on tip (re-verify only)
  · §8 affiliate rates + payout Class M — Nitro / DIRECTION (refuse-closed already pinned)
  · pay:* grants — WITHHELD; never invent
  · KYC vendor webhook — Class X / Nitro
  · legacy plaintext TOTP re-encrypt job — dual-read until re-enrol after #1417
Nitro must decide:
  · none for merge of Class N/P/M units above
  · KYC vendor + §8 rates still Nitro-only if product wants them
  · ops: set IDENTITY_TOTP_SECRET_KEY in prod when #1417 lands (boot refuses without it)
SAFE TO CLOSE: no — three open identity PRs still need green CI + merge; no uncommitted wall code on this agent after stop PR
tip: re-derive origin/main
```

## Unit cards this wave

| PR    | Promise                               | Done bar                                                             | Class |
| ----- | ------------------------------------- | -------------------------------------------------------------------- | ----- |
| #1238 | TOTP window replay (README known gap) | same step → auth.mfa_invalid; enrol seeds last step; tip-safe rebase | M     |
| #1272 | reject is the other half of review    | stamps + resubmit + refuse approved                                  | N     |
| #1417 | TOTP secret encrypt-at-rest           | enc:v1: AES-GCM; dual-read legacy; prod key required                 | P     |
| #1441 | WebAuthn multi-pod challenges         | SQL store put/take/TTL/single-use                                    | P     |
| #1448 | recovery codes on step-up             | TOTP first then burn recovery; 5m trade:withdraw                     | M     |

## Sealed / not re-shipped

- domain_whitelist enforce (#1326 on tip)
- passkey step-up (#1382 on tip)
- KYC encrypted doc store mechanism (#1348; vendor still X)
- freeze → keys (#1240)
- pay:payout bot ban (DB CHECK)
- xpEarned → awardXp consumer (on tip)
- affiliates.payout refuse-closed (router.test pin)

## Agent notes

- No local Docker/Postgres — identity PG suites sealed by CI
- GraphQL rate limit hit late wave; merges via REST when needed
- #1238 stale branch would have deleted domain whitelist + WebAuthn step-up — rebased surgically onto tip
- Exclusive wall held: `services/svc-identity/**` only

## Next agent pickup

1. Merge #1417 #1441 #1448 when CI green (path-intersect serial if needed: encrypt → recovery)
2. Pending TOTP enrolment durability after encrypt lands
3. Do not invent pay:* grants or §8 rates; do not dual-write L01 agents matrix
