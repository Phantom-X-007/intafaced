/**
 * Record markouts for one parent — retained TCA inputs only.
 *
 * Fill VWAP comes from EMS. Later mids come from post-fill capture
 * books. Missing clock, lake, fills, or a later book is a refuse.
 * Never invent a benchmark from fill VWAP. Does not touch matching.
 */
import { div, formatAmount, mul, parseAmount, sub, type Amount } from '@intafaced/ledger-client';
import { midFromCapture, type CaptureLake } from '@intafaced/venue-adapter';
import type { EmsOrderStore } from './oms-ems-store.js';
import { runTcaForParent, type TcaParentRefuse } from './oms-tca-parent.js';

export type OmsMarkoutsInput = {
  readonly parentClientOrderId?: string;
  readonly emsStore?: EmsOrderStore;
  readonly captureLake?: Pick<CaptureLake, 'records'>;
};

export type OmsMarkout = {
  readonly horizonMs: number;
  readonly capturedAt: string;
  readonly mid: string;
  readonly fillVwap: string;
  readonly markout: string;
  readonly markoutBps: string;
  readonly source: 'capture.lake';
  readonly venueId: string;
};

export type OmsMarkoutsOk = {
  readonly ok: true;
  readonly parent: { readonly parentClientOrderId: string };
  readonly fillVwap: string;
  readonly fillAt: string;
  readonly markouts: readonly OmsMarkout[];
};

export type OmsMarkoutsRefuse = TcaParentRefuse;

export type OmsMarkoutsResult = OmsMarkoutsOk | OmsMarkoutsRefuse;

const BPS = parseAmount('10000');

function markoutAmount(side: 'buy' | 'sell', fillVwap: Amount, laterMid: Amount): Amount {
  return side === 'buy' ? sub(laterMid, fillVwap) : sub(fillVwap, laterMid);
}

export function recordMarkoutsForParent(input: OmsMarkoutsInput): OmsMarkoutsResult {
  const tca = runTcaForParent(input);
  if (!tca.ok) return tca;
  if (tca.run.realized.status !== 'AVAILABLE') {
    return {
      ok: false,
      reason: 'missing_retained_inputs',
      detail: 'parent markouts need a retained fill VWAP — refusing to invent one',
    };
  }
  const fillAt = tca.run.executionInterval.to ?? tca.run.arrivalAt;
  if (!fillAt || !input.captureLake) {
    return {
      ok: false,
      reason: 'missing_retained_inputs',
      detail: 'parent markouts need a retained fill clock and a bound capture book — refusing to invent a benchmark',
    };
  }

  const fillVwap = parseAmount(tca.run.realized.fillVwap);
  const fillAtMs = Date.parse(fillAt);
  const venueId = tca.run.fills[0]?.venueId;
  const symbol = tca.run.instrument;
  const side = tca.run.fills[0]?.side ?? 'buy';
  if (!venueId || !symbol || !Number.isFinite(fillAtMs) || fillVwap <= 0n) {
    return {
      ok: false,
      reason: 'missing_retained_inputs',
      detail: 'parent markouts need a retained venue, instrument, and fill — refusing to invent a benchmark',
    };
  }

  const markouts: OmsMarkout[] = [];
  for (const row of input.captureLake.records()) {
    if (row.kind !== 'book') continue;
    if (row.venueId !== venueId || row.symbol !== symbol) continue;
    const capturedMs = row.capturedAt.getTime();
    if (!Number.isFinite(capturedMs) || capturedMs <= fillAtMs) continue;
    const mid = midFromCapture(row);
    if (mid === null || mid <= 0n) continue;
    const raw = markoutAmount(side, fillVwap, mid);
    markouts.push({
      horizonMs: capturedMs - fillAtMs,
      capturedAt: row.capturedAt.toISOString(),
      mid: formatAmount(mid),
      fillVwap: formatAmount(fillVwap),
      markout: formatAmount(raw),
      markoutBps: formatAmount(div(mul(raw, BPS, 'half-up'), fillVwap, 'half-up')),
      source: 'capture.lake',
      venueId: row.venueId,
    });
  }

  if (markouts.length === 0) {
    return {
      ok: false,
      reason: 'missing_retained_inputs',
      detail: 'no retained post-fill capture book — refusing to invent a markout',
    };
  }

  return {
    ok: true,
    parent: { parentClientOrderId: tca.run.parentClientOrderId ?? input.parentClientOrderId!.trim() },
    fillVwap: formatAmount(fillVwap),
    fillAt,
    markouts,
  };
}
