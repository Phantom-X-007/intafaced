# Customer and team surfaces that exist today

**Question.** What customer screens and team screens exist today, in the code this branch actually serves?

**Branch.** `docs/frontend-surface-inventory` at `e3492387b`, cut from GitHub main. Read on 2026-10-02.

**How this was answered.** From the route tables and the page files they load, plus the compose file that says which of those apps is served. Old frontend plans are listed at the end as history. They are not the inventory. This note does not propose a look.

## The product UI folder

The customer UI this branch serves is the vendored Vue shell:

`vendor/upstream-exchange/05_Web_Front`

Compose names that directory the sole product surface. The `vendor-shell` service builds it and publishes port `8090`. Nginx in that image serves the built shell and sends unknown paths to `index.html`, because Vue Router is in history mode. Sources: `docker-compose.apps.yml` (the `vendor-shell` service and the comment above it), `vendor/upstream-exchange/05_Web_Front/Dockerfile`, `vendor/upstream-exchange/05_Web_Front/nginx.conf` (`location /` with `try_files`), `vendor/upstream-exchange/05_Web_Front/src/main.js` (`new VueRouter({ mode: 'history', routes })`).

The route table that shell loads is `vendor/upstream-exchange/05_Web_Front/src/config/routes.js`. Screen names beside those paths are `vendor/upstream-exchange/05_Web_Front/src/config/route-semantics.js`. Every `require([...])` in the route table points at a file that is on disk. There are 73 `*.vue` files under `src/pages/`. Seven of them are not route entries. Those seven are named in the customer section below.

`apps/web` does not exist on this branch. There is no `apps/web` directory and `git ls-files apps/web` is empty. Compose still has a comment that says the directory "is still on disk pending an owner go on deletion" (`docker-compose.apps.yml`, the `no-deploy: web` note). That sentence does not match the tree. The same file's `vendor-shell` note is the one that matches: the customer surface is the Vue shell on `:8090`, and the old Next `web` service is not in the file.

The team desk still exists. It is `apps/admin`, a Next.js App Router app served as the `admin` service on port `3100` (`docker-compose.apps.yml` service `admin`; `apps/admin/package.json` scripts `dev` and `start` use `--port 3100`). Its page list is the `page.tsx` files under `apps/admin/src/app/`, and the links an operator sees are `apps/admin/src/components/nav.tsx`.

Two other UI folders are in the tree and are not that product:

- `vendor/upstream-exchange/04_Web_Admin` is on disk. Compose says it is deliberately not a service (`docker-compose.apps.yml`, the `no-deploy: 04_Web_Admin` note). It is not the team desk this branch serves.
- `sites/sovereign-os/` is a static apply site (`sites/sovereign-os/README.md`). Nothing in `docker-compose.apps.yml` or `package.json` serves it. It is not the product shell.
- `apps/mobile` is a Capacitor project (`apps/mobile/package.json`, `apps/mobile/capacitor.config.json`). Compose says it is not a fleet HTTP service (`docker-compose.apps.yml`, the `no-deploy: mobile` note). The page committed at `apps/mobile/www/index.html` is one short note, not a second route table. `apps/mobile/scripts/build-wrap.mjs` copies the Vue shell's `dist/` into `www` only when that build already exists.

Doctrine agrees that the shell is the product surface and that `apps/web` is retired (`INTAFACED_DEFINITIVE_BUILD.md` §5.3; `docs/adr/2026-08-03-retire-apps-web-port-to-vue-shell.md`). Doctrine §5.3 also names Convert and Copy as shell surfaces. `routes.js` has no `/convert` and no `/copy`. Those names are a claim, not a mounted screen.

## Areas a customer can open

A customer opens these by URL on the shell. The router is `routes.js`. A signed-out visitor is sent to `/login` only when a matched record has `meta.requiresAuth`. That check is `router.beforeEach` in `main.js`. Routes below with no auth note have no `requiresAuth` in the table, including bank, pay, and the exchange desk.

Names in quotes are the `title` strings in `route-semantics.js`.

### Home, sign-in, and public pages

