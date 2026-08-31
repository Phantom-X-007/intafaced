import { describe, expect, it } from 'vitest';
import { formatAmount, parseAmount } from '@intafaced/ledger-client';
import { sliceVwapParent } from './oms-vwap-slice.js';

const MATCHING_OPEN = { venueHalted: false } as const;
const MATCHING_HALTED = { venueHalted: true } as const;
const JOBS_ON = { enabled: true } as const;
const JOBS_OFF = { enabled: false } as const;
const DURATION = 60_000;
const QTY = '0.5';
const CREDIT = '100';
const REMAINING = '1.25';

describe('sliceVwapParent', () => {
  it('refuses missing / whitespace parentClientOrderId', () => {
    expect(
      sliceVwapParent({
        kind: 'vwap',
        status: 'running',
        amount: QTY,
        durationMs: DURATION,
        credit: CREDIT,
        remaining: REMAINING,
        jobs: JOBS_ON,
        matchingVenueHalt: MATCHING_OPEN,
      }),
    ).toMatchObject({ ok: false, reason: 'missing_parent' });
    expect(
      sliceVwapParent({
        parentClientOrderId: '   ',
        kind: 'vwap',
        status: 'running',
        amount: QTY,
        durationMs: DURATION,
        credit: CREDIT,
        remaining: REMAINING,
        jobs: JOBS_ON,
        matchingVenueHalt: MATCHING_OPEN,
      }),
    ).toMatchObject({ ok: false, reason: 'missing_parent' });
  });

  it('jobs unwired / jobs_off refuse even when running', () => {
    expect(
      sliceVwapParent({
        parentClientOrderId: 'p-vwap',
        kind: 'vwap',
        status: 'running',
        amount: QTY,
        durationMs: DURATION,
        credit: CREDIT,
        remaining: REMAINING,
        matchingVenueHalt: MATCHING_OPEN,
      }),
    ).toMatchObject({ ok: false, reason: 'jobs_gate_unwired' });
    expect(
      sliceVwapParent({
        parentClientOrderId: 'p-vwap',
        kind: 'vwap',
        status: 'running',
        amount: QTY,
        durationMs: DURATION,
        credit: CREDIT,
        remaining: REMAINING,
        jobs: JOBS_OFF,
        matchingVenueHalt: MATCHING_OPEN,
      }),
    ).toMatchObject({ ok: false, reason: 'jobs_off' });
  });

  it('refuses kind twap / pov with not_live', () => {
    expect(
      sliceVwapParent({
        parentClientOrderId: 'p-vwap',
        kind: 'twap',
        status: 'running',
        amount: QTY,
        durationMs: DURATION,
        credit: CREDIT,
        remaining: REMAINING,
        jobs: JOBS_ON,
        matchingVenueHalt: MATCHING_OPEN,
      }),
    ).toMatchObject({ ok: false, reason: 'not_live' });
    expect(
      sliceVwapParent({
        parentClientOrderId: 'p-vwap',
        kind: 'pov',
        status: 'running',
        amount: QTY,
        durationMs: DURATION,
        credit: CREDIT,
        remaining: REMAINING,
        jobs: JOBS_ON,
        matchingVenueHalt: MATCHING_OPEN,
      }),
    ).toMatchObject({ ok: false, reason: 'not_live' });
  });

  it('refuses approved / paper / omitted status with not_running', () => {
    expect(
      sliceVwapParent({
        parentClientOrderId: 'p-vwap',
        kind: 'vwap',
        status: 'approved',
        amount: QTY,
        durationMs: DURATION,
        credit: CREDIT,
        remaining: REMAINING,
        jobs: JOBS_ON,
        matchingVenueHalt: MATCHING_OPEN,
      }),
    ).toMatchObject({ ok: false, reason: 'not_running' });
    expect(
      sliceVwapParent({
        parentClientOrderId: 'p-vwap',
        kind: 'vwap',
        status: 'paper',
        amount: QTY,
        durationMs: DURATION,
        credit: CREDIT,
        remaining: REMAINING,
        jobs: JOBS_ON,
        matchingVenueHalt: MATCHING_OPEN,
      }),
    ).toMatchObject({ ok: false, reason: 'not_running' });
    expect(
      sliceVwapParent({
        parentClientOrderId: 'p-vwap',
        kind: 'vwap',
        amount: QTY,
        durationMs: DURATION,
        credit: CREDIT,
        remaining: REMAINING,
        jobs: JOBS_ON,
        matchingVenueHalt: MATCHING_OPEN,
      }),
    ).toMatchObject({ ok: false, reason: 'not_running' });
  });

  it('refuses omitted / null / whitespace amount with missing_qty (never invent from duration)', () => {
    expect(
      sliceVwapParent({
        parentClientOrderId: 'p-vwap',
        kind: 'vwap',
        status: 'running',
        durationMs: DURATION,
        credit: CREDIT,
        remaining: REMAINING,
        jobs: JOBS_ON,
        matchingVenueHalt: MATCHING_OPEN,
      }),
    ).toMatchObject({ ok: false, reason: 'missing_qty' });
    expect(
      sliceVwapParent({
        parentClientOrderId: 'p-vwap',
        kind: 'vwap',
        status: 'running',
        amount: null,
        durationMs: DURATION,
        credit: CREDIT,
        remaining: REMAINING,
        jobs: JOBS_ON,
        matchingVenueHalt: MATCHING_OPEN,
      }),
    ).toMatchObject({ ok: false, reason: 'missing_qty' });
    expect(
      sliceVwapParent({
        parentClientOrderId: 'p-vwap',
        kind: 'vwap',
        status: 'running',
        amount: '   ',
        durationMs: DURATION,
        credit: CREDIT,
        remaining: REMAINING,
        jobs: JOBS_ON,
        matchingVenueHalt: MATCHING_OPEN,
      }),
    ).toMatchObject({ ok: false, reason: 'missing_qty' });
  });

  it("refuses 'not-an-amount' / 0 qty with qty_invalid", () => {
    expect(
      sliceVwapParent({
        parentClientOrderId: 'p-vwap',
        kind: 'vwap',
        status: 'running',
        amount: 'not-an-amount',
        durationMs: DURATION,
        credit: CREDIT,
        remaining: REMAINING,
        jobs: JOBS_ON,
        matchingVenueHalt: MATCHING_OPEN,
      }),
    ).toMatchObject({ ok: false, reason: 'qty_invalid' });
    expect(
      sliceVwapParent({
        parentClientOrderId: 'p-vwap',
        kind: 'vwap',
        status: 'running',
        amount: '0',
        durationMs: DURATION,
        credit: CREDIT,
        remaining: REMAINING,
        jobs: JOBS_ON,
        matchingVenueHalt: MATCHING_OPEN,
      }),
    ).toMatchObject({ ok: false, reason: 'qty_invalid' });
  });

  it('refuses omitted / null / whitespace credit with credit_blank', () => {
    expect(
      sliceVwapParent({
        parentClientOrderId: 'p-vwap',
        kind: 'vwap',
        status: 'running',
        amount: QTY,
        durationMs: DURATION,
        remaining: REMAINING,
        jobs: JOBS_ON,
        matchingVenueHalt: MATCHING_OPEN,
      }),
    ).toMatchObject({ ok: false, reason: 'credit_blank' });
    expect(
      sliceVwapParent({
        parentClientOrderId: 'p-vwap',
        kind: 'vwap',
        status: 'running',
        amount: QTY,
        durationMs: DURATION,
        credit: null,
        remaining: REMAINING,
        jobs: JOBS_ON,
        matchingVenueHalt: MATCHING_OPEN,
      }),
    ).toMatchObject({ ok: false, reason: 'credit_blank' });
    expect(
      sliceVwapParent({
        parentClientOrderId: 'p-vwap',
        kind: 'vwap',
        status: 'running',
        amount: QTY,
        durationMs: DURATION,
        credit: '   ',
        remaining: REMAINING,
        jobs: JOBS_ON,
        matchingVenueHalt: MATCHING_OPEN,
      }),
    ).toMatchObject({ ok: false, reason: 'credit_blank' });
  });

  it("refuses 'not-an-amount' credit with credit_invalid", () => {
    expect(
      sliceVwapParent({
        parentClientOrderId: 'p-vwap',
        kind: 'vwap',
        status: 'running',
        amount: QTY,
        durationMs: DURATION,
        credit: 'not-an-amount',
        remaining: REMAINING,
        jobs: JOBS_ON,
        matchingVenueHalt: MATCHING_OPEN,
      }),
    ).toMatchObject({ ok: false, reason: 'credit_invalid' });
  });

  it('refuses omitted / null / whitespace remaining with missing_residual', () => {
    expect(
      sliceVwapParent({
        parentClientOrderId: 'p-vwap',
        kind: 'vwap',
        status: 'running',
        amount: QTY,
        durationMs: DURATION,
        credit: CREDIT,
        jobs: JOBS_ON,
        matchingVenueHalt: MATCHING_OPEN,
      }),
    ).toMatchObject({ ok: false, reason: 'missing_residual' });
    expect(
      sliceVwapParent({
        parentClientOrderId: 'p-vwap',
        kind: 'vwap',
        status: 'running',
        amount: QTY,
        durationMs: DURATION,
        credit: CREDIT,
        remaining: null,
        jobs: JOBS_ON,
        matchingVenueHalt: MATCHING_OPEN,
      }),
    ).toMatchObject({ ok: false, reason: 'missing_residual' });
    expect(
      sliceVwapParent({
        parentClientOrderId: 'p-vwap',
        kind: 'vwap',
        status: 'running',
        amount: QTY,
        durationMs: DURATION,
        credit: CREDIT,
        remaining: '   ',
        jobs: JOBS_ON,
        matchingVenueHalt: MATCHING_OPEN,
      }),
    ).toMatchObject({ ok: false, reason: 'missing_residual' });
  });

  it('matching halt-all refuses venue_halted; missing halt source refuses venue_halt_unavailable', () => {
    expect(
      sliceVwapParent({
        parentClientOrderId: 'p-vwap',
        kind: 'vwap',
        status: 'running',
        amount: QTY,
        durationMs: DURATION,
        credit: CREDIT,
        remaining: REMAINING,
        jobs: JOBS_ON,
        matchingVenueHalt: MATCHING_HALTED,
      }),
    ).toMatchObject({ ok: false, reason: 'venue_halted' });
    expect(
      sliceVwapParent({
        parentClientOrderId: 'p-vwap',
        kind: 'vwap',
        status: 'running',
        amount: QTY,
        durationMs: DURATION,
        credit: CREDIT,
        remaining: REMAINING,
        jobs: JOBS_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'venue_halt_unavailable' });
  });

  it('happy: running + qty + credit + remaining — not paper, residual via ledger-client', () => {
    const result = sliceVwapParent({
      parentClientOrderId: 'p-vwap',
      kind: 'vwap',
      status: 'running',
      amount: QTY,
      durationMs: DURATION,
      credit: CREDIT,
      remaining: REMAINING,
      jobs: JOBS_ON,
      matchingVenueHalt: MATCHING_OPEN,
    });
    expect(result).toEqual({
      ok: true,
      sliced: true,
      parent: { parentClientOrderId: 'p-vwap', kind: 'vwap' },
      amount: formatAmount(parseAmount(QTY)),
      credit: formatAmount(parseAmount(CREDIT)),
      residual: { remaining: formatAmount(parseAmount(REMAINING)) },
    });
    expect(result).not.toHaveProperty('paper');
    expect(result).not.toHaveProperty('matching');
  });
});
