# ADR: options / forex settlement asset law

**Status:** **Accepted — 2026-08-13 (D26-P0-05 sealed).**  
**Decision owner:** repo owner (Denon). **Written by:** Denon.  
**Board:** D26-P0-05 — Options / forex settlement asset law.  
**Packet:** [`OWNER-DECISION-PACKET-PART-TWO-2026-08-09.md`](../OWNER-DECISION-PACKET-PART-TWO-2026-08-09.md) §P0-05.  
**Builds on:** [`DIRECTION-2026-07-31.md`](../DIRECTION-2026-07-31.md) §2 (instrument model; forex/commodities do not production-list until fiat rails exist) and §8 item 5 (agents do not decide the catalogue); [`2026-08-12-listing-delisting-policy.md`](2026-08-12-listing-delisting-policy.md) (D26-P0-06); D-S-06 one matching book.  
**Does not invent:** which option underlyings list, which FX pairs go live, which ledger asset is the cash payoff asset, D7 fixing source/window/payor, fee bps, or a euro-stablecoin standing in for fiat.

---

## The decision

> **Options v1 is European, cash-settled, full collateral, on the one matching book. The live instrument set and the settlement asset are owner law. Until a deploy sets the opaque stamp `TRADE_OPTIONS_SETTLEMENT_ASSET_LAW`, options cannot list. That stamp means “this ADR is in force on this host.” It is never a parsed table of coins. Agents do not write USDT, USDC, or “use the quote asset” into source to close a tracker row.**
>
> **Forex and commodities may be modelled. They may not be production-tradable until this ADR is in force _and_ real fiat settlement rails exist. Mapping EUR to a euro-denominated crypto asset is not a fiat rail. It is a second book dressed as FX.**
>
> **Refuse is the answer when any of those gates fail — never a silent list, never a default asset, never an IV surface pretending to be settlement.**

This is settled. Agents implement against it. They do not re-litigate the live set.

---

## Why this ADR exists

`trade.options` and `trade.forex` have been `ready` in the tracker long enough that a craft PR could “finish” them by inventing a settlement asset. That would be DIRECTION §8 crime with a green CI.

Tip already refuse-closes the doors:

- Options list: `resolveOptionsListing` → `trade.options_settlement_law_unset` while the opaque stamp is empty (`socket.options-settlement-asset-law`). Fixing is a second opaque string (`TRADE_OPTIONS_SETTLEMENT_FIXING`, D7). Incomplete European terms refuse. Orders still `trade.market_kind_unsupported` until an options engine exists.
- Forex/commodity production list and place: `assertProductionUnsettledAssetClassListing` / `assertSettlementRails` → `trade.unsettled_asset_class_listing` (`socket.forex-settlement`). Paper and non-active rows stay honest.

What was missing was the **owner ruling those sockets wait on**: live set · settlement asset · refuse matrix — without filling in the catalogue.

D26-P0-05’s done bar is **this document**. Setting the env stamp on a host is an operator click after they accept the seal. It is not an agent inventing USDT in `options-listing.ts`.

---

## Authority split

| Question                                             | Authority                                                                                |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| May options list at all on this deploy?              | Opaque `TRADE_OPTIONS_SETTLEMENT_ASSET_LAW` — empty = this ADR not in force              |
| **Which option underlyings / FX pairs list?**        | Owner catalogue (D26-P0-06 / DIRECTION §8 item 5)                                        |
| **Which ledger asset is the cash payoff posted in?** | Owner, when they publish it — **not** this ADR, **not** source defaults                  |
| Settlement _price_ (fixing source / window / payor)  | Owner D7 — `TRADE_OPTIONS_SETTLEMENT_FIXING` opaque; never parsed here                   |
| European terms (call/put, strike, expiry)            | Listing row + DB check `markets_options_terms_ck`                                        |
| Full-collateral cash payoff mechanics                | This ADR (shape) + future ledger-client recipe when an engine exists — no second book    |
| Fiat rails actually moving EUR/USD/JPY bank money    | Owner + pay rails posture (Class X / commercial). Not `PAY_CRYPTO_ASSETS` coincidentally |
| IV / American style / credit-margined options        | **Out of v1.** Explicit non-european style already refuses                               |

**Modelling ≠ live.** A forex pair in `trade.markets` with `paper=true` or `status=pending` is honest. Six seed majors that are `active` in the DB remain **unfundable** on the place path. That is not a listing licence.

---

## What is sealed — options

1. **Product title is mechanical payoff, not a pricing engine.** v1 options are European, cash-settled, full collateral. No IV surface. No American exercise. No invent D7 source. Payoff, when an engine exists, is a ledger-client post in an owner-named settlement asset — never a balance held in `svc-trade`.

2. **One book.** Options do not get a second matching engine or a Java wallet table. D-S-06 holds.

3. **The law stamp is opaque on purpose.** `TRADE_OPTIONS_SETTLEMENT_ASSET_LAW` non-empty means the operator has put **this ADR** in force on that deploy. Agents must not parse it for asset ids, live-set rows, or refuse-matrix cells. Putting `"USDT"` in the default env is inventing the settlement asset.

