# Claim — academy.ambassadors refuse IFC pay when rates unset

**Lane id:** `academy.ambassadors-refuse-unset`  
**Owner session:** Denon · Grok  
**Tracker:** `academy.ambassadors` (stays `ready` — mountain not done)  
**Branch:** `feat/academy-ambassadors-refuse-unset`  
**status:** claimed  
**Class:** N (honesty refuse; no ledger)

## Goal

Residencies / IFC pay refuse when rate authority is unset. No invented IFC magnitudes.

## Done-bar

- Public doors return a typed refuse (not a fake quote)
- Tests fail if unset rates look payable
- No Vue
- No ledger invent

## Scope

- `services/svc-academy/src/ambassadors/**` (ifc-pay + rate-law + tests)
- Surgical `router.ts` public-door wire + mount tests

## Do not touch

- Vue / nitro-frontend-all
- Shehzad chain
- Dual-edit #1841 svc-agents, #1842 svc-bank, connect/ws
- wave-14
- `features.mjs` (tracker stays ready)
- paper/**

## Leverage

Phase A IN — existing academy ambassador procedures. Horizon `academy.ambassadors` = IN.
