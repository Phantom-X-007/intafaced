/**
 * TCA beat-VWAP claims are OWNER-SET. Missing owner benchmark plus retained
 * market data refuses the claim — never emit a fake beat-VWAP, never invent
 * a benchmark from fill VWAP. Mill oms-tca / tca-parent / tca-markouts are
 * not recut. router.ts is not recut.
 */

export type OmsTcaClaimRefuseReason = 'tca_claim_unset';

export type OmsTcaClaimRefusal = {
  readonly ok: false;
  readonly reason: OmsTcaClaimRefuseReason;
  readonly detail: string;
};

function refuseUnset(detail: string): OmsTcaClaimRefusal {
  return { ok: false, reason: 'tca_claim_unset', detail };
}

function setText(raw: string | boolean | null | undefined): string | null {
  if (raw === undefined || raw === null || raw === false) return null;
  if (raw === true) return 'retained';
  const text = raw.trim();
  return text.length === 0 ? null : text;
}

/**
 * Beat-VWAP claim needs an owner benchmark class AND retained market data.
 * Unset either side refuses — never invent interval VWAP or a beat.
 */
export function refuseUnsetTcaClaim(input: {
  readonly ownerBenchmark?: string | null;
  readonly retainedMarketData?: string | boolean | null;
}): OmsTcaClaimRefusal | { readonly ok: true; readonly ownerBenchmark: string } {
  const benchmark = setText(input.ownerBenchmark);
  if (!benchmark) {
    return refuseUnset('owner TCA benchmark is unset — refusing rather than inventing a beat-VWAP');
  }
  const retained = setText(input.retainedMarketData);
  if (!retained) {
    return refuseUnset('retained market data is unset — refusing rather than inventing a beat-VWAP');
  }
  const cls = benchmark.toLowerCase();
  if (cls === 'false' || cls === '0' || cls === 'off' || cls === 'unset' || cls === 'invented') {
    return refuseUnset('owner TCA benchmark is unset — refusing rather than inventing a beat-VWAP');
  }
  return { ok: true, ownerBenchmark: benchmark };
}