4. **Fixing is a second door.** A published law stamp does **not** unlock listing by itself. `TRADE_OPTIONS_SETTLEMENT_FIXING` must also be non-empty, and European terms must be complete. Half-listed options are a lie.

5. **Listing is not trading.** After both stamps and terms, `listMarket(kind=options)` may succeed. `assertTradable` still refuses options orders (`trade.market_kind_unsupported`) until a real options engine exists. Closing the _listing_ socket is not marking `trade.options` Done.

6. **Live set is not in this file.** There is no BTC-29DEC-C-100000 table here. Underlyings enter through P0-06 like any other market. Agents do not mint an options chain to green a mountain.

---

## What is sealed — forex / commodities

1. **DIRECTION §2 stands.** Instrument model and venue hours may exist. Production list (`active` + not paper) and production place stay refused until **both** this ADR is in force **and** fiat settlement rails exist.

2. **Stablecoin substitution is forbidden as FX settlement.** `PAY_CRYPTO_ASSETS` mapping EUR → a euro-ticker crypto asset does not close `socket.forex-settlement`. That would be a second money plane: crypto labelled as fiat. True fiat omnibus / sponsor-bank rails are owner/commercial. Agents do not pick a stablecoin “so FX can ship.”

3. **Seeded majors that look listed are not live.** Existing `active` forex rows in the instrument migration stay **unfundable**. New production-active forex/commodity listings refuse the same code. Paper drills remain allowed.

4. **Same engine.** Forex is not a second matching stack. Quote convention / tick / lot / schedule live on the instrument model (DIRECTION §2). Settlement is the missing rail, not a missing book.

---

## Refuse matrix (names on tip — do not rename to look busy)

| Situation                                      | Code                                  | Socket / residual                                    |
| ---------------------------------------------- | ------------------------------------- | ---------------------------------------------------- |
| Options list, law stamp empty                  | `trade.options_settlement_law_unset`  | `socket.options-settlement-asset-law`                |
| Options list, fixing empty                     | `trade.options_fixing_unconfigured`   | D7 owner law                                         |
| Options list, terms partial / non-european     | `trade.options_terms_incomplete`      | —                                                    |
| Options order while no engine                  | `trade.market_kind_unsupported`       | engine not this ADR                                  |
| FX/commodity production list or place          | `trade.unsettled_asset_class_listing` | `socket.forex-settlement` (P0-05 **and** fiat rails) |
| Invented settlement asset in source / env seed | **Forbidden**                         | Not a code — a doctrine fail. Revert.                |

Empty published allowlists (copy P0-15 shape) are **not** this matrix. Do not borrow copy JSON into options stamps.

---

## What remains owner-open (not inventable here)

- The actual settlement **asset id** (when they choose to publish one, it will be a new owner stamp or a market-row field — **not** a parse of today’s opaque env).
- The live options chain and live FX pair list (P0-06).
- D7 fixing content.
- Fiat rail vendor, BIN, and which fiat currencies those rails actually settle (Class X / commercial).
- Options engine, margin for options (v1 is full collateral — no invent partial-margin options), and any recipe names for option premium/payoff (ledger recipes are DIRECTION §8 item 6).

`TRADE_OPTIONS_SETTLEMENT_ASSET_LAW` stays **unset in committed defaults**. Operator publish is deploy config.

---

## What agents may do without asking again

- Keep and deepen the refuse paths and tests that blank stamps never list options and never production-place FX.
- After an operator sets the opaque law stamp **and** D7 fixing, allow options **listing** that already passes European terms — still no invent asset, still no options **orders** until an engine exists.
- Cite this ADR on any new options/forex entry.

## What agents must not do

- Commit a default settlement asset (USDT/USDC/quote-as-cash) in env examples, compose, or `options-listing.ts`.
- Treat `PAY_CRYPTO_ASSETS` euro-stable as FX rails.
- Mark `trade.options` or `trade.forex` Done because this ADR landed.
- Parse `TRADE_OPTIONS_SETTLEMENT_ASSET_LAW` for a live set.
- Build an IV surface or American options to “complete” T6.

---

## Proof on tip (already; this ADR does not dual-edit trade)

- Options listing socket: `services/svc-trade/src/spot/options-listing.ts`
- Forex socket: `services/svc-trade/src/spot/forex-settlement.ts`
- Listing policy adjacency: D26-P0-06 ADR
- Tracker sockets: `socket.options-settlement-asset-law`, `socket.forex-settlement`

---

## How a later owner click closes the _listing_ half

1. This ADR is on main (now).
2. Operator sets `TRADE_OPTIONS_SETTLEMENT_ASSET_LAW` to any non-empty opaque id on that deploy (meaning: we accepted this file).
3. Operator sets `TRADE_OPTIONS_SETTLEMENT_FIXING` (D7 content — still owner).
4. Owner catalogues specific option markets under P0-06.
5. Forex production still waits on **fiat rails**, not on step 2 alone.

Steps 2–4 are not agent craft. Step 5 is not a stablecoin.
