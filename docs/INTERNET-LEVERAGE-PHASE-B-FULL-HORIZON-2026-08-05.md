# Internet leverage — Phase B full-horizon map (whole future project)

**Status:** CANONICAL Phase B decision surface · research map (no auto-implement)  
**Date:** 2026-08-05  
**Operator correction:** Phase B is **full future-project scope**, not a max-5 implement thrift queue.  
**Supersedes for decisions:** the “90-day max ≤5 tracks” framing in  
[`INTERNET-LEVERAGE-PHASE-B-REPORT-V2-2026-08-05.md`](INTERNET-LEVERAGE-PHASE-B-REPORT-V2-2026-08-05.md)  
(v2 **research tables still valid** as evidence; **queue shape wrong** for your intent).  
**v1 historical:** [`INTERNET-LEVERAGE-PHASE-B-REPORT-2026-08-05.md`](INTERNET-LEVERAGE-PHASE-B-REPORT-2026-08-05.md)  
**Phase A (internal inventory):** [`INTERNET-LEVERAGE-CURRENT-AUDIT-2026-08-04.md`](INTERNET-LEVERAGE-CURRENT-AUDIT-2026-08-04.md)  
**Plan (amended this PR):** [`INTERNET-LEVERAGE-PHASE-B-PLAN-2026-08-04.md`](INTERNET-LEVERAGE-PHASE-B-PLAN-2026-08-04.md)  
**Prior terrain:** ORDER-ROUTE landscape · SECURITY-WHEN-PLAIN · Denon hard board · Shehzad chain board · tracker

**Term:** Internet leverage = already-built systems we adopt / wire / wrap instead of rebuild.  
**Internal leverage** = Phase A (kit + ledger + services). **External leverage** = this map.

**Non-regression forever:** vendor shell = sole product UI · `ledger-client` = only book · no second full exchange kit · no Java dual-book · no invent mids.

---

## 0 · Operator one-screen

### What this doc is

The **complete external + residual leverage map for the rest of the build** — every open mountain / socket / D-S / gap after Phase A, with a path type and a phase. **Nothing important is “out of scope because five slots filled.”**

Ranking = **decision order**, not “only these exist.”

### Path types (legend)

| Code     | Meaning                                                            |
| -------- | ------------------------------------------------------------------ |
| **IN**   | In-repo wire/extend (Phase A asset) — default first                |
| **EXT**  | External OSS/SaaS adopt or trial                                   |
| **GF**   | Greenfield build (no good drop-in)                                 |
| **LAW**  | Product law first (Denon D-S-\* / Shehzad S-D\*) — no invent       |
| **S**    | Shehzad plane only (Nitro babysit)                                 |
| **X**    | Class X human (keys, issuers, sanctions content, licence, go-live) |
| **KILL** | Forbidden “leverage”                                               |

### Phases (horizon, not thrift cap)

| Phase     | Meaning                                                                |
| --------- | ---------------------------------------------------------------------- |
| **NOW**   | Unblocks money/safety/honesty; can start without inventing product law |
| **MID**   | After a law or a thin vertical lands; real product residual            |
| **LATE**  | Scale, nice-to-have, or depends on chain/mainnet maturity              |
| **NEVER** | Explicitly rejected / wrong model                                      |

### Standing order for agents

1. Prefer **IN** over **EXT** over **GF**.
2. **LAW** blocks craft until the named D-S / S-D exists.
3. **S** = no Nitro implement on chain cores.
4. **X** = never agent-closed.
5. **KILL** never “helpfully” reopens.
6. Implement only when you (or standing residual campaign) pick a row — this map does not auto-npm-install.

---

## 1 · Correction log (why this doc exists)

| Wrong (prior)                                           | Right (you)                                                        |
| ------------------------------------------------------- | ------------------------------------------------------------------ |
| Phase B ends in a **max-5** 90-day adopt queue          | Phase B maps **whole future project** external + residual leverage |
| “Everything else is later or Shehzad-only” as dismissal | Everything else is **on the map** with phase + path                |
| Cap invented as thrift hygiene                          | Cap was **plan methodology**, not your order — **removed**         |

