# Internet leverage — standing law (agents · no Nitro decision)

**Status:** LAW · binding on every agent session  
**Operator decision (2026-08-05):** Phase A is **finished for current residual craft**. Agents **must use** that leverage. Nitro does **not** re-decide this per chat.  
**Home for maps:** Phase A audit · Phase B full-horizon (paths) · this file = **enforcement**  
**Partner pack (Denon + his agent):** [`INTERNET-LEVERAGE-PARTNER-BRIEF-2026-08-05.md`](INTERNET-LEVERAGE-PARTNER-BRIEF-2026-08-05.md)

---

## 0 · Plain English (for Nitro)

We already have enough **in-repo** building blocks for what agents should ship **now**: product UI kit, ledger, services.  
Agents must **wire and extend those**, not invent a second shell, second money book, or random new stack.  
**Phase B** is only the residual map (when to use an external tool later) — **not** an excuse to ignore Phase A.

**Enforced how:** written into `AGENTS.md` / project instruction brief / `AGENT_PROTOCOL` + PR checklist + **CI auto-load scan** so the law cannot silently disappear from cold starts.

---

## 1 · Finished decision: Phase A is sufficient **now**

| Need now                                                                         | Phase A answer                                                                              | Agent default                                                 |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| Product UI                                                                       | Vendor shell `:8090` (`vendor/upstream-exchange/05_Web_Front`)                              | Craft / wire shell — **never** new SPA                        |
| Money truth                                                                      | `packages/ledger-client` + `svc-ledger`                                                     | Recipes only                                                  |
| Trade / match / pay / bank / p2p / id / ws / notify / agents / academy / support | Matching `services/svc-*`                                                                   | Extend that service                                           |
| Ops UI patterns                                                                  | Prefer `04_Web_Admin` shape                                                                 | No second admin product                                       |
| Custody go-live                                                                  | Wallet RPC: **critical defects frozen (#763)** — fix before live; not “optional MID review” | Do not invent hot wallets; no mainnet dual-broadcast residual |

**Not “platform complete”** — residual craft remains. **Sufficient leverage for residual craft without rebuild** = yes.

---

## 2 · Mandatory pre-code ritual (every agent · every code task)

Before the first edit of product code:

1. Open [`INTERNET-LEVERAGE-CURRENT-AUDIT-2026-08-04.md`](INTERNET-LEVERAGE-CURRENT-AUDIT-2026-08-04.md) (Phase A) — find the asset for this mountain.
2. Open [`INTERNET-LEVERAGE-PHASE-B-FULL-HORIZON-2026-08-05.md`](INTERNET-LEVERAGE-PHASE-B-FULL-HORIZON-2026-08-05.md) — find the tracker **id** row (path IN / EXT / GF / LAW / S / X).
3. **Default path = Phase A IN** unless the horizon row says LAW (wait for Denon), S (babysit), X (human Class X), or EXT (only then trial external).
4. In the PR body: name **which leverage** you used (path or “none — greenfield justified because …”).
5. If you almost rebuilt UI kit / ledger / full matching / full pay platform — **stop**. That is a failed session.

**Nitro is not asked.** If ambiguous on money/custody, doctrine decides; if still stuck, ask **Denon**, not the operator for leverage homework.

---

## 3 · Hard bans (leverage-specific)

| Never                                                                                        | Why                                                                                                |
| -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| New full exchange front-end kit                                                              | Phase A V-SHELL is product UI                                                                      |
| Second balance book (Java wallet tables, Formance/TigerBeetle as SoT, service-held balances) | Doctrine + Phase A                                                                                 |
| Invent mids/depth/prices so UI “looks live”                                                  | Honesty                                                                                            |
| Ignore named `svc-*` and rewrite the domain                                                  | Rebuild tax                                                                                        |
| Implement Shehzad chain cores “with leverage”                                                | Ownership S                                                                                        |
| Dual-edit open Denon/Shehzad PR paths                                                        | Collision — **necessary, not sufficient** (see §3.1)                                               |
| Treat Phase B shopping as day-1 before Phase A wire                                          | Order of leverage                                                                                  |
| **Hyperswitch** (or peer PSP orchestrators) in the money path                                | D-S-10 ADR #769: orchestrator ≠ acquirer; Doctrine 5 no third-party connectivity lib in money path |
| Native node-gyp RE2 on money-adjacent services when pure-JS linear matchers suffice          | Denon: supply-chain/ABI cost on bank-detail services                                               |

Already machine-enforced where possible: dual-book / custody / brand / vendor-shell scans via `pnpm gates`.

### 3.1 Test isolation (Denon 2026-08-05)

File-level / worktree isolation is **not enough**. Suites that migrate at startup against a **shared** test Postgres can break peer agents (false reds; Denon A/B on #428).

**Law:** use a **dedicated test database per branch** (or equivalent isolation). Do not share one `intafaced_test` across concurrent worktrees.

---

## 4 · Phase B (no thrift ceiling · no Nitro queue pick)

- Full residual map: every open tracker id has a path.
- **Start order (agents may proceed without asking Nitro):**
  1. Prefer **IN** residual on claimed free paths (decimals, shell honesty, pay residual on `svc-pay` after handoff). Depth E2E is **proven** (Denon fleet rebuild) — not a residual theater item.
  2. **ReDoS:** pure-JS linear-time matchers (in-tree preferred; `re2js` pure-JS OK) · **Gitleaks** CI.
  3. **Pay:** commercial `socket.psp-partners` / Class X — **not** Hyperswitch (refused).
  4. **Wallet RPC:** treat as **NOW critical** (mainnet dual-broadcast / pre-EIP-155 / pinned mainnet USDT class defects frozen by #763 — unfixed). Not “MID review someday.”
  5. **LAW rows:** Denon D-S board reported **18 done** — implement from specs.
  6. **X rows:** never agent-close.

Agents **do not** wait for Nitro to “pick the Top 5.”

---

## 5 · Stale map hygiene (agents own it)

When tip drifts (vendor path, deleted apps, new `svc-*`, tracker status flip, **partner corrections**): update Phase A or full-horizon **in the same PR wave**, not a sticky note to Nitro.  
`pnpm verify` / agent-autoload fails if this law vanishes from AGENTS / project instruction brief / protocol.

---

## 6 · Enhanced standing prompt (auto — paste optional)

```
INTERNET LEVERAGE LAW (binding — do not ask Nitro):

1. Phase A is finished for NOW residual craft. Prefer in-repo: vendor shell UI, ledger-client money, existing svc-*.
2. Before code: read docs/INTERNET-LEVERAGE-LAW.md + Phase A audit + full-horizon row for the tracker id.
3. Never rebuild product SPA, second ledger, or invent prices. Never steal Shehzad chain. Never dual-edit open human PR files. Never share one migrate-on-startup test DB across worktrees.
4. PR must name leverage used. No Hyperswitch. ReDoS = pure-JS linear matchers preferred. LAW = Denon first. X = human only.
5. Proceed autonomously on IN / safe EXT (ReDoS pure-JS, Gitleaks). Wallet RPC defects are NOW-critical if you touch custody.
```

---

_Board-Delta: Leverage law aligned to Denon reply — Hyperswitch refuse; pure-JS ReDoS; test-DB isolation; wallet RPC critical_
