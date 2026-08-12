# ADR: scanner signal inputs — what may rank; refuse when inputs are missing

**Status:** **Accepted — 2026-08-12 (D26-P0-11 sealed).**
**Decision owner:** repo owner (Denon). **Written by:** Denon.
**Board:** D26-P0-11 · tracker `agents.scanner` · unblocks D26-P1-A3 ranked-signal product path.
**Binds:** Stage-1 ranker in `services/svc-agents` (`rankFixtures` / live wrappers) · refuse-closed cousin in open implement PR #1709 (`signal-inputs-law` gate) — this ADR is the owner seal those gates honour; it does not invent a second ranker.
**Law:** market honesty (no fabricated last/volume/change) · brand §0.7 · agents never invent alpha.

---

## Why this ADR exists before any “hot list”

`agents.scanner` is a high invent surface. Without a named allowlist of **which market fields may contribute to a ranking** and **which ranking recipe is sealed**, any agent can invent:

- a “momentum score” from missing quotes,
- a “hot” ordering when volume is null,
- a new formula mid-flight that looks like product law.

D26-P0-11’s done bar is exactly: **what may rank**, and **refuse when those inputs are missing**. This ADR seals both. It does **not** invent live venue feeds, tier depth matrices, or UI — those remain product residuals under D26-P1-A3 / the tracker pack.

---

## The decision

> **A ranked scanner signal may only be produced from a sealed input allowlist and a sealed ranking recipe. Missing required inputs → typed refuse or omit — never invent, never zero-fill, never synthesise alpha.**

This is settled. Agents and engineers implement it; they do not re-litigate it or extend the allowlist/recipe without a later owner seal.

---

## Named input universe (closed for v1 naming)

These are the only field kinds that may ever appear on a sealed allowlist until a later owner ruling adds more by name:

| Kind           | Meaning                                                         | Money / quote honesty                                      |
| -------------- | --------------------------------------------------------------- | ---------------------------------------------------------- |
| `last`         | Last trade / mid as a decimal string from a proven feed         | Null / unparseable → incomplete                            |
| `volume24h`    | 24h volume as a decimal string from a proven feed               | Null / negative / unparseable → incomplete                 |
| `change24hBps` | 24h change in basis points (integer/number from a proven feed)  | Null → incomplete                                          |
| `spread`       | Book spread from a proven book (named for future recipes only)  | Not used by the v1 recipe                                  |
| `funding`      | Funding rate from a proven perp feed (named for future recipes) | Not used by the v1 recipe; not a licence to invent funding |

Agents **must not** invent additional kinds (`sentiment`, `social`, `ai_score`, partner-model scores, etc.) under this seal.

---

## Sealed v1 ranking recipe

| Field               | Value                                                                 |
| ------------------- | --------------------------------------------------------------------- |
| `rankingRecipeId`   | `abs_change_x_log_volume`                                             |
| Required inputs     | `last`, `volume24h`, `change24hBps` (all three on the allowlist)      |
| Score (relative)    | `abs(change24hBps) × log1p(volume24h)` as a **relative rank key**     |
| Score is not money  | Decimal-string score is ordering only — never a balance, quote, or PnL |

This is the recipe the Stage-1 fixture ranker already implements. Sealing it here makes that the **only** production ranking recipe until a later owner ADR names another `rankingRecipeId`.

**Allowlist for the sealed production law (v1):** exactly `last`, `volume24h`, `change24hBps`.  
`spread` and `funding` remain in the **named universe** so a later recipe can opt in without inventing new kinds — they are **not** on the v1 allowlist and **must not** be scored today.

---

## Refuse matrix (fail closed)

| Situation                                         | Correct answer                                                                 |
| ------------------------------------------------- | ------------------------------------------------------------------------------ |
| Law unpublished / blank / not `p0_11: sealed`     | **Refuse** ranked path (`signal_inputs_law_blank`) — no invent rankings        |
| Sealed allowlist empty                            | **Refuse** (`inputs_empty`)                                                    |
| Unknown `rankingRecipeId`                         | **Refuse** (`ranking_recipe_unknown`) — do not guess a formula                 |
| Sealed recipe missing a required input on allowlist | **Refuse** (`required_inputs_missing`)                                       |
| Per-row required field null / unparseable / stale | **Omit that row**; if none remain → typed empty / unavailable — never invent |
| Market plane dark / no live path                  | Existing unavailable / dark refuse — still no invent                           |

Wire copy key for the law-level refuse: `agents.scanner.signal_inputs_closed` (brand-safe; no vendor names).

---

## What agents may implement without asking again

- Honour this seal in `svc-agents` scanner rank / session / live paths: gate on sealed law; refuse when blank or inputs missing.
- Keep Stage-1 fixture ranking under `abs_change_x_log_volume` only.
- Typed refuse / omit for incomplete or stale rows (already in `rankFixtures`).
- After this ADR is on tip, set the **production** scanner law object to the sealed v1 allowlist + recipe above (implement PRs — notably #1709’s gate — flip `published: true` / `p0_11: 'sealed'`; do not invent a second gate module).

## What remains blocked / residual

- Any new ranking recipe or input kind — needs a later owner seal.
- Using `spread` or `funding` in a score before a recipe that names them is sealed.
- Live allowlisted spot tickers / Class X venue data — tracker residual; this ADR does not invent feeds.
- Tier depth matrix (how many rows free vs staked) — separate product law; not invented here.
- Shell / UI scanner surface.

---

## Done bar (D26-P0-11)

1. This ADR names the closed input universe and the sealed v1 recipe + required inputs.
2. Refuse-when-missing is mandatory law (table above) — no invent rankings or zero-filled scores.
3. Implement gates (e.g. #1709) may ship refuse-closed until the sealed production constant is flipped; they must not invent alternate formulas while waiting.
4. Tracker `agents.scanner` stays not-Done until the live data path honesty residual clears — law seal ≠ product-complete.

---

## Explicit non-goals

- No second money book, no SPA rebuild, no invented mids/depth.
- No auto-trade from scanner.
- No Shehzad chain work under this id.
- No `features.mjs` Done flip from this ADR alone.
