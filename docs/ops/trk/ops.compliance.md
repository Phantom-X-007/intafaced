# TRK-ops.compliance

**Title:** Screening queues, geo-block, VPN/Tor detection  
**Tracker:** `ops.compliance` · phase 5 · module core-ops · status `ready` · owner none  
**Depends on:** `identity.kyc`

## DoD (plain language)

Operators can process **screening queues**; the platform can **geo-block** and
detect VPN/Tor per published policy. **Sanctions list content is Class X**
(human + counsel) — agents never invent list rows. Enforcement hooks fail
closed when config/lists missing.

## Path on tip

| Area    | Location                                                           |
| ------- | ------------------------------------------------------------------ |
| Related | Identity KYC; edge/env commercial region + sanctions boot guards   |
| Denon   | Open PRs around screening/region config (#432 etc.) — babysit only |
| Class X | Sanctions **content** never agent-authored                         |

## Blocked by

| Blocker   | Notes                                           |
| --------- | ----------------------------------------------- |
| Class X   | List data + legal posture                       |
| Product   | Queue UX, appeal path, false-positive handling  |
| Dual-edit | Do not edit Denon open screening files mid-wave |

## First PR size (if free)

**S — after Denon config PRs land:** operator queue **schema** + empty queue
API that reads identity KYC states only. List ingestion is Class X / human.
No VPN vendor name in user copy.