| Path                                       | Name in `route-semantics.js` | Page file                               |
| ------------------------------------------ | ---------------------------- | --------------------------------------- |
| `/` and `/index`                           | Home                         | `src/pages/index/Index.vue`             |
| `/login` and `/login/returnUrl/:returnUrl` | Sign in                      | `src/pages/uc/Login.vue`                |
| `/register`                                | Create account               | `src/pages/uc/Register.vue`             |
| `/reg`                                     | Create account on mobile     | `src/pages/uc/MobileRegister.vue`       |
| `/findPwd`                                 | Recover account              | `src/pages/uc/FindPwd.vue`              |
| `/app`                                     | Mobile app                   | `src/pages/uc/AppDownload.vue`          |
| `/help`                                    | Help centre                  | `src/pages/cms/Help.vue`                |
| `/helplist`                                | Help topics                  | `src/pages/cms/HelpList.vue`            |
| `/helpdetail`                              | Help article                 | `src/pages/cms/HelpDetail.vue`          |
| `/notice`                                  | Announcements                | `src/pages/cms/Notice.vue`              |
| `/announcement/:id`                        | Announcement                 | `src/pages/cms/NoticeItem.vue`          |
| `/invite`                                  | Invitations                  | `src/pages/invite/Invite.vue`           |
| `/lab`                                     | Lab                          | `src/pages/activity/Activity.vue`       |
| `/lab/detail/:id`                          | Lab activity                 | `src/pages/activity/ActivityDetail.vue` |
| `/partner`                                 | Partner programme            | `src/pages/activity/Partner.vue`        |
| `/bzb`                                     | Token information            | `src/pages/activity/Bzb.vue`            |
| `/about-us`                                | About INTAFACED              | `src/pages/cms/AboutUs.vue`             |

`/announcement` redirects to `/notice`. `/ctc` redirects to `/p2p`. Both are in `routes.js`.

The marketing header links Desk, Money, Pay, and Platform (`src/App.vue`, `isMarketingRoute`). That header is used for `/` and for the roots `help`, `helplist`, `helpdetail`, `notice`, `announcement`, `invite`, `lab`, `partner`, `bzb`, `about-us`, and `app`.

### Exchange desk

| Path                              | Name          | Page file                         |
| --------------------------------- | ------------- | --------------------------------- |
| `/exchange` and `/exchange/:pair` | Exchange desk | `src/pages/exchange/Exchange.vue` |

`App.vue` treats only those two paths as the full-viewport terminal (`isTerminalRoute`). The same header offers a link to `/dex` beside it. `/dex` is a different page, listed with the platform modules.

### Money: bank, pay, balances, peer-to-peer

Bank and pay paths are flat routes, not nested children (`routes.js` comment above `/bank`). The tab lists are `src/config/ix-nav.js` (`BANK_NAV`, `PAY_NAV`).

| Path               | Name                | Page file                                 |
| ------------------ | ------------------- | ----------------------------------------- |
| `/bank`            | Bank                | `src/pages/intafaced/Bank.vue`            |
| `/bank/spaces`     | Bank spaces         | `src/pages/intafaced/bank/Spaces.vue`     |
| `/bank/transfers`  | Bank transfers      | `src/pages/intafaced/bank/Transfers.vue`  |
| `/bank/earn`       | Bank earn           | `src/pages/intafaced/bank/Earn.vue`       |
| `/bank/loans`      | Bank loans          | `src/pages/intafaced/bank/Loans.vue`      |
| `/bank/cards`      | Bank cards          | `src/pages/intafaced/bank/Cards.vue`      |
| `/bank/ramps`      | Bank ramps          | `src/pages/intafaced/bank/Ramps.vue`      |
| `/bank/analytics`  | Bank analytics      | `src/pages/intafaced/bank/Analytics.vue`  |
| `/bank/business`   | Business banking    | `src/pages/intafaced/bank/Business.vue`   |
| `/pay`             | Payments            | `src/pages/intafaced/Pay.vue`             |
| `/pay/money`       | Payment balances    | `src/pages/intafaced/pay/Money.vue`       |
| `/pay/merchant`    | Merchant payments   | `src/pages/intafaced/pay/Merchant.vue`    |
| `/pay/network`     | Payment network     | `src/pages/intafaced/pay/Network.vue`     |
| `/pay/permissions` | Payment permissions | `src/pages/intafaced/pay/Permissions.vue` |
| `/pay/links`       | Payment links       | `src/pages/intafaced/pay/Links.vue`       |
| `/pay/payments`    | Payment activity    | `src/pages/intafaced/pay/Payments.vue`    |
| `/pay/settlements` | Payment settlements | `src/pages/intafaced/pay/Settlements.vue` |
| `/pay/checkout`    | Checkout            | `src/pages/intafaced/pay/Checkout.vue`    |

