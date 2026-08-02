# Scorecard LIVE — re-measure log

**Law:** methodology §2 — no “improved” claim without a row here.  
**Baseline:** `FRONTEND-BASELINE-SCORECARD-A0-2026-07-31.md`  
**Method:** Gates 4/11/12/18/19 pass|fail; other dims 0–3. Prefer non-implementer eyes.

## How to add a row

1. Boot `:8090` · Orca open
2. Score `/exchange`, MoneyIndex, Withdraw (and `/dex` if plane changed)
3. Append table below with tip SHA + date + agent role (implementer|certifier)
4. Attach Orca paths under `docs/styleboard/shots/scorecard-<date>/`

---

## Row: A0 baseline (historical)

See A0 file. **Stale relative to tip after B craft.**

---

## Row: PROOF-1 (2026-08-02) — first post–B-batch re-score

| Field   | Value |
| ------- | ----- |
| Date    | 2026-08-02 |
| Tip SHA | `5f2f8fe` (origin/main at measure; AOS #362) |
| Role    | implementer (PROOF-1 go sequence) |
| Eyes    | Orca embedded browser + PNG pack |
| Shell   | http://127.0.0.1:8090 · Node 18 ui:boot · root/app.js 200 |

### Gate / dim scores

| Surface | G4 Honesty | G11 Feed truth | G12 Irreversible | G18 Recovery | G19 Numeric | Dim1 trust/clarity | Dim6 density | Dim8 calm | Dim23 plane | Notes |
| ------- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| / (index) | **pass** | **pass** | n/a | **pass** | **pass** | 2 | 1 | 2 | 2 | “Market list unavailable — not empty”; no fake tickers |
| /exchange desk | **pass** | **pass*** | **pass** (code+UI path) | **pass** | **pass** | 2 | **1** | 2 | 2 | Book/fee honesty visible; chart center often pure black (empty copy low-contrast / under widget — B13 P0) |
| Login | **pass** | n/a | n/a | n/a | n/a | 2 | 1 | 2 | 2 | P21 teal CTA; generic form craft (not desk bar) |
| MoneyIndex | **pass†** | n/a | n/a | n/a | n/a† | — | — | — | — | Unauth → login (honest; **no fake balances**). Logged-in surface **not** re-Orca’d this run |
| Withdraw | **pass†** | n/a | **code 3** (A2 receipt+lock on main) | n/a | **code 3** | — | — | — | — | Unauth → login. Receipt/lock not re-shot logged-in |

\*G11: book + fee paths correctly labeled unavailable / not free. Chart pane often shows silent black without a readable empty line in the crop — scored pass on book/ticket, **flag for B13** on chart overlay visibility.  
†Money/Withdraw: gate pass means “did not lie”; full craft dims deferred until auth session Orca (never seed fixture money as proof).

### Delta vs A0 (required)

| Area | A0 | PROOF-1 | Better? |
| ---- | -- | ------- | ------- |
| Exchange honesty copy | target 3 after #267 | **pass** — “not empty”, fee “not free”, sign-in for balances | **Holds** Wave A; not a craft win |
| Withdraw / G12 | 3 after A2′ | unauth redirect; code path still on tip | **Holds** — not re-certified eyes-on receipt |
| Density Dim6 | not re-scored post B | **1** — large dead black chart/footer; watchlist thin when markets down | **Not better** — B2 still open |
| P21 palette | provisional | teal accent on login + nav active | **Holds** COLOR lock; taste open for Nitro |

**Claim allowed:** honesty moat still true on public desk/index; **no claim** that craft/density is world-class. Density and chart empty-overlay are residual, not green.

### Orca shots

`docs/styleboard/shots/scorecard-2026-08-02/`

| File | Surface |
| ---- | ------- |
| `01-index.png` | Home / market list honesty |
| `02-exchange.png` | Desk: watchlist, chart void, book unavailable, ticket, blotter |
| `03-login.png` | Auth card P21 |
| `04-uc-money.png` | Unauth → login (money gated) |
| `05-uc-withdraw.png` | Unauth → login (withdraw gated) |

Refs: `docs/refs/proof-1/` (gap-audit · steal-lines · critique).

### Outstanding after this row

- [x] Fill first LIVE row after go
- [ ] Auth’d MoneyIndex + Withdraw Orca (fleet session; **never seed money**)
- [ ] B13: chart empty overlay contrast/z-index; density critique
- [ ] `pnpm ui:proof` hard re-run (P0.4)
- [ ] Never seed fixture money

---

## Row: _TEMPLATE (copy)_

| Field   | Value                   |
| ------- | ----------------------- |
| Date    |                         |
| Tip SHA |                         |
| Role    | implementer / certifier |
| Eyes    | Orca                    |

| Surface    | G4  | G11 | G12 | G18 | G19 | Dim1 | Dim6 | Dim8 | Dim23 | Notes |
| ---------- | --- | --- | --- | --- | --- | ---- | ---- | ---- | ----- | ----- |
| /exchange  |     |     |     |     |     |      |      |      |       |       |
| MoneyIndex |     | n/a |     |     |     |      |      |      |       |       |
| Withdraw   |     | n/a |     |     |     |      |      |      |       |       |

**Delta vs A0 (required if claiming better):**

**Orca shots:**

---

## Row note: B13 chart empty (same day as PROOF-1)

| Field | Value |
| --- | --- |
| Date | 2026-08-02 |
| Tip | feat/app-proof-scorecard + chart overlay commit |
| Role | implementer |
| Eyes | Orca |

**Change:** G11 chart empty status readable (`No market feed — chart has no live history to show`). Dim6 still **1**.  
**Shot:** `docs/styleboard/shots/b13-chart-empty-2026-08-02/02-exchange.png`  
**Refs:** `docs/refs/b13-chart-empty/`

