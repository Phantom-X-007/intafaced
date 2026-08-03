# Shehzad — Blockchain / Protocol Plane task board

**Date:** 2026-08-03  
**Audience:** `@shehzad002` (Shehzad) + his agents  
**GitHub tip:** re-derive `origin/main` every session  
**Status:** BINDING assignment for **crypto + on-chain + Protocol Plane** work

**Why this board exists:** Nitro agents are AFK-swarming **Bizzan shell honesty/craft** and free residual. Denon owns **platform integrity** (WS market-id law, open integrity PR pile, many Class M holds). You get an **insane runway on blockchain / self-custody / contracts / chain path** — your strength — without dual-building shell or Denon’s open branches.

**Master law (read first):**

- [`INTAFACED_DEFINITIVE_BUILD.md`](../INTAFACED_DEFINITIVE_BUILD.md) — especially **§16–§25** (two planes, INTACHAIN, smart accounts, sovereign banking/rails, coverage matrix) and **§0 doctrine** (ledger only for custodial plane; no invent money)
- [`docs/SHEHZAD-HARD-OWNERSHIP-2026-08-01.md`](SHEHZAD-HARD-OWNERSHIP-2026-08-01.md) — historical mountain detail (protocol suite)
- Tracker: `tooling/tracker/features.mjs` · `protocol.*` · `launch.*` · `chain.*` · `bridge.*` · `token.*` on-chain residuals
- Live collision: `gh pr list` · never dual-edit open Denon/Nitro PR file sets

**You design PR DAGs.** Rows below are **outcomes + Done bars**, not micro-tickets. Spec freely, plan completely, ship with proof.

---

## 0 · Collision wall (do not touch)

| Owned by others right now                                                                   | Why                                                                                                                      |
| ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| **Vendor shell `:8090` / Bizzan craft** (Index, Exchange honesty, AFK residual, RP1–RP5 UI) | Nitro swarm — dual-build destroys free parallel                                                                          |
| **Denon open integrity PRs** (file sets live on `gh pr list`)                               | Dual-edit ban                                                                                                            |
| **Platform WS market-id authority + nginx depth path** (Denon D-P0-WS)                      | Product law he is deciding                                                                                               |
| **Custodial pay card / #346 open branch**                                                   | Until tip reclaim handoff is explicit — prefer **on-chain pay acceptance contracts** below, not competing on his open PR |
| **apps/web product resurrection**                                                           | Retired surface                                                                                                          |
| **Class X** (prod keys, mainnet go-live yes, sanctions content)                             | Nitro human                                                                                                              |

**You may:** open new branches from tip · own `services/svc-protocol/**` contracts · forge/scripts · audit packages · indexer **venue contract** side · launch factory · on-chain escrow · research ADRs on tip.

---

## 1 · Mental model (so you don’t rebuild the wrong plane)

| Plane                       | What it is                                                                               | Your focus                                                                                   |
| --------------------------- | ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| **Fiat / custodial**        | Trade, bank ledger, pay gateway, cards that hold balances                                | **Not primary** — Nitro/Denon residual; you only touch **adapters that move value on-chain** |
| **Protocol / self-custody** | Smart accounts, AMM, lending, escrow, merchant contracts, launch factory, INTACHAIN path | **Primary — this board**                                                                     |
| **Shell**                   | Bizzan Vue                                                                               | Nitro wires UI after your APIs/events                                                        |

Definitive build promise: **sovereignty by architecture** — non-custodial plane never pretends to be custodial. Hyperliquid-class **honest sequencing**: contracts on proven EVM rails first, native chain later.

---

## 2 · Insane task matrix (blockchain / crypto)

### Tier A — Protocol P0 (ship value in weeks, tip already has seeds)