Account money paths live under `/uc`, inside `src/pages/uc/MemberCenter.vue`. These child routes do **not** set `requiresAuth`:

| Path                   | Name                 | Page file                               |
| ---------------------- | -------------------- | --------------------------------------- |
| `/uc/money`            | Balances             | `src/components/uc/MoneyIndex.vue`      |
| `/uc/record`           | Transaction records  | `src/components/uc/Record.vue`          |
| `/uc/recharge`         | Deposit              | `src/components/uc/Recharge.vue`        |
| `/uc/withdraw`         | Withdraw             | `src/components/uc/Withdraw.vue`        |
| `/uc/withdraw/address` | Withdrawal addresses | `src/components/uc/WithdrawAddress.vue` |
| `/uc/entrust/current`  | Open orders          | `src/components/uc/EntrustCurrent.vue`  |
| `/uc/entrust/history`  | Order history        | `src/components/uc/EntrustHistory.vue`  |

`Recharge.vue`, `Withdraw.vue`, and `WithdrawAddress.vue` each render `src/components/uc/CustodyNotBuilt.vue`. The route still opens.

Peer-to-peer:

| Path             | Name                       | Page file                     | Auth                            |
| ---------------- | -------------------------- | ----------------------------- | ------------------------------- |
| `/p2p`           | Peer-to-peer trading       | `src/pages/intafaced/P2P.vue` | no                              |
| `/otc`           | Peer-to-peer trading       | `src/pages/otc/Main.vue`      | yes, on the parent              |
| `/otc/trade/*`   | Peer-to-peer market        | `src/pages/otc/Trade.vue`     | yes, because the parent matches |
| `/otc/tradeInfo` | Peer-to-peer order details | `src/pages/otc/TradeInfo.vue` | yes                             |
| `/checkuser`     | Counterparty verification  | `src/pages/otc/CheckUser.vue` | yes                             |
| `/chat`          | Order chat                 | `src/pages/otc/Chat.vue`      | yes                             |

The empty `/otc` child redirects to `trade/usdt`, so the signed-in desk opens at `/otc/trade/usdt` (`routes.js`). The legacy header item for that URL is `display:none` (`App.vue`). `/ctc` does not mount `src/pages/ctc/Ctc.vue`. It redirects to `/p2p`.

### Platform modules

`/platform` ("Platform") loads `src/pages/intafaced/Platform.vue`.

The header dropdown is `MODULES` in `src/config/intafaced.js`, rendered from `App.vue` (`ixModules`). These routes are also in `routes.js`:

| Path              | Name                   | Page file                                |
| ----------------- | ---------------------- | ---------------------------------------- |
| `/bank`           | Bank                   | already listed under money               |
| `/pay`            | Payments               | already listed under money               |
| `/market`         | Market intelligence    | `src/pages/intafaced/Market.vue`         |
| `/market/mine`    | My market research     | `src/pages/intafaced/market/Mine.vue`    |
| `/support`        | Support                | `src/pages/intafaced/Support.vue`        |
| `/portfolio`      | Portfolio              | `src/pages/intafaced/Portfolio.vue`      |
| `/p2p`            | Peer-to-peer trading   | already listed                           |
| `/token`          | Token                  | `src/pages/intafaced/Token.vue`          |
| `/agents`         | Agents                 | `src/pages/intafaced/Agents.vue`         |
| `/blueprint`      | Blueprint              | `src/pages/intafaced/Blueprint.vue`      |
| `/protocol`       | Protocol               | `src/pages/intafaced/Protocol.vue`       |
| `/dex`            | Decentralized exchange | `src/pages/intafaced/Dex.vue`            |
| `/chain`          | Chain                  | `src/pages/intafaced/Chain.vue`          |
| `/academy`        | Academy                | `src/pages/intafaced/Academy.vue`        |
| `/launch`         | Launch                 | `src/pages/intafaced/Launch.vue`         |
| `/quant`          | Quant                  | `src/pages/intafaced/quant/Sandbox.vue`  |
| `/quant/studio`   | Quant studio           | `src/pages/intafaced/quant/Studio.vue`   |
| `/quant/backtest` | Quant backtest         | `src/pages/intafaced/quant/Backtest.vue` |
| `/execution`      | Execution              | `src/pages/intafaced/execution/Arb.vue`  |
| `/predict`        | Prediction markets     | `src/pages/intafaced/Predict.vue`        |
| `/mining`         | Mining                 | `src/pages/intafaced/Mining.vue`         |

