# Remaining product UI — source of truth

**Status:** Living frontend inventory and closure specification · **re-audited 2026-08-31**<br>
**Shipped chrome PRs on `origin/main` [RAN-IT]:** desk `#3313` · money `#3358` · bank `#3371` · pay `#3375` · p2p `#3379` · platform OS `#3380` · public `#3384` · route close `#3385` · ticket TIF `#3388`  
**Finish implementation:** `#3406` + residual `#3419`; graph refresh `#3408/#3445`. These are a baseline, not a blanket completion claim.<br>
**Current closure bar:** §§9–18 below. The 2026-08-26 prompt is execution history, not live law.<br>
**Tip at re-audit:** `origin/main` `f495de5f5`<br>
**Product UI:** Bazaar `vendor/upstream-exchange/05_Web_Front` `:8090` only. No second SPA. N4 paint. Ledger-client only for value.

This file names **every frontend surface and every remaining closure gate**. It is the sole living frontend map. Sections 0–8 preserve the 2026-08-26 baseline; where their status language conflicts with §§9–18, the later closure specification wins. Do not create another frontend tracker or paste this whole file as one PR.

---

## 0 · What “the rest” is

The desk is the trade surface. The rest is **everything a member still opens**: sign-in, the ledger book, bank/pay, OTC, OS modules, marketing/CMS, staff admin, later chart power.

Locked from 2026-07-31 (still true): **desk before CMS**. N4 is closed. Honesty vocabulary stays. Green/red = market only.

---

## 1 · Excellence order (named, in order)

| #   | Mountain                                   | Pack when                                                                      | Codex now?       |
| --- | ------------------------------------------ | ------------------------------------------------------------------------------ | ---------------- |
| 0   | **Trader desk** `/exchange`                | Done `#3313` · glance verified 2026-08-25                                      | No               |
| 1   | **Money OS**                               | Code `#3358` · **eye not re-checked**                                          | No               |
| 2   | **Bank** `/bank/*`                         | Code `#3371` (glance tiles in `Bank.vue`) · **eye not checked**                | No               |
| 3   | **Pay** `/pay/*`                           | Code `#3375` (same tile pattern, **no SHOW-PAY**)                              | No               |
| 4   | **OTC / C2C**                              | `/p2p` OS `#3379`; `/otc` `/ctc` still **desk-mode** routes                    | No               |
| 5   | **OS modules**                             | Chrome unify `#3380`/`#3385` (small diffs, compact IxState)                    | No               |
| 6   | **Marketing / CMS**                        | Homepage + help/notice/invite `#3384`                                          | No               |
| 7   | **Staff admin**                            | Inventory only: `apps/admin` live, `04_Web_Admin` undeployed. **No craft PR.** | **This session** |
| 8   | **Wave C** LWC v5, RSI/MACD, saved layouts | In this session (Nitro 2026-08-26: finish everything)                          | **This session** |

---

## 2 · Complete surface list (every route group)

Live = page exists and talks to a real `svc-*` or ledger. **Refuse** = honest not-built (must stay). **Mall** = marketing chrome we kill on money/desk, keep on marketing routes.

### 2.1 Money OS (mountain 1 — deep spec in money SoT)

| Route                                                | File                           | Live fact                                                            | Job                                                                                    |
| ---------------------------------------------------- | ------------------------------ | -------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `/uc/money`                                          | `components/uc/MoneyIndex.vue` | Ledger balances. **No fiat total** (no rate source). Dual-book note. | N4 ledger book. Glance in ~2s.                                                         |
| `/uc/record`                                         | `Record.vue`                   | History                                                              | Same book, history tab                                                                 |
| `/uc/entrust/current` `/history`                     | `Entrust*.vue`                 | Open / past orders                                                   | Orders in the money OS, link back to desk                                              |
| `/uc/account` `/uc/safe`                             | `Account.vue` `Safe.vue`       | Identity / security                                                  | Quiet settings, not a CMS                                                              |
| `/uc/recharge` `/uc/withdraw` `/uc/withdraw/address` | `CustodyNotBuilt.vue`          | **Refuse.** No chain custody until wallet-RPC review.                | Keep one refusal. N4 it. **Do not rebuild Java withdraw.**                             |
| `/platform`                                          | `pages/intafaced/Platform.vue` | Identity session hub                                                 | One session story. Desk “Log in” already points here.                                  |
| `/login` `/register` `/findPwd`                      | `pages/uc/Login.vue` etc.      | Auth                                                                 | N4 card. Success → **`/exchange`** (locked 2026-07-31). Wallpaper login_bg is residue. |
| `/uc` MemberCenter shell                             | `pages/uc/MemberCenter.vue`    | iView **light** sidebar + promo/innovation mall                      | OS header + **money rail only**. Kill promo cards as peers of balances.                |

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

