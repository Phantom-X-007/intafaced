# Internet leverage — Phase A current audit (in-repo)

**Status:** AUDIT COMPLETE · Phase A only (no open-web shopping)  
**Tip at audit:** re-derive — written from worktree on `origin/main` at execute  
**Plan:** `~/projects/OS/harvest/INTERNET-LEVERAGE-CURRENT-AUDIT-PLAN-2026-08-04.md`  
**Term:** **Internet leverage** = already-built code/systems we adopt, wire, or wrap instead of rebuilding (UI or backend).

**Lanes:** Nitro (you + agents) + Denon hard board.  
**Shehzad:** cross-plane notes only (bridge / matching dual-target).

---

## 0 · Verdict (peace of mind)

| Question                               | Answer                                                                                                                                                 |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Do we already hold massive leverage?   | **Yes** — vendored full exchange kit (`vendor/coinexchange`) + full TypeScript spine (`services/*`, `packages/*`) + infra images                       |
| Is product UI law using that leverage? | **Yes, by ADR** — sole product surface = vendor shell `:8090`; `apps/web` retires                                                                      |
| Are we fully _using_ the kit?          | **No** — shell is primary; **Java money is deliberately not the book**; many Java modules not product-path; wallet RPC **not** live-money until review |
| Biggest rebuild risk (Nitro)?          | New UI for screens that already exist in `05_Web_Front` / admin; second terminal; ignoring `ledger-client` recipes                                     |
| Biggest rebuild risk (Denon)?          | Specs that ignore dual-target matching + ledger-only money; reopening `apps/web` as product; dual-editing shell craft                                  |
| Forbidden “leverage”?                  | Java `MemberWallet` as second book; invent prices to make kit “look live”; unaudited wallet_rpc on mainnet                                             |

**One line:** Use the **kit for product shape and screens**, use **our ledger/services for money truth**, wire the gap — do not rebuild either side blindly.

---

## 1 · Prior maps status (E1)

| Prior doc                                                  | Status vs tip                                                                                         | Action                                                    |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| `adr/2026-08-02-adopt-vendored-product-keep-our-ledger.md` | **Still law**                                                                                         | Keep                                                      |
| `adr/2026-08-03-retire-apps-web-port-to-vue-shell.md`      | **Still law**                                                                                         | Keep; port residual named there still open                |
| `adr/2026-07-28-vendored-exchange-integration.md`          | **Still law** (ledger only)                                                                           | Keep                                                      |
| `VENDORED-SHELL-PEACE-OF-MIND-MAP-2026-08-03.md`           | **Mostly true**, paths may say `exchange-tree` / brand tokens — tip tree is **`vendor/coinexchange`** | Treat as map; paths = coinexchange                        |
| `VENDORED-OVERLAP-AUDIT.md`                                | **Historical** (Jul 30) — Java under-use still directionally true                                     | Do not treat fleet row counts as current without re-probe |
| `UPSTREAM-ADOPTION-QUEUE-2026-08-02.md`                    | Queue doc — re-check any open items against tip                                                       | Refresh when acting                                       |
| `REDUNDANT-VS-PORT-2026-08-03.md`                          | Port map for apps/web → shell                                                                         | Still the port checklist                                  |
| `ORDER-ROUTE-VENDOR-MONEY-INVENTORY.md`                    | Money seam inventory                                                                                  | Use for dual-book / Java residual                         |

---

## 2 · Leverage asset register (E2)

### 2.1 Vendored kit (`vendor/coinexchange`) — primary internet leverage

