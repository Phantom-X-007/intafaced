# Peace of mind — current floor (Nitro)

**Date:** 2026-07-29  
**Baseline audited:** GitHub `main` tip `a19e337` (+ fix branch `chore/full-audit-2026-07-29`)  
**Program:** [`FULL-AUDIT-PROGRAM-2026-07-29.md`](FULL-AUDIT-PROGRAM-2026-07-29.md)  
**Detail:** [`audit/2026-07-29/`](audit/2026-07-29/)

**Claim tags:** `[VERIFIED 2026-07-29]` this program · older July-27 peace docs are **history**, not floor.

---

## Verdict in one breath

Denon shipped a real **startable platform** (edge, mounts, money path, deploy, terminal, DEX shell, vendor blob). Architecture and recipe discipline are strong. **Several open doors and false “done” claims were real** — the worst of those on the audited tip are **fixed on this branch**. Remaining risk is **not “mystery repo”** — it is a **named queue** (crash windows on withdraw/stake, dual-book earn/stake, vendor must stay quarantined, some honesty/docs debt).

**You can let Denon ship again later** if: this PR lands green, and future waves run the [wave audit](WAVE-AUDIT.md). **Do not go live with real user money** until the remaining P1 money-path queue is closed and rails are not sandbox.

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

| System                      | What it does                       | Risk now                                                                          | Proof                         | Status                          |
| --------------------------- | ---------------------------------- | --------------------------------------------------------------------------------- | ----------------------------- | ------------------------------- |
| **Ledger**                  | Only balances                      | Low if network perimeter holds                                                    | S2S auth tests; verify suite  | Good enough for continued build |
| **Identity**                | Login / rank / KYC                 | Was **critical** (XP mint) → **fixed**                                            | serviceProcedure + tests      | Fixed this branch               |
| **Trade / matching**        | Orders + book                      | Low–med                                                                           | Auth regression tests hold    | OK                              |
| **Pay**                     | Money in/out rails                 | Was **critical** IDOR on mutations → **fixed**; residual withdraw crash window P1 | ownership tests               | Fixed + residual queue          |
| **Bank earn / token stake** | Yield / stake                      | Med dual-book + claim-order gaps                                                  | audit L1/L3                   | Residual P1–P2                  |
| **P2P**                     | Escrow                             | Med pooled escrow                                                                 | integrity endpoint now authed | Residual purpose-key            |
| **Edge**                    | Public door                        | Low for forge; med if S2S ports exposed                                           | principal HMAC                | OK for dev                      |
| **Protocol**                | Smart accounts API                 | Was **empty door** → **mounted**                                                  | code fix                      | Ready not “done”                |
| **DEX / indexer**           | Protocol quotes / chain reads      | Low (propped); wrong URLs fixed                                                   | compose + env                 | Shell                           |
| **Web terminal**            | Fiat UI live; Protocol UI was dead | Better after protocol mount                                                       | static                        | CEX real; DEX incomplete        |
| **Deploy**                  | `platform:up`                      | Hotfix thrash history; ports fixed this pass                                      | workspace-sync + L5           | Usable with care                |
| **Vendor**                  | Third-party exchange               | High **if co-run as money**                                                       | ADR                           | **Quarantined** (default)       |
| **CI doctrine**             | Brand / format                     | Was red → green                                                                   | brand-scan clean              | Fixed this branch               |

---

## Ranked remaining queue (after this PR)

### P1 — fix next (money crash windows)

1. **Withdraw reverse vs status** (L3-1) — reverse can commit without marking failed
2. **Token stake claim-before-post** (L3-2)
3. **Earn deposit claim-before-post** (L3-3)

### P2 — structural honesty

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

1. Remaining P1 money crash windows closed
2. Real rails / chain — not sandbox / NullChain
3. Host perimeter: do not expose S2S ports on a public network
4. Vendor never co-custody without ledger ownership decision **B or C**
5. Operator KYC / freeze / kill-switch path proven in a real run

---

## What was fixed in this audit PR (checkable)

| Fix                    | Where you see it                                     |
| ---------------------- | ---------------------------------------------------- |
| Protocol `/trpc` mount | `services/svc-protocol/src/index.ts`                 |
| awardXp service-only   | `services/svc-identity` + router tests               |
| Pay mutation ownership | `services/svc-pay/src/router.ts` + tests             |
| Internal route HMAC    | identity / token / p2p                               |
| Dex correct ports      | compose + `svc-dex` env                              |
| Brand + format green   | brand-scan allowlist ADRs; prettier ignore vendor    |
| Tracker honesty        | protocol.smart-accounts → ready; edge header updated |

**Proof commands** (agent already ran subsets):  
`pnpm scan:brand` clean · identity 84 tests · pay 221 tests · typechecks pass.

---

## After Denon unpauses

Use [`WAVE-AUDIT.md`](WAVE-AUDIT.md) — delta only, not full archaeology.

---

## Links

| Doc                                                                    | Role                    |
| ---------------------------------------------------------------------- | ----------------------- |
| [`audit/2026-07-29/00-BASELINE.md`](audit/2026-07-29/00-BASELINE.md)   | Machine truth at freeze |
| [`audit/2026-07-29/01-INVENTORY.md`](audit/2026-07-29/01-INVENTORY.md) | Every system named      |
| [`audit/2026-07-29/02-FINDINGS.md`](audit/2026-07-29/02-FINDINGS.md)   | Full finding table      |
| [`FULL-AUDIT-PROGRAM-2026-07-29.md`](FULL-AUDIT-PROGRAM-2026-07-29.md) | Method law for this run |
| [`WAVE-AUDIT.md`](WAVE-AUDIT.md)                                       | Standing loop           |
