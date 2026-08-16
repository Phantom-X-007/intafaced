# Threat model — Blueprint rank attestations (zero PII)

**Board:** D26-P0-12 (bar) · D26-P1-I4 (Fiat refuse surface) · tracker `blueprint.attestations`  
**Bar status:** **UNMET** — this page is the working bar, not an owner seal. Product Done stays refused until Denon adds the helper's P0-12 seal line after the on-chain half is specified with Shehzad.  
**Class:** N on the Fiat refuse; on-chain issuance is **Shehzad** (babysit only).  
**Not this page:** [`THREAT-MODEL-CURRENT.md`](THREAT-MODEL-CURRENT.md) (D26-P3-02 fiat/wallet_rpc/Java) · [`THREAT-MODEL-STAGING-DEPLOY.md`](THREAT-MODEL-STAGING-DEPLOY.md) (one workflow).

**Leverage:** Phase A IN `S-BLUEPRINT`. Horizon path for the mountain is **S** (on-chain). This document does not authorize a chain write.

---

## Assets

| #   | Asset                                         | Why it ranks here                                                                                          |
| --- | --------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| 1   | **Fiat identity / KYC store**                 | Name, documents, custodial `userId`. Putting any of it on a public attestation is irreversible disclosure. |
| 2   | **Share card (SVG / raster DTO)**             | Acquisition artifact meant to leave the service. Must stay zero-PII or it becomes a dox vector.            |
| 3   | **Rank / Blueprint standing**                 | The only thing §19 wants to prove. Safe as a commitment or coarse rank token — not as a person.            |
| 4   | **Cross-plane chain address / smart account** | Linking a custodial user to a public address is the other half of a deanonymization pair.                  |
| 5   | **On-chain attestation contract (unbuilt)**   | Shehzad leftover. An agent-invented verifier is security theater.                                          |

---

## Adversaries

| Adversary                  | Goal                                                              | Why we care                                         |
| -------------------------- | ----------------------------------------------------------------- | --------------------------------------------------- |
| Curious verifier / indexer | Reconstruct who holds which rank from public payload + chain data | Payload must not name a person or their other plane |
| Compromised Fiat caller    | Smuggle `userId` / KYC / email onto card or attestation DTO       | Machine refuse by named field                       |
| Agent inventing “done”     | Flip `blueprint.attestations` without P0-12 seal or live chain    | Product Done helper refuses; tracker stays not done |
| Cross-plane correlator     | Join KYC user to INTACHAIN / EVM address via the attestation      | Cross-plane address keys refuse by name             |

---

## Trust boundaries

| Boundary                        | Trusted side                          | Untrusted side                                 | What must not cross                        |
| ------------------------------- | ------------------------------------- | ---------------------------------------------- | ------------------------------------------ |
| Fiat profile store → share card | Derived axes, crew public name        | Session answers, birth data, `userId`, KYC     | Identity / KYC / custodial id              |
| Fiat issuer → attestation DTO   | Rank / crewRole / season / commitment | Email, handle, KYC status, wallet / SA address | Same plus cross-plane address              |
| Fiat → Protocol Plane           | Commitment only (when Shehzad builds) | Encrypted PII store, identity APIs             | Any field that identifies a natural person |
| Card rasterizer                 | SVG we composed                       | Hosted PNG URL consumer                        | SVG must already be zero-PII               |

---

## Zero-PII bar

A card or rank-attestation payload **refuses by named code** if it carries:

| Category            | Refuse code                                     | Example keys                                  |
| ------------------- | ----------------------------------------------- | --------------------------------------------- |
| Identity            | `blueprint.attestation_pii_identity`            | `email`, `legalName`, `handle`, `birthData`   |
| KYC                 | `blueprint.attestation_pii_kyc`                 | `kyc`, `kycStatus`, `kycDocument`             |
| Custodial user id   | `blueprint.attestation_pii_custodial_user_id`   | `userId`, `custodialUserId`, `customerId`     |
| Cross-plane address | `blueprint.attestation_pii_cross_plane_address` | `walletAddress`, `evmAddress`, `smartAccount` |

Allowed attestation keys (Fiat DTO only): `schemaVersion`, `kind`, `rank`, `crewRole`, `season`, `commitment`.  
Share card DTO stays `cardRenderSchema` — no `userId` on the wire object.

WebAuthn authenticator attestation in `svc-identity` is **a different product**. Do not conflate.

---

## Product Done

**Refuse.** `decideAttestationProductDone` returns `blueprint.attestation_threat_model_unmet` until this file contains the helper's P0-12 seal line **and** the headings above. Tracker `blueprint.attestations` stays `ready` / owner `shehzad002`. On-chain leftover: Shehzad (`protocol.smart-accounts` + issuance). Agents do not mark the mountain done from D26-P1-I4.

When (later) the bar is sealed, product Done still requires live issuance on a real chain decision — not anvil-only theater, not this PR.