`/market/mine` embeds `src/pages/intafaced/market/StrategyListing.vue`. That file is not its own route. Quant tab targets are `QUANT_NAV` and market tabs are `MARKET_NAV` in `ix-nav.js`.

`/academy` embeds `academy/Curriculum.vue`, `academy/Certs.vue`, and `academy/Canvas.vue` (`Academy.vue` imports). `Canvas.vue` embeds `academy/Vr.vue`. None of those four is its own route.

`/ops` ("Operations") loads `src/pages/intafaced/Ops.vue`. It is a customer-shell route. It is not in `MODULES`, so it is not in the platform dropdown. `App.vue` still treats the `/ops` root as a platform-module header (`platformModuleLabel`). It is not an `apps/admin` page.

`/identbusiness` ("Merchant verification") loads `src/pages/uc/IdentBusiness.vue` and requires a session.

### Account pages that require a session

These are children of `/uc` unless noted. The parent itself does not set `requiresAuth`. The children that do are marked in `routes.js`. `/uc` and `/uc/safe` are the same component.

| Path                        | Name                       | Page file                                |
| --------------------------- | -------------------------- | ---------------------------------------- |
| `/uc` and `/uc/safe`        | Account / Account security | `src/components/uc/Safe.vue`             |
| `/uc/account`               | Account verification       | `src/components/uc/Account.vue`          |
| `/uc/ad`                    | My advertisements          | `src/components/otc/MyAd.vue`            |
| `/uc/ad/create`             | Create advertisement       | `src/pages/otc/AdPublish.vue`            |
| `/uc/ad/update`             | Update advertisement       | `src/pages/otc/AdPublish.vue`            |
| `/uc/order`                 | Peer-to-peer orders        | `src/components/uc/myorder.vue`          |
| `/uc/trade`                 | Trade history              | `src/components/uc/MinTrade.vue`         |
| `/uc/invitingmining`        | Invitation rewards         | `src/components/uc/InvitingMin.vue`      |
| `/uc/paydividends`          | Dividend records           | `src/components/uc/PayDividends.vue`     |
| `/uc/promotion/mycards`     | Promotion cards            | `src/components/uc/PromotionMyCards.vue` |
| `/uc/promotion/mypromotion` | My promotions              | `src/components/uc/MyPromotion.vue`      |
| `/uc/innovation/myorders`   | Innovation orders          | `src/components/uc/InnovationOrders.vue` |

### Anything else

`*` ("Page not found") loads `src/pages/NotFound.vue`. `routes.js` says this entry stays last.

Page files that are not routes:

- `src/pages/ctc/Ctc.vue` — no `require` in `routes.js`. `/ctc` redirects to `/p2p`.
- `src/pages/intafaced/NotBuilt.vue` — mentioned in a comment in `routes.js`. No route loads it. `/academy` and `/launch` load `Academy.vue` and `Launch.vue`.

`routes.js` also says `/whitepaper` is absent on purpose, and that ten older CMS paths were removed because their components are not in the tree.

## Areas the team desk can open

The served team desk is `apps/admin`. The operator nav is the `ROUTES` array in `apps/admin/src/components/nav.tsx`. Each href is a `page.tsx`:

| Path            | Nav label       | Page file                                  | What the page file mounts |
| --------------- | --------------- | ------------------------------------------ | ------------------------- |
| `/`             | Kill-switches   | `apps/admin/src/app/page.tsx`              | `KillSwitchBoard`         |
| `/launch`       | Launch sequence | `apps/admin/src/app/launch/page.tsx`       | `LaunchSequence`          |
| `/jurisdiction` | Jurisdiction    | `apps/admin/src/app/jurisdiction/page.tsx` | `JurisdictionBoard`       |
| `/ledger`       | Ledger ops      | `apps/admin/src/app/ledger/page.tsx`       | `LedgerOps`               |
| `/tools`        | Operator tools  | `apps/admin/src/app/tools/page.tsx`        | `OperatorToolsBoard`      |

