# Owner decision packet, part two — P0-04…17 + completeness home

**Status:** OPEN rulings — shapes only. Nothing in this file is decided by an agent.  
**Board:** `DENON-HARD-PARALLEL-BOARD-2026-08-09.md` **D26-P0-04…17** (P0-18 = this packet family).  
**Companion (part one):** [`OWNER-DECISION-PACKET-2026-08-09.md`](OWNER-DECISION-PACKET-2026-08-09.md) — P0-01…03 plus money-path / dark-feed / token magnitudes / F10.  
**Machine index (tip SoT for “what is still open”):** [`ops/owner-ruling-packet.json`](ops/owner-ruling-packet.json).

**Rule carried from part one:** a missing number is **refuse-closed**, never a placeholder. Agents implement mechanisms and refuse paths; you publish magnitudes or explicit launch-closed.

---

## Completeness (D26-P0-18)

Part one started the sitting. Part two was a stub. **As of 2026-08-12 the tip packet is complete when:**

1. Part one + this file cover every **D26-P0-01…17** product ruling (sealed or open).
2. [`ops/owner-ruling-packet.json`](ops/owner-ruling-packet.json) indexes those rows **plus** Class X / admin / payout satellites that were previously only in side checklists.
3. A new owner decision that is not in the JSON is a **gap** — add a row before inventing product law.

P0-18 itself is the meta-seal for that tracking, not a product number.

---

## P0-04 · Token emission / buyback authority live

**Blocks:** burn / claim paths that trust seeds over the authority store; agents inventing drift guards.  
**Settled:** [`adr/2026-08-04-token-economics-outcomes.md`](adr/2026-08-04-token-economics-outcomes.md) — **whose** the numbers are (owner), deliberately **no** magnitudes.  
**Question:** when does the live authority store become the only source, and what fails closed if seeds ≠ DB?  
**Recommendation:** claim-before-burn + drift refuse until the store is populated; never burn on seed alone.  
**Also see:** part one item 9 (four token numbers) and index `PKT-C9`.

---

## P0-05 · Options / forex settlement asset law

**Blocks:** `trade.options`, `trade.forex` product-complete paths.  
**Settled:** tracker may show ready-shaped rows; that is **not** licence to invent settlement assets.  
**Question:** which instruments may go live, in which settlement asset, and what refuses when the set is empty?  
**Recommendation:** one ADR — live set · settlement asset · refuse matrix — before any engine claims Done. Options/forex stay socket or refuse until that ADR exists.

---

## P0-06 · Listing / delisting policy (DIRECTION §8.5)

**Blocks:** agents listing markets because a form exists.  
**Question:** what may list, who may list it, what delists, and what the refuse path returns when policy is blank?  
**Recommendation:** written policy that ends in a named refuse code; blank policy = no list, not “default allow.”

---

## P0-07 · Leverage / margin / liq params beyond §1 defaults

**Not open:** `DEFAULT_MAX_LEVERAGE = 10` — already DIRECTION §1 (see part one “already decided”).  
**Still open:** any raise above 10×, margin/liquidation parameters beyond §1’s stated defaults, or market-level overrides.  
**Recommendation:** publish an owner table **or** freeze “§1 defaults only until liquidation ladder proof exists.” Silent constant edits are doctrine crime.

---

## P0-08 · `pay:write` / KYB grant mechanism shape

**Blocks:** merchant surfaces that need a real grant path without inventing who may grant.  
**Shape + Layer B wiring:** [`adr/2026-08-12-pay-write-kyb-grant-mechanism-shape.md`](adr/2026-08-12-pay-write-kyb-grant-mechanism-shape.md) · refuse-closed `issueMerchantPayScopes` in `@intafaced/auth` · live money doors gate on approved KYB (`pay.kyb_required`) via D26-P1-P10 — **still no invented grantor**.  
**Settled around it:** two layers — (A) scope issuance refuse-closed until you publish grant law; (B) KYB money gate separate from dossier transitions. No auto-grant on `kybStatus: approved`. Full digital KYB operator path is `pay.psp`.  
**Question (A2 — yours only):** who may invoke the grantor; KYB predicate per `pay:read` / `pay:write` / `pay:refund` / `pay:payout`; sandbox temporary grant rules (if any); revocation / suspension ⇒ strip scopes.  
**Recommendation:** agents must not invent a grantor. Issuance stays refuse-closed until you seal A2; Layer B live KYB money gate may ship without inventing scopes.

---

## P0-09 · Fee + revenue recipe map

**Blocks:** agents adding ledger recipes because a fee path “needs one.”  
**Also open:** part one item 5 — `TRADE_FUTURES_PROFIT_SOURCE` has **no default** (index `PKT-B5`).  
**Question:** for every fee/revenue path, is there a **named** recipe or an explicit §13 socket?  
**Recommendation:** closed matrix in the packet index (and later a short ADR if the matrix grows). Inventing a recipe is inventing money shape.

