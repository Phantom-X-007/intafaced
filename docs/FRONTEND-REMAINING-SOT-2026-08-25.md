# Remaining product UI — source of truth

**Status:** Map for remaining UI · **audit 2026-08-26** (Grok, vs Codex “full frontend finished”)  
**Shipped chrome PRs on `origin/main` [RAN-IT]:** desk `#3313` · money `#3358` · bank `#3371` · pay `#3375` · p2p `#3379` · platform OS `#3380` · public `#3384` · route close `#3385` · ticket TIF `#3388`  
**Not done until Codex finish prompt crop-true:** glance on money/bank/pay/home/p2p/otc/modules/public · OTC unify · `apps/admin` craft (Admin-1/2/3) · Wave C (LWC v5 + RSI/MACD goldens + persist). Paste: [`PROMPT-CODEX-FRONTEND-FINISH-2026-08-26.md`](PROMPT-CODEX-FRONTEND-FINISH-2026-08-26.md).  
**Tip at audit:** `origin/main` `9182f3de9`  
**Product UI:** Bazaar `vendor/upstream-exchange/05_Web_Front` `:8090` only. No second SPA. N4 paint. Ledger-client only for value.

This file names **every remaining surface**. It is the map. Each mountain gets its own layout pack **just-in-time** (desk taught us: one picture + slices, then Codex). Do not Codex-paste this whole file as one PR.

---

## 0 · What “the rest” is

The desk is the trade surface. The rest is **everything a member still opens**: sign-in, the ledger book, bank/pay, OTC, OS modules, marketing/CMS, staff admin, later chart power.

Locked from 2026-07-31 (still true): **desk before CMS**. N4 is closed. Honesty vocabulary stays. Green/red = market only.

---

## 1 · Excellence order (named, in order)

| # | Mountain | Pack when | Codex now? |
| - | -------- | --------- | ---------- |
| 0 | **Trader desk** `/exchange` | Done `#3313` · glance verified 2026-08-25 | No |
| 1 | **Money OS** | Code `#3358` · **eye not re-checked** | No |
| 2 | **Bank** `/bank/*` | Code `#3371` (glance tiles in `Bank.vue`) · **eye not checked** | No |
| 3 | **Pay** `/pay/*` | Code `#3375` (same tile pattern, **no SHOW-PAY**) | No |
| 4 | **OTC / C2C** | `/p2p` OS `#3379`; `/otc` `/ctc` still **desk-mode** routes | No |
| 5 | **OS modules** | Chrome unify `#3380`/`#3385` (small diffs, compact IxState) | No |
| 6 | **Marketing / CMS** | Homepage + help/notice/invite `#3384` | No |
| 7 | **Staff admin** | Inventory only: `apps/admin` live, `04_Web_Admin` undeployed. **No craft PR.** | **This session** |
| 8 | **Wave C** LWC v5, RSI/MACD, saved layouts | In this session (Nitro 2026-08-26: finish everything) | **This session** |

---

## 2 · Complete surface list (every route group)

Live = page exists and talks to a real `svc-*` or ledger. **Refuse** = honest not-built (must stay). **Mall** = marketing chrome we kill on money/desk, keep on marketing routes.

### 2.1 Money OS (mountain 1 — deep spec in money SoT)

| Route | File | Live fact | Job |
| ----- | ---- | --------- | --- |
| `/uc/money` | `components/uc/MoneyIndex.vue` | Ledger balances. **No fiat total** (no rate source). Dual-book note. | N4 ledger book. Glance in ~2s. |
| `/uc/record` | `Record.vue` | History | Same book, history tab |
| `/uc/entrust/current` `/history` | `Entrust*.vue` | Open / past orders | Orders in the money OS, link back to desk |
| `/uc/account` `/uc/safe` | `Account.vue` `Safe.vue` | Identity / security | Quiet settings, not a CMS |
| `/uc/recharge` `/uc/withdraw` `/uc/withdraw/address` | `CustodyNotBuilt.vue` | **Refuse.** No chain custody until wallet-RPC review. | Keep one refusal. N4 it. **Do not rebuild Java withdraw.** |
| `/platform` | `pages/intafaced/Platform.vue` | Identity session hub | One session story. Desk “Log in” already points here. |
| `/login` `/register` `/findPwd` | `pages/uc/Login.vue` etc. | Auth | N4 card. Success → **`/exchange`** (locked 2026-07-31). Wallpaper login_bg is residue. |
| `/uc` MemberCenter shell | `pages/uc/MemberCenter.vue` | iView **light** sidebar + promo/innovation mall | OS header + **money rail only**. Kill promo cards as peers of balances. |

### 2.2 Bank (mountain 2)

`/bank` `/bank/spaces` `/transfers` `/earn` `/loans` `/cards` `/ramps` `/analytics` `/business` — `pages/intafaced/Bank.vue` + `bank/*`. Live `svc-bank` + IxSubNav. Job: N4 + quiet IxState; **label vs `/uc/money`** (dim 21). Do not invent card/ramp issuers (Class X).

### 2.3 Pay (mountain 3)

