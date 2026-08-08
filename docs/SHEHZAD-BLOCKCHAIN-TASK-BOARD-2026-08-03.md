# Shehzad — Blockchain / Protocol Plane task board

**Date:** 2026-08-03 · **Ownership sole-lock:** 2026-08-04 · **Delta:** 2026-08-07  
**Audience:** `@shehzad002` (Shehzad / Shizu) + his agents  
**GitHub tip:** re-derive `origin/main` every session  
**Status:** BINDING — **sole human ownership** of Protocol Plane + INTACHAIN (not shell, not custodial pay/bank/futures)

> ### 2026-08-07 delta — read this before anything else
>
> **Ownership is unchanged.** What changed is the accounting around it, and one part of that was expensive:
>
> 1. **§1.5 is new — work on this board that is already merged.** Tier A read as eight greenfield items; four of them were substantially built before the sole-lock. Do not rebuild them.
> 2. **Nine outcomes were added** (S-A9…S-A13, S-I3, S-I4) — real chain work that existed in the tracker or in the code and appeared on no list. S-A9, the passkey verifier contract, is arguably the highest-value unbuilt item in the whole protocol suite.
> 3. **The guardian/recovery contradiction is resolved** — see S-A1. Doctrine wins.
> 4. **§0.5 is new — what is blocking you that is NOT yours to solve.** Route around these; do not sit on them.
> 5. **#346 is closed as a question** — it merged 2026-08-06 with your source landing unmodified. Nothing is owed. Old §7 struck.
> 6. **Tracker rows that said "free" while this board said they were yours now carry `owner: shehzad002`** — an agent doing the correct check could legitimately have started them.
>
> 7. **Tier L is new — six capabilities the LAW names that this board never did.** They were counted as gaps in `tooling/coverage.yaml`, which meant the repo knew they were missing and no engineer could see them. Crew vaults, legacy vaults, stealth handles, launch trust, treasury yield, Venue Vault.
>
> Evidence and reasoning: [`SHIZU-BOARD-AUDIT-2026-08-07.md`](SHIZU-BOARD-AUDIT-2026-08-07.md).

**Law:** [`GITHUB-OWNERSHIP-SHEHZAD.md`](GITHUB-OWNERSHIP-SHEHZAD.md) · [`THREE-WAY-DISTRIBUTION-2026-08-04.md`](THREE-WAY-DISTRIBUTION-2026-08-04.md) · definitive build **§16–§25 / §17**

**Why this board exists:** Nitro agents own shell + reclaimed custodial residual. Denon owns platform integrity + open money PR pile + product-law invent. **You** own the entire on-chain / self-custody / L1 runway — plan freely, communicate large plans before execute, ship with proof.

**Master law (read first):**

- [`INTAFACED_DEFINITIVE_BUILD.md`](../INTAFACED_DEFINITIVE_BUILD.md) — especially **§16–§25** (two planes, INTACHAIN, smart accounts, sovereign banking/rails, coverage matrix) and **§0 doctrine** (ledger only for custodial plane; no invent money)
- [`docs/SHEHZAD-HARD-OWNERSHIP-2026-08-01.md`](SHEHZAD-HARD-OWNERSHIP-2026-08-01.md) — historical mountain detail (protocol suite)
- Tracker: `tooling/tracker/features.mjs` · `protocol.*` · `launch.*` · `chain.*` · `bridge.*` · `token.*` on-chain residuals
- Live collision: `gh pr list` · never dual-edit open Denon/Nitro PR file sets

**You design PR DAGs.** Rows below are **outcomes + Done bars**, not micro-tickets. Spec freely, plan completely, ship with proof.

---

## 0 · Collision wall (do not touch)