| Need                     | Phase A                                 | Forbidden                                          |
| ------------------------ | --------------------------------------- | -------------------------------------------------- |
| Shell                    | V-SHELL `:8090`                         | New SPA, Tailwind/shadcn, resurrect `apps/web`     |
| Money numbers            | `packages/ledger-client` + `svc-ledger` | Second book, Java ucenter, fixture-seeded balances |
| Bank / pay / p2p / …     | matching `services/svc-*`               | Rewrite the domain                                 |
| Custody deposit/withdraw | **Refuse** until wallet-RPC review      | Fake addresses, invented fees, pretty custody      |
| Chart power              | LWC 3.8 in-shell                        | TradingView product                                |
| Admin                    | existing admin tree after Admin-0       | Third ops console                                  |
| Auth                     | real session / existing fixture         | Seeded money as “proof”                            |

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

## 5 · What we are _not_ speccing as a fake product

- A Coinbase-style **deposit/withdraw rail** while custody is refuse. The refusal _is_ the product until Denon/wallet-RPC.
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
7. Spec just-in-time for the _next_ mountain’s layout; this file stays the full map so nothing is silently dropped.

---

## 7 · Flip

Wrong if Nitro says money is not next; if wallet-RPC becomes live (then withdraw is a **new** pack, not a silent restore of Java); if a second SPA becomes law (ADR).

---

## 8 · 2026-08-26 execution handoff (historical)

The local `PROMPT-CODEX-FRONTEND-FINISH-2026-08-26.md` drove `#3406/#3419`. It is not present on `origin/main` and is not the live finish bar. Sections 9–18 below supersede it without erasing the implementation history.

---

## 9 · 2026-08-31 closure verdict

The named finish set is substantially implemented, but the frontend is **not certifiably complete**. The earlier crop pass proved valuable visual work; it did not prove every route, state, safety boundary, browser interaction, or implicit professional-product requirement.

### 9.1 Confirmed P0 defects

| ID       | Defect                                                                                                                                                                                    | Why it is P0                                                                                                    | Closure evidence                                                                                                                                                                                                                                                                             |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FE-P0-01 | `apps/admin` BFF authentication is optional when its shared-secret configuration is blank; consequential routes can reach handlers without a fail-closed authenticated operator boundary. | Money/control-plane integrity. Blank configuration must deny, never weaken.                                     | Anonymous, blank-env, expired, wrong-role, CSRF/origin, and valid-MFA browser/API tests for every mutating admin route. The service-authored actor appears in the receipt.                                                                                                                   |
| FE-P0-02 | Member chart/market/indicator paths convert decimal-string economic values with `Number`/`parseFloat` and retain them as JS numbers.                                                      | Violates the repository money representation law and can reorder or round close values.                         | Decimal-string wire fixtures become scaled bigint/fixed-point canonical state. Property tests cover 38-digit, 18-decimal, >2^53, adjacent-tick, zero, and negative inputs. A lossy number may exist only at the final canvas coordinate boundary and never feed business state or wire data. |
| FE-P0-03 | The exchange market drawer is hidden by a later `display:none!important` cascade at tablet/mobile widths even when `.is-open`.                                                            | A user can open the state but cannot switch pairs. Core trade navigation is unreachable.                        | Browser tests at 390, 768, and 1024 open the pair drawer, move focus, select a pair, update URL/header, close with Escape, and prove no page overflow.                                                                                                                                       |
| FE-P0-04 | The router guard/interceptor still accepts or reads legacy `TOKEN`/`MEMBER` local-storage state before the store clears it.                                                               | Creates a brief, contradictory authorization path and can paint/fire protected UI from stale or forged storage. | One session authority only. Forged/stale storage cannot unlock or paint a protected route. Expiry/logout closes private sockets, clears the correct state, preserves a safe redirect, and is tested across tabs and reload.                                                                  |