The layout titles the app "INTAFACED · Operator Console" and renders that nav (`apps/admin/src/app/layout.tsx`).

`apps/admin/src/app/route-probe/crash/page.tsx` is not an operator area. It calls `notFound()` unless `ADMIN_ROUTE_PROBE` is `1`. The comment says that flag is for `scripts/route-boundaries-harness.mjs` only.

These are request handlers, not screens: `apps/admin/src/app/api/kill-switch/route.ts`, `apps/admin/src/app/api/ledger-freeze/route.ts`, `apps/admin/src/app/api/operator-tools/route.ts`, `apps/admin/src/app/api/analytics/warehouse/route.ts`.

`vendor/upstream-exchange/04_Web_Admin` is not in this list. Compose does not serve it.

## Docs that claim a locked color

They disagree. This note does not pick a color.

Doctrine says the design system is "black glass / phosphor green" (`INTAFACED_DEFINITIVE_BUILD.md` §2) and that tokens are locked to "pure black `#000`, phosphor green `#00FF41` primary, glass surfaces (`backdrop-blur`, 1px `rgba(0,255,65,0.15)` borders)" (`INTAFACED_DEFINITIVE_BUILD.md` §3).

The README repeats that lock: "the locked design system: pure black, phosphor `#00FF41`, glass surfaces, Orbitron + Inter" (`README.md`, the `packages/ui` paragraph).

`packages/ui/src/index.ts` still says "Black glass, phosphor green." The token file next to it says something else: "Black, with a restrained orange identity accent" and "Orange is the single identity pin (#FF6B00)" (`packages/ui/src/tokens.ts`). The test named "§3 design tokens are locked" expects `color.accent` to be `#FF6B00`, not `#00FF41` (`packages/ui/src/tokens.test.ts`). The same token file still defines `blur.panel` as `blur(12px)`.

The shell stylesheet header says it "modernises every surface at once — glass panels, real radii, soft elevation" and then, in the same header, "LOCK: N4 Terminal Zero — near-black, square hairlines, no glass, no P21 teal. Restrained identity accent #FF6B00" (`vendor/upstream-exchange/05_Web_Front/src/assets/css/intafaced.css`). The `:root` block under that lock sets `--ix-bg: #000000`, `--ix-text: #c8c8c8`, `--ix-orange: #ff6b00`, `--ix-up: #0ecb81`, `--ix-down: #f6465d`, and `--ix-blur: none`.

`docs/FRONTEND-EXCHANGE-DESK-SOT-2026-08-25.md` §4 says "N4 Terminal Zero — LOCKED 2026-08-25" and "no glass" and "no orange accent", with "bg `#000` · panel near-black · text `#c8c8c8`" and "Market up `#0ecb81` / down `#f6465d`". It also says "P21 teal" is "Dead." That "no orange" line disagrees with the shell CSS lock and with `packages/ui` tokens, which both pin `#FF6B00`.

`docs/COLOR-LOCK-P21-PROVISIONAL-2026-07-31.md` says it is superseded, then still prints two locks: a "Current lock (2026-08-02)" whose accent is `#ff6b00`, and a "P21 values (locked values)" table whose accent is `#00c2a8` and whose background is `#0a0c10`.

`docs/STREAM-A-DESIGN-BAR.md` says "Provisional lock: P21 deep neutral + teal" and points at that color-lock file. The same file's top line says P21 teal is not live paint and that live paint is N4.

`docs/FRONTEND-STYLEBOARD-DRAFT-N1-N4-2026-07-31.md` calls itself "not a pick yet" and sketches N4 as "bg `#000`, fg `#c8c8c8`, 1px borders, no glass." Its last line says "Not decided here."

`docs/FRONTEND-EXCHANGE-DESK-LAYOUT-SOT-2026-08-25.md` says "N4 Terminal Zero stays (near-black, 1px, no glass, no orange)." Its own first line marks the file `[HISTORY 2026-09-01]`.

