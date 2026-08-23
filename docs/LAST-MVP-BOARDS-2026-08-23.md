# Last MVP boards — Nitro · Phantom · Shehzad

**Status:** BINDING overlay for this last wave · **2026-08-23**  
**Audience:** `@Phantom-X-007` (Denon / Phantom) · `@shehzad002` (Shehzad / Shizu) · Nitro agents  
**Replaces as live queue:** [`DENON-HARD-PARALLEL-BOARD-2026-08-09.md`](DENON-HARD-PARALLEL-BOARD-2026-08-09.md) (~120 IDs — historical)  
**Does not replace:** ownership law [`THREE-WAY-DISTRIBUTION-2026-08-04.md`](THREE-WAY-DISTRIBUTION-2026-08-04.md) · Shehzad sole-lock [`GITHUB-OWNERSHIP-SHEHZAD.md`](GITHUB-OWNERSHIP-SHEHZAD.md) · Shehzad full runway [`SHEHZAD-BLOCKCHAIN-TASK-BOARD-2026-08-03.md`](SHEHZAD-BLOCKCHAIN-TASK-BOARD-2026-08-03.md) (INTACHAIN stays there, **not this wave**)

**Tip at write:** re-derive `git fetch origin main && git log -1 --oneline origin/main`  
**Tracker at write:** `141/158` shipped · `12` ready · `5` blocked · `30` sockets. Re-derive with `git show origin/main:docs/TRACKER.md | sed -n '1,45p'`.

When **your** list below is empty: **stop**. Do not mill. Do not close a parked socket. Do not wait for Nitro.

---

## 0 · What “finished” means

