import { describe, expect, it } from 'vitest';
import { startImplementationShortfallParent } from './oms-is-start.js';

const OP = '33333333-3333-4333-8333-333333333333';
const MATCHING_OPEN = { venueHalted: false } as const;
const MATCHING_HALTED = { venueHalted: true } as const;
const now = new Date('2026-08-31T12:00:00.000Z');

describe('startImplementationShortfallParent', () => {
  it("jobs off refuses even with approved true and arrival '100'", () => {
    expect(
      startImplementationShortfallParent({
        parentClientOrderId: 'p-is',
        approved: true,
        arrivalPrice: '100',
        operatorId: OP,
        jobs: { enabled: false },
        matchingVenueHalt: MATCHING_OPEN,
        now,
      }),
    ).toMatchObject({ ok: false, reason: 'jobs_off' });
  });

  it('jobs unwired refuses', () => {
    expect(
      startImplementationShortfallParent({
        parentClientOrderId: 'p-is',
        approved: true,
        arrivalPrice: '100',
        operatorId: OP,
        matchingVenueHalt: MATCHING_OPEN,
        now,
      }),
    ).toMatchObject({ ok: false, reason: 'jobs_gate_unwired' });
  });

  it('refuses missing parentClientOrderId', () => {
    expect(
      startImplementationShortfallParent({
        approved: true,
        arrivalPrice: '100',
        operatorId: OP,
        jobs: { enabled: true },
        matchingVenueHalt: MATCHING_OPEN,
        now,
      }),
    ).toMatchObject({ ok: false, reason: 'missing_parent' });
    expect(
      startImplementationShortfallParent({
        parentClientOrderId: '   ',
        approved: true,
        arrivalPrice: '100',
        operatorId: OP,
        jobs: { enabled: true },
        matchingVenueHalt: MATCHING_OPEN,
        now,
      }),
    ).toMatchObject({ ok: false, reason: 'missing_parent' });
  });

  it('approved false / omitted and status not approved refuses not_approved', () => {
    expect(
      startImplementationShortfallParent({
        parentClientOrderId: 'p-is',
        approved: false,
        arrivalPrice: '100',
        operatorId: OP,
        jobs: { enabled: true },
        matchingVenueHalt: MATCHING_OPEN,
        now,
      }),
    ).toMatchObject({ ok: false, reason: 'not_approved' });
    expect(
      startImplementationShortfallParent({
        parentClientOrderId: 'p-is',
        arrivalPrice: '100',
        operatorId: OP,
        jobs: { enabled: true },
        matchingVenueHalt: MATCHING_OPEN,
        now,
      }),
    ).toMatchObject({ ok: false, reason: 'not_approved' });
  });

  it('status running refuses already_started even if approved true', () => {
    expect(
      startImplementationShortfallParent({
        parentClientOrderId: 'p-is',
        approved: true,
        status: 'running',
        arrivalPrice: '100',
        operatorId: OP,
        jobs: { enabled: true },
        matchingVenueHalt: MATCHING_OPEN,
        now,
      }),
    ).toMatchObject({ ok: false, reason: 'already_started' });
  });

  it('blank/null arrival with approved true refuses missing_schedule and does not invent slices', () => {
    expect(
      startImplementationShortfallParent({
        parentClientOrderId: 'p-is',
        approved: true,
        arrivalPrice: null,
        operatorId: OP,
        jobs: { enabled: true },
        matchingVenueHalt: MATCHING_OPEN,
        now,
      }),
    ).toMatchObject({ ok: false, reason: 'missing_schedule' });
    expect(
      startImplementationShortfallParent({
        parentClientOrderId: 'p-is',
        approved: true,
        arrivalPrice: undefined,
        operatorId: OP,
        jobs: { enabled: true },
        matchingVenueHalt: MATCHING_OPEN,
        now,
      }),
    ).toMatchObject({ ok: false, reason: 'missing_schedule' });
    expect(
      startImplementationShortfallParent({
        parentClientOrderId: 'p-is',
        approved: true,
        arrivalPrice: '',
        operatorId: OP,
        jobs: { enabled: true },
        matchingVenueHalt: MATCHING_OPEN,
        now,
      }),
    ).toMatchObject({ ok: false, reason: 'missing_schedule' });
    expect(
      startImplementationShortfallParent({
        parentClientOrderId: 'p-is',
        approved: true,
        arrivalPrice: '   ',
        operatorId: OP,
        jobs: { enabled: true },
        matchingVenueHalt: MATCHING_OPEN,
        now,
      }),
    ).toMatchObject({ ok: false, reason: 'missing_schedule' });
    const blank = startImplementationShortfallParent({
      parentClientOrderId: 'p-is',
      approved: true,
      arrivalPrice: '',
      operatorId: OP,
      jobs: { enabled: true },
      matchingVenueHalt: MATCHING_OPEN,
      now,
    });
    expect(blank).not.toHaveProperty('slicesPlanned');
    expect(blank).not.toHaveProperty('duration');
  });

  it('missing operator refuses', () => {
    expect(
      startImplementationShortfallParent({
        parentClientOrderId: 'p-is',
        approved: true,
        arrivalPrice: '100',
        jobs: { enabled: true },
        matchingVenueHalt: MATCHING_OPEN,
        now,
      }),
    ).toMatchObject({ ok: false, reason: 'missing_operator' });
    expect(
      startImplementationShortfallParent({
        parentClientOrderId: 'p-is',
        approved: true,
        arrivalPrice: '100',
        operatorId: '   ',
        jobs: { enabled: true },
        matchingVenueHalt: MATCHING_OPEN,
        now,
      }),
    ).toMatchObject({ ok: false, reason: 'missing_operator' });
  });

  it('matching halt-all refuses venue_halted; missing halt source refuses venue_halt_unavailable', () => {
    expect(
      startImplementationShortfallParent({
        parentClientOrderId: 'p-is',
        approved: true,
        arrivalPrice: '100',
        operatorId: OP,
        jobs: { enabled: true },
        matchingVenueHalt: MATCHING_HALTED,
        now,
      }),
    ).toMatchObject({ ok: false, reason: 'venue_halted' });
    expect(
      startImplementationShortfallParent({
        parentClientOrderId: 'p-is',
        approved: true,
        arrivalPrice: '100',
        operatorId: OP,
        jobs: { enabled: true },
        now,
      }),
    ).toMatchObject({ ok: false, reason: 'venue_halt_unavailable' });
  });

  it("happy: approved true + arrival '100.5' + operator + jobs on + matching open + now", () => {
    expect(
      startImplementationShortfallParent({
        parentClientOrderId: 'p-is',
        approved: true,
        arrivalPrice: '100.5',
        operatorId: OP,
        jobs: { enabled: true },
        matchingVenueHalt: MATCHING_OPEN,
        now,
      }),
    ).toEqual({
      ok: true,
      started: true,
      parentClientOrderId: 'p-is',
      kind: 'implementation_shortfall',
      status: 'running',
      arrivalPrice: '100.5',
      startedAt: '2026-08-31T12:00:00.000Z',
    });
  });

  it("status 'approved' without approved true still starts", () => {
    expect(
      startImplementationShortfallParent({
        parentClientOrderId: 'p-is',
        status: 'approved',
        arrivalPrice: '100.5',
        operatorId: OP,
        jobs: { enabled: true },
        matchingVenueHalt: MATCHING_OPEN,
        now,
      }),
    ).toMatchObject({
      ok: true,
      started: true,
      status: 'running',
      kind: 'implementation_shortfall',
      arrivalPrice: '100.5',
    });
  });
});
