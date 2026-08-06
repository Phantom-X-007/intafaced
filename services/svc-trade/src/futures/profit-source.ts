/**
 * THE PAYOUT BOUND — realised futures profit is bounded by a real balance.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT WAS WRONG
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `futuresRealizeProfit` pays a winning position out of `houseFees('trade', …)`
 * with no ceiling. A house account is not an insurance fund and a fee balance is
 * not a risk budget: the size of the platform's worst day was whatever had
 * happened to accumulate in a fee pot, and nothing in the code said so.
 *
 * `bank.pool_underfunded` is the model — "a pool that cannot pay its advertised
 * rate is an operator problem today, not a shortfall discovered at maturity."
 * The equivalent here is that an under-funded profit source is an operator
 * problem at the moment of the trade, not an accounting surprise later.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT THIS FILE IS, AND DELIBERATELY IS NOT
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * It is THE MECHANISM: profit is paid from a NAMED account, that account's
 * balance is the ceiling, and a payout that would exceed it refuses instead of
 * overdrawing.
 *
 * It is NOT the choice of account, and it sets no rate, ceiling or buffer.
 * `docs/adr/2026-08-05-futures-risk-and-mark-law.md` reserves "which account
 * funds realised profit, and how it is capitalised" to the owner — it is a fee
 * and revenue recipe, `DIRECTION` §8 item 6 and a §3 carve-out twice over. So
 * the account arrives as CONFIGURATION and there is no default. A deployment
 * that has not named one does not quietly fall back to house fees; it refuses
 * to boot, which is the only way the absence of a decision stays visible.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THE CONFIGURED ACCOUNT IS CHECKED AGAINST THE RECIPE
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The bound is only a bound if it guards the account the money actually leaves.
 * Checking `A` and debiting `B` is worse than not checking at all, because it
 * reads like a control.
 *
 * `futuresRealizeProfit` is a ledger recipe and recipes are an owner carve-out
 * (`DIRECTION` §3), so this file does not change which account it credits.
 * Instead it ASKS the recipe — builds a probe request and reads the funding leg
 * off it — and refuses to boot when the configured account is not that one,
 * naming the recipe change that would be required. The owner can then name a
 * different account knowing exactly what it costs, rather than discovering the
 * mismatch as a silent overdraw.
 */
import { accountKey, formatAmount, recipes, type AccountKind, type AccountRef, type Amount, type Balance } from '@intafaced/ledger-client';

/** Owner types the ledger knows. Kept explicit so a typo in config is a boot failure. */
const OWNER_TYPES = ['user', 'subaccount', 'house', 'module', 'treasury'] as const;
type OwnerType = (typeof OWNER_TYPES)[number];

const KINDS = ['available', 'hold', 'escrow', 'stake', 'collateral'] as const;

export class ProfitSourceConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProfitSourceConfigError';
  }
}

/**
 * Parse `ownerType:ownerId:kind[:purpose]` into an `AccountRef`.
 *
 * Deliberately a general account reference rather than a menu of blessed pots:
 * naming the pot is the owner's decision, and a menu written here would be this
 * file making it.
 *
 * `ownerId` may itself contain colons (`fees:trade`), so the format is parsed
 * from the ENDS in: the first token is the owner type, the last token is the
 * kind unless a purpose follows it, and everything between is the owner id.
 * Ambiguity is refused rather than guessed.
 */
export function parseAccountRef(raw: string, assetId: string): AccountRef {
  const trimmed = (raw ?? '').trim();
  if (trimmed === '') {
    throw new ProfitSourceConfigError('empty account reference');
  }
  const parts = trimmed.split(':').map((p) => p.trim());
  if (parts.some((p) => p === '')) {
    throw new ProfitSourceConfigError(`"${raw}" has an empty segment — expected ownerType:ownerId:kind[:purpose]`);
  }
  if (parts.length < 3) {
    throw new ProfitSourceConfigError(`"${raw}" is not ownerType:ownerId:kind[:purpose]`);
  }

  const ownerType = parts[0] as OwnerType;
  if (!OWNER_TYPES.includes(ownerType)) {
    throw new ProfitSourceConfigError(`"${parts[0]}" is not a ledger owner type (${OWNER_TYPES.join(', ')})`);
  }

  // Find the kind: the last segment that names one. Anything after it is the purpose.
  let kindIndex = -1;
  for (let i = parts.length - 1; i >= 1; i -= 1) {
    if ((KINDS as readonly string[]).includes(parts[i]!)) {
      kindIndex = i;
      break;
    }
  }
  if (kindIndex < 2) {
    throw new ProfitSourceConfigError(`"${raw}" names no account kind (${KINDS.join(', ')}) after the owner id`);
  }
  if (parts.length - kindIndex > 2) {
    throw new ProfitSourceConfigError(`"${raw}" has more than one segment after the kind — a purpose is a single segment`);
  }

  const ownerId = parts.slice(1, kindIndex).join(':');
  const kind = parts[kindIndex] as AccountKind;
  const purpose = parts[kindIndex + 1];

  return purpose === undefined ? { ownerType, ownerId, assetId, kind } : { ownerType, ownerId, assetId, kind, purpose };
}

