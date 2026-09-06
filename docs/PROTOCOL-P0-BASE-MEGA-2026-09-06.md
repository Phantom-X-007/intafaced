# Protocol P0 on Base — mega overview (2026-09-06)

**Status:** BINDING for this wave · Nitro 2026-09-06  
**Audience:** `@shehzad002` (build) · Nitro human (Class X / now) · Nitro agents (babysit only)  
**Does not replace:** doctrine §16–§17 (end-state still own L1) · park ADR [`adr/2026-09-03-protocol-rails-until-intachain.md`](adr/2026-09-03-protocol-rails-until-intachain.md) · P0 rails [`adr/2026-08-08-protocol-plane-p0-handshake-and-rails.md`](adr/2026-08-08-protocol-plane-p0-handshake-and-rails.md) · matching dual-target [`adr/2026-08-04-matching-dual-target.md`](adr/2026-08-04-matching-dual-target.md)  
**Does replace as live queue:** LAST-MVP §4’s three-row leftover (S-01 is done). Full runway still [`SHEHZAD-BLOCKCHAIN-TASK-BOARD-2026-08-03.md`](SHEHZAD-BLOCKCHAIN-TASK-BOARD-2026-08-03.md) — this file is the **phase overlay**, not a rewrite of every S-\* row.

**Tip at write:** `origin/main` `dd6a883b` (#4189). Re-derive.  
**Tracker at write:** 155 done / 6 ready / 24 sockets. Shehzad: 28 done, 1 ready (`socket.clob-contracts`), L1 rows parked `socket`.

This is **outcomes + honesty + phases**. Not Solidity tickets. Shehzad designs the DAG.

---

## What “mega” means here

Not a Nitro-agent swarm. Not INTACHAIN. Not fifty micro-tickets.

**Mega = the Protocol Plane becomes a real Base app a wallet can use**, using the suite already on `main`, without building our L1 this wave.

Anvil CI proofs are **not** that product. LAST-MVP’s three rows were **not** that product. Idle after #2473 is the failure this file exists to stop.

---

## Law (do not re-litigate)

1. **Two shops.** Fiat matching stays `svc-matching` → ledger post is final. Protocol never writes the ledger.
2. **P0 rail = Base.** Base Sepolia first, Base mainnet later (Class X). Anvil = CI. Not “our chain.”
3. **P1 parked.** No `svc-chain`, genesis, Cosmos, INTAEVM, canonical INTACHAIN bridge, HIP-3, HyperEVM-as-home, extra L2 “just in case.”
4. **`audited:true` stays false** until Nitro pays a firm and hash+signer match. Keep shipping.
5. **No second money book.** Protocol execution/OMS must not hold balances. Internet leverage: existing shell + ledger + `svc-*`.
6. **Shehzad owns how.** Outcomes below. Stack, PR order, contract internals, bundler vendor, foundry flags — his.

---

## Research pass (2026-09-06) — what it changes

RAN-IT this turn (public docs / papers, not Shehzad’s private notes).

| Finding                                                                                                                                                                                                                                                                                                                     | So what for us                                                                                                                                                          |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **ERC-4337 on Base Sepolia is commodity.** Pimlico (Alto) tutorials deploy a smart account + bundler + ERC-20 paymaster on chain id **84532** today. Alchemy/Candide exist too.                                                                                                                                             | Phase 3 does **not** wait for a research invention. Point at a live bundler. Do not hand-roll one unless Shehzad wants to.                                              |
| **Native AA (EIP-8130 / Cobalt)** is Base+OP+Coinbase work. **No Sepolia/mainnet date** (vibenet only as of 5 Sep 2026).                                                                                                                                                                                                    | Do **not** block P0 on native AA. 4337 now; native AA later if it lands.                                                                                                |
| **Flashblocks = 200ms preconf** on Base today. **Denim** (canonical 200ms blocks, replaces Flashblocks) is live on **vibenet only** — Sepolia/mainnet TBD (Base docs 1 Sep 2026). Public `sepolia.base.org` is HTTP, **no WebSocket**.                                                                                      | Venue UX may use Flashblocks if Shehzad wants; must work on ordinary blocks. Indexer needs a WS-capable provider, not the public HTTP RPC.                              |
| **June 25–26 2026 Base outages** (~116 min + ~20 min). Funds safe; **liveness** died (central sequencer). Sep 2026: Base traffic can crowd blob space for other OP chains.                                                                                                                                                  | Honest copy: Base can stall. Not a reason to start INTACHAIN this wave. Incident runbook already: kill **our relay**, never a pause/upgrade.                            |
| **On-chain CLOB on a generic EVM is not Hyperliquid.** HL is a custom L1 (~70ms blocks, claimed ~~200k orders/s). Research still treats “CLOB on Ethereum L1” as structurally hard (gas, MEV, latency). L2 median fees are tiny (~~$0.0015 in 2026 Q1 papers) — **fee is not the CLOB limiter; latency/MEV/sequencer are.** | `SovereignVenue` on Base is a **self-custody venue**, not an HFT competitor. Done bar = honest public book on Sepolia, not “we beat HL.” Fiat house book stays the CEX. |
| **Deploy/verify on Base Sepolia is boring.** Foundry (`base-forge`) + Basescan / Blockscout. Chain id 84532.                                                                                                                                                                                                                | Phase 1 is ops + registry, not new architecture.                                                                                                                        |
| **#2473 merged 2026-09-02.** Shehzad last GitHub event that day. #3746 closed by an agent 4 Sep as superseded by #3839.                                                                                                                                                                                                     | Agents do not rewrite `svc-protocol` behind him. LAST-MVP “2473 still open” is **false**.                                                                               |

Unpark L1 only on a **new Nitro GO** + S-D2 module map + not-mainnet labels. This research does **not** flip that.

---

## Already on `main` — do not rebuild

Shehzad’s Aug–Sep wave: smart accounts, passkey, recovery, session keys, paymaster **contract**, AMM, lending, escrow, router, merchant, launch/fair/NFT/RWA, stealth, crew/legacy vaults, SovereignVenue + reorg tests, audit pipeline (S-J1), CardPull seam (#2473), dex fee honesty (S-I3).

**Missing as a product:** those addresses on **Base Sepolia**, indexer on the **real venue**, 4337 **live** against that chain, execution (S-I4) without a second book.

---

## Phases

Shehzad may parallelise inside a phase. He may not skip the honesty bars. Later phases may start design work early; they do not **stamp Done** early.

### Phase 0 — Now (Nitro + paste) · this week

Unblocks Phase 1. Not coding.

| Who              | Do                                                                                                                                                                                          | Done when                                           |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| **Nitro**        | Land this file on `main`. Paste to Shehzad (bottom).                                                                                                                                        | He has the GitHub link.                             |
| **Nitro**        | Base Sepolia ETH on a deployer Shehzad controls **or** written “use your own testnet key.” Named RPC (public is rate-limited; WS for indexer). Optional: bundler API key if we sponsor gas. | Shehzad can broadcast.                              |
| **Nitro agents** | Do **not** edit `services/svc-protocol/**` except babysit of **his** open PRs. Do not close his protocol PRs by rewriting them.                                                             | Path-intersect.                                     |
| **Shehzad**      | Write **his** DAG for Phase 1–3. First PR can be deploy.                                                                                                                                    | DAG exists (PR or board delta). We do not write it. |

Do **not** wait for: audit cheque, mainnet keys, named _external_ CEX venues (`socket.dex-venue-set` is a different socket), native AA, Denim.

### Phase 1 — Publish the suite on Base Sepolia

**Needle:** a stranger can open Basescan/Blockscout, see **our** verified contracts on chain id **84532**, labelled testnet / `audited: false` / **not INTACHAIN**.

Done bar:

- Deployment registry (S-A13) holds **non-zero** Sepolia addresses + source hash. Defaults stay zero in unset env.
- Explorer verification for the suite that users will touch (accounts, AMM, venue, factory — Shehzad names the set).
- No UI or tracker implies mainnet or “our chain.”

Fail-first: a configured-env test (or public call) against a **non-anvil** RPC that fails until the registry is filled.

### Phase 2 — Venue is real (closes `socket.clob-contracts`)

**Needle:** indexer + quote path read **SovereignVenue** at the published Sepolia address. DevVenue is a fixture only.

Done bar:

- `socket.clob-contracts` can go **done** with residual named: `audited: false`, testnet only.
- Reorg behaviour already tested on anvil (#2465) — prove it still holds against the live address or say what is still anvil-only.
- Honest product line: this is a **protocol CLOB on Base**, not HyperCore.

Shehzad owns matching design on that contract. Do not spec ticks/gas here.

### Phase 3 — Account path on that chain (4337 live)

**Needle:** a UserOperation lands on Base Sepolia for **our** account implementation (not only a Pimlico Safe tutorial).

Done bar:

- Bundler URL is configured for 84532. Vendor is Shehzad’s pick (Pimlico/Alto is proven; not mandatory).
- Paymaster **contract** already refuses when unfunded (S-A10). Live: that refuse on Sepolia, **or** sponsored ops if Nitro funded the float.
- Passkey / recovery / session-key: configured-env proof on Sepolia or an honest “anvil-only residual” line. Do not rebuild S-A1.

Do **not** wait for Cobalt/EIP-8130.

### Phase 4 — User journeys on Sepolia (rooms, not tickets)

Each is a **wallet click** on Base Sepolia against published addresses. Shehzad picks order and batching.

| Room              | User-visible done                                               |
| ----------------- | --------------------------------------------------------------- |
| Smart account     | Create / session-key spend / recovery path as already specified |
| AMM               | Mint + swap on the published pool template                      |
| Launch            | Token+pool or fair-launch as already specified                  |
| Stealth           | Announce + scan against published announcer                     |
| Merchant / escrow | One accept or escrow round-trip if already in the suite         |

Empty UI on `:8090` is **Nitro shell wiring after addresses exist** — not a reason for Shehzad to sit. Protocol Done ≠ Vue.

### Phase 5 — Execution (S-I4) · the remaining engineering mountain

**Needle:** a quoted **protocol** venue can **fill** without the platform holding the user’s tokens.

Done bar:

- OMS/submit path exists for the Protocol venue. Today adapters are quote-only and `submit()` throws — keep that loud until this is real.
- Venue Vault residuals (durable store / HSM as Shehzad specifies) — withdrawal still refused at register.
- **Must not** become a second ledger. Fills final at **chain** finality (dual-target ADR).
- Fiat house book stays `svc-matching`. This phase is **not** “move CEX matching to Base.”

This is the biggest remaining build. Shehzad specs it. Agents do not invent `svc-execution` behind him unless he asks.

### Phase 6 — Adversarial leftover (S-J2)

Reentrancy, oracle manipulation, session theft, factory griefing — **his depth**. Pipeline already refuses a fake `audited:true`. External firm remains Nitro Class X.

### Phase 7 — Base mainnet (Class X)

Only after Phases 1–4 work on Sepolia **and** Nitro writes GO (keys, gas, go-live yes). Same honesty: not INTACHAIN, `audited:false` until paid.

---

## Parked this wave (named)

`chain.mainnet` · `chain.evm` · `chain.validators` · `chain.governance` · `chain.rust-core` · `bridge.canonical` (INTACHAIN) · `predict.markets` as INTACORE type · HIP-3 · HyperEVM as home · Base Appchain/L3 · dual-deploy Arbitrum “just in case.”

S-D2 (module map) may be **written** as a spec anytime. **Implement** of S-D4 stays parked.

---

## Nitro still holds (not coding gates)

| Item                                     | Why                                                        |
| ---------------------------------------- | ---------------------------------------------------------- |
| Sepolia ETH / RPC / optional bundler key | Phase 0                                                    |
| Gas-sponsorship float                    | Paymaster live sponsor                                     |
| External audit cheque                    | `socket.contract-audit`                                    |
| Named **external** venues we quote       | `socket.dex-venue-set` — different from our SovereignVenue |
| Mainnet keys / go-live yes               | Phase 7                                                    |
| Issuer keys                              | `socket.live-issuer`                                       |

Shehzad does **not** sit on Phase 1–4 waiting for the audit cheque or external venue names.

---

## Nitro agents

- **Do:** shell honesty once addresses exist; path-intersect; babysit **his** PRs; leave `audited:false`.
- **Do not:** `svc-protocol` rewrites, tracker “ready→done” for chain rows, `svc-chain`, closing his PRs as “superseded” by your recook.

Tip CI at write is **red** (`Doctrine gates` / `Format` / `Typecheck` / `Tests (full)` on #4188-class). Informational. Do not block Shehzad on it. Do not “heal main” by touching his contracts.

---

## Research still owed (all-out, not L1)

Do these **during** the phases, not as a new park:

1. **Flashblocks vs ordinary blocks** for SovereignVenue cancel/replace (Shehzad). Denim when it actually activates on Sepolia.
2. **Gas/latency of our venue** on Sepolia vs “demo” — measure, don’t claim HL numbers.
3. **Bundler SLA / permissionless mempool** on Base (OP `eth_sendRawTransactionConditional`) — Shehzad picks.
4. **IFC on Base vs ledger** — existing cross-plane ADR; not a substitute P1.
5. **Indexer WS provider** — public Base RPC has no WS (Aug 2026). Pick a provider; Nitro funds if paid.

Do **not** research Cosmos/HIP-3/HyperCore clones this wave.

---

## Conflict rule

If LAST-MVP, a dated board, or a tracker `ready` line says start INTACHAIN **or** says Shehzad is done after #2473, **this file + the park ADR win**.

---

## Paste — Nitro → Shehzad

```
Shizu — P1 stays parked. Live overview (phases, not tickets):

https://github.com/Phantom-X-007/intafaced/blob/main/docs/PROTOCOL-P0-BASE-MEGA-2026-09-06.md

You own how. Needle: Protocol suite live on Base Sepolia (84532), verified, audited:false, not called INTACHAIN. Then indexer on SovereignVenue (not DevVenue). Then a real UserOp on that chain. Then wallet journeys. Execution/OMS is the big leftover — you spec it; no second money book.

#2473 already merged. Do not sit. Do not start svc-chain. Do not ping me for audited:true.

I will get you Sepolia ETH/RPC (or you use your own testnet key). DAG is yours.
```
