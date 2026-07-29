import { div, min, mul, proRata, sub, sum, type Amount } from '@intafaced/ledger-client';

/**
 * WHO GETS WHAT (§8.4 — presale / fair-launch).
 *
 * A pure function over the closed book of contributions. No I/O, no clock, no
 * database — which is what makes it testable to the unit, and what makes a
 * disputed allocation something anyone can recompute from the raise's terms and
 * the list of commitments rather than something they have to trust.
 *
 * Amounts are scaled bigints throughout (10^18). Nothing here sees a `number`
 * except basis points and array indices.
 *
 * ── The two modes ────────────────────────────────────────────────────────────
 *
 * `presale` sells at a fixed price. Undersubscribed, everyone gets what they
 * paid for and the unsold remainder returns to the issuer. Oversubscribed,
 * supply is split pro-rata by contribution and the unspendable remainder is
 * refunded — nobody is left holding a commitment that bought nothing.
 *
 * `fair` sells the WHOLE supply pro-rata to whatever was raised. There is no
 * price to be early for, so there is no oversubscription and no refund: the
 * price is simply whatever the raise cleared at, discovered by everyone at the
 * same instant.
 *
 * ── Rounding ────────────────────────────────────────────────────────────────
 *
 * Every division that decides what a contributor RECEIVES rounds `floor`, and
 * `proRata` hands the resulting dust back out one unit at a time so the shares
 * sum to exactly the supply. Rounding in the house's favour on a purchase would
 * be a fee nobody published.
 */

export type RaiseMode = 'presale' | 'fair';

export interface RaiseTerms {
  mode: RaiseMode;
  saleSupply: Amount;
  /** Payment units per sale unit. Required for `presale`, absent for `fair`. */
  price: Amount | null;
  /** Below this the raise fails and everything is refunded. */
  softCap: Amount;
}

export interface ContributionInput {
  userId: string;
  amount: Amount;
}

export interface AllocationLine {
  userId: string;
  /** What they committed. All of it leaves escrow at settlement. */
  contributed: Amount;
  /** The part that bought nothing. */
  refund: Amount;
  /** What they bought. Zero on a failed raise. */
  saleAmount: Amount;
}

export interface AllocationResult {
  outcome: 'succeeded' | 'failed';
  totalRaised: Amount;
  lines: AllocationLine[];
  /** Returns to the issuer. On a failed raise, the entire supply. */
  unsoldSupply: Amount;
}

export class AllocationError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
    this.name = 'AllocationError';
  }
}

/**
 * Decide the whole raise at once.
 *
 * Called exactly once per raise, when the funding window closes, and its output
 * is written to `launch.allocations` before any ledger post. Re-running it
 * against the same inputs produces the same answer — that is the property that
 * makes settlement resumable.
 */
export function allocate(terms: RaiseTerms, contributions: readonly ContributionInput[]): AllocationResult {
  if (terms.saleSupply <= 0n) {
    throw new AllocationError('A raise with no supply cannot allocate', 'launch.no_supply');
  }
  for (const c of contributions) {
    if (c.amount <= 0n) throw new AllocationError(`Contribution for ${c.userId} must be positive`, 'launch.invalid_contribution');
  }

  const totalRaised = sum(contributions.map((c) => c.amount));

  // A raise that did not clear its soft cap — including one nobody entered —
  // refunds every contributor in full and returns the whole supply. No fee is
  // taken, because nothing was sold.
  if (contributions.length === 0 || totalRaised < terms.softCap) {
    return {
      outcome: 'failed',
      totalRaised,
      lines: contributions.map((c) => ({ userId: c.userId, contributed: c.amount, refund: c.amount, saleAmount: 0n })),
      unsoldSupply: terms.saleSupply,
    };
  }

  return terms.mode === 'fair' ? allocateFair(terms, contributions, totalRaised) : allocatePresale(terms, contributions, totalRaised);
}

/**
 * Fair launch: the whole supply, split by contribution.
 *
 * No refunds by construction. Every unit of supply is sold, so the clearing
 * price is `totalRaised / saleSupply` — a fact discovered at close, not a
 * number anyone had to be early enough to get.
 */
function allocateFair(terms: RaiseTerms, contributions: readonly ContributionInput[], totalRaised: Amount): AllocationResult {
  const shares = proRata(
    terms.saleSupply,
    contributions.map((c) => c.amount),
  );

  return {
    outcome: 'succeeded',
    totalRaised,
    lines: contributions.map((c, i) => ({
      userId: c.userId,
      contributed: c.amount,
      refund: 0n,
      saleAmount: shares[i] ?? 0n,
    })),
    unsoldSupply: 0n,
  };
}

function allocatePresale(terms: RaiseTerms, contributions: readonly ContributionInput[], totalRaised: Amount): AllocationResult {
  const price = terms.price;
  if (price === null || price <= 0n) {
    throw new AllocationError('A presale needs a positive price', 'launch.no_price');
  }

  // What each contributor asked for, at the published price. `floor`: a buyer
  // gets whole units they have actually paid for and the dust comes back.
  const demand = contributions.map((c) => div(c.amount, price, 'floor'));
  const totalDemand = sum(demand);

  const oversubscribed = totalDemand > terms.saleSupply;

  // Oversubscribed: split the supply by contribution rather than first-come.
  // A queue would reward whoever had the fastest connection at the open; this
  // rewards nobody, which is the point.
  const filled = oversubscribed
    ? proRata(
        terms.saleSupply,
        contributions.map((c) => c.amount),
      )
    : demand;

  const lines = contributions.map((c, i) => {
    const saleAmount = filled[i] ?? 0n;
    // `floor` again, then clamped: a contributor can never be charged more than
    // they committed, whatever the pro-rata rounding did.
    const spent = min(mul(saleAmount, price, 'floor'), c.amount);
    return { userId: c.userId, contributed: c.amount, refund: sub(c.amount, spent), saleAmount };
  });

  return {
    outcome: 'succeeded',
    totalRaised,
    lines,
    unsoldSupply: sub(terms.saleSupply, sum(lines.map((l) => l.saleAmount))),
  };
}

/**
 * What a contributor may still commit, given the tier that admitted them and
 * what the raise has already taken.
 *
 * Enforced at COMMIT time rather than clawed back at settlement, and that is
 * the honest order: refusing a commitment costs the user a retry, whereas
 * accepting one and refunding it later means their money sat in our escrow
 * earning them nothing for the length of the raise.
 */
export function commitHeadroom(input: {
  /** Total already committed to this raise by everyone. */
  raised: Amount;
  hardCap: Amount;
  /** Already committed by this contributor. */
  alreadyCommitted: Amount;
  /** The cap of the tier that admitted them. */
  tierCap: Amount;
}): Amount {
  const raiseRoom = sub(input.hardCap, input.raised);
  const tierRoom = sub(input.tierCap, input.alreadyCommitted);
  const room = min(raiseRoom, tierRoom);
  return room > 0n ? room : 0n;
}

/**
 * The highest tier a given stake clears, or null.
 *
 * Highest wins: a user who clears three gates gets the biggest cap, not the
 * first one in the list. `stake` arrives from svc-token — this service never
 * stores it (§8.4 "allocation tiers by `token.stakeOf`").
 */
export function tierFor<T extends { name: string; minStake: Amount; allocationCap: Amount }>(
  tiers: readonly T[],
  stake: Amount,
): T | null {
  let best: T | null = null;
  for (const tier of tiers) {
    if (stake < tier.minStake) continue;
    if (best === null || tier.minStake > best.minStake) best = tier;
  }
  return best;
}