| Asset ID         | Path                                                                            | Kind                      | Use?                                                           | Owner care                     |
| ---------------- | ------------------------------------------------------------------------------- | ------------------------- | -------------------------------------------------------------- | ------------------------------ |
| **V-SHELL**      | `05_Web_Front` (~41 page entries, 74 Vue-class surface)                         | Trader UI                 | **YES — sole product UI**                                      | Nitro                          |
| **V-ADMIN**      | `04_Web_Admin`                                                                  | Operator UI               | **YES — adopt workflows**, rebrand/honesty                     | Nitro later / Denon ops        |
| **V-JAVA**       | `00_framework/*` (exchange, market, otc, ucenter, admin, wallet, chat, jobs, …) | Java microservices        | **Shape + controllers** adapt; **not** balance book            | Denon policy + agents residual |
| **V-WALLET-RPC** | `01_wallet_rpc/*`                                                               | Chain custody RPC         | **Leverage after security review** — not live value until then | Denon + Class X                |
| **V-DOC**        | `09_DOC`                                                                        | Screenshots / nginx notes | Reference                                                      | —                              |
| **V-MOBILE**     | `02_App_Android`, `03_APP_IOS`                                                  | Stubs only                | **No source** — not leverage yet                               | Future decision                |
| **V-ROBOT**      | `06_ExchangeRobot`                                                              | Stub                      | Out of scope                                                   | —                              |
| **V-COMPOSE**    | `vendor/coinexchange-compose.yml` + monorepo compose `vendor-shell`             | Fleet                     | Shell on **:8090**                                             | Ops                            |

**Overlays already ours (leverage + extension):**  
`05_Web_Front/.../pages/intafaced/*` — Academy, Agents, Bank, Blueprint, Chain, Dex, Launch, Pay, P2P, Platform, Protocol, Token, NotBuilt, …

### 2.2 TypeScript services (already-built backend leverage)