| ID       | Outcome                                        | What’s already on tip (lead)                                                | Done bar (proof)                                                                                                                                                            | Spec freely                                                         |
| -------- | ---------------------------------------------- | --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| **S-A1** | **Smart accounts production-ready**            | `SmartAccount.sol`, `AccountFactory`, session keys, CREATE2 tests, registry | Deploy path documented · adversarial **audit package** (threat model + findings + fix or residual) · passkey/session flows proven on **configured** env (not “code exists”) | Recovery, session key policy, factory upgrades, multi-sig guardians |
| **S-A2** | **AMM suite honest**                           | `PoolFactory`, `ConstantProductPool`, mint/swap onchain tests               | Compile clean · mint/swapExactIn proof on dev chain · invariants tests · `audited` flag path honest (no fake audited:true)                                                  | Fee tiers, LP accounting, oracle coupling later                     |
| **S-A3** | **On-chain P2P escrow**                        | Protocol plane doctrine §17 / §23                                           | Contracts: lock → release → refund → dispute timer · keeper-safe · no stranded funds tests                                                                                  | Multi-asset escrow, fee split                                       |
| **S-A4** | **Lending markets P0**                         | `protocol.lending` tracker residual · SPEC-LENDING                          | Collateral in **contracts** not ledger · LTV from oracle marks · permissionless liquidation keepers · refuse invent rates                                                   | Isolation modes, IFC collateral                                     |
| **S-A5** | **Sovereign router**                           | `protocol.router`                                                           | Best of book vs pool **without invent prices** · quote proof · fail closed                                                                                                  | Split routes, MEV notes                                             |
| **S-A6** | **Merchant contracts (zero-KYB architecture)** | §24 sovereign rails                                                         | Merchant deploys to **their** smart account · accept address · auto-split · optional convert via router · platform never in flow of funds                                   | Sub-merchant trees, invoice metadata                                |
| **S-A7** | **Launch / token factory honest**              | `TokenFactory`, `SovereignToken`, launch.status honesty notes               | CREATE2 deploy proof · refuse zero factory · **audited:false until real audit** · no sell of unaudited as live                                                              | Meme factory, vesting, staked allocation tiers                      |
| **S-A8** | **Contract compile + pin toolchain**           | solc pin shared with indexer                                                | One EXPECTED_SOLC · CI green · no “works on my laptop” solc                                                                                                                 | Foundry/hardhat policy if you upgrade                               |

### Tier B — Crypto rails that stay on-chain / adapter-isolated

| ID       | Outcome                                         | Done bar                                                                                                                          | Collision note                                                          |
| -------- | ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| **S-B1** | **Crypto-native pay acceptance (on-chain leg)** | Deposit address / watch / confirm policy for USDT/USDC/BTC/ETH-class assets · **adapter interface** only · no partner names in UI | Coordinate with pay residual owners — don’t rewrite open #346 files     |
| **S-B2** | **Hot-wallet / mnemonic perimeter**             | Runbooks + tests for env posture · secrets never in repo · align `docs/A1.4-WALLET-SECRETS-PERIMETER`                             | Class X prod keys still Nitro human                                     |
| **S-B3** | **IFC on-chain representation**                 | §17.3 path: how IFC appears on EVM rails without double-mint vs ledger token                                                      | Spec ADR first if ambiguous                                             |
| **S-B4** | **Buyback/burn on-chain observability**         | If buyback posts to chain, events indexer can project                                                                             | Custodial buyback stays token service — you own **chain events** if any |
| **S-B5** | **Bridge design (canonical IFC)**               | `bridge.canonical` research + threat model + phased build                                                                         | Don’t invent bridge security theater                                    |

### Tier C — Indexer / venue contracts (chain → read models)

| ID       | Outcome                                 | Done bar                                                                  | Collision                                                            |
| -------- | --------------------------------------- | ------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| **S-C1** | **Real venue contracts (not DevVenue)** | Auditable venue events matching indexer ABI · or explicit socket residual | Indexer adapter exists; **contracts** are the hole (tracker honesty) |
| **S-C2** | **Reorg-safe event surface**            | Property tests: reorg deeper than history · tip replace                   | Pair with indexer owners; you own Solidity venue                     |
| **S-C3** | **Permissionless position/fill events** | Document event matrix for agents to WS later                              | Don’t invent futures mids                                            |