This wave finishes **MVP**: the spec’d product a user can click on `:8090`, plus Phantom’s remaining human/integrity work, plus Shehzad’s remaining EVM P0 (venue contract + #2473).

It does **not** mean 158/158. Doctrine forbids inventing a BIN, Stripe keys, a named venue, a paid audit firm, or a new L1.

After this wave: **no more product tickets.** Leftover is §1 parked + §2 human blockers.

---

## 1 · Parked (spec’d, not this wave — do not build)

Re-derive: any tracker row with `status: 'socket'`, plus INTACHAIN and everything blocked on it.

### 1a · INTACHAIN / later chain (Shehzad owns; **after** MVP)

| id                          | Why parked                                                                                   |
| --------------------------- | -------------------------------------------------------------------------------------------- |
| `chain.mainnet`             | Own CometBFT + native CLOB — v2, not MVP                                                     |
| `chain.evm`                 | Blocked on `chain.mainnet`                                                                   |
| `bridge.canonical`          | Blocked on `chain.mainnet`                                                                   |
| `chain.validators`          | Blocked on `chain.mainnet`                                                                   |
| `chain.governance`          | Blocked on validators + token governance                                                     |
| `predict.markets`           | INTACORE market type — no L1                                                                 |
| `mining.pool`               | Keep off MVP unless it already lives on ruled EVM rails without a new chain                  |
| `chain.rust-core`           | Socket — rust CLOB                                                                           |
| `socket.dex-execution`      | Socket — needs a quoted venue + vault                                                        |
| `socket.mpc-custody`        | Socket                                                                                       |
| `socket.contract-toolchain` | Socket (Foundry in CI is already partly shipped; this row is the remainder)                  |
| `socket.contract-audit`     | Socket — **Nitro pays** an external firm. `audited:true` stays false. **Do not ping Nitro.** |

### 1b · Thirty §13 sockets (not v1 — inventing a partner is a lie)

`token.yield` · `token.buyback` · `token.governance` · `socket.trade-vwap-pov` · `launch.fundraising` · `launch.structured` · `ops.custody` · `socket.notify-push` · `socket.notify-email` · `socket.notify-sms` · `socket.options-settlement-asset-law` · `socket.rust-matching` · `socket.live-issuer` · `socket.psp-partners` · `socket.pay-precharge-notify` · `socket.forex-settlement` · `socket.otc-maker-routing` · `socket.pay-chargeback-ledger-wire` · `socket.copy-auto-mirror-place` · `socket.vr-client` · `socket.stream-provider` · `socket.geo-region-resolution` · `socket.ledger-sharding` · `socket.indexer-stream` · `socket.dex-venue-set` (Nitro names venues or writes **never**)

Plain: no Stripe/PayPal, no live card BIN, no email/SMS/push vendor, no LiveKit/VR, no token weekly payout/buyback/vote **outcomes**, no named outside venue until Nitro publishes one.

### 1c · Cut from Phantom’s old 120-ID board (not MVP tickets)

Auth/session PDF-without-tickets · load-test numbers as a campaign · backup drill · staging `workflow_dispatch` · secret rotation **itself** (runbook may exist) · GitHub people-reviews. Optional admin clicks are **human blockers** in §2, not product mountains.

---

## 2 · Human blockers (Phantom overview)

Agents cannot close these. Sitting on them does **not** pause §3–§5.

Home for GitHub admin clicks: [`ops/OWNER-GITHUB-CONFIG.md`](ops/OWNER-GITHUB-CONFIG.md). **Live 2026-08-23** (`gh api`, do not trust older “protection 200” snapshots):

| ID                       | Live                                                                               | What it means                                                                                                                                                                                                                                         | Who                          |
| ------------------------ | ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| **G1** `main` protection | **404** · rulesets `[]`                                                            | Anyone with `write` can force-push `main`. Optional click: require Doctrine + Typecheck + Tests/CI merge seal + Gitleaks + Dependency audit, **0** approving reviews, force-push off. **Do not** require people reviews or “up to date before merge”. | Phantom admin                |
| **G2** CODEOWNERS        | advisory (`require_code_owner_reviews` not on; protection absent)                  | **Leave advisory.** Required owners re-creates the bottleneck.                                                                                                                                                                                        | Phantom — do nothing         |
| **G3** auto-merge        | `allow_auto_merge: false`                                                          | Agents poll and merge by hand. Optional: enable Allow auto-merge. Squash-only + delete-on-merge already on.                                                                                                                                           | Phantom admin                |
| **G5** `ZenYoda3`        | structural                                                                         | Nitro-the-person and Nitro agents share one login. Git author is not person-evidence. Do not “fix” in agents.                                                                                                                                         | Phantom + Nitro decide later |
| **Repo roles**           | Phantom **admin** · Shehzad **write** · ZenYoda3 **write** · visibility **public** | Only Phantom can change protection / auto-merge.                                                                                                                                                                                                      | —                            |

**Class X — Nitro human (not a coding gate):**

| Item                                                       | Effect if unset                                       |
| ---------------------------------------------------------- | ----------------------------------------------------- |
| Named venues or written **never** (`socket.dex-venue-set`) | Dex/indexer stay honestly dead                        |
| Pay an external contract auditor                           | `audited:true` unreachable; keep `audited: false`     |
| Licences / sanctions **list** / issuer keys                | Those rooms stay refuse-closed                        |
| Prod go-live **yes**                                       | Not a live money product until then                   |
| Gas-sponsorship float                                      | Paymaster contract may exist; funded account is Nitro |

**Partner PR:** Shehzad **#2473** (`S-E3` ICardPull issuer seam) — open, stale since 2026-08-20, previously CONFLICTING. **His** to rebase/land or kill. Babysit only. Do not dual-edit `svc-protocol/contracts`.

---

## 3 · Phantom — last board (human / integrity only)

**Ban:** Vue / i18n / academy canvas · new `mount-vs-tracker` as Done · Shehzad `.sol` / L1 · closing §1 sockets · inventing §8 numbers.

**Collision:** path-intersect every open Nitro PR before edit. Nitro in flight at write: **#3069** i18n · **#3073** quant sandbox · **#3074** mobile wrap. Re-derive `gh pr list`.

| #        | Mountain                                                                      | Done bar                                                                                                                                                                                                                                                                                                                |
| -------- | ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **P-01** | **Unstamp lies** on money / Shehzad / `web.terminal` rows that are mount-only | Keep `done` only if the **public door** holds; else `wip`/`socket` with the residual named. No new mount file                                                                                                                                                                                                           |
| **P-02** | **Publish or write never** (you live with it)                                 | Settlement asset · copy ISO list · internal MM / house-on-own-venue · futures D3/funding ceiling · insurance size · OTC desk-law · execution letter→bps · token **outcomes** or keep those sockets · listing catalogue · leverage freeze-forever or thaw table. **Venue names = Nitro Class X** — do not invent a venue |
| **P-03** | **Public-door money proofs**                                                  | trade / pay / ledger / matching / bank / p2p / token / agents — fail-closed through mounted tRPC/REST, not a sibling unit file                                                                                                                                                                                          |
| **P-04** | **OMS/EMS** (`execution.sor`)                                                 | Reports, parent/child, cancel — product path. #2248 closed 2026-08-22; leftover still product                                                                                                                                                                                                                           |
| **P-05** | **Venue aggregation TRADING half**                                            | Adapters refuse when book is not payout-grade. Quote-only is not Done                                                                                                                                                                                                                                                   |
| **P-06** | **Java Grade D + jar truth**                                                  | Grade D sites gone; `pnpm vendor-java:rebuild`; scan object = runtime                                                                                                                                                                                                                                                   |
| **P-07** | **Kill-switch completeness**                                                  | Every money route killable from one surface; proven                                                                                                                                                                                                                                                                     |
| **P-08** | **`connect.data-lake` honesty**                                               | Tracker stamped `done` 2026-08-22. Keep only if ticks/books/fills persist; else unstamp                                                                                                                                                                                                                                 |

Then **stop**. Integrity that needs Stripe/BIN stays a socket.

---

## 4 · Shehzad — last MVP board (chain P0 only)

**Ban:** vendor shell · custodial pay/bank/futures · ping Nitro to flip `audited:true` · start INTACHAIN implement this wave · rebuild items already on main (your board §1.5).

| #        | Mountain                                                                       | Done bar                                                                                                                                                           |
| -------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **S-01** | **Land or kill [#2473](https://github.com/Phantom-X-007/intafaced/pull/2473)** | Rebase onto tip. Merged with honest residual **or** closed with one line that matches tracker. Do not sit on CONFLICTING                                           |
| **S-02** | **Real venue contract** (`socket.clob-contracts`)                              | Audited-event surface the indexer can read — not the dev fixture. `audited: false` until Nitro pays a firm                                                         |
| **S-03** | Remaining P0 **not** already on main                                           | Use [`SHEHZAD-BLOCKCHAIN-TASK-BOARD-2026-08-03.md`](SHEHZAD-BLOCKCHAIN-TASK-BOARD-2026-08-03.md) §1.5 so you do not rebuild AMM/escrow/launch that already shipped |

**Out of this wave:** `chain.mainnet` and everything in §1a. That is the next campaign, not MVP.

---

## 5 · Nitro agents — extra volume (do not steal)

Drain [`ops/boom/2026-08-22-agent-board-complete.md`](ops/boom/2026-08-22-agent-board-complete.md). After it: **no second boom**.

**Still this wave (skip if already `done` on tip):**  
`infra.i18n` · `web.mobile-apps` · `api.gateway` · `quant.sdk` · `quant.marketplace` · `ops.business-systems` · `ops.marketing` · `ops.infra-b2b`  
Plus two wirings (not new tracker mountains): **KYB actually blocks money** · **ops.admin fee/listing WRITE**.

**Not Nitro:** Shehzad chain · Phantom invent/unstamp · Class X content.

---

## 6 · Cold start

### Phantom / his agent

```
git fetch origin main && git log -1 --oneline origin/main
gh pr list --author Phantom-X-007 --state open
gh pr list --state open
Read: docs/LAST-MVP-BOARDS-2026-08-23.md  (§1 parked · §2 blockers · §3 your list)
Ban: mount-vs-tracker as Done · Vue · Shehzad implement · closing sockets
Start: P-01 unstamp OR P-02 one publish-or-never OR P-04 OMS/EMS
When §3 is empty: STOP
```

### Shehzad / his agent

```
git fetch origin main && git log -1 --oneline origin/main
gh pr view 2473
Read: docs/LAST-MVP-BOARDS-2026-08-23.md  (§4 your list · §1a INTACHAIN is later)
Do not ping Nitro for audited:true. Keep audited: false.
Start: rebase/land or kill #2473, then S-02 venue contract
When §4 is empty: STOP. Do not begin chain.mainnet this wave.
```

---

## 7 · Paste — Nitro → Phantom (Telegram)

```
Phantom — last MVP board is on GitHub. Tracker-done ≠ product-done. Your agent: this is the live board.

https://github.com/Phantom-X-007/intafaced/blob/main/docs/LAST-MVP-BOARDS-2026-08-23.md

Re-derive:
git fetch origin main && git log -1 --oneline origin/main
gh pr list --state open
pnpm tracker   # or git show origin/main:docs/TRACKER.md | sed -n '1,45p'

YOU (short, human/integrity — then STOP):
P-01 Unstamp money/Shehzad/web.terminal rows that are mount-only. Public door or unstamp. No new mount-vs-tracker.
P-02 Publish or write NEVER: settlement, copy countries, internal MM, futures caps, insurance, OTC, letter→bps, token outcomes or keep sockets, listing catalogue, leverage freeze/thaw. Do NOT invent a venue (Nitro Class X).
P-03 Public-door money proofs (trade/pay/ledger/matching/bank/p2p/token/agents).
P-04 OMS/EMS (execution.sor leftover; #2248 is closed).
P-05 Venue aggregation TRADING half (not quote-only).
P-06 Java Grade D + jar truth.
P-07 Kill-switch completeness.
P-08 connect.data-lake honesty — stamped done 2026-08-22; keep only if ticks/books/fills persist.

NOT YOU: Vue, i18n, academy canvas, Shehzad L1, closing sockets, inventing §8 numbers.
Path-intersect Nitro open PRs (#3069 i18n, #3073 quant, #3074 mobile — re-derive).

PARKED (spec’d, not this wave — do not build):
INTACHAIN + evm/bridge/validators/governance/Predict/mining/rust-core/mpc/contract-audit.
30 sockets: Stripe/cards, email/SMS/push, LiveKit/VR, token yield/buyback/votes, named venue, settlement assets, chargeback wire, OTC maker-routing, copy auto-mirror, fundraising/structured, custody ops, geo, ledger sharding, indexer stream, vwap/pov, rust matching, precharge notify. Full table in the file.

HUMAN BLOCKERS (you / Nitro — not coding gates; do not sit the board on them):
G1 main protection LIVE 404, rulesets []. Optional: required CI checks, 0 people reviews, force-push off. Do NOT add people-gates.
G3 allow_auto_merge false. Optional: turn on.
G2 CODEOWNERS stay advisory.
G5 ZenYoda3 is Nitro+swarm — structural.
Class X Nitro: venue names, audit cheque, licences, sanctions list, issuer keys, go-live yes.
Shehzad #2473 still open — babysit only.

When your 8 rows are empty: product tickets for you are done. Parked stays parked until a later wave or a partner.
```

---

## 8 · Paste — Nitro → Shehzad (Telegram)

```
Shehzad — last MVP board is on GitHub. Your session is NOT finished. Do not wait for Nitro. audited:true stays false.

https://github.com/Phantom-X-007/intafaced/blob/main/docs/LAST-MVP-BOARDS-2026-08-23.md
Full runway still: docs/SHEHZAD-BLOCKCHAIN-TASK-BOARD-2026-08-03.md  (read §1.5 — do not rebuild what is already on main)

THIS WAVE ONLY:
S-01 Land or kill #2473 (ICardPull issuer seam). It is stale / was CONFLICTING. Rebase. Do not sit.
S-02 Real venue contract (socket.clob-contracts) — indexer-readable, not the dev fixture. audited: false.
S-03 Remaining P0 that §1.5 does not already list as shipped.

NOT THIS WAVE: INTACHAIN (chain.mainnet), INTAEVM, bridge, validators, governance, Predict, mining-as-L1, rust core, MPC, external audit (Nitro cheque). Those are parked. After S-01…S-03: STOP.

Do not ping Nitro. Do not touch vendor shell or custodial pay/bank.
```

---

## 9 · Provenance (this turn)

| Fact                                                                                   | How                         |
| -------------------------------------------------------------------------------------- | --------------------------- |
| tip `d62014100` #3075 last MVP boards                                                  | `git fetch` + `origin/main` |
| tracker 141/158 · 12 ready · 5 blocked · 30 sockets                                    | `docs/TRACKER.md` on tip    |
| open PRs #3069 #3073 #3074 ZenYoda3 · #2473 shehzad002                                 | `gh pr list`                |
| protection **404** · rulesets `[]` · `allow_auto_merge` false · public · Phantom admin | `gh api` 2026-08-23         |
| #2248 / #2575 closed 2026-08-22                                                        | `gh pr view`                |
