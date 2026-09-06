# Shehzad audit — Protocol P0 on Base (fill this, then ship)

**Status:** **EMPTY — not an audit.** `@shehzad002` fills this in a PR.  
**Gate:** no Base Sepolia deploy, no `svc-chain`, no IFC-named token, until this file is merged with every answer non-empty.  
**Not valid:** “LGTM”, “agreed”, “looks good”, copy-paste of the mega, an agent filling this for you.  
**You may disagree.** A **NO** with a better overview path is a successful audit. Rubber-stamp is a failed one.

**Read first (tick in your PR body, not here):**

- [ ] [`PROTOCOL-P0-BASE-MEGA-2026-09-06.md`](PROTOCOL-P0-BASE-MEGA-2026-09-06.md) including **Send-off law**
- [ ] [`adr/2026-09-03-protocol-rails-until-intachain.md`](adr/2026-09-03-protocol-rails-until-intachain.md)
- [ ] [`adr/2026-08-08-protocol-plane-p0-handshake-and-rails.md`](adr/2026-08-08-protocol-plane-p0-handshake-and-rails.md)
- [ ] [`adr/2026-08-04-matching-dual-target.md`](adr/2026-08-04-matching-dual-target.md)
- [ ] [`adr/2026-08-08-paymaster-and-bundler-policy.md`](adr/2026-08-08-paymaster-and-bundler-policy.md)
- [ ] [`adr/2026-08-04-cross-plane-bridge-accounting.md`](adr/2026-08-04-cross-plane-bridge-accounting.md) + [`adr/2026-08-15-cross-plane-bridge-handshake.md`](adr/2026-08-15-cross-plane-bridge-handshake.md)

Replace every `REPLACE` line. Delete this sentence when done.

---

## Verdict (pick one)

`REPLACE: GO as written` / `GO with named deltas below` / `NO — do this instead`

One line why:

`REPLACE`

---

## Q1 — Park INTACHAIN this wave?

Is parking `svc-chain` / Cosmos / HIP-3 / HyperEVM-as-home the right move for a real Protocol product **now**, or did we miss a cheaper path?

- Verdict: `REPLACE: keep park / unpark because …`
- Why (engineer, not vibe): `REPLACE`
- If you unpark: what ships in 30 days that Base Sepolia cannot? `REPLACE or n/a`

## Q2 — Base Sepolia → Base still the P0 rail (Sep 2026)?

Vs HyperEVM, another L2, or stay anvil-only.

- Verdict: `REPLACE`
- Why: `REPLACE`
- Sequencer liveness (Base can stall) — acceptable for P0 testnet? `REPLACE`

## Q3 — No token named IFC, no CEX ↔ chain crossing this wave?

- Verdict: `REPLACE: hold / I would mint IFC because …`
- Why (one-supply / reconciler): `REPLACE`
- Test quote asset you would actually use on Sepolia: `REPLACE` (must not be named IFC)

## Q4 — SovereignVenue on Base vs house book + AMM only?

Is an on-chain CLOB on Base an honest self-custody venue, or a dead end (latency/MEV) we should not pretend is the exchange?

- Verdict: `REPLACE: keep venue in Phase 2 / defer venue, AMM-first because …`
- Why: `REPLACE`

## Q5 — Phase order 1 publish → 2 venue → 3 UserOp → 4 journeys → 5 protocol OMS?

- Verdict: `REPLACE: keep / reorder to …`
- Why: `REPLACE`

## Q6 — Two OMS / no second money book / user-pays gas until funded?

- Fiat `execution.sor` vs protocol `socket.dex-execution` — same or different? `REPLACE`
- Protocol fills through `svc-matching` or ledger? `REPLACE: never / I would because …`
- Gas: user submits until Nitro funds — agree? `REPLACE`

## Q7 — What would you **cut** or **add** at overview altitude (not Solidity)?

Must name **at least one** cut or one add. Empty = invalid.

- Cut: `REPLACE`
- Add: `REPLACE`

## Q8 — What would make this plan **false** if we shipped it as marketing?

(e.g. “our chain”, `audited:true`, Hyperliquid-speed, IFC live)

- `REPLACE`

---

## After this PR merges

Phase 1 (publish on 84532) is allowed unless verdict is **NO**. If **GO with deltas**, the deltas in Q1–Q7 are the overlay; do not silently drop them.

Nitro does not re-spec your how. He only needs this file on `main` before you broadcast.
