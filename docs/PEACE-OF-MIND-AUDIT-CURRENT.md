# Peace of mind — current floor (Nitro)

**Date:** 2026-07-29  
**Baseline audited:** GitHub `main` tip `a19e337` (+ fix branch `chore/full-audit-2026-07-29`)  
**Program:** [`FULL-AUDIT-PROGRAM-2026-07-29.md`](FULL-AUDIT-PROGRAM-2026-07-29.md)  
**Detail:** [`audit/2026-07-29/`](audit/2026-07-29/)

**Claim tags:** `[VERIFIED 2026-07-29]` this program · older July-27 peace docs are **history**, not floor.

---

## Verdict in one breath

Denon shipped a real **startable platform** (edge, mounts, money path, deploy, terminal, DEX shell, vendor blob). Architecture and recipe discipline are strong. **Open doors and false “done” claims were real** — the worst of those on audited tip `a19e337` are **fixed on this branch** (wave-1 auth/mount/CI + V2 money crash windows). Remaining risk is **not “mystery repo”** — it is a **named P2 queue** (dual-book, P2P purpose keys, stronger S2S, docs honesty) plus **not-live rails**.

**You can let Denon keep building** once this PR is **fully CI green and merged**. Future Denon waves: [wave audit](WAVE-AUDIT.md) only. **Do not go live with real user money** until real rails/chain + host perimeter + operator kill path — not because mystery bugs remain unnamed.

---

## What Denon built (plain)

| Area                                        | What it is                                                       |
| ------------------------------------------- | ---------------------------------------------------------------- |
| **Front door**                              | Edge service — login token → signed identity for every API       |
| **Books**                                   | Ledger still the only balance truth; purpose-keyed holds shipped |
| **Trade**                                   | Spot orders + matching engine + live depth stream to browser     |
| **Pay**                                     | Merchant payments + operator deposit + user withdrawal shapes    |
| **Bank / P2P / Token / Agents / Blueprint** | Cores + API mounts                                               |
| **Protocol / DEX / Indexer**                | Non-custodial plane shell; indexer prop (no real chain yet)      |
| **One-command platform**                    | `platform:up` compose for the whole fleet                        |
| **Vendor dump**                             | Full third-party exchange under `vendor/` — **reference only**   |

---

## Scoreboard (trust)

| System                      | What it does                       | Risk now                                                                        | Proof                         | Status                          |
| --------------------------- | ---------------------------------- | ------------------------------------------------------------------------------- | ----------------------------- | ------------------------------- |
| **Ledger**                  | Only balances                      | Low if network perimeter holds                                                  | S2S auth tests; verify suite  | Good enough for continued build |
| **Identity**                | Login / rank / KYC                 | Was **critical** (XP mint) → **fixed**                                          | serviceProcedure + tests      | Fixed this branch               |
| **Trade / matching**        | Orders + book                      | Low–med                                                                         | Auth regression tests hold    | OK                              |
| **Pay**                     | Money in/out rails                 | Was **critical** IDOR → **fixed**; withdraw reverse crash window → **fixed V2** | ownership + reverse tests     | Good enough for continued build |
| **Bank earn / token stake** | Yield / stake                      | Claim-order crash windows → **fixed V2**; dual-book still P2                    | pending→active + tests        | Residual P2 only                |
| **P2P**                     | Escrow                             | Med pooled escrow                                                               | integrity endpoint now authed | Residual purpose-key            |
| **Edge**                    | Public door                        | Low for forge; med if S2S ports exposed                                         | principal HMAC                | OK for dev                      |
| **Protocol**                | Smart accounts API                 | Was **empty door** → **mounted**                                                | code fix                      | Ready not “done”                |
| **DEX / indexer**           | Protocol quotes / chain reads      | Low (propped); wrong URLs fixed                                                 | compose + env                 | Shell                           |
| **Web terminal**            | Fiat UI live; Protocol UI was dead | Better after protocol mount                                                     | static                        | CEX real; DEX incomplete        |
| **Deploy**                  | `platform:up`                      | Hotfix thrash history; ports fixed this pass                                    | workspace-sync + L5           | Usable with care                |
| **Vendor**                  | Third-party exchange               | High **if co-run as money**                                                     | ADR                           | **Quarantined** (default)       |
| **CI doctrine**             | Brand / format                     | Was red → green                                                                 | brand-scan clean              | Fixed this branch               |

---

## Ranked remaining queue

### P1 money crash windows — **fixed on this branch (Audit V2)**

1. ~~Withdraw reverse vs status (L3-1)~~ → **FIXED** — durable reverse finalize
2. ~~Token stake claim-before-post (L3-2)~~ → **FIXED** — `pending` → ledger → `active`
3. ~~Earn deposit claim-before-post (L3-3)~~ → **FIXED** — same pattern

### P2 — structural honesty (still open)

4. Dual-book stake/earn vs ledger (L1-2/3)
5. Purpose-keyed P2P escrow (L3-4)
6. Split earn vs token stake accounts (L3-5)
7. RUNNING.md + tracker path-only `done` (L5-8, L8-2)
8. Sign region into principal (L2-4); stronger S2S (L2-6)

### Vendor product decision (only if Denon wants product integration)

