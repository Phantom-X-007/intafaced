/**
 * All-or-none through matching. Fill the entire remaining qty or do not take a stub.
 * Missing or false is a normal order. The engine does not invent a fill.
 */
import type { Amount } from '@intafaced/ledger-client/money';

export const AON_ICEBERG = 'aon_iceberg' as const;

export type AonRefuse = typeof AON_ICEBERG;

export function readAon(order: { readonly aon?: boolean | null }): boolean {
  return order.aon === true;
}

export function aonIcebergRefuse(aon: boolean, iceberg: boolean): { readonly code: AonRefuse; readonly message: string } | null {
  if (!aon || !iceberg) return null;
  return {
    code: AON_ICEBERG,
    message: 'all-or-none cannot hide a stub behind a display; the engine does not invent a fill',
  };
}

/** A clip against an AON rest must exhaust remaining. */
export function clipMeetsAon(clip: Amount, remaining: Amount, aon: boolean): boolean {
  if (!aon) return true;
  return clip >= remaining;
}

/** An AON taker trades only when the sweep covers remaining. */
export function canFillAon(fillable: Amount, qty: Amount, aon: boolean): boolean {
  if (!aon) return true;
  return fillable >= qty;
}
