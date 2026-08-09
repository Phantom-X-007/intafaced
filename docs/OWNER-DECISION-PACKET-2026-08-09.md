# Owner decision packet — everything waiting on you, in one sitting

**Written by:** Denon, 2026-08-09. **Tip:** `2f9a7df0`.
**Board:** `DENON-HARD-PARALLEL-BOARD-2026-08-09.md` **D26-P0-01 · P0-02 · P0-03**, plus every ruling I have accumulated separately.
**Nothing here is decided by me.** Each item states the question, what is already settled around it, a recommendation, and what unblocks the moment you answer.

**One rule I have applied throughout:** where a number is missing, the answer is **not** a placeholder. `services/svc-trade/src/copy/` already does this correctly — it is **refuse-closed** with `COPY_FEE_SHARE_RESIDUAL`, declining the surface and naming the residual rather than inventing a rate. That pattern is the model for item 3 below.

---

## First — one item is already decided and nobody noticed

**`DEFAULT_MAX_LEVERAGE = '10'` needs no ruling.**

`19340c9e` shipped it labelled _"placeholder awaiting a `DIRECTION` §8 item 8 ruling."_ But §8 item 8 reserves _"leverage, margin and liquidation parameters **beyond §1's stated defaults**"_ — and [`DIRECTION-2026-07-31.md:27`](DIRECTION-2026-07-31.md) states:

> **Max leverage v1: 10×.** Not a product opinion — it is the number at which our liquidation latency is survivable. Raise it only with evidence from §1's liquidation proof.

The agent picked `10` independently and matched the standing decision. **This is not open.** I am removing it from the list rather than asking you to re-rule it, and the constant's comment should be corrected to cite §1 instead of claiming it awaits §8.

**Consequence worth stating:** §1 conditions raising it on _"evidence from §1's liquidation proof."_ That proof does not exist — there is no margin call, no grace and no partial liquidation in futures today (see item 7). So 10× is not merely the current number, it is **the ceiling until the liquidation ladder exists.**

---

# A · The three that unblock whole engines

## 1 · House desk and internal market making — three questions

**Blocks:** `execution.house-tenant` and the internal half of `execution.market-making`, both boarded and both explicitly unbuildable until ruled.
**Law:** [`adr/2026-08-08-house-desk-and-market-making-fairness.md`](adr/2026-08-08-house-desk-and-market-making-fairness.md) — five rules Accepted, these three reserved.

§28 says three things that compose badly: the house desk is **sealed and undisclosed** (`:777`), it has **"structural first-class access"** to the venue we own (`:774`), and its MM engine **"seeds our books and works the street"** (`:773`). Together: a sealed desk quoting both sides of the book we settle customer fills against — sitting on top of _"a price that moves money is never supplied by the party it pays."_

### Q1 — Does the house desk trade our own venue, or only external ones?

**Recommendation: external-only for v1.** Not caution — **SOR, arbitrage, the cost model and execution reports can all be built and proven against external venues with no fairness surface at all.** You then answer the internal question with a working engine in hand instead of in the abstract.

### Q2 — If it trades our venue, is its _existence_ disclosed?

The Throne Law is unambiguous about **strategies** and **silent about existence**. Strategy-secret / existence-disclosed is what regulated venues do and is compatible with §28 as written. Existence-also-secret is defensible for pure alpha and much harder to defend if a user discovers the counterparty to their fill was the operator. **Honesty doctrine points at disclosure; it is a positioning call, not a correctness one.**

### Q3 — Where is the line between "seeding" and "supplying a price that moves money"?

Even excluded from marks, a dominant internal quote **influences** the mark others are liquidated on. **Recommendation: hard exclusion rather than a percentage cap** — a cap needs a number, and item 4 already has two unruled ones on this exact path. Two more would be drift.

---

## 2 · The dex venue set — one sentence

**Blocks:** `dex.quote` reaching `done`; `socket.dex-venue-set` is the row.
**This is not an engineering problem.** The row says it plainly:

> **"THE CODE IS FINISHED. IT CANNOT SERVE A QUOTE."**

Live probe on shipped defaults: HTTP 503, `dex.quote.no_venue_available — No venue could price BTC-USDT: intachain-clob (unreachable); internal-book (unreachable)`. It fails safe and names both dead venues. Given **one** reachable venue via `DEX_EXTERNAL_VENUES` and nothing else changed, the same binary returned HTTP 200 with a real route, correctly flagged `degraded: true`, `singleVenue: true`, `custodialLegs: true`.

**The question: which venue or venues does this platform actually quote?** Answer that and the row moves; leave it and the code stays finished and useless.

**Recommendation:** name the one venue we already have a working adapter for and mark the row `done` with `singleVenue` disclosed on every response — which the service already does. A single disclosed venue is honest; an empty set presented as a router is not.

---

## 3 · The §8 rate, fee and share numbers — and the mechanism

**Blocks:** `trade.copy` payout, market commission, affiliate rates, and any pay fee table still carrying a seed.

**The mechanism question is mine and I have answered it; the numbers are yours.**

**Ruling I am making (mechanism only):** a surface whose rate is unset is **refuse-closed and says so** — it does not fall back to a source seed, a zero, or a "sensible default." `services/svc-trade/src/copy/` already implements exactly this:

```
COPY_FEE_SHARE_RESIDUAL =
  'DIRECTION §8 leader_share_bps is owner-only — refuse-closed (never invent fee-share rates)'
```

That is the pattern. **A seeded rate in source is indistinguishable from a decided one three months later**, which is how an invented bps becomes policy nobody chose.

**What I need from you** — each is a number or an explicit "launch-closed until set":

