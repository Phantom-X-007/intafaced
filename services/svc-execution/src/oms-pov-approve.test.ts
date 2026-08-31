import { describe, expect, it } from 'vitest';
import { formatAmount, parseAmount } from '@intafaced/ledger-client';
import { approvePovParent } from './oms-pov-approve.js';

const OP = '33333333-3333-4333-8333-333333333333';
const MATCHING_OPEN = { venueHalted: false } as const;
const MATCHING_HALTED = { venueHalted: true } as const;
const JOBS_ON = { enabled: true } as const;
const JOBS_OFF = { enabled: false } as const;
const PARTICIPATION = 1500;
const CREDIT = '100';
const REMAINING = '1.25';

describe('approvePovParent', () => {
  it('refuses missing / whitespace parentClientOrderId', () => {
    expect(
      approvePovParent({
        kind: 'pov',
        maxParticipationBps: PARTICIPATION,
        credit: CREDIT,
        remaining: REMAINING,
        operatorId: OP,
        jobs: JOBS_ON,
        matchingVenueHalt: MATCHING_OPEN,
      }),
    ).toMatchObject({ ok: false, reason: 'missing_parent' });
    expect(
      approvePovParent({
        parentClientOrderId: '   ',
        kind: 'pov',
        maxParticipationBps: PARTICIPATION,
        credit: CREDIT,
        remaining: REMAINING,
        operatorId: OP,
        jobs: JOBS_ON,
        matchingVenueHalt: MATCHING_OPEN,
      }),
    ).toMatchObject({ ok: false, reason: 'missing_parent' });
  });

  it('jobs unwired / jobs_off refuse even with participation + credit', () => {
    expect(
      approvePovParent({
        parentClientOrderId: 'p-pov',
        kind: 'pov',
        maxParticipationBps: PARTICIPATION,
        credit: CREDIT,
        remaining: REMAINING,
        operatorId: OP,
        matchingVenueHalt: MATCHING_OPEN,
      }),
    ).toMatchObject({ ok: false, reason: 'jobs_gate_unwired' });
    expect(
      approvePovParent({
        parentClientOrderId: 'p-pov',
        kind: 'pov',
        maxParticipationBps: PARTICIPATION,
        credit: CREDIT,
        remaining: REMAINING,
        operatorId: OP,
        jobs: JOBS_OFF,
        matchingVenueHalt: MATCHING_OPEN,
      }),
    ).toMatchObject({ ok: false, reason: 'jobs_off' });
  });

  it('refuses kind twap / vwap with not_live', () => {
    expect(
      approvePovParent({
        parentClientOrderId: 'p-pov',
        kind: 'twap',
        maxParticipationBps: PARTICIPATION,
        credit: CREDIT,
        remaining: REMAINING,
        operatorId: OP,
        jobs: JOBS_ON,
        matchingVenueHalt: MATCHING_OPEN,
      }),
    ).toMatchObject({ ok: false, reason: 'not_live' });
    expect(
      approvePovParent({
        parentClientOrderId: 'p-pov',
        kind: 'vwap',
        maxParticipationBps: PARTICIPATION,
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
      approvePovParent({
        parentClientOrderId: 'p-pov',
        kind: 'pov',
        maxParticipationBps: PARTICIPATION,
        credit: CREDIT,
        remaining: REMAINING,
        jobs: JOBS_ON,
        matchingVenueHalt: MATCHING_OPEN,
      }),
    ).toMatchObject({ ok: false, reason: 'missing_operator' });
    expect(
      approvePovParent({
        parentClientOrderId: 'p-pov',
        kind: 'pov',
        maxParticipationBps: PARTICIPATION,
        credit: CREDIT,
        remaining: REMAINING,
        operatorId: '   ',
        jobs: JOBS_ON,
        matchingVenueHalt: MATCHING_OPEN,
      }),
    ).toMatchObject({ ok: false, reason: 'missing_operator' });
  });

  it('refuses omitted / null participation with participation_blank', () => {
    expect(
      approvePovParent({
        parentClientOrderId: 'p-pov',
        kind: 'pov',
        credit: CREDIT,
        remaining: REMAINING,
        operatorId: OP,
        jobs: JOBS_ON,
        matchingVenueHalt: MATCHING_OPEN,
      }),
    ).toMatchObject({ ok: false, reason: 'participation_blank' });
    expect(
      approvePovParent({
        parentClientOrderId: 'p-pov',
        kind: 'pov',
        maxParticipationBps: null,
        credit: CREDIT,
        remaining: REMAINING,
        operatorId: OP,
        jobs: JOBS_ON,
        matchingVenueHalt: MATCHING_OPEN,
      }),
    ).toMatchObject({ ok: false, reason: 'participation_blank' });
  });

  it('refuses negative / non-integer participation with participation_invalid', () => {
    expect(
      approvePovParent({
        parentClientOrderId: 'p-pov',
        kind: 'pov',
        maxParticipationBps: -1,
        credit: CREDIT,
        remaining: REMAINING,
        operatorId: OP,
        jobs: JOBS_ON,
        matchingVenueHalt: MATCHING_OPEN,
      }),
    ).toMatchObject({ ok: false, reason: 'participation_invalid' });
    expect(
      approvePovParent({
        parentClientOrderId: 'p-pov',
        kind: 'pov',
        maxParticipationBps: 1.5,
        credit: CREDIT,
        remaining: REMAINING,
        operatorId: OP,
        jobs: JOBS_ON,
        matchingVenueHalt: MATCHING_OPEN,
      }),
    ).toMatchObject({ ok: false, reason: 'participation_invalid' });
  });

  it('refuses omitted / null / whitespace credit with credit_blank', () => {
    expect(
      approvePovParent({
        parentClientOrderId: 'p-pov',
        kind: 'pov',
        maxParticipationBps: PARTICIPATION,
        remaining: REMAINING,
        operatorId: OP,
        jobs: JOBS_ON,
        matchingVenueHalt: MATCHING_OPEN,
      }),
    ).toMatchObject({ ok: false, reason: 'credit_blank' });
    expect(
      approvePovParent({
        parentClientOrderId: 'p-pov',
        kind: 'pov',
        maxParticipationBps: PARTICIPATION,
        credit: null,
        remaining: REMAINING,
        operatorId: OP,
        jobs: JOBS_ON,
        matchingVenueHalt: MATCHING_OPEN,
      }),
    ).toMatchObject({ ok: false, reason: 'credit_blank' });
    expect(
      approvePovParent({
        parentClientOrderId: 'p-pov',
        kind: 'pov',
        maxParticipationBps: PARTICIPATION,
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
      approvePovParent({
        parentClientOrderId: 'p-pov',
        kind: 'pov',
        maxParticipationBps: PARTICIPATION,
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
      approvePovParent({
        parentClientOrderId: 'p-pov',
        kind: 'pov',
        maxParticipationBps: PARTICIPATION,
        credit: CREDIT,
        operatorId: OP,
        jobs: JOBS_ON,
        matchingVenueHalt: MATCHING_OPEN,
      }),
    ).toMatchObject({ ok: false, reason: 'missing_residual' });
    expect(
      approvePovParent({
        parentClientOrderId: 'p-pov',
        kind: 'pov',
        maxParticipationBps: PARTICIPATION,
        credit: CREDIT,
        remaining: null,
        operatorId: OP,
        jobs: JOBS_ON,
        matchingVenueHalt: MATCHING_OPEN,
      }),
    ).toMatchObject({ ok: false, reason: 'missing_residual' });
    expect(
      approvePovParent({
        parentClientOrderId: 'p-pov',
        kind: 'pov',
        maxParticipationBps: PARTICIPATION,
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
      approvePovParent({
        parentClientOrderId: 'p-pov',
        kind: 'pov',
        maxParticipationBps: PARTICIPATION,
        credit: CREDIT,
        remaining: REMAINING,
        operatorId: OP,
        jobs: JOBS_ON,
        matchingVenueHalt: MATCHING_HALTED,
      }),
    ).toMatchObject({ ok: false, reason: 'venue_halted' });
    expect(
      approvePovParent({
        parentClientOrderId: 'p-pov',
        kind: 'pov',
        maxParticipationBps: PARTICIPATION,
        credit: CREDIT,
        remaining: REMAINING,
        operatorId: OP,
        jobs: JOBS_ON,
      }),
    ).toMatchObject({ ok: false, reason: 'venue_halt_unavailable' });
  });

  it('happy: participation + credit + remaining + jobs on — status approved, not paper', () => {
    const result = approvePovParent({
      parentClientOrderId: 'p-pov',
      kind: 'pov',
      maxParticipationBps: PARTICIPATION,
      credit: CREDIT,
      remaining: REMAINING,
      operatorId: OP,
      jobs: JOBS_ON,
      matchingVenueHalt: MATCHING_OPEN,
    });
    expect(result).toEqual({
      ok: true,
      approved: true,
      parent: { parentClientOrderId: 'p-pov', kind: 'pov' },
      status: 'approved',
      maxParticipationBps: PARTICIPATION,
      credit: formatAmount(parseAmount(CREDIT)),
      residual: { remaining: formatAmount(parseAmount(REMAINING)) },
    });
    expect(result).not.toHaveProperty('paper');
    expect(result).not.toHaveProperty('matching');
    expect(result).not.toMatchObject({ status: 'paper' });
  });
});
