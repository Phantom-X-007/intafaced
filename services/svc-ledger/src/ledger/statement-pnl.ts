/**
 * PTX-M14-R01/R02 — customer statement PnL/NAV from ledger facts, or a typed refuse.
 *
 * Lot basis is not a ledger column; history amounts are not cost (same honesty as
 * svc-tax `TAX_COST_BASIS_UNAVAILABLE`). Marks and NAV inputs are not on this book.
 * Missing is named. Realized/unrealized/NAV are never invented as 0.
 *
 * This is a VIEW. It does not post, and it is not a second money book.
 */
import { formatAmount, mul, parseAmount, type Amount } from '@intafaced/ledger-client';
import { z } from 'zod';

export const STATEMENT_LOTS_MISSING = 'ledger.statement.lots_missing' as const;
export const STATEMENT_LOT_BASIS_MISSING = 'ledger.statement.lot_basis_missing' as const;
export const STATEMENT_MARK_MISSING = 'ledger.statement.mark_missing' as const;
export const STATEMENT_NAV_INPUTS_MISSING = 'ledger.statement.nav_inputs_missing' as const;

export const STATEMENT_PNL_REFUSE_CODES = [
  STATEMENT_LOTS_MISSING,
  STATEMENT_LOT_BASIS_MISSING,
  STATEMENT_MARK_MISSING,
  STATEMENT_NAV_INPUTS_MISSING,
] as const;

export type StatementPnlRefuseCode = (typeof STATEMENT_PNL_REFUSE_CODES)[number];

export type FactSource<T> = { readonly status: 'absent' } | { readonly status: 'present'; readonly value: T };

export interface ClosedLotFact {
  readonly assetId: string;
  /** Reporting-currency cost. Null is unknown — never treated as 0. */
  readonly costBasis: string | null;
  /** Reporting-currency proceeds. Null is unknown — never treated as 0. */
  readonly proceeds: string | null;
}

export interface OpenLotFact {
  readonly assetId: string;
  readonly qtyRemaining: string;
  /** Remaining reporting-currency cost. Null is unknown — never treated as 0. */
  readonly costBasis: string | null;
}

export interface StatementPnlFacts {
  readonly lots: FactSource<{ readonly closed: readonly ClosedLotFact[]; readonly open: readonly OpenLotFact[] }>;
  /** Reporting-currency price per 1 unit of asset. */
  readonly marks: FactSource<Readonly<Record<string, string>>>;
  /** Reporting-currency cash already on the book. */
  readonly navInputs: FactSource<{ readonly cashReporting: string }>;
}

export interface StatementPnlOwner {
  readonly ownerType: 'user' | 'subaccount' | 'module' | 'house' | 'treasury';
  readonly ownerId: string;
  readonly reportingAssetId: string;
}

const ownerFields = {
  ownerType: z.enum(['user', 'subaccount', 'module', 'house', 'treasury']),
  ownerId: z.string().min(1),
  reportingAssetId: z.string().min(1),
};

export const statementPnlInputSchema = z.object({
  ...ownerFields,
});

export const statementPnlResultSchema = z.discriminatedUnion('status', [
  z.object({
    ...ownerFields,
    status: z.literal('ok'),
    codes: z.tuple([]),
    realized: z.string(),
    unrealized: z.string(),
    nav: z.string(),
  }),
  z.object({
    ...ownerFields,
    status: z.literal('empty'),
    codes: z.tuple([]),
    realized: z.null(),
    unrealized: z.null(),
    nav: z.string(),
  }),
  z.object({
    ...ownerFields,
    status: z.literal('refused'),
    codes: z.array(z.enum(STATEMENT_PNL_REFUSE_CODES)).min(1),
    realized: z.null(),
    unrealized: z.null(),
    nav: z.null(),
  }),
]);

export type StatementPnlResult = z.infer<typeof statementPnlResultSchema>;

/**
 * What this book actually has today: balances and history, no lot basis, no mark,
 * no owner-approved NAV mapping. Callers must not fold those gaps into 0.
 */
export function ledgerBookStatementFacts(): StatementPnlFacts {
  return {
    lots: { status: 'absent' },
    marks: { status: 'absent' },
    navInputs: { status: 'absent' },
  };
}

export function composeStatementPnl(owner: StatementPnlOwner, facts: StatementPnlFacts): StatementPnlResult {
  const codes = new Set<StatementPnlRefuseCode>();

  if (facts.lots.status === 'absent') codes.add(STATEMENT_LOTS_MISSING);
  if (facts.navInputs.status === 'absent') codes.add(STATEMENT_NAV_INPUTS_MISSING);

  if (facts.lots.status === 'present') {
    for (const lot of facts.lots.value.closed) {
      if (lot.costBasis === null || lot.proceeds === null) codes.add(STATEMENT_LOT_BASIS_MISSING);
    }
    for (const lot of facts.lots.value.open) {
      if (lot.costBasis === null) codes.add(STATEMENT_LOT_BASIS_MISSING);
    }
    if (facts.lots.value.open.length > 0) {
      if (facts.marks.status === 'absent') {
        codes.add(STATEMENT_MARK_MISSING);
      } else {
        for (const lot of facts.lots.value.open) {
          const mark = facts.marks.value[lot.assetId];
          if (mark === undefined) codes.add(STATEMENT_MARK_MISSING);
        }
      }
    }
  } else {
    codes.add(STATEMENT_MARK_MISSING);
  }

  if (codes.size > 0) {
    return {
      ...owner,
      status: 'refused',
      codes: [...codes].sort() as [StatementPnlRefuseCode, ...StatementPnlRefuseCode[]],
      realized: null,
      unrealized: null,
      nav: null,
    };
  }

  if (facts.lots.status !== 'present' || facts.navInputs.status !== 'present') {
    return {
      ...owner,
      status: 'refused',
      codes: [...codes].sort() as [StatementPnlRefuseCode, ...StatementPnlRefuseCode[]],
      realized: null,
      unrealized: null,
      nav: null,
    };
  }

  const lots = facts.lots.value;
  const marks = facts.marks.status === 'present' ? facts.marks.value : {};
  const cash = parseAmount(facts.navInputs.value.cashReporting);

  if (lots.closed.length === 0 && lots.open.length === 0) {
    return {
      ...owner,
      status: 'empty',
      codes: [] as [],
      realized: null,
      unrealized: null,
      nav: formatAmount(cash),
    };
  }

  let realized: Amount = 0n;
  for (const lot of lots.closed) {
    realized += parseAmount(lot.proceeds!) - parseAmount(lot.costBasis!);
  }

  let unrealized: Amount = 0n;
  let markedOpen: Amount = 0n;
  for (const lot of lots.open) {
    const qty = parseAmount(lot.qtyRemaining);
    const markValue = mul(qty, parseAmount(marks[lot.assetId]!), 'half-up');
    markedOpen += markValue;
    unrealized += markValue - parseAmount(lot.costBasis!);
  }

  return {
    ...owner,
    status: 'ok',
    codes: [] as [],
    realized: formatAmount(realized),
    unrealized: formatAmount(unrealized),
    nav: formatAmount(cash + markedOpen),
  };
}

/** Hitch point for the served doors — this book's facts, never invented 0. */
export function statementPnlFromThisBook(owner: StatementPnlOwner): StatementPnlResult {
  return composeStatementPnl(owner, ledgerBookStatementFacts());
}
