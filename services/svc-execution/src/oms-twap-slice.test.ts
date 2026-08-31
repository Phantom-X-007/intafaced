import { describe, expect, it } from 'vitest';
import { formatAmount, parseAmount } from '@intafaced/ledger-client';
import { sliceTwapParent } from './oms-twap-slice.js';

const MATCHING_OPEN = { venueHalted: false } as const;
const MATCHING_HALTED = { venueHalted: true } as const;
const JOBS_ON = { enabled: true } as const;
const JOBS_OFF = { enabled: false } as const;
const DURATION = 60_000;
const QTY = '0.5';
const CREDIT = '100';
const REMAINING = '1.25';

describe('sliceTwapParent', () => {
  it('refuses missing / whitespace parentClientOrderId', () => {
    expect(
      sliceTwapParent({
        kind: 'twap',
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
      sliceTwapParent({
        parentClientOrderId: '   ',
        kind: 'twap',
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
      sliceTwapParent({
        parentClientOrderId: 'p-twap',
        kind: 'twap',
        status: 'running',
        amount: QTY,
        durationMs: DURATION,
        credit: CREDIT,
        remaining: REMAINING,
        matchingVenueHalt: MATCHING_OPEN,
      }),
    ).toMatchObject({ ok: false, reason: 'jobs_gate_unwired' });
    expect(
      sliceTwapParent({
        parentClientOrderId: 'p-twap',
        kind: 'twap',
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

  it('refuses kind vwap / pov with not_live', () => {
    expect(
      sliceTwapParent({
        parentClientOrderId: 'p-twap',
        kind: 'vwap',
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
      sliceTwapParent({
        parentClientOrderId: 'p-twap',
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
      sliceTwapParent({
        parentClientOrderId: 'p-twap',
        kind: 'twap',
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
      sliceTwapParent({
        parentClientOrderId: 'p-twap',
        kind: 'twap',
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
      sliceTwapParent({
        parentClientOrderId: 'p-twap',
        kind: 'twap',
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
      sliceTwapParent({
        parentClientOrderId: 'p-twap',
        kind: 'twap',
        status: 'running',
        durationMs: DURATION,
        credit: CREDIT,
        remaining: REMAINING,
        jobs: JOBS_ON,
        matchingVenueHalt: MATCHING_OPEN,
      }),
    ).toMatchObject({ ok: false, reason: 'missing_qty' });
    expect(
      sliceTwapParent({
        parentClientOrderId: 'p-twap',
        kind: 'twap',
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
      sliceTwapParent({
        parentClientOrderId: 'p-twap',
        kind: 'twap',
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
      sliceTwapParent({
        parentClientOrderId: 'p-twap',
        kind: 'twap',
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
      sliceTwapParent({
        parentClientOrderId: 'p-twap',
        kind: 'twap',
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
      sliceTwapParent({
        parentClientOrderId: 'p-twap',
        kind: 'twap',
        status: 'running',
        amount: QTY,
        durationMs: DURATION,
        remaining: REMAINING,
        jobs: JOBS_ON,
        matchingVenueHalt: MATCHING_OPEN,
      }),
    ).toMatchObject({ ok: false, reason: 'credit_blank' });
    expect(
      sliceTwapParent({
        parentClientOrderId: 'p-twap',
        kind: 'twap',
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
      sliceTwapParent({
        parentClientOrderId: 'p-twap',
        kind: 'twap',
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
      sliceTwapParent({
        parentClientOrderId: 'p-twap',
        kind: 'twap',
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
      sliceTwapParent({
        parentClientOrderId: 'p-twap',
        kind: 'twap',
        status: 'running',
        amount: QTY,
        durationMs: DURATION,
        credit: CREDIT,
        jobs: JOBS_ON,
        matchingVenueHalt: MATCHING_OPEN,
      }),
    ).toMatchObject({ ok: false, reason: 'missing_residual' });
    expect(
      sliceTwapParent({
        parentClientOrderId: 'p-twap',
        kind: 'twap',
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
      sliceTwapParent({
        parentClientOrderId: 'p-twap',
        kind: 'twap',
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
      sliceTwapParent({
        parentClientOrderId: 'p-twap',
        kind: 'twap',
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
      sliceTwapParent({
        parentClientOrderId: 'p-twap',
        kind: 'twap',
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
    const result = sliceTwapParent({
      parentClientOrderId: 'p-twap',
      kind: 'twap',
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
      parent: { parentClientOrderId: 'p-twap', kind: 'twap' },
      amount: formatAmount(parseAmount(QTY)),
      credit: formatAmount(parseAmount(CREDIT)),
      residual: { remaining: formatAmount(parseAmount(REMAINING)) },
    });
    expect(result).not.toHaveProperty('paper');
    expect(result).not.toHaveProperty('matching');
  });
});
