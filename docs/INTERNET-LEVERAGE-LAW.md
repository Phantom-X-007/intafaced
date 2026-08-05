# Internet leverage — standing law (agents · no Nitro decision)

**Status:** LAW · binding on every agent session  
**Operator decision (2026-08-05):** Phase A is **finished for current residual craft**. Agents **must use** that leverage. Nitro does **not** re-decide this per chat.  
**Home for maps:** Phase A audit · Phase B full-horizon (paths) · this file = **enforcement**

---

## 0 · Plain English (for Nitro)

We already have enough **in-repo** building blocks for what agents should ship **now**: product UI kit, ledger, services.  
Agents must **wire and extend those**, not invent a second shell, second money book, or random new stack.  
**Phase B** is only the residual map (when to use an external tool later) — **not** an excuse to ignore Phase A.

**Enforced how:** written into `AGENTS.md` / project instruction brief / `AGENT_PROTOCOL` + PR checklist + **CI auto-load scan** so the law cannot silently disappear from cold starts.

---

## 1 · Finished decision: Phase A is sufficient **now**

| Need now                                                                         | Phase A answer                                                 | Agent default                          |
| -------------------------------------------------------------------------------- | -------------------------------------------------------------- | -------------------------------------- |
| Product UI                                                                       | Vendor shell `:8090` (`vendor/upstream-exchange/05_Web_Front`) | Craft / wire shell — **never** new SPA |
| Money truth                                                                      | `packages/ledger-client` + `svc-ledger`                        | Recipes only                           |
| Trade / match / pay / bank / p2p / id / ws / notify / agents / academy / support | Matching `services/svc-*`                                      | Extend that service                    |
| Ops UI patterns                                                                  | Prefer `04_Web_Admin` shape                                    | No second admin product                |
| Custody go-live                                                                  | Wallet RPC **after** Denon review                              | Do not invent hot wallets              |

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

| Never                                                                                        | Why                           |
| -------------------------------------------------------------------------------------------- | ----------------------------- |
| New full exchange front-end kit                                                              | Phase A V-SHELL is product UI |
| Second balance book (Java wallet tables, Formance/TigerBeetle as SoT, service-held balances) | Doctrine + Phase A            |
| Invent mids/depth/prices so UI “looks live”                                                  | Honesty                       |
| Ignore named `svc-*` and rewrite the domain                                                  | Rebuild tax                   |
| Implement Shehzad chain cores “with leverage”                                                | Ownership S                   |
| Dual-edit open Denon/Shehzad PR paths                                                        | Collision                     |
| Treat Phase B shopping as day-1 before Phase A wire                                          | Order of leverage             |

Already machine-enforced where possible: dual-book / custody / brand / vendor-shell scans via `pnpm gates`.

---

## 4 · Phase B (no thrift ceiling · no Nitro queue pick)

- Full residual map: every open tracker id has a path.
- **Start order (agents may proceed without asking Nitro):**
  1. Prefer **IN** residual on claimed free paths (depth E2E, decimals, shell honesty, pay residual on `svc-pay` after handoff, etc.)
  2. **EXT adopt next (Class N/P when safe):** RE2 on hot parsers · Gitleaks CI — security leverage, no product-law invent.
  3. **Trial EXT only with local proof:** Hyperswitch **behind adapter**, ledger stays SoT.
  4. **LAW rows:** wait for Denon D-S or implement only refuse-closed thin.
  5. **X rows:** never agent-close (issuers, PSP go-live keys, sanctions **content**, mainnet custody).

Agents **do not** wait for Nitro to “pick the Top 5.”

---

## 5 · Stale map hygiene (agents own it)

When tip drifts (vendor path, deleted apps, new `svc-*`, tracker status flip): update Phase A or full-horizon **in the same PR wave**, not a sticky note to Nitro.  
`pnpm verify` / agent-autoload fails if this law vanishes from AGENTS / project instruction brief / protocol.

---

## 6 · Enhanced standing prompt (auto — paste optional)

```
INTERNET LEVERAGE LAW (binding — do not ask Nitro):

1. Phase A is finished for NOW residual craft. Prefer in-repo: vendor shell UI, ledger-client money, existing svc-*.
2. Before code: read docs/INTERNET-LEVERAGE-LAW.md + Phase A audit + full-horizon row for the tracker id.
3. Never rebuild product SPA, second ledger, or invent prices. Never steal Shehzad chain. Never dual-edit open human PR files.
4. PR must name leverage used. EXT only when horizon says EXT and doctrine allows. LAW = Denon first. X = human only.
5. Proceed autonomously on IN / safe EXT (RE2, Gitleaks). No operator pick list.
```

---

_Board-Delta: Internet leverage standing law — Phase A sufficient now; agent-enforced reuse_
