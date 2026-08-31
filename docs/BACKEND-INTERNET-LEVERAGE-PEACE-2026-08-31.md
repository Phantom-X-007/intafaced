# Backend internet leverage — peace of mind (2026-08-31)

**Audience:** Nitro + next Grok bot. **Scope:** backend only.  
**Binding law:** [`INTERNET-LEVERAGE-LAW.md`](INTERNET-LEVERAGE-LAW.md). This file does not weaken it.  
**Question:** should we pull open-source instead of vibe-coding the remaining exchange backend?

**Verdict:** Yes — but only **codecs and session engines** at the edge. Matching, money, risk, identity, and MMP stay **in-repo**. Pulling a second exchange, second ledger, or CCXT-on-money would be the broken path.

## Unspoken need

Grok bot must not invent a matching engine, a FIX stack from a tutorial, or a “better” ledger. It also must not npm-install a random CLOB. The right take is **narrow, pinned, adapter-only**.

## Default (already decided)

| Need                               | Take this                                | Never this                                                           |
| ---------------------------------- | ---------------------------------------- | -------------------------------------------------------------------- |
| Match / book / halt / collar / IFM | `services/svc-matching`                  | Java `exchange-core` as SoT; OpenDAX; Hummingbot; LMAX-clone as book |
| Money                              | `packages/ledger-client` + `svc-ledger`  | Formance, TigerBeetle, Java wallet tables, Hyperswitch               |
| Orders / convert / copy / RFQ wrap | `svc-trade`                              | New OMS product                                                      |
| Algos / kill / stage               | `svc-execution`                          | Third-party algo cloud                                               |
| MMP / mass quote                   | `packages/execution-mm`                  | Deribit-clone as a service                                           |
| Identity                           | `svc-identity`                           | Auth0 in the money path                                              |
| Depth / private stream             | `svc-ws` + `packages/market-data`        | Fake L3 from L2                                                      |
| UI                                 | vendored shell `:8090`                   | New SPA                                                              |
| Venue quotes                       | `packages/venue-adapter` decimal strings | **CCXT** (returns JS numbers — already banned)                       |

Greenfield only if Phase A **cannot** do the behavior, named in the PR, money law preserved. “I prefer a new stack” is not evidence.

## The only external OSS worth taking (when that mountain is built)

Pin a **commit SHA**. Isolated install. Config/output outside the clone. Upgrade = new SHA.

| When we build                    | Take                                                   | Why (verified 2026-08-31)                                                                                                                                                          | How to implement                                                                                                                    | Do not                                                                                                        |
| -------------------------------- | ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| FIX door (`PTX-M05-R02/R10`)     | **QuickFIX/J** (`quickfix-j/quickfixj`)                | Production FIX 4.0–5.0 SP2 / FIXLatest; 100% Java; release **3.0.2** 2026-08-04; ~400 dependents. License: QuickFIX 1.0 (BSD-style, keep notice, don’t call the product QuickFIX). | Adapter at `svc-edge` / a dedicated FIX gateway. Session, dictionary, resend. **Fills still go matching → ledger-client.** Pin SHA. | node-gyp / unmaintained `node-quickfix`. AGPL **jPOS** (wrong domain + copyleft). Writing our own FIX parser. |
| Binary/SBE codec (`PTX-M05-R04`) | **Real Logic SBE** (`aeron-io/simple-binary-encoding`) | FIX SBE reference codec; Apache-2.0; Java/C++/Rust stubs; Binance docs tell you to generate decoders from this tool; latest **1.39.0** (2026-07).                                  | Codec + our schema. Not a matching engine. Pin SHA. Decimal fields as SBE types, never IEEE float.                                  | Protobuf as a fake SBE. Inventing a binary layout.                                                            |
| ReDoS-safe engineer parsers      | `@intafaced/safe-regex` (already on main)              | Law §3.2                                                                                                                                                                           | Keep                                                                                                                                | Native `node-re2` on money-adjacent services                                                                  |
| Operator P2P patterns            | in-tree `linear-pattern.ts`                            | Law §3.2                                                                                                                                                                           | Keep                                                                                                                                | Swap onto re2js                                                                                               |

**Rust matching (`svc-matching-rust-stage1`):** study / dual-target with Shehzad later. **Fiat SoT stays `svc-matching`.** Do not cut over because OSS-adjacent Rust exists.

## Never take (looks like leverage, is a second product or a float)

| Temptation                                 | Why it is wrong here                                                     |
| ------------------------------------------ | ------------------------------------------------------------------------ |
| CCXT in the money / quote path             | JS `number` books — already forbidden in `svc-dex` README and Phase A E6 |
| Formance / TigerBeetle as SoT              | Second money book                                                        |
| Hyperswitch / PSP orchestrators            | D-S-10; orchestrator ≠ acquirer                                          |
| Java `MemberWallet` / vendor wallet tables | Dual book                                                                |
| OpenDAX / full exchange kits               | Second SPA + second book                                                 |
| Hummingbot / MM bots as the venue          | They are clients, not the matching law                                   |
| Unmaintained FIX GUIs (FIXimulator ~2012)  | Dead                                                                     |
| “Clone Binance/Deribit matching”           | Shape-study the vendor Java at most; SoT is `svc-matching`               |

## Remaining v1.20 work — leverage map

| Spec item                     | Path                                                                                                             |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Collar on FileJournal         | **IN** `svc-matching` journal encode                                                                             |
| Kill-parent unknown ≠ killed  | **IN** `svc-execution`                                                                                           |
| RFQ expire / copy drift       | **IN** `svc-trade`                                                                                               |
| Bank cooling                  | **IN** `svc-bank`                                                                                                |
| TradFi-linked perps class     | **IN** instrument master (`exchange-contract` / matching) — refuse unsupported class. Do not import a HIP-3 DEX. |
| Yield-bearing collateral      | **IN** ledger recipes — refuse until product exists. Do not import a yield protocol as the book.                 |
| IFM                           | **IN** `svc-matching` amend path                                                                                 |
| MMP two-sided / MQQ reserve   | **IN** `execution-mm` + matching; owner numbers unset-refuse                                                     |
| FIX versions                  | **EXT adapter** QuickFIX/J when that mountain is scheduled — not day-1 of leftover queue                         |
| SBE feed                      | **EXT codec** Real Logic SBE when that mountain is scheduled                                                     |
| Off-book RFQ credit cap       | **IN** `svc-p2p` / `svc-trade` refuse-closed                                                                     |
| L4 attribution                | **IN** refuse (already the honest door)                                                                          |
| Firm/session pre-trade credit | **IN** `svc-edge` / matching; unset refuse                                                                       |

FIX and SBE are **not** the leftover queue in issue #3446. Do not start them to look busy.

## How Grok bot proves it in a PR

Name the leverage line: `IN svc-matching` or `EXT QuickFIX/J @ <sha> adapter-only`. If neither, the session failed.

## Peace of mind

The right open-source is **two libraries**, later, at the wire. Everything that can lose money is already in this repo. Taking more than that is how the product gets broken.
