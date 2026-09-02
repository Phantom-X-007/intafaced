/**
 * G-custody (PTX-M15-R03–R05, PTX-M15-R07).
 * Chain/fiat adapters stay adapters. Breaks age, never auto-disappear.
 * Off-exchange models OWNER — refuse the product. svc-bank and svc-trade are not recut.
 */

import { formatAmount, parseAmount } from '@intafaced/ledger-client';
import { z } from 'zod';

export const CUSTODY_KINDS = ['chain', 'fiat', 'off_exchange', 'break'] as const;
export type CustodyKind = (typeof CUSTODY_KINDS)[number];

export const ADAPTER_IS_NOT_BOOK = 'ledger.custody.adapter_is_not_book' as const;
export const BREAK_AUTO_CLEAR_REFUSED = 'ledger.custody.break_auto_clear_refused' as const;
export const OFF_EXCHANGE_OWNER_UNSET = 'ledger.custody.off_exchange_owner_unset' as const;
export const CUSTODY_AMOUNTS_MISSING = 'ledger.custody.amounts_missing' as const;

export type CustodyRefuseReason =
  | typeof ADAPTER_IS_NOT_BOOK
  | typeof BREAK_AUTO_CLEAR_REFUSED
  | typeof OFF_EXCHANGE_OWNER_UNSET
  | typeof CUSTODY_AMOUNTS_MISSING;

export type CustodyRefusal = {
  readonly ok: false;
  readonly reason: CustodyRefuseReason;
  readonly kind: CustodyKind;
  readonly role: 'adapter';
  readonly detail: string;
  readonly ageMs?: number;
  readonly breakId?: string;
};

export type CustodyAdapterOk = {
  readonly ok: true;
  readonly kind: 'chain' | 'fiat';
  readonly role: 'adapter';
  readonly observed: string;
};

export type CustodyBreakOk = {
  readonly ok: true;
  readonly kind: 'break';
  readonly role: 'adapter';
  readonly status: 'open' | 'resolved';
  readonly ageMs: number;
  readonly breakId: string;
  readonly difference: string;
};

export type CustodyOffExchangeOk = {
  readonly ok: true;
  readonly kind: 'off_exchange';
  readonly role: 'adapter';
  readonly ownerAuthorized: true;
};

export type CustodyResult = CustodyRefusal | CustodyAdapterOk | CustodyBreakOk | CustodyOffExchangeOk;

const moneyString = z.string().min(1);

export const custodyInputSchema = z.object({
  kind: z.enum(CUSTODY_KINDS),
  role: z.enum(['adapter', 'book']).optional(),
  treatAsBook: z.boolean().optional(),
  ownerAuthorized: z.boolean().optional(),
  adapterAmount: moneyString.optional(),
  bookAmount: moneyString.optional(),
  breakId: z.string().optional(),
  firstSeenAt: z.string().optional(),
  now: z.string().optional(),
  autoClear: z.boolean().optional(),
  resolve: z.enum(['operator', 'auto']).optional(),
});

function refuse(
  kind: CustodyKind,
  reason: CustodyRefuseReason,
  detail: string,
  extra: { readonly ageMs?: number; readonly breakId?: string } = {},
): CustodyRefusal {
  return { ok: false, reason, kind, role: 'adapter', detail, ...extra };
}

function ageMsOf(firstSeenAt: string | undefined, now: string | undefined): number {
  const start = firstSeenAt ? Date.parse(firstSeenAt) : Number.NaN;
  const end = now ? Date.parse(now) : Date.now();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return 0;
  return end - start;
}

function differenceOrMissing(
  adapterAmount: string | undefined,
  bookAmount: string | undefined,
): { ok: true; difference: string } | { ok: false } {
  if (!adapterAmount || !bookAmount) return { ok: false };
  const adapter = parseAmount(adapterAmount);
  const book = parseAmount(bookAmount);
  return { ok: true, difference: formatAmount(adapter - book) };
}

export function refuseCustodyProduct(input: z.infer<typeof custodyInputSchema>): CustodyResult {
  if (input.kind === 'off_exchange' && input.ownerAuthorized !== true) {
    return refuse(
      'off_exchange',
      OFF_EXCHANGE_OWNER_UNSET,
      'off-exchange custody is OWNER — product refuses until authorized',
    );
  }

  if (input.kind === 'chain' || input.kind === 'fiat') {
    if (input.treatAsBook === true || input.role === 'book') {
      return refuse(input.kind, ADAPTER_IS_NOT_BOOK, `${input.kind} adapter is not the book`);
    }
    if (!input.adapterAmount) {
      return refuse(input.kind, CUSTODY_AMOUNTS_MISSING, 'adapter observation is missing, not 0');
    }
    return {
      ok: true,
      kind: input.kind,
      role: 'adapter',
      observed: formatAmount(parseAmount(input.adapterAmount)),
    };
  }

  if (input.kind === 'off_exchange') {
    return { ok: true, kind: 'off_exchange', role: 'adapter', ownerAuthorized: true };
  }

  const ageMs = ageMsOf(input.firstSeenAt, input.now);
  const breakId = input.breakId && input.breakId.trim().length > 0 ? input.breakId.trim() : 'unset';
  const compared = differenceOrMissing(input.adapterAmount, input.bookAmount);
  if (!compared.ok) {
    return refuse('break', CUSTODY_AMOUNTS_MISSING, 'break amounts are missing, not healed to 0', {
      ageMs,
      breakId,
    });
  }

  if (input.autoClear === true || input.resolve === 'auto') {
    return refuse('break', BREAK_AUTO_CLEAR_REFUSED, 'breaks age and never auto-disappear', {
      ageMs,
      breakId,
    });
  }

  if (input.resolve === 'operator') {
    return {
      ok: true,
      kind: 'break',
      role: 'adapter',
      status: 'resolved',
      ageMs,
      breakId,
      difference: compared.difference,
    };
  }

  return {
    ok: true,
    kind: 'break',
    role: 'adapter',
    status: 'open',
    ageMs,
    breakId,
    difference: compared.difference,
  };
}

export function handleCustody(body: unknown): CustodyResult {
  return refuseCustodyProduct(custodyInputSchema.parse(body));
}
