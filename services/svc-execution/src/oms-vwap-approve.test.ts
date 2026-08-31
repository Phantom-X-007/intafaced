import { describe, expect, it } from 'vitest';
import { formatAmount, parseAmount } from '@intafaced/ledger-client';
import { approveVwapParent } from './oms-vwap-approve.js';

const OP = '33333333-3333-4333-8333-333333333333';
const MATCHING_OPEN = { venueHalted: false } as const;
const MATCHING_HALTED = { venueHalted: true } as const;
const JOBS_ON = { enabled: true } as const;
const JOBS_OFF = { enabled: false } as const;
const DURATION = 60_000;
const CREDIT = '100';
const REMAINING = '1.25';

describe('approveVwapParent', () => {
  it('refuses missing / whitespace parentClientOrderId', () => {
    expect(
      approveVwapParent({
        kind: 'vwap',
        durationMs: DURATION,
        credit: CREDIT,
        remaining: REMAINING,
        operatorId: OP,
        jobs: JOBS_ON,
        matchingVenueHalt: MATCHING_OPEN,
      }),
    ).toMatchObject({ ok: false, reason: 'missing_parent' });
    expect(
      approveVwapParent({
        parentClientOrderId: '   ',
        kind: 'vwap',
        durationMs: DURATION,
        credit: CREDIT,
        remaining: REMAINING,
        operatorId: OP,
        jobs: JOBS_ON,
        matchingVenueHalt: MATCHING_OPEN,
      }),
    ).toMatchObject({ ok: false, reason: 'missing_parent' });
  });

  it('jobs unwired / jobs_off refuse even with duration + credit', () => {
    expect(
      approveVwapParent({
        parentClientOrderId: 'p-vwap',
        kind: 'vwap',
        durationMs: DURATION,
        credit: CREDIT,
        remaining: REMAINING,
        operatorId: OP,
        matchingVenueHalt: MATCHING_OPEN,
      }),
    ).toMatchObject({ ok: false, reason: 'jobs_gate_unwired' });
    expect(
      approveVwapParent({
        parentClientOrderId: 'p-vwap',
        kind: 'vwap',
        durationMs: DURATION,
        credit: CREDIT,
        remaining: REMAINING,
        operatorId: OP,
        jobs: JOBS_OFF,
        matchingVenueHalt: MATCHING_OPEN,
      }),
    ).toMatchObject({ ok: false, reason: 'jobs_off' });
  });

  it('refuses kind twap / pov with not_live', () => {
    expect(
      approveVwapParent({
        parentClientOrderId: 'p-vwap',
        kind: 'twap',
        durationMs: DURATION,
        credit: CREDIT,
        remaining: REMAINING,
        operatorId: OP,
        jobs: JOBS_ON,
        matchingVenueHalt: MATCHING_OPEN,
      }),
    ).toMatchObject({ ok: false, reason: 'not_live' });
    expect(
      approveVwapParent({
        parentClientOrderId: 'p-vwap',
        kind: 'pov',
        durationMs: DURATION,
        credit: CREDIT,
        remaining: REMAINING,
        operatorId: OP,
        jobs: JOBS_ON,
        matchingVenueHalt: MATCHING_OPEN,
      }),
    ).toMatchObject({ ok: false, reason: 'not_live' });
  });

  it('refuses missing / whitespace operator', () => {
    expect(
      approveVwapParent({
        parentClientOrderId: 'p-vwap',
        kind: 'vwap',
        durationMs: DURATION,
        credit: CREDIT,
        remaining: REMAINING,
        jobs: JOBS_ON,
        matchingVenueHalt: MATCHING_OPEN,
      }),
    ).toMatchObject({ ok: false, reason: 'missing_operator' });
    expect(
      approveVwapParent({
        parentClientOrderId: 'p-vwap',
        kind: 'vwap',
        durationMs: DURATION,
        credit: CREDIT,
        remaining: REMAINING,
        operatorId: '   ',
        jobs: JOBS_ON,
        matchingVenueHalt: MATCHING_OPEN,
      }),
    ).toMatchObject({ ok: false, reason: 'missing_operator' });
  });

  it('refuses omitted / null duration with duration_blank', () => {
    expect(
      approveVwapParent({
        parentClientOrderId: 'p-vwap',
        kind: 'vwap',
        credit: CREDIT,
        remaining: REMAINING,
        operatorId: OP,
        jobs: JOBS_ON,
        matchingVenueHalt: MATCHING_OPEN,
      }),
    ).toMatchObject({ ok: false, reason: 'duration_blank' });
    expect(
      approveVwapParent({
        parentClientOrderId: 'p-vwap',
        kind: 'vwap',
        durationMs: null,
        credit: CREDIT,
        remaining: REMAINING,
        operatorId: OP,
        jobs: JOBS_ON,
        matchingVenueHalt: MATCHING_OPEN,
      }),
    ).toMatchObject({ ok: false, reason: 'duration_blank' });
  });

  it('refuses 0 / non-integer duration with duration_invalid', () => {
    expect(
      approveVwapParent({
        parentClientOrderId: 'p-vwap',
        kind: 'vwap',
        durationMs: 0,
        credit: CREDIT,
        remaining: REMAINING,
        operatorId: OP,
        jobs: JOBS_ON,
        matchingVenueHalt: MATCHING_OPEN,
      }),
    ).toMatchObject({ ok: false, reason: 'duration_invalid' });
    expect(
      approveVwapParent({
        parentClientOrderId: 'p-vwap',
        kind: 'vwap',
        durationMs: 1.5,
        credit: CREDIT,
        remaining: REMAINING,
        operatorId: OP,
        jobs: JOBS_ON,
        matchingVenueHalt: MATCHING_OPEN,
      }),
    ).toMatchObject({ ok: false, reason: 'duration_invalid' });
  });

  it('refuses omitted / null / whitespace credit with credit_blank', () => {
    expect(
      approveVwapParent({
        parentClientOrderId: 'p-vwap',
        kind: 'vwap',
        durationMs: DURATION,
        remaining: REMAINING,
        operatorId: OP,
        jobs: JOBS_ON,
        matchingVenueHalt: MATCHING_OPEN,
      }),
    ).toMatchObject({ ok: false, reason: 'credit_blank' });
    expect(
      approveVwapParent({
        parentClientOrderId: 'p-vwap',
        kind: 'vwap',
        durationMs: DURATION,
        credit: null,
        remaining: REMAINING,
        operatorId: OP,
        jobs: JOBS_ON,
        matchingVenueHalt: MATCHING_OPEN,
      }),
    ).toMatchObject({ ok: false, reason: 'credit_blank' });
    expect(
      approveVwapParent({
        parentClientOrderId: 'p-vwap',
        kind: 'vwap',
        durationMs: DURATION,
        credit: '   ',
        remaining: REMAINING,
        operatorId: OP,
        jobs: JOBS_ON,
        matchingVenueHalt: MATCHING_OPEN,
      }),
    ).toMatchObject({ ok: false, reason: 'credit_blank' });
  });

  it("refuses 'not-an-amount' credit with credit_invalid", () => {
    expect(
      approveVwapParent({
        parentClientOrderId: 'p-vwap',
        kind: 'vwap',
        durationMs: DURATION,
        credit: 'not-an-amount',
        remaining: REMAINING,
        operatorId: OP,
        jobs: JOBS_ON,
        matchingVenueHalt: MATCHING_OPEN,
      }),
    ).toMatchObject({ ok: false, reason: 'credit_invalid' });
  });

  it('refuses omitted / null / whitespace remaining with missing_residual', () => {
    expect(
      approveVwapParent({
        parentClientOrderId: 'p-vwap',
        kind: 'vwap',
        durationMs: DURATION,
        credit: CREDIT,
        operatorId: OP,
        jobs: JOBS_ON,
        matchingVenueHalt: MATCHING_OPEN,
      }),
    ).toMatchObject({ ok: false, reason: 'missing_residual' });
    expect(
      approveVwapParent({
        parentClientOrderId: 'p-vwap',
        kind: 'vwap',
        durationMs: DURATION,
        credit: CREDIT,
        remaining: null,
        operatorId: OP,
        jobs: JOBS_ON,
        matchingVenueHalt: MATCHING_OPEN,
      }),
    ).toMatchObject({ ok: false, reason: 'missing_residual' });
    expect(
      approveVwapParent({
        parentClientOrderId: 'p-vwap',
        kind: 'vwap',
        durationMs: DURATION,
        credit: CREDIT,
        remaining: '   ',
        operatorId: OP,
        jobs: JOBS_ON,
        matchingVenueHalt: MATCHING_OPEN,
      }),
    ).toMatchObject({ ok: false, reason: 'missing_residual' });
  });

  it('matching halt-all refuses venue_halted; missing halt source refuses venue_halt_unavailable', () => {
    expect(
      approveVwapParent({
        parentClientOrderId: 'p-vwap',
        kind: 'vwap',
        durationMs: DURATION,
        credit: CREDIT,
        remaining: REMAINING,
        operatorId: OP,
        jobs: JOBS_ON,
        matchingVenueHalt: MATCHING_HALTED,
      }),
    ).toMatchObject({ ok: false, reason: 'venue_halted' });
    expect(
      approveVwapParent({
        parentClientOrderId: 'p-vwap',
        kind: 'vwap',
        durationMs: DURATION,
        credit: CREDIT,
        remaining: REMAINING,
        operatorId: OP,
        jobs: JOBS_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'venue_halt_unavailable' });
  });

  it('happy: duration + credit + remaining + jobs on — status approved, not paper', () => {
    const result = approveVwapParent({
      parentClientOrderId: 'p-vwap',
      kind: 'vwap',
      durationMs: DURATION,
      credit: CREDIT,
      remaining: REMAINING,
      operatorId: OP,
      jobs: JOBS_ON,
      matchingVenueHalt: MATCHING_OPEN,
    });
    expect(result).toEqual({
      ok: true,
      approved: true,
      parent: { parentClientOrderId: 'p-vwap', kind: 'vwap' },
      status: 'approved',
      durationMs: DURATION,
      credit: formatAmount(parseAmount(CREDIT)),
      residual: { remaining: formatAmount(parseAmount(REMAINING)) },
    });
    expect(result).not.toHaveProperty('paper');
    expect(result).not.toHaveProperty('matching');
    expect(result).not.toMatchObject({ status: 'paper' });
  });
});