Research evidence from v2 (Hyperswitch, RE2, Gitleaks, Moov, SimpleWebAuthn, kills, GitHub metadata) is **reused here**, not re-shopped from zero.

---

## 2 · Full-horizon master table

Every open tracker feature (ready/wip/socket at tip re-derive) + Phase A gaps + D-S law rows + named security holes.  
**Columns:** ID · need · path · external candidate (if any) · phase · owner · depends on.

### 2.1 Security / honesty / ops hygiene (platform always-on)

| ID        | Need                                              | Path                | External / note                                      | Phase             | Owner | Depends           |
| --------- | ------------------------------------------------- | ------------------- | ---------------------------------------------------- | ----------------- | ----- | ----------------- |
| FH-SEC-01 | ReDoS-safe parsers (P2P methods, untrusted regex) | **EXT**             | RE2 family: **re2js** (primary) / **node-re2** (alt) | **NOW**           | N/D   | —                 |
| FH-SEC-02 | Secret scanning on main                           | **EXT**             | **Gitleaks** CI (TruffleHog later)                   | **NOW**           | N     | —                 |
| FH-SEC-03 | Doctrine money scans grow                         | **IN**              | custody-scan, fabricated-money, dual-book doors      | **NOW**           | N/D   | —                 |
| FH-SEC-04 | Semgrep / money SAST rules                        | **EXT** adapt       | Semgrep patterns (ORDER-ROUTE Tier B)                | **MID**           | N     | FH-SEC-03 fatigue |
| FH-SEC-05 | Property tests money invariants                   | **EXT** adapt       | **fast-check** (already Tier A landscape)            | **MID**           | N     | Class M craft     |
| FH-SEC-06 | Chaos / network fault trade↔match                 | **EXT** later       | Toxiproxy when mocks lie                             | **LATE**          | D/N   | assembled path    |
| FH-SEC-07 | Strix / AI pentest pack                           | **X** / explicit go | Not default                                          | **NEVER** default | Nitro | written RoE       |
| FH-SEC-08 | OpenBao / Vault for deploy secrets                | **EXT** later       | OpenBao MPL if self-host secrets mature              | **LATE**          | D ops | fleet story       |

### 2.2 Shell / terminal / WS (IN first)

| ID           | Need                                                    | Path          | External / note                                                           | Phase     | Owner | Depends              |
| ------------ | ------------------------------------------------------- | ------------- | ------------------------------------------------------------------------- | --------- | ----- | -------------------- |
| web.terminal | Live feed, decimals, shape validation residual          | **IN**        | V-SHELL + bignumber + port notes; charts = lightweight-charts **already** | **NOW**   | N     | S-WS path            |
| ws.gateway   | Fan-out depth/trades/orders/positions                   | **IN**        | S-WS; positions need futures events                                       | **MID**   | N     | D-S-01 for positions |
| G-P0-2       | Decimal desk end-to-end                                 | **IN**        | Vendored bignumber wire                                                   | **NOW**   | N     | —                    |
| G-P0-1       | Depth client residual                                   | **IN**        | #748-class; re-verify tip                                                 | **NOW**   | N     | fleet                |
| FH-UI-01     | Runtime edge response validation                        | **EXT** trial | Zod (default) / Valibot / ArkType — pick one                              | **MID**   | N     | honesty residual     |
| FH-UI-02     | Second exchange SPA / TV Charting Library without grant | **KILL**      | Phase A non-regression; licence law                                       | **NEVER** | —     | —                    |
| FH-UI-03     | Headless a11y only if claim needs                       | **EXT** trial | Only if frontend residual demands                                         | **LATE**  | N     | claim                |
| FH-UI-04     | Platform pages craft                                    | **IN**        | V-SHELL Platform + cms/uc                                                 | **MID**   | N     | D-S-15 IA            |
| ops.admin    | Admin console                                           | **IN**        | Prefer **V-ADMIN** over new SPA                                           | **MID**   | N/D   | honesty              |
| G-P2-1       | apps/web delete                                         | **IN**        | D-P2-01                                                                   | **MID**   | D     | —                    |