/** Render an `AccountRef` back into the config spelling, for error messages. */
export function formatAccountRef(ref: AccountRef): string {
  const base = `${ref.ownerType}:${ref.ownerId}:${ref.kind}`;
  return ref.purpose ? `${base}:${ref.purpose}` : base;
}

/**
 * WHICH ACCOUNT DOES `futuresRealizeProfit` ACTUALLY DRAW FROM?
 *
 * Asked of the recipe rather than restated here. A `credit` leg is value
 * LEAVING an account, so the funding source is the credited one — and reading
 * it off a probe request means this file cannot drift away from the recipe the
 * way a copied constant would.
 */
export function recipeProfitFundingAccount(assetId: string): AccountRef {
  const probe = recipes.futuresRealizeProfit({
    positionId: '00000000-0000-4000-8000-000000000000',
    userId: '00000000-0000-4000-8000-000000000000',
    assetId,
    amount: 1n,
    profitId: 'probe',
  });
  const credit = probe.entries.find((e) => e.direction === 'credit');
  if (!credit) {
    throw new ProfitSourceConfigError('futuresRealizeProfit has no credit leg — cannot determine what funds a profit payout');
  }
  return credit.account;
}

export interface ProfitSource {
  /** The configured funding account for one asset. */
  accountFor(assetId: string): AccountRef;
  /** The config spelling, for logs and refusals. */
  readonly configured: string;
}

/**
 * Build the profit source from configuration.
 *
 * Throws — at boot, before a single position can be closed — when the value is
 * absent, unparseable, or names an account the profit recipe does not draw
 * from. All three are the same failure: nobody has decided where futures profit
 * comes from, and the code refuses to decide on their behalf.
 */
export function profitSourceFromConfig(raw: string | undefined): ProfitSource {
  const configured = (raw ?? '').trim();
  if (configured === '') {
    throw new ProfitSourceConfigError(
      'TRADE_FUTURES_PROFIT_SOURCE is not set. Realised futures profit must be paid from a named account whose balance ' +
        'bounds the payout, and there is no safe default — a fee pot is not a risk budget. Set it to ' +
        'ownerType:ownerId:kind[:purpose] (which account, and how it is capitalised, is an owner decision: ' +
        'docs/adr/2026-08-05-futures-risk-and-mark-law.md, DIRECTION §8 item 6).',
    );
  }

  // Parsed once against a placeholder asset so a malformed value fails at boot
  // rather than on the first profitable close.
  const probe = parseAccountRef(configured, '__probe__');
  const recipeAccount = recipeProfitFundingAccount('__probe__');

  if (accountKey(probe) !== accountKey(recipeAccount)) {
    throw new ProfitSourceConfigError(
      `TRADE_FUTURES_PROFIT_SOURCE names ${formatAccountRef(probe)}, but recipes.futuresRealizeProfit draws from ` +
        `${formatAccountRef(recipeAccount)}. Bounding one account while debiting another is not a bound. Paying from a ` +
        'different account needs a ledger recipe change, which is an owner carve-out (DIRECTION §3) — this service will ' +
        'not do it implicitly.',
    );
  }

  return {
    configured,
    accountFor: (assetId) => parseAccountRef(configured, assetId),
  };
}

export interface BoundCheck {
  readonly ok: boolean;
  readonly account: AccountRef;
  readonly available: Amount;
  readonly reason?: string;
}

/**
 * Is there enough in the named source to pay this profit?
 *
 * Read BEFORE anything posts. The ledger's own non-negative CHECK on non-treasury
 * accounts would also stop an overdraw, but it would stop it halfway through a
 * close — after the margin release, with the position row still open and an
 * error that says `ledger.insufficient_funds` about an account the trader has
 * never heard of. Refusing up front makes it one answer, with the operator's
 * name on it.
 */
export async function checkProfitBound(input: {
  source: ProfitSource;
  assetId: string;
  amount: Amount;
  balance: (ref: AccountRef) => Promise<Balance>;
}): Promise<BoundCheck> {
  const account = input.source.accountFor(input.assetId);
  const { amount: available } = await input.balance(account);
  if (input.amount > available) {
    return {
      ok: false,
      account,
      available,
      reason:
        `profit source ${formatAccountRef(account)} holds ${formatAmount(available)} ${input.assetId} and this close would ` +
        `pay ${formatAmount(input.amount)} — refusing rather than overdrawing it`,
    };
  }
  return { ok: true, account, available };
}