### Tier D — INTACHAIN long path (honest sequencing)

| ID       | Outcome                              | Done bar                                                                                         |
| -------- | ------------------------------------ | ------------------------------------------------------------------------------------------------ |
| **S-D1** | **P0 rails ADR**                     | Written decision: which EVM L2 / HyperEVM / anvil-only for v1 · no fantasy “mainnet next week”   |
| **S-D2** | **INTACORE module map**              | Spec only until P0 contracts live: CLOB-at-chain, margin, one-block finality targets as **SLOs** |
| **S-D3** | **Validator / staking architecture** | How IFC staking ties to chain security vs ledger stakeOf                                         |
| **S-D4** | **CometBFT / app-chain residual**    | `chain.mainnet` tracker row — research + phased milestones, not vapor status:done                |

### Tier E — Sovereign card / JIT (contract half)

| ID       | Outcome                   | Done bar                                                                                                         |
| -------- | ------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| **S-E1** | **JIT funding contract**  | Smart-account pull exact amount at auth · issuer never holds user balance · program kill strands zero user funds |
| **S-E2** | **IFC cashback on-chain** | Cashback mint/transfer policy + events                                                                           |
| **S-E3** | **Adapter boundary**      | Contract interfaces for `CardIssuerAdapter` without shipping issuer keys                                         |

### Tier F — Web4 / attestations (on-chain standing, zero PII)

| ID       | Outcome                            | Done bar                                                             |
| -------- | ---------------------------------- | -------------------------------------------------------------------- |
| **S-F1** | **Rank/reputation attestations**   | On-chain attestations, zero PII · verify without identity disclosure |
| **S-F2** | **Blueprint attestation issuance** | Phase 4 hook: proof packages                                         |
| **S-F3** | **Portable crew/perk claims**      | Spec + minimal verifier                                              |

### Tier G — Launchpad / NFT / RWA (crypto surfaces)

| ID       | Outcome                                | Done bar                                                |
| -------- | -------------------------------------- | ------------------------------------------------------- |
| **S-G1** | **Meme factory + instant market + LP** | Depends AMM honesty                                     |
| **S-G2** | **Presale / fair launch / vesting**    | Staked allocation tiers via stakeOf **read**, no invent |
| **S-G3** | **NFT mint/list/auction + royalty**    | On-chain royalty enforcement                            |
| **S-G4** | **RWA registry**                       | Licence-gated honesty · §13 if partner blocks           |

### Tier H — Mining / MatMul PoW interface (crypto)

| ID       | Outcome                                   | Done bar                                            |
| -------- | ----------------------------------------- | --------------------------------------------------- |
| **S-H1** | **Share protocol + epoch allocation API** | svc-token remains only minter; pool requests epochs |
| **S-H2** | **Difficulty / epoch proofs**             | From token paper — no invent emission               |

### Tier I — DEX self-custody surface (`svc-dex`)

| ID       | Outcome                                 | Done bar                                                 |
| -------- | --------------------------------------- | -------------------------------------------------------- |
| **S-I1** | **Pool interface + self-custody flows** | Contract-held liquidity · no platform custody masquerade |
| **S-I2** | **Quote integrity**                     | Fail closed without invent                               |

### Tier J — Security / audit factory (your senior edge)

| ID       | Outcome                            | Done bar                                                                |
| -------- | ---------------------------------- | ----------------------------------------------------------------------- |
| **S-J1** | **Audit pipeline in svc-protocol** | Status, artifact hash, who signed, never “audited:true” without package |
| **S-J2** | **Adversarial suites**             | Reentrancy, oracle manipulation, session key theft, factory griefing    |
| **S-J3** | **Incident runbooks**              | Pause, upgrade, guardian paths                                          |

### Tier K — Spec / ADR factory (plan completeness — you write freely)