### 9.2 Confirmed P1 product gaps

1. The executable `tooling/uiproof/matrix.mjs` covers a stale 22-route set, not the complete living router or the finish prompt's 35-route subset. Existing 1440/390 crops are ephemeral `.artifacts`, not durable baselines.
2. Actual chart drag-reprice is not built. The current control focuses a staged Amend price field. That is a useful non-drag alternative, not the named chart interaction.
3. Admin “daily queues” are launchers/raw JSON, not dense, source-backed users/orders/finance work queues with paging, filters, age, staleness, row identity, and row-scoped decisions. Withdrawal approval correctly remains unavailable because no procedure exists.
4. Chart candles are a REST snapshot because the chart is constructed without a live STOMP client. Freshness, as-of time, reconnect state, and latest-request-wins behavior are not complete.
5. Panel resize handles are mouse-drag-only. Chart canvas/panes lack a complete keyboard and screen-reader layer. Several custom tab/favorite/confirmation interactions have partial semantics or focus handling.
6. Saved layout exists, but lacks full browser round-trip coverage, an explicit Reset surface, schema migration/observability, account scoping, visible-range/follow-live semantics, and storage-failure tests.
7. `apps/admin` has no real-browser route/action suite and lacks route-level loading/error/not-found boundaries.
8. No supported-browser policy, performance budget, RUM/error-observability contract, or feed-update budget closes the product.
9. The member shell's Vue 2.5/Webpack 3/Node 16–18 proof chain is EOL. A proof requirement that depends on an unavailable, unsupported runtime is itself a frontend defect.

### 9.3 Confirmed P2 enhancements

- Named/versioned layout Save, Save As, Reset, and import/export only after the single-layout behavior is correct.
- Better chart range, zoom, pan, fit, and follow-live controls; never gesture-only.
- Structured, recoverable admin receipts and operator deep links.
- Broader visual baselines, field telemetry, and worker offload only where profiling proves need.

## 10 · Outcome and boundaries

### 10.1 Outcome

A professional user can enter, navigate, understand state, inspect market data, stage and authorize an order, manage open orders, inspect money, and recover from stale/down/unknown conditions without being lied to or trapped. An operator can inspect real queues and perform only server-authorized consequential actions with exact confirmation, lock, reconciliation, and durable receipt. Every claim is reproducible from the branch under test.

### 10.2 In scope

- Bazaar member SPA: `vendor/upstream-exchange/05_Web_Front`.
- Operator console: `apps/admin`.
- Existing shared UI/contracts used by those surfaces.
- Frontend build, browser security, accessibility, performance, telemetry, and `tooling/uiproof`.
- Honest UI for missing backend contracts.

### 10.3 Out of scope

- A second member SPA, `apps/web`, a new design system, or a replacement exchange kit.
- A second money book or any frontend-owned economic authority.
- Invented custody, card issuer, acquirer, FX, candle, alert, approval, or multi-market APIs.
- Backend feature invention inside a frontend PR. Missing contracts become typed dependencies and refuse-closed UI.
- A Vue rewrite disguised as polish. Toolchain work must be incremental and behavior-preserving.

## 11 · How implicit requirements are inferred

Every frontend lane must perform this loop before code:

1. **Name the user decision.** What does the user believe, choose, authorize, or recover from on this screen?
2. **Name the authority.** Which existing `svc-*`, ledger, identity session, or market feed owns the fact? If none exists, refuse closed.
3. **Enumerate states.** At minimum: loading, reachable-empty, live, stale, partial, refused, unauthorized, unconfigured, malformed, timeout, unknown outcome, and recovered.
4. **Follow the transitions.** Refresh, back/forward, reload, duplicate tab, slow response, response reordering, disconnect/reconnect, expiry, resize, zoom, and route change.
5. **Check all input modes.** Keyboard, single pointer, touch, screen reader, zoom/reflow, reduced motion, and storage-disabled mode.
6. **Research only the unstable or normative question.** Use current primary sources, record the date/version, and translate the finding into a repo-specific acceptance test. Research must not introduce a second stack.
7. **Write the falsifier first.** State the observation that would prove the feature unsafe, dishonest, inaccessible, or incomplete.
8. **Close with durable evidence.** Unit/golden tests prove math and parsers; browser tests prove behavior; committed baselines or attached immutable artifacts prove pixels; the scorecard indexes evidence but does not replace it.

### 11.1 Mandatory research prompts

| Before changing                    | Research question                                                                                                                           | Primary sources                                                                                                                |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Chart/panes/reprice                | What does the vendored LWC version actually support for panes, price lines, hit testing, ranges, tracking mode, cleanup, and accessibility? | Matching-version Lightweight Charts docs/source/license only. TradingView proprietary Charting Library is not an option.       |
| Authentication/admin authorization | What must be browser-held, cookie-held, server-enforced, reauthenticated, CSRF-protected, logged, and revoked?                              | Current `svc-identity`/admin contracts first; then NIST SP 800-63B and OWASP session/transaction authorization guidance.       |
| Accessibility                      | Which WCAG 2.2 AA criteria apply to dense controls, dragging, chart canvas, status changes, sticky chrome, and reflow exceptions?           | W3C WCAG 2.2 Recommendation and Understanding documents.                                                                       |
| Build/runtime                      | What supported Node/browser/toolchain path preserves this SPA with the smallest migration boundary?                                         | Official Node, Vue, webpack, Babel and dependency migration/support pages.                                                     |
| Operator lists                     | Which real query contracts exist and what is their pagination, freshness, authorization, and row identity?                                  | Repo contracts and service code first. External design research only after the real data boundary is known.                    |
| Performance                        | Which user-visible latency is poor, and is the cause DOM, parsing, chart work, network, or feed burst?                                      | Profile this tree first; use Web Vitals and browser performance APIs for measurement, never a framework rewrite by assumption. |

### 11.2 Researched landscape baseline

Normative and security baselines:

- [WCAG 2.2](https://www.w3.org/TR/WCAG22/) is the accessibility target. Its guidance specifically requires alternatives to authored dragging and a 24×24 CSS-pixel target/spacing floor.
- [NIST SP 800-63B session guidance](https://pages.nist.gov/800-63-4/sp800-63b.html#session-management), [OWASP Session Management](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html), and [OWASP Transaction Authorization](https://cheatsheetseries.owasp.org/cheatsheets/Transaction_Authorization_Cheat_Sheet.html) inform session storage, reauthentication, server enforcement, and what-you-see-is-what-you-sign confirmations. They do not replace repository contracts.
- [Node release status](https://nodejs.org/en/about/previous-releases) records Node 16/18 as EOL. [Vue's official lifecycle page](https://v2.vuejs.org/lts/) records Vue 2 as EOL. The plan therefore contains an in-place support lane, not a second SPA.

Product and implementation signals, not legal standards:

- [Lightweight Charts accessibility](https://tradingview.github.io/lightweight-charts/tutorials/a11y/intro) states that the library does not supply accessibility behavior by default; its keyboard/ARIA/description layer must be integrated by the product. Official tutorials also expose [panes](https://tradingview.github.io/lightweight-charts/tutorials/how_to/panes) and [price lines](https://tradingview.github.io/lightweight-charts/tutorials/how_to/price-line), supporting the staged chart interaction specified here.
- [CME EBS keyboard navigation](https://www.cmegroup.com/tools-information/webhelp/ebs-workstation-quick-guide/Content/Keyboard-Navigation.html) and [IBKR hotkey configuration](https://www.interactivebrokers.com/campus/trading-lessons/configuring-tws-hotkeys/) support discoverable, scoped shortcuts and cautious transmission defaults.
- [LSEG Workspace layout administration](https://www.lseg.com/content/dam/data-analytics/en_us/documents/support/workspace/administration-panel-configuration-guide.pdf) supports named, versioned Save/Save As/autosave semantics; this is why opaque persistence is completed before optional multi-layout expansion.
- [Core Web Vitals](https://web.dev/articles/defining-core-web-vitals-thresholds) provides the initial LCP/INP/CLS measurement thresholds. These are performance guidance, not proof of product correctness.
- [Playwright visual comparisons](https://playwright.dev/docs/test-snapshots) recommends reviewed, versioned baselines and a controlled rendering environment. [Playwright accessibility testing](https://playwright.dev/docs/accessibility-testing) explicitly requires automated checks to be combined with manual assessment.
- [GOV.UK confirmation pages](https://design-system.service.gov.uk/patterns/confirmation-pages/) support stable reference numbers, next steps, and recoverable transaction records after completion.

## 12 · Cross-cutting product requirements

### 12.1 Truth and money

- Economic values remain decimal strings on the wire and fixed-point/scaled bigint in canonical memory.
- Unknown, unavailable, refused, stale, malformed, and reachable-zero are different types and different UI.
- Every displayed balance/order/price states its book or venue when ambiguity is possible.
- Market and account facts carry source and freshness. Client clocks never manufacture feed truth.
- Reordered responses and reconnects cannot overwrite the active pair/interval with stale data.
- No optimistic success for consequential writes. Timeout is unknown until authoritative reconciliation.

### 12.2 Navigation and session

- Route metadata names the required authority; a generic truthy “session” is insufficient.
- Deep links, redirects, back/forward, refresh, logout, expiry, and cross-tab state are deterministic.
- The member SPA holds no bearer token in local/session storage. Until an HttpOnly refresh-cookie design exists, reload logout is accepted and stated honestly.
- Protected content never paints before the authority check completes.
- Every route has a meaningful document title, stable main heading, skip path, and branded 404.

### 12.3 Responsive and accessibility

- WCAG 2.2 AA is the target. Automated scans help but do not certify it.
- Whole-page reflow works at 320 CSS px and 400% zoom. Essential two-dimensional chart/table regions may scroll internally, are labeled, and provide equivalent summary/actions.
- Test 390 portrait plus 768/1024 tablet widths, 1440 desktop, and representative landscape. No orientation lock.
- Pointer targets meet 24×24 CSS px or the WCAG spacing exception; submit/cancel/high-risk controls target at least 44 px where layout permits.
- Every authored drag interaction has a single-pointer non-drag alternative and a keyboard alternative.
- Sticky headers, dialogs, virtual keyboards, and error summaries never obscure focused controls.
- Status messages are programmatic and restrained: announce decision-relevant state, not every market tick.
- Color never carries side, movement, danger, or status alone.
- LWC panes expose focusable regions, keyboard point/series navigation, a concise textual summary, and high-contrast/scalable text behavior.

### 12.4 Resilience and recovery

- Network loss, service refusal, malformed payload, timeout, partial data, websocket gap, tab backgrounding, and visibility return each have explicit behavior.
- On visibility/focus/reconnect, private and market snapshots are revalidated; elapsed client time does not prove freshness.
- Duplicate clicks/tabs are absorbed by server idempotency and visible client locks.
- Error boundaries isolate a failing module and preserve navigation/logout.
- Retry never clears the last honest state or turns unknown into success.

### 12.5 Security and privacy

- Admin routes deny when authentication/authorization configuration is blank.
- Client hiding is never authorization. Server role/scope and recent authentication own the decision.
- Consequential confirmations bind the exact target and transaction facts (“what you see is what you sign”).
- Tokens, secrets, raw PII, authorization material, and sensitive receipts never enter logs, telemetry, URLs, or persistent browser storage.
- CSP begins report-only, then moves to exact sources, `object-src 'none'`, `base-uri 'none'`, appropriate `form-action`, and `frame-ancestors`; embeddable checkout/widget routes are scoped separately.
- Logout/expiry closes private sockets and clears browser-held state. External links use safe opener/referrer behavior.

### 12.6 Performance and observability

- Define a browser-support policy before baselines. Minimum proposed matrix: current Chromium, Firefox, and WebKit equivalents used by Playwright.
- Lab budgets begin with LCP ≤2.5 s, INP ≤200 ms, CLS ≤0.1 on representative hardware/fixtures; field results use the 75th percentile and are segmented mobile/desktop.
- Desk measures additionally: first honest book state, first accepted candle, ticket validation latency, submit-to-ack/unknown, reconnect duration, update coalescing, and long animation frames.
- Feed bursts are coalesced; long ladders/blotters are virtualized only after profiling; hidden tabs reduce noncritical rendering.
- Telemetry carries redacted correlation IDs and distinguishes client error, service refusal, timeout, and unknown write outcome.

## 13 · Exchange-specific closure

### 13.1 Chart and feed

- LWC remains vendored with pinned version/hash, Apache license, NOTICE, and attribution.
- Candle adapters reject numeric economic fields and malformed/reordered bars.
- RSI/MACD fixed-point goldens precede rendering; pane creation, removal, resize, precision, empty input, partial history, interval change, and teardown are tested.
- UI labels snapshot/live/stale/reconnecting and an as-of time. No stream means no “live” implication.
- Pair/interval request races are latest-request-wins. Old requests/subscriptions cannot mutate the new view.
- Zoom, pan, fit/reset, and follow-live are explicit controls in addition to gestures.

### 13.2 Reprice

Actual drag-reprice is allowed because an amend path exists, but dragging must only **stage** an edit:

1. An eligible open order renders a labeled price line.
2. Drag/tap/keyboard changes snap to the instrument tick using fixed-point math.
3. The UI shows original price, proposed price, remaining quantity, side, delta, and any service-authored preview.
4. Partial fill, cancellation, permission loss, stale order version, or feed loss invalidates/reloads the stage.
5. Release never submits. Review and explicit confirmation invoke the existing amend flow with idempotency and unknown-outcome recovery.
6. The current price input remains the accessible non-drag alternative.

Price alerts and multi-market remain disabled with a named missing API until a real contract exists.

### 13.3 Saved layout and shortcuts

- Persist pair, interval, book mode/group, panel widths, pane visibility, logical visible range, and follow-live as validated, versioned presentation state.
- Scope user-specific preferences by stable principal; never leak one account's selection to another.
- Corruption, quota refusal, private mode, old schema, unavailable pair, and breakpoint change fall back visibly and safely.
- Provide Reset layout before Save As/import/export.
- Browser tests prove full save/reload/remount/account-switch round trips, not helper normalization only.
- Full shortcut map stays in-product. Shortcuts never fire inside editable/composition contexts and expose an armed/focus scope. Instant transmission is out of scope unless separately specified and opt-in.

## 14 · Admin-specific closure

### 14.1 Authentication and authority

- Every admin page and BFF route requires authenticated operator identity and server-verified role/scope.
- Blank/malformed auth configuration returns a typed refusal before any consequential handler.
- State-changing requests enforce CSRF/origin protections and recent MFA/reauthentication according to action risk.
- Environment, operator, scope, authority source, reachability, and freshness are visible. Unknown is never styled as safe/off.

### 14.2 Dense work queues

Users, orders, and finance each need either a real query-backed table or an explicit unavailable state. A command launcher is not a queue.

Each real queue provides:

- stable record ID and deep link;
- total/page facts, paging, stable sorting, filters, refresh, age/SLA, and as-of time;
- loading, empty, stale, partial, refused, unauthorized, malformed, and unreachable states;
- PII minimization/masking and accessible table semantics;
- row-scoped actions bound to the displayed record version;
- no bulk command before the operator can inspect its target set.

Withdrawal approval remains non-interactive until a real server procedure exists. The absence itself is a passing honest state.

### 14.3 Consequential actions and receipts

- Final confirmation states environment, actor, target, current state, requested state, blast radius, reason, and whether the operation is live, staged, or inert.
- Typed phrase/reason/reauth requirements are service/action specific.
- Submit locks against duplicate intent. Timeout/transport loss yields unknown and a reconcile path.
- Completion shows immutable command/correlation/idempotency ID, actor, target, requested and returned state, service timestamp, verdict, and next action.
- Receipts survive navigation/reload through the authoritative audit source; transient component state is not the only record.
- Focus moves to confirmation/error/receipt and returns to the invoker on cancel.

## 15 · Executable acceptance system

### 15.1 Route authority

`tooling/uiproof/matrix.mjs` becomes generated-or-checked executable coverage truth derived from `routes.js`. This document describes families; the matrix proves exact routes. A test fails when a navigable route is absent unless it carries an explicit alias/redirect/exclusion reason.

### 15.2 Tiered matrix

Avoid a useless Cartesian explosion:

- **Tier A — every route:** 1440×900 and 390×844; navigation, mounted semantic screen, title/heading, no whole-page overflow, no uncaught error, expected auth/refusal, and deterministic crop.
- **Tier B — each layout family:** add 320, 768 portrait, 1024 landscape, 200% zoom, reduced motion, high contrast, keyboard traversal, focus visibility, and axe scan.
- **Tier C — critical workflows:** member login/logout/expiry; pair switch; chart interval/race/reconnect; order stage/confirm/ack/refuse/timeout/unknown/reconcile; cancel/amend/reprice; money unknown/zero/live; admin auth and every consequential action. Run across supported browser projects and all relevant data states.
- **Tier D — manual certification:** VoiceOver/NVDA-equivalent screen-reader pass, touch/virtual-keyboard pass, 400% reflow, chart summary/navigation, and human visual review.

### 15.3 Durable evidence

- Replace fixed sleeps with observable readiness/state predicates.
- Freeze locale, timezone, font, browser build, animation, clock, viewport, and network fixtures.
- Use `toHaveScreenshot`; commit reviewed baselines beside tests or publish immutable PR artifacts with manifest/hash. `.artifacts` alone is not cold-start evidence.
- Mask only irreducibly volatile cursor/clock regions—never balance, status, authority, warnings, receipt, or error content.
- Store exact commit SHA, browser/runtime versions, route/state/viewport, screenshot/diff location, and certifier in the evidence manifest.
- Automated accessibility tests are paired with manual checks; no tool output claims WCAG conformance by itself.

## 16 · Supported toolchain lane

The current Node 16–18 proof constraint is retired: those runtimes are EOL. The goal is a supported build path without replacing Bazaar.

1. Inventory actual webpack/Babel/Vue/iView blockers and browser targets.
2. Make the current shell build reproducibly on an active LTS Node release.
3. Incrementally move Webpack 3 toward a supported bundler version using official migrations; preserve route and screenshot behavior at each step.
4. Move Vue 2.5 at least to the final Vue 2 line or obtain an explicit supported-maintenance strategy. Research a Vue 3 compatibility migration separately; do not combine it with feature closure or create another SPA.
5. Generate dependency/license/vulnerability evidence and remove dead scaffold tests/dependencies only with route/build regression coverage.
6. Keep LWC vendored and reproducible; no CDN runtime dependency.

## 17 · Execution DAG and PR boundaries

One service/surface per PR. Independent lanes run in parallel; no PR combines member SPA, admin, and documentation merely for convenience.

### Wave 0 — stop unsafe claims

- **Admin lane:** FE-P0-01 fail-closed auth/authorization/CSRF/actor receipt.
- **Member money lane:** FE-P0-02 fixed-point chart/market/indicator pipeline and property goldens.
- **Member navigation lane:** FE-P0-03 responsive drawer plus focus/keyboard/touch proof.
- **Member identity lane:** FE-P0-04 remove legacy storage authority and converge guard/interceptor/store.

### Wave 1 — make proof executable

- Expand route inventory and tiered uiproof matrix.
- Add durable visual/semantic/a11y baselines and admin browser harness.
- Add state fixtures for live/empty/stale/refused/malformed/timeout/unknown.
- Record supported browser/runtime policy.

### Wave 2 — finish professional workflows

- Exchange freshness, request sequencing, reconnect, accessible chart controls, and true staged drag-reprice.
- Versioned/resettable saved layout and full browser round trip.
- Admin source-backed dense queues and durable receipts, preserving explicit unavailable rows for missing contracts.
- Route-level loading/error/not-found recovery.

### Wave 3 — supported runtime and quality budgets

- In-place member build/toolchain stabilization on active LTS Node.
- Performance budgets, feed coalescing, field/lab telemetry, client error boundaries, and redacted correlation.
- Cross-browser, zoom, screen-reader, touch, and human crop certification.

### Wave 4 — close and janitor

- Fix only failed acceptance rows.
- Append exact-SHA scorecard evidence; never replace old rows.
- Refresh Graphify after code changes.
- Merge each completed PR without treating CI as a permission gate.
- Declare completion only when §18 is true.

## 18 · File janitoring and final Definition of Done

### 18.1 Document roles

| Role                           | File                                                                                                                | Rule                                                                                                                                                 |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Product doctrine               | `INTAFACED_DEFINITIVE_BUILD.md`                                                                                     | Keep. Mark old `apps/web`/glass/green rows explicitly superseded by the later Bazaar/N4 amendment; do not silently delete history.                   |
| Reuse law                      | `docs/INTERNET-LEVERAGE-LAW.md`                                                                                     | Keep. Correct the stale `04_Web_Admin` preference to live `apps/admin` and align human-wait language with current refuse-closed autonomy.            |
| Living frontend inventory/spec | This file                                                                                                           | Sole frontend backlog/status/acceptance map. Update requirements here, not in a new board.                                                           |
| Executable route proof         | `tooling/uiproof/matrix.mjs` and tests                                                                              | Exact route/state/viewport authority. Prose cannot claim coverage that this matrix does not execute.                                                 |
| Evidence index                 | `docs/FRONTEND-SCORECARD-LIVE.md`                                                                                   | Append-only exact-SHA results and proof links. It is not a requirements document.                                                                    |
| Method                         | `docs/FRONTEND-MASTER-METHODOLOGY-2026-07-31.md`                                                                    | Preserve useful dimensions/gates; mark obsolete start gates and rebuild language superseded.                                                         |
| Visual evidence                | `SHOW-LAYOUT/MONEY/BANK` and committed crops                                                                        | Reference only for named families; absence of SHOW-PAY/etc. is not permission to invent style.                                                       |
| History                        | old prompts, layout SoTs, selection/color boards, Wave A/B, GO-ready/autonomy plans, LWC A6 after status correction | Add completed/superseded banners or move deliberately to a history/evidence namespace. Do not leave them looking live and do not delete proof value. |

Do not land the local 2026-08-26 finish prompt as new live law. If retained, store it as completed execution history and point back here. Repair or remove references to absent `SHOW-NOW.html` rather than preserving dangling authority.

### 18.2 Frontend done means all are true

- All FE-P0 items are closed with browser/API/property evidence.
- Every navigable route is represented in executable coverage or has an explicit alias/redirect/exclusion reason.
- All Tier A routes and Tier B families pass; every critical Tier C workflow passes; Tier D has named human certification.
- No canonical money value is a JS number; no frontend owns balance or authorization truth.
- Member and admin sessions/permissions fail closed and contain no persistent browser bearer.
- Exchange pair switching, chart freshness, reprice/amend/cancel, saved layout, keyboard, touch, and accessible alternatives work across the required matrix.
- Admin queues are real or explicitly unavailable; consequential actions bind exact facts, lock, reconcile unknowns, and return durable service receipts.
- Loading/empty/live/stale/refused/error/unknown states are distinct across member and admin surfaces.
- Supported runtime/browser policy, performance budgets, and production observability exist and pass their stated gates.
- Visual proof is durable and tied to an exact commit; scorecard and Graphify are updated.
- Canonical documents do not contradict the shipped architecture or claim unfinished/historical waves as current work.

Until then, the correct status is: **frontend baseline shipped; closure in progress**.