### 2.3 Pay (N after handoff; law D-S-10)

| ID                  | Need                       | Path               | External / note                                            | Phase     | Owner | Depends        |
| ------------------- | -------------------------- | ------------------ | ---------------------------------------------------------- | --------- | ----- | -------------- |
| pay.gateway         | Hosted checkout / links    | **IN** + **EXT**   | S-PAY + shell Pay; orchestration via Hyperswitch **trial** | **MID**   | N     | D-S-10 thin    |
| pay.psp             | PSP mode                   | **IN** + **EXT**   | Connectors via Hyperswitch / direct SDK adapters           | **MID**   | N     | D-S-10         |
| pay.payfac          | PayFac trees               | **IN** + law       | Mostly GF product after law                                | **LATE**  | N     | D-S-10         |
| pay.routing         | Smart routing              | **EXT**            | **Hyperswitch** primary candidate                          | **MID**   | N     | D-S-10         |
| pay.settlement      | Dual settlement            | **IN**             | Ledger recipes + bank/crypto rails                         | **MID**   | N     | ledger         |
| pay.fraud           | Risk / chargebacks         | **EXT** later      | PSP fraud tools as adapters; no second book                | **LATE**  | N     | pay live       |
| pay.subscriptions   | Recurring                  | **IN** + connector | After card path                                            | **LATE**  | N     | card rail      |
| pay.plugins         | Woo/Magento/OC             | **GF** thin        | Our public API first                                       | **LATE**  | N     | pay.public-api |
| pay.public-api      | REST + webhooks + sandbox  | **IN**             | S-PAY surface                                              | **MID**   | N     | —              |
| socket.psp-partners | Live acquiring             | **X**              | Stripe/PayPal-class partners — adapters only               | **LATE**  | Nitro | Class X        |
| FH-PAY-KILL         | OSS gateway as balance SoT | **KILL**           | Dual-book                                                  | **NEVER** | —     | —              |

### 2.4 Bank / ramps / cards

| ID                  | Need                       | Path             | External / note                                                                                      | Phase     | Owner | Depends     |
| ------------------- | -------------------------- | ---------------- | ---------------------------------------------------------------------------------------------------- | --------- | ----- | ----------- |
| bank.earn           | Yield pools                | **IN** + **LAW** | S-BANK + shell; product bounds D-S-09                                                                | **MID**   | N     | D-S-09      |
| bank.cards          | CardIssuerAdapter + sim    | **IN** + **X**   | Adapter pattern; live issuer = Class X                                                               | **MID**   | N     | D-S-09      |
| bank.ramps          | Fiat on/off                | **IN** + **EXT** | Reuse pay adapters; **Moov ACH/Wire/Fed libs** for US file rails; ramp aggregators as **X** adapters | **MID**   | N     | D-S-09, pay |
| bank.sovereign-card | Self-custody funded card   | **IN** + **S**   | Custodial half N; SA contracts S                                                                     | **LATE**  | N/S   | protocol SA |
| socket.live-issuer  | Live card issuer rail      | **X**            | Never invent issuer                                                                                  | **LATE**  | Nitro | Class X     |
| FH-BANK-KILL        | Guaranteed APY OSS product | **KILL**         | Invent / law risk                                                                                    | **NEVER** | —     | —           |

### 2.5 P2P / disputes

| ID              | Need                            | Path             | External / note                                     | Phase       | Owner | Depends     |
| --------------- | ------------------------------- | ---------------- | --------------------------------------------------- | ----------- | ----- | ----------- |
| P2P-D / D-S-08  | Human dispute desk + Done law   | **GF** + **LAW** | No OSS Fiat moderator matched SPEC + custody escrow | **NOW–MID** | N/D   | D-S-08 seal |
| p2p.merchants   | Merchant programme              | **IN**           | S-P2P + shell                                       | **MID**     | N     | —           |
| FH-P2P-01       | ReDoS on method strings         | **EXT**          | RE2 (FH-SEC-01)                                     | **NOW**     | N     | —           |
| FH-P2P-02       | GDPR erase path                 | **GF**           | Spec required                                       | **MID**     | N/D   | privacy law |
| FH-P2P-KILL     | Kleros / AI as Fiat adjudicator | **KILL**         | Conflicts human + escrow ruling                     | **NEVER**   | —     | —           |
| protocol.escrow | Non-custodial chain escrow      | **S**            | Shehzad; optional later for chain plane             | **LATE**    | S     | S-A\*       |