---

## P0-10 · Listings / treasury / house commission law

**Blocks:** `market.commerce` commission invent.  
**Overlaps:** P0-02 market commission rate.  
**Question:** where does house commission authority live, and does blank refuse?  
**Recommendation:** authority store + refuse-blank; same pattern as copy fee-share residual. Numbers still P0-02.

---

## P0-11 · Scanner signal inputs law

**Blocks:** `agents.scanner` ranked signals.  
**Question:** which inputs may enter a rank, and what refuses when inputs are missing or untrusted?  
**Recommendation:** written input allow-list + fail-closed when any required input is absent. Rankings without law are product invention.

---

## P0-12 · Attestation threat model (`blueprint.attestations`)

**Blocks:** on-chain rank / attestation surfaces.  
**Question:** threat model + zero-PII bar before any product path claims Done.  
**Recommendation:** threat model doc first; implementers refuse if the bar is unmet. No PII in attestation payloads.

---

## P0-13 · Launchpad raise economics (law only)

**Blocks:** raise economics numbers invent.  
**Ownership:** law = owner/Denon; **on-chain implement = Shehzad** (agents babysit only).  
**Question:** which economic parameters are law vs socket, and what refuses until set?  
**Recommendation:** law doc with named params or explicit refuse; never ship agent-invented raise math.

---

## P0-14 · `DEFAULT_MIN_BEST_LEVEL_*` + mark dust floor

**Covered in part one item 4** — kept here so the P0 board row has a home in part two’s board span.  
**Recommendation unchanged:** keep shipped values until a real market lists with observed depth; ties P0-01 Q3 hard exclusion (no inventing a second % cap).

---

## P0-15 · Copy jurisdiction list

**Covered in part one item 3 table** — geo list is counsel/Nitro (see also `CLASS-X-SANCTIONS` in the JSON index).  
**Recommendation:** list **or** refuse-closed regions; engineers never draft the list.

---

## P0-16 · “Audited / insured / guaranteed” language ban

**Blocks:** marketing invent under DIRECTION §8.9.  
**Question:** which product surfaces may use those words, and what gate requires an owner seal?  
**Recommendation:** product copy + automated gate — those words require owner seal; default ban in user-facing copy.

---

## P0-17 · Insurance fund funding policy (futures list gate)

**Blocks:** listing live perps against an empty or undefined fund.  
**Settled around it:** futures risk ADR refuses inventing a house-fee “insurance” substitute.  
**Question:** fund exists, is funded by which recipe, and empty → **no list**?  
**Recommendation:** same honesty as lending reserve — empty fund cannot back a live market. Policy before list.

---

## Satellites (indexed, not re-litigated here)

| Index id                             | Home doc                                                                                         | Why separate                       |
| ------------------------------------ | ------------------------------------------------------------------------------------------------ | ---------------------------------- |
| `PAYOUT-01`                          | [`OWNER-RULINGS-FROM-DENON-PAYOUT-2026-08-09.md`](OWNER-RULINGS-FROM-DENON-PAYOUT-2026-08-09.md) | Affiliate payout clicks / defaults |
| `CLASS-X-NOTIFY`                     | [`OWNER-ACTIONS-NOTIFY-GATEWAYS.md`](OWNER-ACTIONS-NOTIFY-GATEWAYS.md)                           | Out-of-app delivery credentials    |
| `CLASS-X-WALLET-SECRETS` / `PKT-D10` | [`OWNER-ACTIONS-WALLET-RPC-SECRETS.md`](OWNER-ACTIONS-WALLET-RPC-SECRETS.md)                     | Rotation + §A4 F10                 |
| `CLASS-X-SANCTIONS`                  | [`OWNER-DECISIONS-OPEN.md`](OWNER-DECISIONS-OPEN.md)                                             | Counsel list content               |
| `CLASS-X-LICENCE`                    | [`LICENCE-POSITION.md`](LICENCE-POSITION.md)                                                     | Counsel / launch lawfulness        |
| `CLASS-X-GO-LIVE`                    | staging deploy ADR                                                                               | Host / secrets / prod RPC          |
| `GH-G1`…`G5`                         | [`ops/OWNER-GITHUB-CONFIG.md`](ops/OWNER-GITHUB-CONFIG.md)                                       | Admin-only GitHub settings         |

---

## What to answer next (aligned with part one)

1. **P0-03** — one venue sentence (highest unblock per finished code).
2. **P0-02 / P0-15 / P0-10** — rates + jurisdictions + commission authority (or launch-closed).
3. **P0-17 + P0-14** — insurance fund policy and mark dust floors before live perps.
4. Class X wallet rotation / notify credentials when you want out-of-app margin calls.