`sites/sovereign-os/DESIGN.md` is a different folder. It says "Color (committed dark)" and sets `--lime: #b8ff3c` and `--void: #070a08`. That site is not the served product shell.

The accepted shell ADR drops a "phosphor-bloom backdrop" because "it belongs to a different product" and "The shell's look is the vendor's" (`docs/adr/2026-08-03-retire-apps-web-port-to-vue-shell.md`). It does not name a hex.

## Old frontend plan documents

Later agents must treat these as history. They are claims about the frontend. They are not the route table. This note does not rewrite them.

Plans and scorecards:

- `docs/FRONTEND-AFK-AUTONOMOUS-CAMPAIGN-2026-08-02.md`
- `docs/FRONTEND-AUTONOMOUS-CONTINUE-2026-07-31.md`
- `docs/FRONTEND-AUTONOMOUS-OPERATING-SYSTEM-2026-08-02.md`
- `docs/FRONTEND-BASELINE-SCORECARD-A0-2026-07-31.md`
- `docs/FRONTEND-EXCHANGE-DESK-LAYOUT-SOT-2026-08-25.md`
- `docs/FRONTEND-EXCHANGE-DESK-SOT-2026-08-25.md`
- `docs/FRONTEND-GO-READY-BRIEF-2026-08-02.md`
- `docs/FRONTEND-HONESTY-VOCABULARY-A1-2026-07-31.md`
- `docs/FRONTEND-LEVEL-RECOVERY-AND-GO-READY-2026-08-02.md`
- `docs/FRONTEND-LWC-V5-PLAN-A6-2026-07-31.md`
- `docs/FRONTEND-MASTER-METHODOLOGY-2026-07-31.md`
- `docs/FRONTEND-MASTER-PLAN-WAVE-A-B-2026-07-31.md`
- `docs/FRONTEND-OPERATING-PLAN-2026-07-30.md`
- `docs/FRONTEND-OPERATING-PLAN-GROK-AUDIT-2026-07-30.md`
- `docs/FRONTEND-OPS-NOW-2026-07-30.md`
- `docs/FRONTEND-REMAINING-SOT-2026-08-25.md`
- `docs/FRONTEND-SCORECARD-LIVE.md`
- `docs/FRONTEND-STATE-OF-TRUTH-2026-07-31.md`
- `docs/FRONTEND-STREAM-A-PR-BODY.md`
- `docs/FRONTEND-STYLEBOARD-DRAFT-N1-N4-2026-07-31.md`
- `docs/FRONTEND-WAVE-A-GAP-AUDIT-2026-07-31.md`

`docs/FRONTEND-REMAINING-SOT-2026-08-25.md` calls itself the living frontend map. For this redesign, it is still history. Screens come from `routes.js` and `apps/admin/src/app/`.

Color and design-bar claims:

- `docs/COLOR-LOCK-P21-PROVISIONAL-2026-07-31.md`
- `docs/STREAM-A-DESIGN-BAR.md`
- `sites/sovereign-os/DESIGN.md`
- `sites/sovereign-os/PRODUCT.md`
- `sites/sovereign-os/STACK-LOCK.md`

Styleboard pages (picture boards, not routes):

- `docs/styleboard/OPEN-ME.html`
- `docs/styleboard/SHOW-BANK.html`
- `docs/styleboard/SHOW-LAYOUT.html`
- `docs/styleboard/SHOW-MONEY.html`
- `docs/styleboard/SHOW-TASTE.html`
- `docs/styleboard/VIEW-COLOR-PALETTES.html`
- `docs/styleboard/VIEW-COLORS.html`
- `docs/styleboard/VIEW-PICK.html`

Shots under `docs/styleboard/shots/` and `docs/styleboard/l1/` are pictures from those boards. They are not pages the product serves.

Prompts that tell an agent to build from those plans:

- `docs/PROMPT-CODEX-EXCHANGE-DESK-LAYOUT-2026-08-25.md`
- `docs/PROMPT-CODEX-FRONTEND-NORTHSTAR-2026-08-31.md`
- `docs/PROMPT-GROK-FRONTEND-GO.md`

The staff-console inventory that compose cites for leaving `04_Web_Admin` unserved is `docs/ADMIN-0-INVENTORY-VENDOR-VS-APPS-2026-08-02.md`. It is history too. The served team pages are the five `apps/admin` routes above.