`/pay` + money/merchant/network/permissions/links/payments/settlements/checkout — `svc-pay`. Job: merchant/checkout craft. **No Hyperswitch.** Gateway/PSP are Class X — UI must not fake a live acquirer.

### 2.4 OTC / C2C (mountain 4)

`/otc` `/otc/trade/*` `/ctc` `/uc/ad` `/uc/order`. Job: desk-adjacent P2P, not a mall. Dual-book if fiat vs ledger.

### 2.5 OS modules (mountain 5) — already `ix-page` + `svc-*`

Academy, Launch, Support, Ops, Portfolio, P2P, Token, Agents, Blueprint, Protocol, Dex, Chain, Quant, Execution, Market, Predict, Mining.

Job: **one OS chrome** (header + subnav + quiet honesty). Not 15 landing pages. Empty/error = IxState compact. Do not invent data so they “look live.”

`/dex` is protocol plane — keep plane honesty; do not clone the CEX desk.

### 2.6 Marketing / CMS (mountain 6 — last)

`/` Index, `/lab`, `/invite`, `/partner`, `/bzb`, `/announcement`, `/help*`, `/about-us`, `/app` (APK never existed — already honest).

Job: later. Must not sit on `/exchange` or `/uc/money`.

### 2.7 Staff admin (mountain 7)

Two trees: `vendor/upstream-exchange/04_Web_Admin` and `apps/admin`. **Admin-0 = pick which is live** before any craft. Not trader UI.

### 2.8 Wave C (mountain 8)

LWC v5 panes, RSI/MACD, saved layouts. Plan: `FRONTEND-LWC-V5-PLAN-A6`. Not this season.

---

## 3 · Leverage (do not vibe)

| Need | Phase A | Forbidden |
| ---- | ------- | --------- |
| Shell | V-SHELL `:8090` | New SPA, Tailwind/shadcn, resurrect `apps/web` |
| Money numbers | `packages/ledger-client` + `svc-ledger` | Second book, Java ucenter, fixture-seeded balances |
| Bank / pay / p2p / … | matching `services/svc-*` | Rewrite the domain |
| Custody deposit/withdraw | **Refuse** until wallet-RPC review | Fake addresses, invented fees, pretty custody |
| Chart power | LWC 3.8 in-shell | TradingView product |
| Admin | existing admin tree after Admin-0 | Third ops console |
| Auth | real session / existing fixture | Seeded money as “proof” |

Internet leverage = extend these pages. Not npm a wallet dashboard.

---

## 4 · Cross-cutting law (all remaining mountains)

1. **N4** — near-black, 1px, no glass, no orange, no P21 teal. Market green/red only.  
2. **Quiet honesty** — one line; `Details` for endpoints. Failed ≠ `$0` ≠ empty.  
3. **Dual-book labeled** — venue wallet vs platform ledger vs bank space.  
4. **No fake live-ness.**  
5. **OS chrome vs desk chrome** — `/exchange` stays desk-mode (`#3313`). Money/OS get a **thin OS header** (wordmark, module, account), not the ticker row, not Lab/Announce.  
6. **iView 3 one kit.** Radius-0 on these pages; if tabs break, replace tab chrome **on the page**.  
7. **390** is first-class.  
8. **One mountain per PR.**  
9. **Graphify** does not map vendor Vue — open the Vue file.  
10. **Worktree** `pnpm wt` off tip. Copy untracked SoT files first. `STREAM_A_NODE` = sibling `.tools/node18` if needed. Never the Grok door.

---

## 5 · What we are *not* speccing as a fake product

- A Coinbase-style **deposit/withdraw rail** while custody is refuse. The refusal *is* the product until Denon/wallet-RPC.  
- A second trading desk on `/dex` unless a written hole says Bazaar+LWC cannot do plane-in-desk.  
- Widget-canvas Hyperdash (Wave C).  
- AI homepage, promo carousel, more tabs as quality.

---

## 6 · Implicit needs (rest of UI)

1. After the desk, a pro still has to **see money and get in**. If `/uc/money` still looks like 2018 iView light + a wallpaper login, the desk win dies on the next click.  
2. **Logged-in lands on the desk** (already locked). Money is one hop from the account chip.  
3. Custody honesty must **look designed**, not like a bug.  
4. Bank vs ledger must not show two different “totals” without labels.  
5. He will not pick N1–N4 again.  
6. He looks at pictures, not PR bodies. Each mountain gets a SHOW-*.html before Codex.  
7. Spec just-in-time for the *next* mountain’s layout; this file stays the full map so nothing is silently dropped.

---

## 7 · Flip

Wrong if Nitro says money is not next; if wallet-RPC becomes live (then withdraw is a **new** pack, not a silent restore of Java); if a second SPA becomes law (ADR).

---

## 8 · Go

Paste [`PROMPT-CODEX-FRONTEND-FINISH-2026-08-26.md`](PROMPT-CODEX-FRONTEND-FINISH-2026-08-26.md) into a **new** Codex off tip. That prompt is the finish bar: every member family + admin + Wave C. Do not stop at chrome PRs.