### 2.6 Trade engines (Fiat) — law first

| ID                   | Need                                       | Path                | External / note                                               | Phase         | Owner     | Depends    |
| -------------------- | ------------------------------------------ | ------------------- | ------------------------------------------------------------- | ------------- | --------- | ---------- |
| trade.futures        | Perps                                      | **LAW** → **GF**/IN | UI kit shape + ledger; **no invent mids**                     | **MID**       | N after D | **D-S-01** |
| trade.options        | Options                                    | **LAW** → **GF**    | After futures patterns                                        | **LATE**      | N after D | D-S-01/05  |
| trade.otc            | OTC RFQ                                    | **IN** + **LAW**    | Kit otc workflows + ledger                                    | **MID**       | N after D | **D-S-02** |
| trade.copy           | Copy trading                               | **LAW** → **GF**    | Engine after law                                              | **MID**       | N after D | **D-S-03** |
| trade.algo           | TWAP/VWAP/POV                              | **LAW** → **GF**    | NautilusTrader = **study only** (LGPL, not CEX core)          | **MID**       | N after D | **D-S-04** |
| trade.forex          | Fiat pairs                                 | **LAW** → **IN**    | Same engine; instrument matrix                                | **MID**       | N after D | D-S-05     |
| trade.ccxt-api       | CCXT-compatible API                        | **IN** care         | **CCXT on money path = KILL** (floats); public API shape only | **MID**       | N         | doctrine   |
| trade.mm-bot         | Internal MM                                | **IN**              | S-TRADE patterns; honesty flags                               | **MID**       | N         | seed law   |
| venue.aggregation    | External venues                            | **IN**              | venue-adapter pattern; not CCXT money                         | **LATE**      | N         | D-S-05     |
| D-S-05 / #734        | Multi-asset matrix                         | **LAW**             | Refuse-closed default                                         | **NOW** (law) | D         | —          |
| FH-MATCH-01          | Fiat matching                              | **IN**              | **svc-matching** SoT                                          | **NOW**       | N/D       | —          |
| FH-MATCH-02          | exchange-core / HFT Java port as Fiat core | **KILL**            | Unmaintained + doctrine split (ORDER-ROUTE)                   | **NEVER**     | —         | —          |
| FH-MATCH-03          | Oracle mid as match truth                  | **KILL**            | Invent ban                                                    | **NEVER**     | —         | —          |
| socket.rust-matching | Rust port matching                         | **LATE** optional   | Dual-target with S; not day-1                                 | **LATE**      | D/S       | D-S-06     |
| D-S-06               | Matching dual-target law                   | **LAW**             | One **spec**, two runtimes                                    | **NOW** (law) | D+S       | —          |
| D-S-07               | Oracle / mark policy                       | **LAW**             | Refuse rules                                                  | **NOW** (law) | D         | —          |

### 2.7 Identity / KYC / passkeys

| ID                           | Need                     | Path                    | External / note                                        | Phase             | Owner     | Depends         |
| ---------------------------- | ------------------------ | ----------------------- | ------------------------------------------------------ | ----------------- | --------- | --------------- |
| D-S-11                       | Identity money graph law | **LAW**                 | Sub-account ownership                                  | **NOW** (law)     | D         | —               |
| FH-ID-01                     | Passkeys / step-up       | **EXT**                 | **SimpleWebAuthn**                                     | **MID**           | N         | D-S-11          |
| FH-ID-02                     | KYC providers            | **EXT** adapter + **X** | Sumsub/Persona/Veriff/Onfido/Jumio — **adapters only** | **MID–LATE**      | N + Nitro | Class X content |
| FH-ID-03                     | Self-host full KYC stack | **KILL** for now        | Ops/legal weight                                       | **NEVER** default | —         | —               |
| ops.compliance               | Screening queues / geo   | **IN** + **X**          | Queues in-repo; list **content** Class X               | **MID**           | N + Nitro | —               |
| socket.geo-region-resolution | Real geo resolve         | **EXT**/GF              | Provider adapter                                       | **LATE**          | N         | ops             |

