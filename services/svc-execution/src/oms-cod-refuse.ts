/**
 * Cancel-on-disconnect / dead-man is OWNER-SET. Unset refuses rather than
 * inventing a flatten. Session drop cancels in-scope opens only when set.
 * Matching halt is cancel-only on matching (D-halt) — this file does not recut it.
 * router.ts is not recut. Mill kill / drain / kill-parent files are not recut.
 */

export type OmsCodRefuseReason = 'cod_unset';

export type OmsCodRefusal = {
  readonly ok: false;
  readonly reason: OmsCodRefuseReason;
  readonly detail: string;
};

function refuseUnset(detail: string): OmsCodRefusal {
  return { ok: false, reason: 'cod_unset', detail };
}

/**
 * Missing/blank/off COD policy refuses — never invent a flatten.
 * Set policy is explicit cancel (true | 'cancel' | 'on' | '1').
 */
export function refuseUnsetCancelOnDisconnect(
  raw: string | boolean | null | undefined,
): OmsCodRefusal | { readonly ok: true; readonly cancelOnDisconnect: true } {
  if (raw === undefined || raw === null || raw === false) {
    return refuseUnset('cancel-on-disconnect is unset — refusing rather than inventing a flatten');
  }
  if (raw === true) {
    return { ok: true, cancelOnDisconnect: true };
  }
  const text = raw.trim().toLowerCase();
  if (text.length === 0 || text === 'false' || text === '0' || text === 'off' || text === 'unset') {
    return refuseUnset('cancel-on-disconnect is unset — refusing rather than inventing a flatten');
  }
  if (text === 'true' || text === 'cancel' || text === 'on' || text === '1') {
    return { ok: true, cancelOnDisconnect: true };
  }
  return refuseUnset('cancel-on-disconnect is not a set cancel policy — refusing to invent a flatten');
}
