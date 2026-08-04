# Board Clear — Human blockers (deferred queue)

**Rule:** Append only while agent residual remains. This file **is** the Nitro inbox — do not create `docs/ops/NITRO-INBOX.md`.  
**Flush:** After AGENT-COMPLETE (all agent-owned rows Done/Cut), orchestrator finalizes this file and reports once.

**Agent residual remaining?** **Yes (partial)** — shell freeProduct often 0, but platform M1–M7 + Class X + infra blockers remain.  
**Last refresh:** 2026-08-04 (install / cost emergency).

---

## Deferred X1–X5 (Nitro only / Denon admin)

| ID  | Queued (UTC)      | Issue                                                                                                                                                                                                                             | Sandbox/§13 tried?                        | Status             |
| --- | ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- | ------------------ |
| X1  | 2026-08-04T01:00Z | **Actions billing** — last 24h ~677 runs (≈90 CI + ≈582 Docs-format). `paths-ignore` moved spend, did not remove it. Issue #197 already hit ceiling once (2026-07-30). **Only Denon can see the bill.** Confirm headroom tonight. | value-gate shipping on Docs-format (#721) | OPEN — Denon       |
| X2  | 2026-08-04T01:00Z | **Branch protection on `main`** — `gh api …/protection` → 404; rulesets → 403 “Upgrade to GitHub Pro”. Any push-capable identity can force-push main. `tooling/scripts/setup-github.mjs` exists; needs admin.                     | agents cannot                             | OPEN — Denon       |
| X3  | 2026-08-04T01:00Z | **CODEOWNERS advisory only** on private repo without Pro — Shehzad money paths can merge with zero review.                                                                                                                        | agents cannot                             | OPEN — Denon       |
| X4  | 2026-08-04T01:00Z | **`allow_auto_merge: false`** — swarm polls CI and merges by hand; admin toggle.                                                                                                                                                  | agents cannot                             | OPEN — Denon       |
| X5  | 2026-08-04T01:00Z | **ZenYoda3 dual identity** — Nitro operator + swarm share one GitHub identity → no ownership rule is mechanically enforceable (same Pro/protection gap as X2). Structural; do not “fix” in agents.                                | n/a                                       | OPEN — Denon/Nitro |

---

## Human mountain rows still open at last flush

| Row                        | Owner      | What’s left (honest)                                       | Waiting on        |
| -------------------------- | ---------- | ---------------------------------------------------------- | ----------------- |
| pay.gateway (+ expand)     | shehzad002 | Card sandbox + KYB + durable list — PR #346 dirty/conflict | shehzad merge fix |
| protocol.smart-accounts    | shehzad002 | Deploy + audit package                                     | M2 implement      |
| protocol.amm (+ lending/…) | shehzad002 | After SA                                                   | M2                |
| trade.futures              | shehzad002 | Risk/margin/liq/mark truth; unlocks B-WS-2 live positions  | M3                |
| trade.otc / copy / algo    | shehzad002 | Real engines (agents must not invent)                      | M4                |
| identity sub-account money | shehzad002 | Money routing graph (UI list already shipped)              | M5                |
| Phase 5 bank money         | shehzad002 | earn/cards/ramps                                           | M6                |
| dual-book / Java residual  | shehzad002 | M7 — agents never steal                                    | M7                |

### Agent §13 residual (not a human steal)

| ID     | Row        | Socket                                                                 | Owner after |
| ------ | ---------- | ---------------------------------------------------------------------- | ----------- |
| B-WS-2 | ws.gateway | Live futures **position** private stream E2E — needs correct M3 events | M3 + agent  |

---

## Open shehzad/Denon PRs needing human eyes (snapshot)

_Re-derive with `gh pr list`. Snapshot is advisory._

| PR        | Note                                               |
| --------- | -------------------------------------------------- |
| #346      | shehzad M1 pay — **CONFLICTING**; babysit only     |
| #428      | Denon p2p instruments — open; no dual-edit         |
| #432–#448 | Denon money/config/CI residual wave — babysit only |

---

## Last flush

**2026-08-04** — Cost + protection blockers written to X1–X5 (were empty since 2026-08-02).  
Human M1–M7 still OPEN → BOARD-COMPLETE not claimed.  
Agent residual = F-STANDBY / P1–P5 ladder when freeProduct=0 — not stamp mills.