| Owned by others right now                                                                  | Why                                                                                                         |
| ------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| **Vendor shell `:8090` / shell craft** (Index, Exchange honesty, AFK residual, RP1–RP5 UI) | Nitro swarm — dual-build destroys free parallel                                                             |
| **Denon open integrity PRs** (file sets live on `gh pr list`)                              | Dual-edit ban                                                                                               |
| **Platform WS depth path** (#727/#737 landed)                                              | Shell client = Nitro; you do not dual-build nginx/ws unless chain events                                    |
| **Custodial pay card / #346**                                                              | **Settled — #346 merged 2026-08-06, nothing owed.** No further pay expand. On-chain pay leg = **S-B1** only |
| **apps/web product resurrection**                                                          | Retired surface                                                                                             |
| **Class X** (prod keys, mainnet go-live yes, sanctions content)                            | Nitro human                                                                                                 |

**You may:** open new branches from tip · own `services/svc-protocol/**` contracts · forge/scripts · audit packages · indexer **venue contract** side · launch factory · on-chain escrow · research ADRs on tip.

---

## 0.5 · Waiting on Nitro — not yours to solve, do not stall on them

Added 2026-08-07. Each of these gates something on this board and **no PR closes any of them**. If one blocks you, say so and move to the next item — an owner-gated wall is never your delay.

| Blocked on                                     | Whose call         | What it gates                                                                       | Status                                            |
| ---------------------------------------------- | ------------------ | ----------------------------------------------------------------------------------- | ------------------------------------------------- |
| **Which venue this platform quotes**           | **Nitro**          | `socket.dex-venue-set` — svc-dex and the indexer both stay honestly dead until then | Open. Not tracked as pending in any ADR until now |
| **Money for an external contract audit**       | **Nitro**          | S-J1 / `socket.contract-audit` — `audited:true` is unreachable without it           | Open                                              |
| **Testnet / mainnet funding, RPC access**      | **Nitro**          | Anything past a local dev chain, incl. S-A13 deployment registry                    | Open                                              |
| **Which EVM chain P0 deploys to**              | Nitro, on your ADR | S-D1, and every deployed-address item                                               | **You propose in S-D1; Nitro rules**              |
| **Class X — mainnet keys, go-live, sanctions** | **Nitro human**    | Any live-money posture                                                              | Standing law, unchanged                           |
| **Gas sponsorship funding** (if we sponsor)    | **Nitro**          | S-A10 paymaster — the contract is yours, the funded account is not                  | Open                                              |

---

## 1 · Mental model (so you don’t rebuild the wrong plane)

| Plane                       | What it is                                                                               | Your focus                                                                                   |
| --------------------------- | ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| **Fiat / custodial**        | Trade, bank ledger, pay gateway, cards that hold balances                                | **Not primary** — Nitro/Denon residual; you only touch **adapters that move value on-chain** |
| **Protocol / self-custody** | Smart accounts, AMM, lending, escrow, merchant contracts, launch factory, INTACHAIN path | **Primary — this board**                                                                     |
| **Shell**                   | Vendor Vue shell                                                                         | Nitro wires UI after your APIs/events                                                        |

Definitive build promise: **sovereignty by architecture** — non-custodial plane never pretends to be custodial. Hyperliquid-class **honest sequencing**: contracts on proven EVM rails first, native chain later.

---

## 1.5 · ALREADY ON MAIN — do not rebuild (added 2026-08-07)

This board was written on 2026-08-03 against a picture that was already out of date, and the tracker rows it points at carried ownership stamps instead of state. The result: **four Tier A items read as greenfield and are substantially built.** Re-deriving any of this is our error, not yours.

| Board item                       | Already merged                                                                                                                                                                                        | What is actually left                                                                                         |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| **S-A2 AMM**                     | Compile fix — private `_swap`, external ABI unchanged (**#228, yours**). PoolFactory on the dev chain (**#264**). **mint + swapExactIn proven on a real chain** (**#288**). Pure maths module tested. | Invariant / property suites · LP accounting + fee tiers · oracle coupling (S-A12) · `audited` stays false     |
| **S-A7 Launch / token factory**  | Fixed-supply ERC-20 + CREATE2 factory, own pinned suite, **proven end to end on the dev chain**, refuses a zero factory before any arithmetic, `audited:false` deliberate (**#217**)                  | The audit itself · launch fee (Fiat Plane) · meme/vesting/NFT surfaces (Tier G)                               |
| **S-A8 Toolchain pin**           | solc 0.8.28 pinned, artefacts committed with a re-derived source hash, contracts run against anvil in CI (`REQUIRE_EVM_CHAIN=1`), one `EXPECTED_SOLC` shared with the indexer                         | **Foundry/forge invariant + fuzz suites · gas snapshots** — the part that proves _safe_, not merely _correct_ |
| **S-A1 Smart accounts (partly)** | SmartAccount / AccountFactory / SessionKeyLib compile and run; **31 contract tests incl. the CREATE2 cross-check** (**#210**); typed refusals on every chain path (**#193**); userop hashing built    | **The adversarial audit package** · S-A9 verifier · S-A11 differential check · gas ownership (S-A10/S-A11)    |

**Your genuinely greenfield Tier A front is four items: S-A3 escrow · S-A4 lending · S-A5 router · S-A6 merchant contracts.**

---

## 2 · Insane task matrix (blockchain / crypto)

### Tier A — Protocol P0 (ship value in weeks, tip already has seeds)

| ID        | Outcome                                           | What’s already on tip (lead)                                                                                                                   | Done bar (proof)                                                                                                                                                                                                      | Spec freely                                                                                                                    |
| --------- | ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| **S-A1**  | **Smart accounts production-ready**               | `SmartAccount.sol`, `AccountFactory`, session keys, CREATE2 tests, registry                                                                    | Deploy path documented · adversarial **audit package** (threat model + findings + fix or residual) · passkey/session flows proven on **configured** env (not “code exists”)                                           | Session key policy, factory upgrades. **Recovery: see the doctrine note below — this row no longer invites a guardian design** |
| **S-A2**  | **AMM suite honest**                              | `PoolFactory`, `ConstantProductPool`, mint/swap onchain tests                                                                                  | Compile clean · mint/swapExactIn proof on dev chain · invariants tests · `audited` flag path honest (no fake audited:true)                                                                                            | Fee tiers, LP accounting, oracle coupling later                                                                                |
| **S-A3**  | **On-chain P2P escrow**                           | Protocol plane doctrine §17 / §23                                                                                                              | Contracts: lock → release → refund → dispute timer · keeper-safe · no stranded funds tests                                                                                                                            | Multi-asset escrow, fee split                                                                                                  |
| **S-A4**  | **Lending markets P0**                            | `protocol.lending` tracker residual · SPEC-LENDING                                                                                             | Collateral in **contracts** not ledger · LTV from oracle marks · permissionless liquidation keepers · refuse invent rates                                                                                             | Isolation modes, IFC collateral                                                                                                |
| **S-A5**  | **Sovereign router**                              | `protocol.router`                                                                                                                              | Best of book vs pool **without invent prices** · quote proof · fail closed                                                                                                                                            | Split routes, MEV notes                                                                                                        |
| **S-A6**  | **Merchant contracts (zero-KYB architecture)**    | §24 sovereign rails                                                                                                                            | Merchant deploys to **their** smart account · accept address · auto-split · optional convert via router · platform never in flow of funds                                                                             | Sub-merchant trees, invoice metadata                                                                                           |
| **S-A7**  | **Launch / token factory honest**                 | `TokenFactory`, `SovereignToken`, launch.status honesty notes                                                                                  | CREATE2 deploy proof · refuse zero factory · **audited:false until real audit** · no sell of unaudited as live                                                                                                        | Meme factory, vesting, staked allocation tiers                                                                                 |
| **S-A8**  | **Contract compile + pin toolchain**              | solc pin shared with indexer                                                                                                                   | One EXPECTED_SOLC · CI green · no “works on my laptop” solc                                                                                                                                                           | Foundry/hardhat policy if you upgrade                                                                                          |
| **S-A9**  | **Passkey (P-256) verifier contract** 🔴          | `socket.p256-verifier` · SmartAccount already routes contract owners through ERC-1271                                                          | A passkey signature verified **on-chain** · gas cost stated · cross-checked against WebAuthn assertions this repo already produces                                                                                    | Precompile vs library, malleability handling, batching                                                                         |
| **S-A10** | **Who pays gas — paymaster + sponsorship policy** | `socket.paymaster-policy` · every paymaster field already exists in `src/chain/userop.ts`, nothing decides who pays                            | A funded path from "user has zero native token" to "operation executes" · sponsorship rules · abuse refusal · **the funding account is a Nitro decision, the contract is yours**                                      | Sponsorship tiers, session-key-scoped sponsorship                                                                              |
| **S-A11** | **Bundler dependency — public or self-hosted**    | `socket.bundler-policy` · `PROTOCOL_BUNDLER_URL` optional with no decision behind it                                                           | Choice stated with its failure mode (a public bundler can censor or reorder a user's operation) · fallback path when it is down · **plus** the live-EntryPoint differential check (`socket.userop-differential-test`) | Self-hosting plan, redundancy                                                                                                  |
| **S-A12** | **Price oracle for marks and liquidations** 🔴    | `socket.price-oracle` · **S-A4 lending cannot ship without it**; existed only as an ADR line                                                   | Source set · staleness bound · disagreement rule between sources · **fail closed (refuse to liquidate), never a fallback price**                                                                                      | TWAP vs feed, own-pool oracles, IFC marks                                                                                      |
| **S-A13** | **Deployment registry + explorer verification**   | `socket.deployment-registry` · every address in `env.ts` defaults to zero; bytecode-vs-template proof already solved (immutable ranges masked) | A tracked artefact: these addresses, this chain, this source hash, verified on this explorer · reproducible by a third party                                                                                          | Multi-chain topology (S-K4), upgrade records                                                                                   |

> **Doctrine note on recovery (resolved 2026-08-07).** This board previously invited a guardian / multi-sig recovery design, while `socket.social-recovery` in the tracker forbids one: _"a guardian is a second party who can take the account, and the platform must never be one."_ **The tracker wins.** What you may design: guardians the **user** elects and can revoke, where no platform-controlled key is ever eligible and no platform quorum can move funds. If that cannot be built without the platform becoming a party, the honest answer is that it stays a socket — say so rather than shipping it.

🔴 = named nowhere before 2026-08-07 and blocking something that is already on this board.

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

### Tier D — INTACHAIN L1 epic (honest sequencing · §17 — YOU OWN THIS)

This is the **own-the-chain** mountain. Freedom to design the full PR DAG. **Communication gate:** before P1 implement, land an **ADR/plan PR** on tip (Nitro + Denon can see), then ship.

| ID       | Outcome                                  | Done bar                                                                                                                                                                                                                                         |
| -------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **S-D0** | **Plan-first handshake**                 | ADR/plan PR: attack order, stack choice, risks, what is P0 vs P1 — **before** large P1 code · **Proposed 2026-08-08:** [`docs/adr/2026-08-08-protocol-plane-p0-handshake-and-rails.md`](adr/2026-08-08-protocol-plane-p0-handshake-and-rails.md) |
| **S-D1** | **P0 rails ADR**                         | Which EVM L2 / HyperEVM / anvil for contract suite v1 · no fantasy “mainnet next week” · **Proposed same ADR:** anvil CI kept; Base Sepolia → Base mainnet proposed; HyperEVM optional later; **Nitro rules** (§0.5)                             |
| **S-D2** | **INTACORE module map**                  | Spec: on-chain CLOB, margin, one-block finality SLOs (§20) until P0 contracts live                                                                                                                                                               |
| **S-D3** | **Validator / staking architecture**     | IFC staking secures validators · honest vs ledger `stakeOf`                                                                                                                                                                                      |
| **S-D4** | **P1 own chain (CometBFT / Cosmos SDK)** | `chain.mainnet` phased milestones · native CLOB module (dYdX v4-class) · not vapor `done`                                                                                                                                                        |
| **S-D5** | **INTAEVM**                              | EVM module sharing validator set / state with INTACORE                                                                                                                                                                                           |
| **S-D6** | **svc-chain**                            | Node ops, validator tooling, chain config (§17.5)                                                                                                                                                                                                |
| **S-D7** | **svc-bridge**                           | Fiat↔Protocol canonical IFC bridge + attestations (§17.3 / §17.5)                                                                                                                                                                                |
| **S-D8** | **P2 rust CLOB core**                    | Shared matching-spec target with Fiat Plane engine · throughput SLOs                                                                                                                                                                             |
| **S-D9** | **P3 progressive decentralisation**      | Validator open schedule · IFC governance parameter control                                                                                                                                                                                       |

**Tracker gravity:** `chain.mainnet` · `chain.evm` · `chain.validators` · `chain.governance` · `chain.rust-core` · `bridge.canonical` · owner `shehzad002`.

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

| ID       | Outcome                                           | Done bar                                                                                                                                                                                                                                                                                                                                                         |
| -------- | ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **S-I1** | **Pool interface + self-custody flows**           | Contract-held liquidity · no platform custody masquerade                                                                                                                                                                                                                                                                                                         |
| **S-I2** | **Quote integrity**                               | Fail closed without invent. **Already true on main** — `dex.quote-router` sources live prices, enforces a staleness bound against its own read, has no cache and no fallback, and refuses 503 naming every dead venue. What it lacks is a venue that answers, and that is Nitro's decision (§0.5)                                                                |
| **S-I3** | **Authoritative venue fees + settlement cost** 🔴 | `socket.dex-fee-source` — fees are configured guesses (`DEX_CLOB_FEE_BPS` 0, internal book 20bps) and settlement cost is a **declared understatement of zero**. Understate either and every quote promises a better price than the user gets. Must be set before the first real on-chain quote                                                                   |
| **S-I4** | **Execution against a quoted venue** 🔴           | `socket.dex-execution` — and note the size the one-line title hides: this needs a **Venue Vault** (§27) and an **OMS service that does not exist** (§28, `services/svc-execution`). Today every adapter declares quote-only and `submit()` throws loudly rather than returning a plausible rejection. Keep the refusal loud until the vault and the OMS are real |

### Tier J — Security / audit factory (your senior edge)

| ID       | Outcome                            | Done bar                                                                                    |
| -------- | ---------------------------------- | ------------------------------------------------------------------------------------------- |
| **S-J1** | **Audit pipeline in svc-protocol** | Status, artifact hash, who signed, never “audited:true” without package                     |
| **S-J2** | **Adversarial suites**             | Reentrancy, oracle manipulation, session key theft, factory griefing                        |
| **S-J3** | **Incident runbooks**              | Pause, upgrade, recovery paths (**no platform-guardian path** — see the S-A1 doctrine note) |

### Tier K — Spec / ADR factory (plan completeness — you write freely)

| ID       | Topic                                                                                                           |
| -------- | --------------------------------------------------------------------------------------------------------------- |
| **S-K1** | Market-id on **protocol plane** vs edge/matching (coordinate Denon — don’t silently redefine custodial markets) |
| **S-K2** | Oracle policy for lending/liquidation (sources, refuse-not-invent)                                              |
| **S-K3** | Upgradeability vs immutable factories                                                                           |
| **S-K4** | Multi-chain deployment topology                                                                                 |
| **S-K5** | Testnet faucet / mint policy for IFC-on-EVM                                                                     |
| **S-K6** | Cross-plane identity: rank travels without PII                                                                  |
| **S-K7** | **Inheritance vs the never-a-guardian rule** — settles S-L2 (see below). Write this one before any vault code   |

### Tier L — Vaults, privacy and trust (added 2026-08-07)

Every row here was a **counted gap** in `tooling/coverage.yaml`: the law named the capability, no task carried it, and the ratchet held the number so it could not quietly grow. **Counted is not assigned** — a chain engineer reading this board could not see any of them, so the previous handover was not the complete scope it claimed to be. All six now exist as tracker rows with an owner, and the gap entries are closed.

| ID       | Outcome                         | Why it was not visible                                                                                                                   | Done bar                                                                                                                                                                                                            |
| -------- | ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **S-L1** | **Crew vaults** (§33)           | Crews are `done` as a social object; a shared treasury for one is a contract and had no row in any form                                  | Member shares · M-of-N spend threshold · **a defined split on exit, designed before anyone deposits** · money-path invariant tests                                                                                  |
| **S-L2** | **Legacy vaults** (§34) 🔴      | **Arrives with a contradiction.** §34 describes guardian M-of-N recovery; `socket.social-recovery` forbids the platform being a guardian | **S-K7 ADR first.** Then: heirs and time locks the USER sets and revokes · no platform key ever eligible · no platform quorum can move funds. If it cannot be built without us being a party, say it stays a socket |
| **S-L3** | **Stealth handles** (§26)       | `blueprint.attestations` covered the zero-PII half; the receiving half had no row                                                        | One human, two unlinkable presentations · indexer analytics stay aggregate-only · **cannot be retrofitted once addresses are public**                                                                               |
| **S-L4** | **Launch trust layer** (§35)    | The law calls trust the moat in meme season; the anti-rug architecture was missing without being recorded as missing                     | LP locks and vesting **enforced by contract, not promised in a listing** · deployer reputation · a badge that would be false must be unissuable                                                                     |
| **S-L5** | **Treasury yield vaults** (§36) | `launch.rwa` recorded the licence blocker for one half of the pair and nothing recorded the other                                        | Contract half yours · **licence is Class X, Nitro human** — no contract makes that go away                                                                                                                          |
| **S-L6** | **Venue Vault** (§27) 🔴        | `venue.aggregation` has admitted "Venue Vault absent" in its own note since 2026-08-02 with no row behind it                             | Per-user encrypted external venue keys · **a key carrying withdrawal permission refused at registration, not filtered at use** · this is the hard blocker under S-I4                                                |

**Yours because it is key custody, not because it is protocol plane** — S-L6 holds credentials to _custodial_ venues. The split: the vault design, key handling and refusal are yours; wiring svc-trade to a vault that exists is agent work.

**Three more gaps closed and deliberately NOT given to you**, so the boundary stays where the ownership law puts it:

- `ops.custody` — how the platform holds its own funds. The multi-sig contract and hot-wallet perimeter are yours (already S-B2); the tiering policy and approval console are agent work; real keys are Class X.
- `launch.fundraising` and `launch.structured` — fiat-plane product surfaces. Their on-chain legs (milestone escrow, vesting, wrappers) are yours under S-L4 and S-G2.

**Still open and not chain work:** 30 counted gaps remain — trading engines, quant, mobile apps, CRM, tax, B2B infra. That is a product-scope question for Nitro and Denon, not a hole in this board.

---

## 3 · Suggested attack order (reorder when deps force)

**Reordered 2026-08-07** — the old order opened on S-A2 (AMM), which is already proven on a chain (§1.5), and it did not contain S-A9/S-A12 at all even though S-A1 and S-A4 depend on them.

1. **S-D0** plan PR + **S-D1** rails ADR — unchanged, still first
2. **S-A1** smart-accounts **audit package** + **S-A9** passkey verifier — the verifier is what makes the row's own title true on-chain
3. **S-A3** escrow + **S-A6** merchant contracts — the sovereign-rails story, and the largest genuinely greenfield value
4. **S-A12** oracle → then **S-A4** lending + **S-A5** router — lending without the oracle is not startable
5. **S-C1** real venue contracts — closes `socket.clob-contracts` and makes both svc-indexer and svc-dex honest at once
6. **S-A10 / S-A11** gas ownership + bundler decision + **S-A13** deployment registry — before anything leaves the dev chain
7. **S-A2 residual** (invariants, LP accounting) + **S-A7 residual** (audit) + **S-G\*** as oxygen
8. **S-E\*** sovereign card contract half when SA is solid
9. **S-D2–D4** INTACHAIN long path (spec-heavy, no vapor done)
10. **S-J\*** continuous audit factory, running alongside from step 2

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

| Unspoken need                                | Your job                                                                                                |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Insane parallel without stealing shell swarm | This board only                                                                                         |
| Blockchain senior not micro-managed          | You spec PR DAGs                                                                                        |
| Plan complete, no silent gaps                | Tiers A–K named; expand freely inside crypto plane                                                      |
| Denon not dual-built                         | Collision wall §0                                                                                       |
| Vendor shell is UI, not “skip chain”         | Protocol plane still full product                                                                       |
| Quality of elite chain engineer              | Audit packages, fail closed, no vapor                                                                   |
| **Never sent at merged work**                | §1.5 exists for this. If a row here disagrees with `main`, `main` wins and this board is wrong — say so |
| **Owner-gated walls are visibly Nitro's**    | §0.5. Naming a blocker is progress; sitting on one silently is not                                      |

---

## 6 · Cold start for your agents

```
git fetch origin main
Read: INTAFACED_DEFINITIVE_BUILD.md §16–§25 (especially §17 INTACHAIN)
Read: docs/GITHUB-OWNERSHIP-SHEHZAD.md
Read: docs/THREE-WAY-DISTRIBUTION-2026-08-04.md
Read: docs/SHEHZAD-BLOCKCHAIN-TASK-BOARD-2026-08-03.md (this file) — §1.5 FIRST: four Tier A items are already merged
gh pr list — do not touch open Denon paths or vendor shell
Claim: LIVE-LANES shehzad-protocol-chain
Worktree from tip · svc-protocol contracts first (P0) · plan PR before P1 L1
Ship: PR with proof (forge/anvil tests, audit package path, ADR link)
```

---

## 7 · #346 pay handoff — CLOSED 2026-08-06

**Nothing is owed here.** #346 **merged on 2026-08-06**, and the merge comment on the PR records that his source landed unmodified — every line of `payment-service.ts`, `router.ts`, `schema.ts`, the migrations, the tests and `card-sandbox-e2e.mjs` as written; only board files were touched. Custodial pay is reclaimed for Nitro agents from tip.

This section previously asked him to "finish or hand off #346". That instruction is dead and is struck rather than deleted, because a task that vanishes reads as a task nobody ever set.

**Standing:** do not open new pay product PRs.

---

## 8 · One-breath message (paste to Shehzad)

```
Shehzad — blockchain / Protocol Plane board is yours. Board delta landed 2026-08-07.

FIRST: §1.5 of the board — four Tier A items are ALREADY MERGED and must not be rebuilt.
AMM compiles and mint/swapExactIn is proven on a real chain (#228 yours, #264, #288).
Token factory proven end to end (#217). Toolchain pinned + contracts running in CI (#210).
Smart-account contracts land, run and cross-check CREATE2 — what is missing there is the
AUDIT PACKAGE, not the contracts.

Your greenfield front: escrow (S-A3), lending (S-A4), router (S-A5), merchant contracts (S-A6).
Newly named and yours: S-A9 passkey P-256 verifier contract (the one that makes "passkey smart
accounts" true on-chain), S-A10 who pays gas / paymaster, S-A11 bundler decision, S-A12 price
oracle (S-A4 cannot start without it), S-A13 deployment + verification registry, S-I3 venue fees,
S-I4 execution (Venue Vault §27 + an OMS service that does not exist yet).

NEW TIER L — six capabilities the LAW names and this board never did. They were counted as gaps
in tooling/coverage.yaml, so the repo knew and no engineer could see them: S-L1 crew vaults
(shared multi-sig treasuries), S-L2 legacy vaults (inheritance), S-L3 stealth handles (receive
on-chain unlinkably), S-L4 launch trust layer (enforced LP locks + vesting — the law calls trust
the moat in meme season), S-L5 tokenised treasury-yield vaults, S-L6 Venue Vault (external venue
API keys — the hard blocker under S-I4, and venue.aggregation has admitted it was absent since
2026-08-02 with no row behind it).

Recovery / inheritance: doctrine wins — the platform is NEVER a guardian. That collides head-on
with §34's guardian M-of-N recovery, so S-L2 does not start with code: write the S-K7 ADR first.
User-elected heirs and time locks only, no platform key ever eligible, or say it stays a socket.

#346 is merged (2026-08-06), your source landed unmodified. Nothing owed. No pay expand.

Blocked-on-me and not on you (board §0.5): which venue we quote, audit budget, testnet/RPC
funding, which EVM chain P0 targets (you propose in S-D1), Class X, gas sponsorship funding.
Hit one of these — say so and move on, do not sit on it.

Unchanged: sole mountain Protocol Plane + INTACHAIN · you design PR DAGs · ADR/plan PR before
large P1 · proof in the PR body · honest §13 socket over fake Done.

Law on tip: docs/SHEHZAD-BLOCKCHAIN-TASK-BOARD-2026-08-03.md · docs/GITHUB-OWNERSHIP-SHEHZAD.md
· docs/THREE-WAY-DISTRIBUTION-2026-08-04.md · INTAFACED_DEFINITIVE_BUILD.md §16–25.
Confirm + first chain step (or S-D0 ADR link) when you start.
```