### 2.8 Custody / wallet

| ID                 | Need                              | Path            | External / note                                     | Phase     | Owner       | Depends         |
| ------------------ | --------------------------------- | --------------- | --------------------------------------------------- | --------- | ----------- | --------------- |
| G-P1-4             | Wallet RPC live                   | **IN** first    | V-WALLET-RPC **after security review**              | **MID**   | D then N    | review artifact |
| socket.mpc-custody | MPC custody                       | **EXT** + **X** | DFNS / Turnkey-class **after** review; adapter only | **LATE**  | D→N + Nitro | G-P1-4          |
| FH-CUS-KILL        | Hot-wallet npm / dual-book wallet | **KILL**        | Supply chain + doctrine                             | **NEVER** | —           | —               |
| FH-CUS-STUDY       | OSS MPC libs (e.g. mpcium)        | **STUDY**       | Primitives only, not platform                       | **LATE**  | D           | audit           |

### 2.9 Notify / messaging

| ID                  | Need                   | Path     | External / note           | Phase     | Owner | Depends |
| ------------------- | ---------------------- | -------- | ------------------------- | --------- | ----- | ------- |
| ops.notifications   | Event fan-out          | **IN**   | svc-notify                | **MID**   | N     | —       |
| socket.notify-push  | Push channel           | **EXT**  | FCM/APNs SDKs behind port | **MID**   | N     | —       |
| socket.notify-email | Email channel          | **EXT**  | SES/etc. behind port      | **MID**   | N     | —       |
| socket.notify-sms   | SMS channel            | **EXT**  | Twilio-class behind port  | **LATE**  | N     | cost    |
| FH-MSG-KILL         | Second notify platform | **KILL** | We have svc-notify        | **NEVER** | —     | —       |

### 2.10 Token / ledger honesty (Fiat)

| ID                     | Need                                 | Path             | External / note        | Phase             | Owner | Depends     |
| ---------------------- | ------------------------------------ | ---------------- | ---------------------- | ----------------- | ----- | ----------- |
| token.yield            | Operator staker payout               | **GF** + honesty | Socket — no fake yield | **MID**           | N     | D-S-14 nums |
| token.buyback          | Operator burn record                 | **GF**           | Socket                 | **MID**           | N     | D-S-14      |
| token.governance       | Ballots                              | **GF**           | Socket                 | **LATE**          | N     | D-S-14      |
| D-S-14                 | Token economics outcomes             | **LAW**          | Numbers not invent     | **NOW** (law)     | D     | —           |
| FH-LEDGER-KILL         | Formance / TigerBeetle / Blnk as SoT | **KILL** replace | Study recipes only     | **NEVER** as book | —     | —           |
| socket.ledger-sharding | Per-asset hash chains                | **GF** late      | Scale residual         | **LATE**          | D/N   | load        |

### 2.11 Data / analytics / search / obs

| ID             | Need              | Path          | External / note                          | Phase    | Owner | Depends   |
| -------------- | ----------------- | ------------- | ---------------------------------------- | -------- | ----- | --------- |
| ops.analytics  | Warehouse         | **EXT** later | ClickHouse / cube — when mountain funded | **LATE** | N/D   | —         |
| ops.support    | Tickets / KB      | **IN**        | Desk craft; optional ticket skin later   | **MID**  | N     | —         |
| ops.affiliates | IB trees          | **IN**/GF     | Product residual                         | **MID**  | N     | —         |
| FH-DATA-01     | Ops admin search  | **EXT** later | Meilisearch/Typesense                    | **LATE** | N     | ops.admin |
| FH-OBS-01      | OTEL stack        | **IN**        | Keep compose Prom/Grafana                | **NOW**  | N     | —         |
| FH-OBS-02      | SigNoz unified UI | **EXT** later | Optional; ClickHouse ops cost            | **LATE** | D     | pain      |
| FH-OBS-03      | Sentry errors     | **EXT** later | SaaS cost                                | **LATE** | N     | —         |