| Asset ID    | Service                                 | Leverage for                                  |
| ----------- | --------------------------------------- | --------------------------------------------- |
| S-LEDGER    | `svc-ledger` + `packages/ledger-client` | **Only book** — all money                     |
| S-ID        | `svc-identity`                          | Accounts, rank, keys, KYC surfaces            |
| S-TOKEN     | `svc-token`                             | IFC stake/emissions (honest residuals remain) |
| S-MATCH     | `svc-matching`                          | Fiat plane matching                           |
| S-TRADE     | `svc-trade`                             | Spot/convert done; futures residual           |
| S-PAY       | `svc-pay`                               | Crypto rail done; card/gateway residual       |
| S-BANK      | `svc-bank`                              | Accounts/loans done; earn/cards residual      |
| S-P2P       | `svc-p2p`                               | P2P product                                   |
| S-WS        | `svc-ws`                                | Depth/stream (platform path landed #727/#737) |
| S-EDGE      | `svc-edge`                              | API edge                                      |
| S-PROTOCOL  | `svc-protocol`                          | **Shehzad** contracts/plane                   |
| S-DEX       | `svc-dex`                               | Self-custody DEX (**Shehzad** gravity)        |
| S-INDEXER   | `svc-indexer`                           | Chain read models                             |
| S-NOTIFY    | `svc-notify`                            | Fan-out                                       |
| S-AGENTS    | `svc-agents`                            | Navigator etc.                                |
| S-ACADEMY   | `svc-academy`                           | Lobbies                                       |
| S-BLUEPRINT | `svc-blueprint`                         | Blueprint                                     |

### 2.3 Packages

| Package                                                                   | Leverage                 |
| ------------------------------------------------------------------------- | ------------------------ |
| `ledger-client`                                                           | Money movement only path |
| `contracts` / `events`                                                    | Cross-service API law    |
| `auth` / `config` / `db`                                                  | Shared infra             |
| `i18n` / `ui`                                                             | Shell honesty / tokens   |
| `market-data` / `venue-adapter` / `venue-contracts` / `exchange-contract` | Venue/market wiring      |

### 2.4 Apps (non-product)

| Path         | Role                                                                                     |
| ------------ | ---------------------------------------------------------------------------------------- |
| `apps/web`   | **Retired product** — port source for desk ideas only; delete sequencing = Denon D-P2-01 |
| `apps/admin` | Separate admin surface if present — prefer **V-ADMIN** for exchange ops                  |

### 2.5 Infra leverage (compose)

Postgres 16 · Redis 7 · NATS · OTEL collector · vendor-shell image — **do not rebuild** messaging/DB.

---

## 3 · PAST — already done leverage (E3)

| Work                        | Leverage used                               | Proof / note                    |
| --------------------------- | ------------------------------------------- | ------------------------------- |
| Product UI decision         | V-SHELL not apps/web                        | ADR 2026-08-02 / 2026-08-03     |
| Ledger-only money           | ledger-client recipes                       | ADR 2026-07-28; dual-book scans |
| Shell deployable :8090      | V-SHELL + nginx/compose                     | #412-class + fleet              |
| Spot / convert trade        | S-TRADE + shell Exchange                    | tracker `done`                  |
| WS depth platform path      | S-WS + nginx                                | #727 Denon + #737               |
| Pay crypto rail             | S-PAY adapters                              | #226 / pay.rails done           |
| Bank accounts/loans         | S-BANK                                      | tracker done                    |
| Identity core               | S-ID                                        | tracker done                    |
| Matching engine             | S-MATCH                                     | tracker done                    |
| Order-route / CX-8 program  | Vendor money inventory + our edge           | ORDER-ROUTE docs                |
| Brand scrub / partner names | brand-scan + kit rebrand                    | ongoing gates                   |
| AFK shell honesty residual  | V-SHELL screens (wire/honesty, not rebuild) | freeProduct≈0 shell             |

**Past debt (still true):** kit **breadth** (OTC desk, admin finance workflows, wallet RPC) adopted as **shape** more than **running product path**; Java balance subsystem **must not** be adopted as book.

---

## 4 · NOW — active work × leverage (E4)

### 4.1 Nitro / agents (now)

| Work                                  | Best leverage                                            | Using?                                        | Action                                                    |
| ------------------------------------- | -------------------------------------------------------- | --------------------------------------------- | --------------------------------------------------------- |
| **WS depth client**                   | V-SHELL book UI + S-WS `/ws/stream` + #727 spec          | Partial — platform unblocked; client residual | **WIRE** shell to live feed; no new terminal app          |
| **Decimal-safe desk**                 | `bignumber` under shell assets + port note in retire ADR | Partial                                       | **WIRE** ix-trade to bignumber — not rewrite desk         |
| **Runtime shape validation**          | apps/web patterns as **reference** only                  | Partial                                       | Port discipline into shell, not resurrect Next            |
| **Stranded branch land**              | Existing feat branches                                   | Active                                        | Prefer path-clean land over rewrite                       |
| **#346 pay residual**                 | S-PAY + V-SHELL Pay/intafaced Pay + card sandbox in PR   | Blocked on handoff                            | After handoff: **extend svc-pay**, don’t new pay UI stack |
| **Open #734 multi-asset**             | S-TRADE + contracts + Denon D-S-05 law                   | Risky without law                             | **Pause invent** until D-S-05 or narrow refuse-closed     |
| **Open #735 bank/pay audit residual** | S-BANK/S-PAY                                             | Collision risk                                | Path-check vs Denon/Shehzad; no dual-edit                 |
| **Platform-pages craft**              | V-SHELL `Platform.vue` + cms/uc pages                    | Should                                        | **Craft on kit**, not apps/web                            |
| **Invent / honesty scans**            | fabricated-money gate + shell                            | Active                                        | Keep ratchet; don’t invent to green                       |

### 4.2 Denon (now — hard board)

| Work                                               | Best leverage                                    | Using?                     | Action                                                                       |
| -------------------------------------------------- | ------------------------------------------------ | -------------------------- | ---------------------------------------------------------------------------- |
| **Open PR pile** (#448 #433 #432 #430 #428 #420 …) | Existing services/gates/config                   | Active on **his** branches | **Land** — don’t parallel-rebuild in agents                                  |
| **Fleet image rebuild**                            | compose + Dockerfiles already in repo            | Ops residual               | **Rebuild images** from tip — not new fleet design                           |
| **Market-id authority ADR**                        | S-WS + S-EDGE + S-MATCH reality                  | Partial after #727         | **Write law** so agents don’t invent                                         |
| **D-S-01…05 engine laws**                          | S-TRADE/S-MATCH + kit OTC/exchange **workflows** | Specs missing              | Specs should say: **UI from V-SHELL/V-JAVA shape; money from ledger-client** |
| **D-S-06 matching dual-target**                    | S-MATCH + Shehzad INTACORE later                 | Spec missing               | **Must** reuse matching **spec**, not two product laws                       |
| **D-S-10/11/09 pay/id/bank law**                   | S-PAY/S-ID/S-BANK + kit screens                  | Spec missing               | Name **which kit screens + which recipes**                                   |
| **D-S-12 bridge accounting**                       | S-LEDGER + S-PROTOCOL/S-INDEXER                  | Future                     | Spec only — Shehzad builds chain side                                        |
| **D-P2-01 apps/web delete**                        | Retire ADR + V-SHELL already product             | Pending                    | **Delete** product role; keep port notes                                     |
| **D-P2-02 spine-\* abandon**                       | Remote branches as leverage or cut               | Pending                    | Decide — don’t silent dual-maintain                                          |
| **D-P3 admin Actions/protection**                  | GitHub + existing setup-github.mjs               | Admin                      | Use existing scripts — not new process theater                               |
| **Java dual-book residual**                        | vendor-java-money-scan + dual-book-door          | Scans exist                | **Policy + residual** — don’t re-home balances to Java                       |

---

## 5 · FUTURE — reclaimed / residual mountains (E5)

| Mountain                  | Default leverage                                          | Greenfield OK?              | Notes                                      |
| ------------------------- | --------------------------------------------------------- | --------------------------- | ------------------------------------------ |
| **pay.\*** expand         | S-PAY + V-SHELL pay/uc + kit merchant patterns            | No full rewrite             | After #346 + D-S-10                        |
| **bank.earn/cards/ramps** | S-BANK + V-SHELL Bank.vue + kit finance workflows         | No                          | D-S-09; issuer Class X                     |
| **bank.sovereign-card**   | S-BANK + Shehzad SA contracts (S-E\*)                     | Split                       | Custodial half agents; contract half Shizu |
| **trade.futures**         | S-TRADE residual + S-WS private + kit futures UI if any   | Law first                   | **D-S-01 required**                        |
| **trade.otc**             | Kit **otc** pages + otc-api **workflow** + ledger recipes | No UI rewrite               | **D-S-02**                                 |
| **trade.copy / algo**     | Mostly greenfield engines                                 | Engines yes; UI on shell    | **D-S-03/04**                              |
| **identity money graph**  | S-ID + shell sub-account selector already shipped         | No new identity service     | D-S-11                                     |
| **trade.mm-bot**          | S-TRADE patterns                                          | Thin                        | Nitro owned ready                          |
| **ws.gateway complete**   | S-WS                                                      | No                          | Positions need futures events (D-S-01)     |
| **Admin ops console**     | **V-ADMIN** first                                         | No second admin SPA         | Rebrand/honesty                            |
| **CMS / help / notice**   | Kit **cms** pages                                         | No                          | Honesty/i18n only                          |
| **Notifications**         | S-NOTIFY + kit chat **shape**                             | Partial                     | Don’t rebuild chat stack blindly           |
| **Wallet custody**        | **V-WALLET-RPC** after security review                    | Building from zero = months | Denon gate                                 |
| **Mobile**                | No leverage in repo (stubs)                               | Yes if ever                 | Phase B later                              |
| **Shehzad protocol/L1**   | S-PROTOCOL + forge — his board                            | His plane                   | Don’t steal                                |

---

## 6 · Forbidden leverage (E6)

| Temptation                                                         | Why forbidden             |
| ------------------------------------------------------------------ | ------------------------- |
| Java `MemberWallet` / dual balance tables as source of truth       | Doctrine: ledger only     |
| Invent mids/depth so kit charts “look live”                        | Honesty doctrine          |
| Partner/PSP names in user-facing copy                              | Brand law — adapters only |
| `01_wallet_rpc` on mainnet without security review                 | Custody Class X / ADR     |
| Resurrect `apps/web` as product because it “has a better terminal” | ADR 2026-08-03            |
| Agents implementing Shehzad `svc-protocol` contracts               | Ownership                 |
| Dual-edit Denon open PR files “to help”                            | Collision                 |
| New npm “exchange kit” while coinexchange sits in tree             | Rebuild of V-SHELL        |

---

## 7 · Gap register (E7) — ordered

### P0 — stop silent rebuild / unlock money path

| ID         | Gap                                                             | Who              | Action                                               |
| ---------- | --------------------------------------------------------------- | ---------------- | ---------------------------------------------------- |
| **G-P0-1** | WS client / live feed still residual while platform path exists | Nitro            | Wire V-SHELL to S-WS per #727 — highest leverage NOW |
| **G-P0-2** | Desk may still not use bignumber end-to-end                     | Nitro            | Wire existing asset — retire ADR residual            |
| **G-P0-3** | #346 handoff blocks pay leverage chain                          | Shizu → Nitro    | Finish/handoff then extend S-PAY                     |
| **G-P0-4** | Denon open money PRs unmerged = blocked leverage of fixes       | Denon            | Land P0 pile                                         |
| **G-P0-5** | Engine work without D-S-01…05 = invent or stall                 | Denon then Nitro | Spec factory first                                   |

### P1 — kit under-used (shape adoption)

| ID         | Gap                                                             | Who             | Action                                   |
| ---------- | --------------------------------------------------------------- | --------------- | ---------------------------------------- |
| **G-P1-1** | OTC/admin/CMS workflows not fully product-path                  | Nitro after law | Adopt screens; money via ledger adapters |
| **G-P1-2** | V-ADMIN not primary ops story                                   | Nitro/Denon     | Prefer V-ADMIN over new admin            |
| **G-P1-3** | Peace maps path names drift (`exchange-tree` vs `coinexchange`) | Agents docs     | When touching maps, fix paths            |
| **G-P1-4** | Wallet RPC unused without review                                | Denon           | Security review program before live      |

### P2 — hygiene

| ID         | Gap                                        | Who           | Action                       |
| ---------- | ------------------------------------------ | ------------- | ---------------------------- |
| **G-P2-1** | apps/web still in tree as confusion magnet | Denon D-P2-01 | One-commit delete when ready |
| **G-P2-2** | spine-\* branch pile                       | Denon D-P2-02 | Abandon/resume list          |
| **G-P2-3** | Stale overlap audit fleet numbers          | —             | Don’t cite without re-probe  |

---

## 8 · Hole hunt — second pass (E8)

| Hunt question                      | Result                                                         |
| ---------------------------------- | -------------------------------------------------------------- |
| Missed packages?                   | Covered §2.3                                                   |
| Missed services?                   | All 17 svc-\* listed                                           |
| Mobile leverage?                   | **None** (stubs) — called out future                           |
| Charting?                          | Already decided lightweight-charts on shell — not Phase B shop |
| Existing peace maps ignored?       | Explicitly loaded; path drift noted                            |
| Shehzad plane stolen?              | No — only dual-target + bridge notes                           |
| Phase B mixed in?                  | **No** — no new OSS candidates                                 |
| Tracker done features as leverage? | Core money/identity/trade/ws.depth treated as leverage in §3   |
| Compose infra?                     | Yes §2.5                                                       |
| intafaced overlays?                | Listed as our extension of kit                                 |

**None found that change the verdict** after named hunt above.

---

## 9 · Actions (E9) — no code in this PR beyond this doc

### Nitro / agents (now)

1. **WS client + decimal desk** on V-SHELL — top leverage use.
2. **Never** new product SPA.
3. After #346: pay on **S-PAY + existing Pay screens**.
4. #734 only with D-S-05 or refuse-closed thin.
5. Platform craft → kit pages first.

### Denon (now)

1. Land open P0 PR pile + fleet rebuild.
2. Write **D-S-*** specs that **name leverage** (kit workflow + ledger recipes + our svc).
3. D-S-06 dual-target matching — shared spec.
4. apps/web delete + spine disposition when ready.
5. Wallet RPC review before live custody leverage.

### You (operator)

1. Optional: re-send Denon paste pointing at hard board + this audit.
2. Phase B fan-out only after G-P0-1…5 move — so research fills **real** holes (e.g. mobile, reviewed custody, card issuer adapters).

---

## 10 · Success criteria (this audit)

- [x] Asset register covers vendor + services + packages + infra
- [x] Past / Now / Future matrices
- [x] Denon open PRs + D-S-\* notes
- [x] Reclaimed mountains future rows
- [x] Forbidden leverage
- [x] Gaps ranked
- [x] Second-pass hole hunt
- [x] No Phase B shopping
- [x] Durable on tip via PR

---

## 11 · Phase B boundary (later only)

Search **new** external leverage only for gaps this audit leaves honestly open, e.g.:

- Mobile (no kit source)
- Card issuer / KYC providers (adapters — Class X content separate)
- Post-review custody alternatives if wallet_rpc fails review
- Not: another full exchange Vue kit while coinexchange exists

---

_Board-Delta: Phase A internet leverage audit — in-repo reuse map for Nitro+Denon_