| Parameter                  | Surface it gates              |
| -------------------------- | ----------------------------- |
| `leader_share_bps`         | copy trading payout           |
| Copy **jurisdiction list** | which regions may copy at all |
| Market commission rate     | `market.commerce`             |
| Affiliate commission tiers | `ops.affiliates`              |
| Pay fee table              | PSP pricing surfaces          |

**Recommendation: publish them into a config authority, not source.** Set what you know, leave the rest launch-closed. A launch-closed surface that says why is honest; a surface running on a placeholder is not.

---

# B · Money-path parameters

## 4 · Two depth numbers on the futures mark path

Both landed in `19340c9e` as placeholders, and unlike the leverage cap **these genuinely are §8 item 8** — they gate whether a mark may liquidate.

- **`DEFAULT_MIN_BEST_LEVEL_NOTIONAL = '100'`** — absolute floor, quote units per best level.
- **`DEFAULT_MIN_BEST_LEVEL_BPS_OF_NOTIONAL = 100`** (1%) — the best level must also carry this fraction of the position it is pricing.

The relative one exists because the absolute one alone was exploited: **two orders worth ~120 quote units priced the close of a 1,000,000 notional position and extracted 190,000 USDT.** Raising the absolute number does not fix that — it moves the size at which the same arithmetic works and makes ordinary markets unquotable on the way past.

**Recommendation: keep both at the shipped values until a market is actually listed with real depth**, then set them from observed book data rather than from judgement. I have no evidence for a better number and neither does anyone else yet.

## 5 · Which account funds realised futures profit

Open since [`adr/2026-08-05`](adr/2026-08-05-futures-risk-and-mark-law.md). A fee and revenue recipe — **§8 item 6** — and therefore twice yours. `TRADE_FUTURES_PROFIT_SOURCE` deliberately has **no default**, so futures cannot pay anything until you name it. That is the correct posture and I am not changing it.

## 6 · Turning funding on for a market

Explicitly owner-reserved by the same ADR. Nothing is blocked _today_ because `TRADE_FUTURES_JOBS_ENABLED` ships off — but note §7: that flag being off is also what freezes every position's mark basis.

---

# C · Postures and horizons

## 7 · The dark-feed horizon, and operator settlement of a frozen position

From [`adr/2026-08-07`](adr/2026-08-07-futures-exit-when-the-feed-is-dark.md):

- **How long may a market sit dark before frozen positions become an operator alert?** A posture parameter.
- **May an operator ever settle a frozen position at an adjudicated price if a feed never returns?** External value movement, `DIRECTION` §3. **Until decided the answer is no** — and today that means a position frozen past the deviation breaker has **four exits and all four are shut.**

**Recommendation on the second:** yes, with two conditions — a human adjudicates (never a job), and the adjudicated price and its author are recorded on the row. The alternative is collateral that is permanently unreachable, and [`adr/2026-08-07`](adr/2026-08-07-futures-exit-when-the-feed-is-dark.md) already ruled that **a control which traps funds is not a safety control.**

## 8 · The `p2p:moderate` scope split

Owner sign-off, noted in `LIVE-LANES` as explicitly not agent-implementable.

## 9 · Four token numbers

Emission, buyback, burn and staking parameters. [`adr/2026-08-04-token-economics-outcomes.md`](adr/2026-08-04-token-economics-outcomes.md) decided **whose they are** and deliberately decided **no number**.

---

# D · Two live defects that need an owner action, not a fix

## 10 · `act/pom.xml` declares `rpc-common` twice — F10, LIVE

`vendor/upstream-exchange/01_wallet_rpc/act/pom.xml` declares `rpc-common` at version `1.0` and again at `1.2`. **Maven resolves the first.** `1.2` is where the auth guard lives; `1.0` does not exist in this reactor. Resolved from a stale local repository, **`act` boots serving `/rpc/**` to anyone who can open a socket, and throws nothing at startup** because nothing else reads `rpc.auth-token`.

Recorded as **F10 LIVE** in the 2026-08-05 security review, and **frozen — not fixed** — in `wallet-rpc-auth-scan`, where `act` is the sole `RECORDED UNPROVEN` module. Remediation is `OWNER-ACTIONS-WALLET-RPC-SECRETS.md` **§A4** because the edit is inside unreviewed, never-compiled, key-handling third-party code. **I have not touched it and will not.**

## 11 · `svc-bank` earn and loans idempotency — a real money defect, parked by a claim lock

Both verified live on `main`:

- **earn `deposit()` has no idempotency check at all.** `ON CONFLICT (id) DO NOTHING` with no `RETURNING`, and the router accepts a **client-supplied `positionId`**. A second caller reusing a live id has their value moved into a pot keyed to them that no `withdraw` of theirs can reach, while the _first_ caller's row flips to active. **`principalOf()` vs `stakedOf()` — the README's own reconciliation proof — is false for both users at once.**
- **loans check the amount but not the borrower.** `loan.userId` and `loan.productId` are unchecked, so on a `pending` row `completePending` drives the **other** borrower's loan using **this** caller's collateral figure.

A complete patch with five tests exists and is parked because `services/svc-bank` is owner-locked to `@cursor-swarm-bank` and `claim-check` refuses every path under it. **This needs you to release the lock or direct the lane owner — I am not dual-editing a claimed money service.**

---

# What I recommend you answer first

**Q1 alone unblocks the most.** External-only for v1 turns `execution.sor`, `execution.arbitrage` and the external half of `execution.market-making` from blocked-on-a-ruling into ordinary engineering, and defers the hard fairness question until there is a working engine to reason about.

**Then item 11** — it is the only thing on this list that is a live money defect with a written fix sitting behind a process lock.

**Then item 2**, because one sentence moves a finished service from useless to shipping.