### 2.12 Agents / academy / market / ops residual (mostly IN/GF)

| ID                                                            | Need                       | Path            | External / note                  | Phase        | Owner | Depends    |
| ------------------------------------------------------------- | -------------------------- | --------------- | -------------------------------- | ------------ | ----- | ---------- |
| agents.\* (navigator, support, scanner, merchant, copy-intel) | Agents product             | **IN** + GF     | svc-agents; no invent money      | **MID–LATE** | N     | guardrails |
| academy.\*                                                    | Spatial/curriculum/certs/… | **IN** + GF     | svc-academy; kit where exists    | **MID–LATE** | N     | —          |
| socket.vr-client                                              | VR lobby                   | **GF**/EXT late | Explicit later                   | **LATE**     | N     | academy    |
| socket.stream-provider                                        | WebRTC SFU                 | **EXT**         | Real SFU adapter when Live ships | **LATE**     | N     | §8.3       |
| market.vendors / market.commerce                              | Vendor lifecycle           | **IN**/GF       | Shell + services                 | **MID–LATE** | N     | —          |
| infra.i18n                                                    | 100+ languages             | **IN**          | packages/i18n                    | **MID**      | N     | —          |
| FH-I18N                                                       | Full TMS SaaS              | **EXT** later   | Only if scale hurts              | **LATE**     | N     | —          |

### 2.13 Protocol / chain / bridge / launch / dex / mining (Shehzad + X)

| ID                                                                    | Need                                       | Path            | External / note                                 | Phase        | Owner                  | Depends      |
| --------------------------------------------------------------------- | ------------------------------------------ | --------------- | ----------------------------------------------- | ------------ | ---------------------- | ------------ |
| protocol.\*                                                           | SA, AMM, lending, escrow, router, merchant | **S**           | Audited templates where possible; no Nitro core | **MID–LATE** | S                      | S-D0…        |
| chain.mainnet                                                         | INTACHAIN CometBFT + CLOB                  | **S** + **REF** | CometBFT, Cosmos SDK, **dYdX v4-chain pattern** | **LATE**     | S                      | S-D0–D4      |
| chain.evm                                                             | INTAEVM                                    | **S**           | Cosmos EVM module path                          | **LATE**     | S                      | S-D5         |
| chain.rust-core                                                       | Rust CLOB                                  | **S**           | Dual-target D-S-06                              | **LATE**     | S                      | S-D8         |
| chain.validators / governance                                         | Open schedule                              | **S**           | S-D3/D9                                         | **LATE**     | S                      | —            |
| bridge.canonical                                                      | IFC bridge                                 | **S** + ledger  | D-S-12 accounting law                           | **LATE**     | S + D law              | S-D7         |
| indexer.readmodels                                                    | Chain → PG                                 | **IN**/S        | svc-indexer                                     | **MID**      | N/S                    | chain events |
| socket.indexer-stream                                                 | Live book from projection                  | **IN**          | WS path                                         | **LATE**     | N/S                    | indexer      |
| launch.\* / mining.pool / dex.\*                                      | Launchpad, NFT, RWA, pool, quote router    | **S** / socket  | Chain plane                                     | **LATE**     | S                      | toolchains   |
| socket.contract-\* / userop / p256 / social-recovery / clob-contracts | Contract engineering sockets               | **S**           | Foundry, audits **X** for external audit hire   | **MID–LATE** | S + Nitro audit budget | —            |
| FH-CHAIN-KILL                                                         | Nitro implements L1 core                   | **KILL** for N  | Ownership                                       | **NEVER**    | —                      | —            |
| FH-CHAIN-KILL2                                                        | Hyperliquid binary copy                    | **KILL**        | Closed/custom; learn SLOs only                  | **NEVER**    | —                      | —            |

