# TRK-blueprint.attestations

**Title:** On-chain rank attestations, zero PII (§19)  
**Tracker:** `blueprint.attestations` · phase 4 · plane B · status `ready` · owner none  
**Depends on:** `blueprint.onboarding` (done), `protocol.smart-accounts`

## DoD (plain language)

A user can prove rank / Blueprint standing **on-chain** via an attestation that
contains **zero PII** (§19). Fiat-plane identity never leaks into the payload.
Issuance and revoke paths are explicit; no “silent NFT” of email or legal name.

## Path on tip

| Area           | Location                                                                   |
| -------------- | -------------------------------------------------------------------------- |
| Off-chain half | `svc-blueprint` profile + rank live on Fiat plane                          |
| On-chain half  | **Not built** under this id — README lists attestations as future residual |
| Protocol dep   | `protocol.smart-accounts` / chain issuance — Protocol Plane                |
| Doctrine       | §19 portable sovereign identity; Phase 4 Blueprint + attestation issuance  |

No attestation schema or issuer service in monorepo craft for this mountain.

## Blocked by

| Blocker              | Notes                                                                 |
| -------------------- | --------------------------------------------------------------------- |
| Protocol / chain law | Smart-account + attestation contract decisions — Denon / Shehzad lane |
| Product law          | What fields are “standing” vs PII; revoke UX                          |
| Class X              | Mainnet keys, auditor sign-off for contracts                          |
| Soft dep             | Rank thresholds exist in identity; binding on-chain is separate       |

Do **not** implement as agent free craft if it touches Shehzad protocol ownership
or invents chain product law. Research only until direction says free residual.

## First PR size (if free)

**M — contracts-first:** attestation payload schema (zero-PII zod) + issuer port
interface in `packages/contracts`; mock issuer in tests; no mainnet. Second PR
only after protocol socket owner accepts chain shape. Prefer babysit if M1–M7
or protocol branch owns issuance.
