# Post-merge residual — after PR #86

**For Nitro.** Living residual queue after the consolidated shell + custody release.  
**Not** a full audit. **Not** go-live clearance.

**Claim tags:** `[VERIFIED 2026-07-29]` · residual **#2–#4** closed (#96) · residual **#9** closed (CI money Postgres honesty, this PR)

---

## One-line floor

**#86 custody + #96 shell residue + #9 CI harness honesty.** Real user money still blocked: dual-book policy, wallet secrets/perimeter, pay retry contract, licence Priority-1, rails/chain/kill-path.

---

## Closed by #86 — do not re-open

- API-key privilege escalation (scope ceiling on grant)
- Wallet RPC unauthenticated withdraw (shared-secret, fail-closed)
- Live trading backdoor / mock controllers removed
- Shell rebrand (English-only, black/orange, vendor logos out)
- Bank + blueprint scopes issued to sessions
- Licence inventory named (blockers honest)
- `workspace-sync` widened to every service upstream URL

---

## Closed in residual hygiene (do not re-open)

| #   | Item                                                          | How                                                                                                                                          |
| --- | ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| 2   | CORS `*` + credentials on Java web modules                    | `CorsAllowlist` + env `CORS_ALLOWED_ORIGINS`; local defaults only; `pnpm scan:vendor-shell`                                                  |
| 3   | `unfreezeMore` / `unfreezeLess` mass balance credit           | Service throws; DAO queries no-op; scan bans `balance+500` / `+to_released`                                                                  |
| 4   | `dropWeekTable` TRUNCATE + `createWeekTable` snapshot helpers | Service throws; DAO no-op; scan bans `TRUNCATE TABLE member_wallet_`                                                                         |
| 9   | CI money tests can skip without PG env                        | CI sets all `TEST_DATABASE_URL_*` on `127.0.0.1:5432`; `assert-test-db-env.mjs`; `postgresAvailable` hard-fails when `CI`/`REQUIRE_POSTGRES` |
| —   | JDBCUtils mass wallet credit / to_released bulk debit         | Methods throw; vendor-shell-scan bans `to_released=to_released-`                                                                             |

**Production CORS:** set `CORS_ALLOWED_ORIGINS` to your real app origins before public shell. Defaults are localhost only (not “any site”).

**Standing policy (not a code defect):** #1 dual-book — shell UI ≠ TS ledger books. Enforced by doctrine + residual scans; no PR reopens “use Java as ledger.”

---

## Residual queue (money-risk order)

| #   | Item                                                       | Owner                                           | When                                    |
| --- | ---------------------------------------------------------- | ----------------------------------------------- | --------------------------------------- |
| 1   | Vendor UI ≠ money books (policy — standing)                | Nitro policy · all agents                       | Always · hard before real money         |
| 5   | Wallet secrets / empty keystore passwords / host perimeter | Denon ops                                       | When Denon back · before real money     |
| 6   | TradingView: no licence + remote third-party chart JS      | Denon picks path · Nitro if commercial TV grant | When Denon back · before public product |
| 7   | MySQL Connector/J GPL in proprietary product               | Denon (MariaDB swap)                            | When Denon back · before public ship    |
| 8   | Pay withdraw retry: test vs service contract               | Money agent (**after** open pay feature PR)     | Soon · before real money                |
| 10  | `feat/multi-asset-instruments` not merged                  | **Denon only** + WAVE after                     | When Denon back                         |
| 11  | L2-6 S2S body-bind                                         | Design, not drive-by                            | Before hard multi-service prod          |
| 12  | Real rails + live chain                                    | Denon                                           | Before real money                       |
| 13  | Operator freeze/kill proven end-to-end                     | Denon · Nitro sign-off on drill                 | Before go-live                          |
| 14  | Sanctions list empty                                       | Nitro + counsel                                 | Before public / real money              |
| 15  | Secret scan (gitleaks-class) not CI law yet                | Agent when Nitro authorizes tooling             | High-leverage Track A                   |
| 16  | Prices/candles empty (demo)                                | Product / agent                                 | Demo quality, not P0 steal-money        |
| 17  | Stream A app polish                                        | Nitro Stream A                                  | After shell stable                      |

---

## Explicit non-goals this week

- Full A–E audit restart
- Rebuild trade/matching/pay
- Strix without Nitro go + non-prod
- Merge multi-asset without Denon
- Agents inventing licence answers
- Taking open feature PRs from the product-shipping chat

---

## After Denon ships again

Use [`WAVE-AUDIT.md`](WAVE-AUDIT.md) only — delta since this tip.