| ID       | Topic                                                                                                           |
| -------- | --------------------------------------------------------------------------------------------------------------- |
| **S-K1** | Market-id on **protocol plane** vs edge/matching (coordinate Denon — don’t silently redefine custodial markets) |
| **S-K2** | Oracle policy for lending/liquidation (sources, refuse-not-invent)                                              |
| **S-K3** | Upgradeability vs immutable factories                                                                           |
| **S-K4** | Multi-chain deployment topology                                                                                 |
| **S-K5** | Testnet faucet / mint policy for IFC-on-EVM                                                                     |
| **S-K6** | Cross-plane identity: rank travels without PII                                                                  |

---

## 3 · Suggested attack order (reorder when deps force)

1. **S-D1** (rails ADR) → **S-A1** smart accounts audit package → **S-A2** AMM honesty
2. **S-A3** escrow + **S-A6** merchant contracts (sovereign rails story)
3. **S-A4** lending + **S-A5** router
4. **S-A7** launch factory honesty + **S-G\*** as oxygen
5. **S-C1** real venue contracts (unlocks indexer “done” honesty)
6. **S-E\*** sovereign card contract half when SA solid
7. **S-D2–D4** INTACHAIN long path (spec-heavy, no vapor done)
8. **S-J\*** continuous audit factory

Parallel: 2–4 worktrees inside **protocol/contracts only** is fine.

---

## 4 · Rules (same bar as rest of monorepo)

1. Tip worktree · one concern per PR · CI green
2. **Never invent** prices, funding rates, oracles, factory addresses, “audited:true”
3. Custodial value still only via `packages/ledger-client` when you touch fiat plane
4. Partner names in adapters only, not user-facing copy
5. Sandbox/dev proof OK; **Class X** (mainnet live money posture) needs Nitro
6. Tracker/scoreboard moves only with **proof**
7. Prefer **honest §13 socket** over fake Done
8. When blocked: research pack on tip → thinner real vertical → residual owned

---

## 5 · Implicit requirements (Nitro unspoken → your mandate)

| Unspoken need                                | Your job                                           |
| -------------------------------------------- | -------------------------------------------------- |
| Insane parallel without stealing shell swarm | This board only                                    |
| Blockchain senior not micro-managed          | You spec PR DAGs                                   |
| Plan complete, no silent gaps                | Tiers A–K named; expand freely inside crypto plane |
| Denon not dual-built                         | Collision wall §0                                  |
| Bizzan is UI, not “skip chain”               | Protocol plane still full product                  |
| Quality of elite chain engineer              | Audit packages, fail closed, no vapor              |

---

## 6 · Cold start for your agents

```
git fetch origin main
Read: INTAFACED_DEFINITIVE_BUILD.md §16–§25
Read: docs/SHEHZAD-BLOCKCHAIN-TASK-BOARD-2026-08-03.md (this file)
gh pr list — do not touch open Denon/Nitro shell paths
Claim: LIVE-LANES or docs/ops/claims/<id>.md for your protocol claim
Worktree from tip · contracts + svc-protocol first
Ship: PR with proof commands (forge/anvil tests, audit package path)
```

---

## 7 · One-breath message (paste to Shehzad)

```
Shehzad — blockchain / Protocol Plane board is yours.

Nitro agents: Bizzan shell honesty only. Denon: platform WS + his open integrity pile.
You: insane runway on-chain — smart accounts audit package, AMM honesty, escrow, lending, router, merchant contracts, launch factory, venue contracts for indexer, sovereign card JIT contracts, IFC-on-chain, bridge/INTACHAIN phased specs, attestations, launchpad/NFT, mining epoch API, dex self-custody, audit factory.

Law: INTAFACED_DEFINITIVE_BUILD.md §16–25 + docs/SHEHZAD-BLOCKCHAIN-TASK-BOARD-2026-08-03.md on tip.
Do not dual-edit open partner PRs or shell residual. Spec freely, ship with proof, honest §13 over fake Done.
Start when ready from latest main.
```
