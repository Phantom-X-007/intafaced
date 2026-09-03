---
name: intafaced-ui
description: >
  Governor for INTAFACED member-shell frontend work (vendored Vue 2 Bazaar, uiproof,
  N4, money/session honesty, crops). Use when editing vendor/upstream-exchange/05_Web_Front,
  tooling/uiproof, frontend fixtures, calibration, ticket/blotter/money/bank/pay UI, or
  when claiming a screen is proved. Slash: /intafaced-ui. v0 — no UI is certified yet.
---

# intafaced-ui v0

**No UI is certified.** This skill routes method and enforces product law. It does not declare the frontend green, does not invent a second brand, and does not replace remaining-SOT.

Authority, in order:

1. `AGENTS.md` + `INTAFACED_DEFINITIVE_BUILD.md`
2. `docs/FRONTEND-REMAINING-SOT-2026-08-25.md` on **origin/main** (door copy may be stale)
3. `docs/PROMPT-GROK-FRONTEND-GO.md` on origin/main (how Grok runs this; Codex-look only)
4. This skill

Repo law wins. Do not create a second SPA, design system, or money book.

## Before any frontend edit

1. `git fetch origin main`. Work in `pnpm wt` off that tip. Never the Grok door.
2. Read remaining-SOT via `git show origin/main:docs/FRONTEND-REMAINING-SOT-2026-08-25.md`. Run §11 (decision → authority → states → transitions → falsifier → evidence).
3. Classify `LOOK | TRUTH | BOTH` (GO brief §3). Grok does not paint. Codex does not author fixtures/money.
4. Name the claim class: `BROWSER-PROVED` | `SOURCE-READ` | `UNVERIFIED` | `REFUSED`.

## Evidence

A localhost URL is not proof. Crops + provenance are.

Every BROWSER-PROVED crop names: route, fixture, browser, viewport, SHA, worktree, evidence file, user task, API/session behavior.

`pnpm ui:boot` allocates a unique port and writes `.artifacts/uiproof/provenance.json`. Never reuse a foreign process because `:8090` returned 200. Playwright must not default to 8090.

Tracked PNGs, Axe, and “211 cells” are not design, a11y, or §18.2.

DoD is remaining-SOT **§18.2 copied literally**. The GO sequence is a wrapper.

## Fixtures (v0 live set)

Only these four, until a named real fixture exists:

1. Anonymous + dependencies down
2. Memory-authenticated + dependencies down
3. Reachable but genuinely empty
4. Explicitly refused / not built

Do not seed balances. Memory + HTTP 503 on `/uc/money` is authenticated degraded — not a ledger, not a balance, not reachable-zero.

Failed ≠ `$0` ≠ empty. Unauthorized ≠ anonymous. Implement NOW behavior even when the claim stays SOURCE-READ.

## Calibration paths (methodology only — not Layer A done)

`/` · `/login` · `/exchange/btc_usdt` · `/uc/money` (include signed-out) · `/bank` (OS glance).

`/bank` is not `/bank/business`. Pay (`/pay` and `/pay/checkout`) is out of this calibration.

## Money and session

Value only through `packages/ledger-client`. Decimal strings on the wire; scaled bigint in memory. No JS `Number` economics. No persistent browser bearer. No optimistic success. Close is `DELETE /api/v1/positions/:id` (ACCEPTED/REJECTED/UNKNOWN) — not flatten. Destructive flatten/reverse/join stay off until a blast-radius payload.

Grok authors capability **tests** and wires. Codex **mounts** refuse-or-real ticket chrome. Grok must not add Vue buttons as “truth-only.”

Money-facing: adversarial pass by someone other than the fixture author and other than the look author.

## Look (Codex only — unfrozen in v0)

N4 is closed product law (near-black, square, no glass, no orange identity, green/red = market only). That is not “Money/Bank/Pay look is done.”

**v0 does not freeze look routing.** Codex authors Impeccable allow/deny application and 390/density after five-path calibration. Until v1: do not mint a second kit; iView 3 only; no Tailwind/shadcn; `/exchange` stays desk chrome; Money/OS get a thin OS header, not the ticker row.

Impeccable pin `c0f495212236129c2e92aaf7714a3a9914569d13`. Allow: document, layout, quieter, distill, harden, clarify, critique, audit, adapt, polish, shape. Forbid: init, extract, Impeccable `live` CLI (including inside Orca), `npx`. Critique without detector = degraded. Vercel pin `e3d624baaf29dc1fc645aff3e38f03e564d2d6b1`. No Taste-Skill. No Anthropic frontend-design.

LOOK/BOTH PRs cannot merge without Codex crop-true on that SHA (1440 and 390 files). Grok certifies truth only.

## Accessibility

WCAG 2.2 AA is the target. Axe does not certify it. Named AT claims need route, fixture, browser, AT+version, viewport, named task, expected vs observed. 320 CSS px + 400% reflow; 24×24 targets.

## Graphify

`services/` and `packages/` only. Vendor Vue is not in the graph — open the Vue file. Do not commit graphify-out on a product PR.

## Stop

SOCKET items (Advanced Charts access, Trading Platform, hotkey blast-radius policy, layout-share, mobile control plane) stay SOCKET. `go` does not close them. Leave the chart host; freshness is Grok TRUTH on LWC, not a restyle.