### 2.14 Process / law / Denon meta (not packages)

| ID            | Need                          | Path            | External / note      | Phase     | Owner  | Depends     |
| ------------- | ----------------------------- | --------------- | -------------------- | --------- | ------ | ----------- |
| D-S-01…18     | Spec factory                  | **LAW**         | Unblocks agent craft | **NOW**   | D      | —           |
| D-S-16        | Class M hold language         | **LAW**         | Merge matrix         | **NOW**   | D      | —           |
| D-S-17        | Java dual-book residual       | **IN** + policy | Scans exist          | **MID**   | D      | —           |
| D-S-18        | Predict/quant/connect         | **LAW**         | Invent ban until law | **LATE**  | D      | product yes |
| D-P2-02       | spine-\* disposition          | **IN**          | Abandon/resume       | **MID**   | D      | —           |
| G-P0-4        | Land Denon money PRs          | **IN**          | His branches         | **NOW**   | D      | —           |
| FH-DENON-KILL | Dual-edit open Denon PR files | **KILL**        | Collision            | **NEVER** | agents | —           |

### 2.15 Mobile

| ID             | Need                                            | Path             | External / note                                       | Phase             | Owner | Depends          |
| -------------- | ----------------------------------------------- | ---------------- | ----------------------------------------------------- | ----------------- | ----- | ---------------- |
| V-MOBILE       | Mobile apps                                     | **GF** later     | Kit stubs empty; Expo/RN or Flutter when product push | **LATE**          | N     | product decision |
| FH-MOBILE-KILL | Random full exchange mobile template as product | **KILL** default | Second surface risk                                   | **NEVER** default | —     | —                |

---

## 3 · Ranked decision order (not a ceiling)

Use this to **pick what to start**, not to delete rows from §2.

### Tier A — start without inventing product law

1. FH-SEC-01 RE2
2. FH-SEC-02 Gitleaks
3. web.terminal / G-P0-2 wire (IN)
4. P2P human dispute path + ReDoS (GF + EXT) when D-S-08 path-clear
5. G-P0-4 Denon land PRs (his)
6. D-S-01 / 05 / 06 / 07 / 10 / 11 law factory (Denon) — **highest agent unblock**

### Tier B — after thin law or vertical

7. Hyperswitch trial → pay.routing / gateway
8. SimpleWebAuthn
9. Moov ACH libs when bank.ramps real
10. KYC adapters (Class X pick)
11. Notify channel SDKs
12. trade.\* engines **only after** matching D-S
13. Wallet RPC review → then MPC vendor class

### Tier C — late / scale / chain maturity

14. Analytics warehouse, SigNoz, search
15. Mobile
16. PayFac depth, subscriptions, plugins
17. Full Shehzad INTACHAIN P1–P3 stack (his board)
18. Ledger sharding, VR, stream SFU

### Tier Z — never

Second UI kit · second ledger SoT · invent mids · Kleros Fiat adjudicator · unaudited mainnet custody · CCXT money path · Nitro L1 core · dual-edit Denon/Shehzad branches

---

## 4 · External candidate register (horizon, not top-5 only)