**Default already applied:** quarantine — not user-facing, not format/brand noise, not ledger replacement.  
**Escalate to you only if** someone proposes vendor owns balances (ADR Option A) — that abandons the ledger. Deny that.

---

## Explicit non-problems (so fear does not loop)

- Services do **not** invent balances outside ledger recipes on production paths
- Protocol plane does **not** get write access to the books
- Historical open doors (#50 ledger, #55 matching, #62 bank jobs, #75 depth) **still fixed**
- Test suite at baseline was **green**; CI red was brand/format + vendor, not silent test blackout
- You do **not** need to rebuild trade/matching/pay/p2p/bank from scratch

---

## Go-live blockers (even if not deploying today)

1. ~~P1 money crash windows~~ **closed on this branch** (still need PR merged + CI green)
2. Real rails / chain — not sandbox / NullChain
3. Host perimeter: do not expose S2S ports on a public network
4. Vendor never co-custody without ledger ownership decision **B or C**
5. Operator KYC / freeze / kill-switch path proven in a real run
6. (Recommended before live) close P2 dual-book + P2P purpose-key — not open-door class, but money-shape honesty

---

## What was fixed in this audit PR (checkable)

| Fix                               | Where you see it                                |
| --------------------------------- | ----------------------------------------------- |
| Protocol `/trpc` mount            | `services/svc-protocol/src/index.ts`            |
| awardXp service-only              | `services/svc-identity` + router tests          |
| Pay mutation ownership            | `services/svc-pay/src/router.ts` + tests        |
| Internal route HMAC               | identity / token / p2p                          |
| Dex correct ports                 | compose + `svc-dex` env                         |
| Brand + format green              | brand-scan; prettier ignore vendor              |
| Tracker honesty                   | protocol.smart-accounts → ready                 |
| **L3-1 withdraw reverse durable** | `svc-pay` `finalizeRailRefusal` + recovery test |
| **L3-2 stake pending→active**     | `svc-token` + migration `0001_stake_pending`    |
| **L3-3 earn pending→active**      | `svc-bank` + migration `0001_position_pending`  |

**Proof:** brand-scan clean · pay 221 non-PG tests · token economics 101 · typecheck pay/token/bank. Full money-path PG tests need docker (CI).

---

## What “properly audited” means here (and what it does not)

**Properly for this program =** every system that can lose money or trust was **named**, risk **judged**, open doors **fixed or parked with reason**, and you have **one scoreboard** — not “every line of every file” and not “go-live certified.”

| Bar                                                  | Status                                                                   |
| ---------------------------------------------------- | ------------------------------------------------------------------------ |
| Denon tip through vendor #73 (`a19e337`) inventoried | **Yes**                                                                  |
| Auth/money open doors found + fixed (wave-1 + V2)    | **Yes on branch**                                                        |
| Named residual queue (no mystery fear)               | **Yes** — P2 list                                                        |
| CI fully green + merged to main                      | **Closing** — tests/doctrine green; format was the last blocker (pushed) |
| Cross-family second model on every fix               | **Not done** (same-session judgment)                                     |
| Property-test library on ledger invariants           | **Not done**                                                             |
| Concurrent load smoke                                | **Not done**                                                             |
| Live rails / production deploy audit                 | **Out of scope** (not live money product yet)                            |

Optional extra proof (not “hidden unfinished audit”): property tests + concurrent smoke. Not required to close **review of what Denon shipped so far**.

---

## After Denon unpauses

Use [`WAVE-AUDIT.md`](WAVE-AUDIT.md) — delta only, not full archaeology.

---

## Links

| Doc                                                                                                    | Role                           |
| ------------------------------------------------------------------------------------------------------ | ------------------------------ |
| [`audit/2026-07-29/00-BASELINE.md`](audit/2026-07-29/00-BASELINE.md)                                   | Machine truth at freeze        |
| [`audit/2026-07-29/01-INVENTORY.md`](audit/2026-07-29/01-INVENTORY.md)                                 | Every system named             |
| [`audit/2026-07-29/02-FINDINGS.md`](audit/2026-07-29/02-FINDINGS.md)                                   | Full finding table             |
| [`audit/2026-07-29/03-ADVERSARIAL-PASS.md`](audit/2026-07-29/03-ADVERSARIAL-PASS.md)                   | What was / wasn’t dual-proofed |
| [`FULL-AUDIT-PROGRAM-2026-07-29.md`](FULL-AUDIT-PROGRAM-2026-07-29.md)                                 | Method law for wave-1          |
| [`AUDIT-V2-RESIDUAL-AND-STRESS-2026-07-29.md`](AUDIT-V2-RESIDUAL-AND-STRESS-2026-07-29.md)             | Residual P1 + stress upgrades  |
| [`HANDOVER-AUDIT-V2-PASTE.md`](HANDOVER-AUDIT-V2-PASTE.md)                                             | New-chat paste                 |
| [`WAVE-AUDIT.md`](WAVE-AUDIT.md)                                                                       | Standing loop after Denon      |
| [`PLAN-META-AUDIT-FULL-AUDIT-PROGRAM-2026-07-29.md`](PLAN-META-AUDIT-FULL-AUDIT-PROGRAM-2026-07-29.md) | Plan methods meta-audit        |
