# TRK-bridge.canonical

**Title:** Canonical IFC bridge + attestations  
**Tracker:** `bridge.canonical` · phase 4P · plane B · status `ready` · owner none (Shehzad board S-B5 design; not free craft invent)  
**Depends on:** chain.mainnet, token.emissions (emissions done; mainnet not)  
**Tip freeze:** `afa73a4f` · research only · no `features.mjs`

## DoD (plain language)

Ledger IFC and chain IFC are **one supply**, reconciled by a **canonical bridge** + attestation path — not two independent print heads.

Deposit/withdraw between Fiat ledger and Protocol chain is **attested**, fail-closed, and never invents balances on either side when the other is unreachable.

Bridge security model is written (validators / light client / multisig phases) **before** mainnet money moves — no “bridge theatre” contracts without threat model.

## Path on tip

| Area    | Location                     |
| ------- | ---------------------------- |
| Service | **none** (future svc-bridge) |
| Chain   | chain.mainnet not built      |
| Token   | svc-token emissions done     |

## Blocked by

| Blocker       | Notes                                       |
| ------------- | ------------------------------------------- |
| chain.mainnet | Not started — hard dependency               |
| Shehzad S-B5  | Design/threat model — do not invent theater |
| Class X       | Keys / go-live                              |

## First PR size (if free)

**Docs/threat model only** under S-B5. No code PR from this research claim.

**Solid spec:** [TRK-bridge.canonical.md](./TRK-bridge.canonical.md)
