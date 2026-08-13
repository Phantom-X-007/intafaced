# ADR: insurance fund funding policy — empty fund, no live perps

**Status:** **Accepted — 2026-08-13 (D26-P0-17 sealed).**  
**Decision owner:** repo owner (Denon). **Written by:** Denon.  
**Board:** D26-P0-17 — Insurance fund funding policy (futures list gate).  
**Packet:** [`OWNER-DECISION-PACKET-PART-TWO-2026-08-09.md`](../OWNER-DECISION-PACKET-PART-TWO-2026-08-09.md) §P0-17.  
**Builds on:** [`DIRECTION-2026-07-31.md`](../DIRECTION-2026-07-31.md) §1 (“If it is empty, futures do not list”); [`2026-08-12-listing-delisting-policy.md`](2026-08-12-listing-delisting-policy.md) (D26-P0-06); [`2026-08-05-futures-risk-and-mark-law.md`](2026-08-05-futures-risk-and-mark-law.md) (house fees are not insurance).  
**Does not invent:** target fund size, fee-share into the pot, capitalisation schedule, ADL thresholds, or a second money book.

---

## The decision

> **A real-money perpetual does not list, and does not become `active`, while the insurance pot for its quote asset holds nothing. Any positive ledger balance in that pot is “funded” for the list gate. Target size is owner law and is not this ADR.**
>
> **The pot is the ledger insurance account named by the recipes. Top-up is `futuresInsuranceTopup`. Shortfall draw is `futuresRealizeLoss({ fromInsurance })`. House trade fees are not the fund. `svc-trade` does not hold the balance.**
>
> **Refuse is `trade.insurance_fund_empty`. Paper and non-active rows may exist. Modelling is not listing.**

This is settled. Agents do not invent a capitalisation number to “finish” futures.

---

## Why this ADR exists

DIRECTION §1 already said empty fund → no list. Tip already enforces it (`checkInsuranceFundedForListing`). What was missing was the **owner seal** so a craft PR cannot close D26-P0-17 by writing `$10_000_000` into source, or by treating `houseFees` as cover (the risk ADR already forbids that substitute).

P0-17’s done bar is **this document**: fund exists, is funded via a named recipe, empty means no list. It is **not** an owner table of target size. That remains open (D4 / DIRECTION §8).

---

## What is sealed

1. **Existence.** The insurance fund is a ledger account (`insuranceFund` / `house:insurance-fund:available` for the quote asset), not a comment, not a `svc-trade` table, not a Java wallet.

2. **Funded, for listing.** Production `kind=futures` + `status=active` + `paper=false` requires `available > 0` on that account. The listing gate and the shortfall bound **must name the same pot** (`recipeInsuranceAccount`). Any positive amount satisfies the _list_ gate. It does **not** satisfy a target-size policy that does not exist yet.

3. **Recipe.** Capital enters the pot via `futuresInsuranceTopup` (from house trade fees). Shortfalls leave via `futuresRealizeLoss` with `fromInsurance` bounded by live balance (`insurance-bound.ts`). Do not invent a second top-up recipe or an inline post.

4. **Empty → no list.** Refuse code `trade.insurance_fund_empty`. Same honesty as lending reserve: a market that cannot absorb a named loss does not open for real money.

5. **House fees ≠ insurance.** Paying PnL from `houseFees` with no ceiling is not this pot. The futures risk ADR stands.

6. **Paper / pending stay honest.** Non-futures, paper, and non-active statuses skip the balance read. You may model a perp without capital. You may not take real-money risk against an empty pot.

---

## What remains owner-open (not inventable here)

- Target size, fee-share into the fund, and capitalisation _schedule_.
- Whether “positive” is enough for _launch_, or a later owner table raises the floor.
- ADL magnitudes (D5) — last-resort disclosure already has a product path; numbers stay §8.
- `TRADE_FUTURES_PROFIT_SOURCE` / N1 profit-source capitalisation (adjacent, not this row).

A later owner table may raise the list floor above zero. Until then, **do not** put a second constant in `insurance-listing-gate.ts` and call it policy.

---

## Refuse matrix (names on tip — do not rename)

| Situation                                           | Code                                                  |
| --------------------------------------------------- | ----------------------------------------------------- |
| Real-money futures list / enable-to-active, pot ≤ 0 | `trade.insurance_fund_empty`                          |
| Shortfall larger than live pot                      | existing shortfall bound refuse (not a new list code) |

---

## What agents may do without asking again

- Keep and deepen the listing gate and shortfall bound tests.
- Cite this ADR on any new futures list / enable path.
- After an operator funds the pot via `futuresInsuranceTopup`, allow production-active futures listing that already passes every other P0-06 gate — still no invent target size.

## What agents must not do

- Commit a target size, APR, or “1% of OI” into source or env defaults.
- Treat `houseFees` as the insurance fund.
- Hold insurance balance outside `ledger-client`.
- Mark `trade.futures` Done because this ADR landed.

---

## Proof on tip (already; this ADR does not dual-edit trade)

- List gate: `services/svc-trade/src/futures/insurance-listing-gate.ts`
- Shortfall bound: `services/svc-trade/src/futures/insurance-bound.ts`
- Recipe: `packages/ledger-client` `futuresInsuranceTopup` / `futuresRealizeLoss`
- Listing policy adjacency: D26-P0-06 ADR
