import { describe, expect, it } from 'vitest';
import { formatAmount, parseAmount } from '@intafaced/ledger-client';
import { startVwapParent } from './oms-vwap-start.js';

const OP = '33333333-3333-4333-8333-333333333333';
const MATCHING_OPEN = { venueHalted: false } as const;
const MATCHING_HALTED = { venueHalted: true } as const;
const JOBS_ON = { enabled: true } as const;
const JOBS_OFF = { enabled: false } as const;
const DURATION = 60_000;
const CREDIT = '100';
const REMAINING = '1.25';
const NOW = new Date('2026-08-31T17:00:00.000Z');

describe('startVwapParent', () => {
  it('refuses missing / whitespace parentClientOrderId', () => {
    expect(
      startVwapParent({
        kind: 'vwap',
        approved: true,
        durationMs: DURATION,
        credit: CREDIT,
        remaining: REMAINING,
        operatorId: OP,
        jobs: JOBS_ON,
        matchingVenueHalt: MATCHING_OPEN,
        now: NOW,
      }),
    ).toMatchObject({ ok: false, reason: 'missing_parent' });
    expect(
      startVwapParent({
        parentClientOrderId: '   ',
        kind: 'vwap',
        approved: true,
        durationMs: DURATION,
        credit: CREDIT,
        remaining: REMAINING,
        operatorId: OP,
        jobs: JOBS_ON,
        matchingVenueHalt: MATCHING_OPEN,
        now: NOW,
      }),
    ).toMatchObject({ ok: false, reason: 'missing_parent' });
  });

  it('jobs unwired / jobs_off refuse even when already approved', () => {
    expect(
      startVwapParent({
        parentClientOrderId: 'p-vwap',
        kind: 'vwap',
        approved: true,
        durationMs: DURATION,
        credit: CREDIT,
        remaining: REMAINING,
        operatorId: OP,
        matchingVenueHalt: MATCHING_OPEN,
        now: NOW,
      }),
    ).toMatchObject({ ok: false, reason: 'jobs_gate_unwired' });
    expect(
      startVwapParent({
        parentClientOrderId: 'p-vwap',
        kind: 'vwap',
        approved: true,
        durationMs: DURATION,
        credit: CREDIT,
        remaining: REMAINING,
        operatorId: OP,
        jobs: JOBS_OFF,
        matchingVenueHalt: MATCHING_OPEN,
        now: NOW,
      }),
    ).toMatchObject({ ok: false, reason: 'jobs_off' });
  });

  it('refuses kind twap / pov with not_live', () => {
    expect(
      startVwapParent({
        parentClientOrderId: 'p-vwap',
        kind: 'twap',
        approved: true,
        durationMs: DURATION,
        credit: CREDIT,
        remaining: REMAINING,
        operatorId: OP,
        jobs: JOBS_ON,
        matchingVenueHalt: MATCHING_OPEN,
        now: NOW,
      }),
    ).toMatchObject({ ok: false, reason: 'not_live' });
    expect(
      startVwapParent({
        parentClientOrderId: 'p-vwap',
        kind: 'pov',
        approved: true,
        durationMs: DURATION,
        credit: CREDIT,
        remaining: REMAINING,
        operatorId: OP,
        jobs: JOBS_ON,
        matchingVenueHalt: MATCHING_OPEN,
        now: NOW,
      }),
    ).toMatchObject({ ok: false, reason: 'not_live' });
  });

  it('refuses already-running parent with already_started', () => {
    expect(
      startVwapParent({
        parentClientOrderId: 'p-vwap',
        kind: 'vwap',
        approved: true,
        status: 'running',
        durationMs: DURATION,
        credit: CREDIT,
        remaining: REMAINING,
        operatorId: OP,
        jobs: JOBS_ON,
        matchingVenueHalt: MATCHING_OPEN,
        now: NOW,
      }),
    ).toMatchObject({ ok: false, reason: 'already_started' });
  });

  it('refuses paper / omitted approved with not_approved', () => {
    expect(
      startVwapParent({
        parentClientOrderId: 'p-vwap',
        kind: 'vwap',
        status: 'paper',
        durationMs: DURATION,
        credit: CREDIT,
        remaining: REMAINING,
        operatorId: OP,
        jobs: JOBS_ON,
        matchingVenueHalt: MATCHING_OPEN,
        now: NOW,
      }),
    ).toMatchObject({ ok: false, reason: 'not_approved' });
    expect(
      startVwapParent({
        parentClientOrderId: 'p-vwap',
        kind: 'vwap',
        durationMs: DURATION,
        credit: CREDIT,
        remaining: REMAINING,
        operatorId: OP,
        jobs: JOBS_ON,
        matchingVenueHalt: MATCHING_OPEN,
        now: NOW,
      }),
    ).toMatchObject({ ok: false, reason: 'not_approved' });
  });

  it('refuses missing / whitespace operator', () => {
    expect(
      startVwapParent({
        parentClientOrderId: 'p-vwap',
        kind: 'vwap',
        approved: true,
        durationMs: DURATION,
        credit: CREDIT,
        remaining: REMAINING,
        jobs: JOBS_ON,
        matchingVenueHalt: MATCHING_OPEN,
        now: NOW,
      }),
    ).toMatchObject({ ok: false, reason: 'missing_operator' });
    expect(
      startVwapParent({
        parentClientOrderId: 'p-vwap',
        kind: 'vwap',
        approved: true,
        durationMs: DURATION,
        credit: CREDIT,
        remaining: REMAINING,
        operatorId: '   ',
        jobs: JOBS_ON,
        matchingVenueHalt: MATCHING_OPEN,
        now: NOW,
      }),
    ).toMatchObject({ ok: false, reason: 'missing_operator' });
  });

  it('refuses omitted / null / 0 duration with missing_schedule', () => {
    expect(
      startVwapParent({
        parentClientOrderId: 'p-vwap',
        kind: 'vwap',
        approved: true,
        credit: CREDIT,
        remaining: REMAINING,
        operatorId: OP,
        jobs: JOBS_ON,
        matchingVenueHalt: MATCHING_OPEN,
        now: NOW,
      }),
    ).toMatchObject({ ok: false, reason: 'missing_schedule' });
    expect(
      startVwapParent({
        parentClientOrderId: 'p-vwap',
        kind: 'vwap',
        approved: true,
        durationMs: null,
        credit: CREDIT,
        remaining: REMAINING,
        operatorId: OP,
        jobs: JOBS_ON,
        matchingVenueHalt: MATCHING_OPEN,
        now: NOW,
      }),
    ).toMatchObject({ ok: false, reason: 'missing_schedule' });
    expect(
      startVwapParent({
        parentClientOrderId: 'p-vwap',
        kind: 'vwap',
        approved: true,
        durationMs: 0,
        credit: CREDIT,
        remaining: REMAINING,
        operatorId: OP,
        jobs: JOBS_ON,
        matchingVenueHalt: MATCHING_OPEN,
        now: NOW,
      }),
    ).toMatchObject({ ok: false, reason: 'missing_schedule' });
  });

  it('refuses omitted / null / whitespace credit with credit_blank', () => {
    expect(
      startVwapParent({
        parentClientOrderId: 'p-vwap',
        kind: 'vwap',
        approved: true,
        durationMs: DURATION,
        remaining: REMAINING,
        operatorId: OP,
        jobs: JOBS_ON,
        matchingVenueHalt: MATCHING_OPEN,
        now: NOW,
      }),
    ).toMatchObject({ ok: false, reason: 'credit_blank' });
    expect(
      startVwapParent({
        parentClientOrderId: 'p-vwap',
        kind: 'vwap',
        approved: true,
        durationMs: DURATION,
        credit: null,
        remaining: REMAINING,
        operatorId: OP,
        jobs: JOBS_ON,
        matchingVenueHalt: MATCHING_OPEN,
        now: NOW,
      }),
    ).toMatchObject({ ok: false, reason: 'credit_blank' });
    expect(
      startVwapParent({
        parentClientOrderId: 'p-vwap',
        kind: 'vwap',
        approved: true,
        durationMs: DURATION,
        credit: '   ',
        remaining: REMAINING,
        operatorId: OP,
        jobs: JOBS_ON,
        matchingVenueHalt: MATCHING_OPEN,
        now: NOW,
      }),
    ).toMatchObject({ ok: false, reason: 'credit_blank' });
  });

  it("refuses 'not-an-amount' credit with credit_invalid", () => {
    expect(
      startVwapParent({
        parentClientOrderId: 'p-vwap',
        kind: 'vwap',
        approved: true,
        durationMs: DURATION,
        credit: 'not-an-amount',
        remaining: REMAINING,
        operatorId: OP,
        jobs: JOBS_ON,
        matchingVenueHalt: MATCHING_OPEN,
        now: NOW,
      }),
    ).toMatchObject({ ok: false, reason: 'credit_invalid' });
  });

  it('refuses omitted / null / whitespace remaining with missing_residual', () => {
    expect(
      startVwapParent({
        parentClientOrderId: 'p-vwap',
        kind: 'vwap',
        approved: true,
        durationMs: DURATION,
        credit: CREDIT,
        operatorId: OP,
        jobs: JOBS_ON,
        matchingVenueHalt: MATCHING_OPEN,
        now: NOW,
      }),
    ).toMatchObject({ ok: false, reason: 'missing_residual' });
    expect(
      startVwapParent({
        parentClientOrderId: 'p-vwap',
        kind: 'vwap',
        approved: true,
        durationMs: DURATION,
        credit: CREDIT,
        remaining: null,
        operatorId: OP,
        jobs: JOBS_ON,
        matchingVenueHalt: MATCHING_OPEN,
        now: NOW,
      }),
    ).toMatchObject({ ok: false, reason: 'missing_residual' });
    expect(
      startVwapParent({
        parentClientOrderId: 'p-vwap',
        kind: 'vwap',
        approved: true,
        durationMs: DURATION,
        credit: CREDIT,
        remaining: '   ',
        operatorId: OP,
        jobs: JOBS_ON,
        matchingVenueHalt: MATCHING_OPEN,
        now: NOW,
      }),
    ).toMatchObject({ ok: false, reason: 'missing_residual' });
  });

  it('matching halt-all refuses venue_halted; missing halt source refuses venue_halt_unavailable', () => {
    expect(
      startVwapParent({
        parentClientOrderId: 'p-vwap',
        kind: 'vwap',
        approved: true,
        durationMs: DURATION,
        credit: CREDIT,
        remaining: REMAINING,
        operatorId: OP,
        jobs: JOBS_ON,
        matchingVenueHalt: MATCHING_HALTED,
        now: NOW,
      }),
    ).toMatchObject({ ok: false, reason: 'venue_halted' });
    expect(
      startVwapParent({
        parentClientOrderId: 'p-vwap',
        kind: 'vwap',
        approved: true,
        durationMs: DURATION,
        credit: CREDIT,
        remaining: REMAINING,
        operatorId: OP,
        jobs: JOBS_ON,
        now: NOW,
      }),
    ).toMatchObject({ ok: false, reason: 'venue_halt_unavailable' });
  });

  it('happy: already-approved + credit + remaining + jobs on — status running, not paper', () => {
    const result = startVwapParent({
      parentClientOrderId: 'p-vwap',
      kind: 'vwap',
      approved: true,
      status: 'approved',
      durationMs: DURATION,
      credit: CREDIT,
      remaining: REMAINING,
      operatorId: OP,
      jobs: JOBS_ON,
      matchingVenueHalt: MATCHING_OPEN,
      now: NOW,
    });
    expect(result).toEqual({
      ok: true,
      started: true,
      parentClientOrderId: 'p-vwap',
      kind: 'vwap',
      status: 'running',
      durationMs: DURATION,
      credit: formatAmount(parseAmount(CREDIT)),
      residual: { remaining: formatAmount(parseAmount(REMAINING)) },
      startedAt: NOW.toISOString(),
    });
    expect(result).not.toHaveProperty('paper');
    expect(result).not.toHaveProperty('matching');
    expect(result).not.toMatchObject({ status: 'paper' });
    expect(result).not.toMatchObject({ status: 'approved' });
  });
});