| Candidate                 | Use for                  | Phase    | Owner      | Status           |
| ------------------------- | ------------------------ | -------- | ---------- | ---------------- |
| re2js / node-re2          | ReDoS                    | NOW      | N/D        | **Adopt**        |
| Gitleaks                  | Secrets CI               | NOW      | N          | **Adopt**        |
| TruffleHog                | Secrets alt/complement   | MID      | N          | Later            |
| Hyperswitch               | Pay orchestration        | MID      | N          | **Trial**        |
| Stripe/Adyen/… SDKs       | Connectors               | MID      | N + X      | Adapt            |
| Moov ACH/Wire/Fed         | US bank files            | MID      | N          | Adapt libs       |
| SimpleWebAuthn            | Passkeys                 | MID      | N          | Trial            |
| Sumsub/Persona/Veriff/…   | KYC                      | MID–LATE | N + X      | Adapter          |
| SES/Twilio/FCM/APNs       | Notify                   | MID–LATE | N          | Adapt            |
| Zod/Valibot/ArkType       | Runtime validation       | MID      | N          | Trial one        |
| fast-check                | Property tests           | MID      | N          | Adopt pattern    |
| Toxiproxy                 | Chaos network            | LATE     | D/N        | Later            |
| Semgrep                   | Money SAST               | MID      | N          | Later            |
| DFNS / Turnkey            | MPC custody API          | LATE     | D→N + X    | After review     |
| OpenBao                   | Secrets ops              | LATE     | D          | Later            |
| Meilisearch/Typesense     | Admin search             | LATE     | N          | Later            |
| ClickHouse / cube         | Analytics                | LATE     | N/D        | Later            |
| SigNoz                    | Unified OTel UI          | LATE     | D          | Later            |
| Sentry                    | Errors SaaS              | LATE     | N          | Later            |
| Expo/RN or Flutter        | Mobile                   | LATE     | N          | Product yes      |
| CometBFT + Cosmos SDK     | INTACHAIN                | LATE     | **S**      | Ref              |
| dYdX v4-chain             | CLOB-on-appchain pattern | LATE     | **S**      | Ref              |
| NautilusTrader            | Algo research only       | LATE     | D study    | Study not core   |
| exchange-core             | Journal ideas only       | —        | —          | **KILL replace** |
| Formance/TigerBeetle/Blnk | Ledger study             | —        | —          | **KILL as SoT**  |
| Kleros                    | Chain dispute ref        | —        | S optional | **KILL Fiat**    |
| Full exchange Vue kits    | UI                       | —        | —          | **KILL**         |
| CCXT money path           | Venue                    | —        | —          | **KILL money**   |

---

## 5 · Completeness proof (whole future, not five)

| Check                                                       | Result                                           |
| ----------------------------------------------------------- | ------------------------------------------------ |
| Every **open tracker** row has a path type + phase?         | **Yes** §2 (grouped by domain; sockets included) |
| Every **D-S-01…18** has external vs law vs greenfield note? | **Yes** (law rows + engines §2.6 / §2.14)        |
| Phase A **IN** assets preferred before EXT?                 | **Yes** standing order                           |
| Kill list explicit?                                         | **Yes** Tier Z + KILL rows                       |
| Max-5 thrift queue as law?                                  | **Removed** — ranking only                       |
| Class X isolated?                                           | **Yes** X rows                                   |
| Shehzad plane isolated?                                     | **Yes** S rows                                   |
| Auto-implement?                                             | **No**                                           |

Open tracker count at map write (tip re-derive): **~89 non-done** (ready/wip/socket). All appear under a domain section above.

---

## 6 · Relationship to Phase A

| Phase A says                         | This map says                                                                                                   |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| Kit + ledger + services already huge | **Default path is IN** for almost every mountain                                                                |
| Gaps are wire + residual + law       | EXT only when IN cannot fill (ReDoS, secrets CI, multi-PSP orchestration, passkeys, ACH files, KYC adapters, …) |
| Forbidden dual-kit / dual-book       | Still **NEVER**                                                                                                 |

---

## 7 · What you decide (still human)

1. **Class X:** which PSPs, issuers, ramp partners, KYC vendors, custody SaaS, audit hire.
2. **Product yes:** mobile, predict/quant rooms (D-S-18), VR.
3. **Fund Denon** law factory time (unblocks most Fiat engines).
4. **Order among Tier A** if you want agents to implement next (map does not auto-start).

---

## 8 · Non-claims

- Not a dependency install.
- Not a second full web research fan-out of every late socket (v2 evidence reused; new names only where horizon required).
- Not “project finished.”
- Not “only five levers.”

---

_Board-Delta: Phase B full-horizon leverage map — whole future project; kills max-5 thrift framing_
