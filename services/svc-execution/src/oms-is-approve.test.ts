import { describe, expect, it } from 'vitest';
import { approveImplementationShortfallParent } from './oms-is-approve.js';

const OP = '33333333-3333-4333-8333-333333333333';
const MATCHING_OPEN = { venueHalted: false } as const;
const MATCHING_HALTED = { venueHalted: true } as const;

describe('approveImplementationShortfallParent', () => {
  it('refuses missing parentClientOrderId', () => {
    expect(
      approveImplementationShortfallParent({
        arrivalPrice: '100',
        operatorId: OP,
        jobs: { enabled: true },
        matchingVenueHalt: MATCHING_OPEN,
      }),
    ).toMatchObject({ ok: false, reason: 'missing_parent' });
    expect(
      approveImplementationShortfallParent({
        parentClientOrderId: '   ',
        arrivalPrice: '100',
        operatorId: OP,
        jobs: { enabled: true },
        matchingVenueHalt: MATCHING_OPEN,
      }),
    ).toMatchObject({ ok: false, reason: 'missing_parent' });
  });

  it('refuses null/undefined/whitespace arrivalPrice with arrival_price_blank', () => {
    expect(
      approveImplementationShortfallParent({
        parentClientOrderId: 'p-is',
        arrivalPrice: null,
        operatorId: OP,
        jobs: { enabled: true },
        matchingVenueHalt: MATCHING_OPEN,
      }),
    ).toMatchObject({ ok: false, reason: 'arrival_price_blank' });
    expect(
      approveImplementationShortfallParent({
        parentClientOrderId: 'p-is',
        arrivalPrice: undefined,
        operatorId: OP,
        jobs: { enabled: true },
        matchingVenueHalt: MATCHING_OPEN,
      }),
    ).toMatchObject({ ok: false, reason: 'arrival_price_blank' });
    expect(
      approveImplementationShortfallParent({
        parentClientOrderId: 'p-is',
        arrivalPrice: '   ',
        operatorId: OP,
        jobs: { enabled: true },
        matchingVenueHalt: MATCHING_OPEN,
      }),
    ).toMatchObject({ ok: false, reason: 'arrival_price_blank' });
  });

  it("refuses 'nope' with arrival_price_invalid", () => {
    expect(
      approveImplementationShortfallParent({
        parentClientOrderId: 'p-is',
        arrivalPrice: 'nope',
        operatorId: OP,
        jobs: { enabled: true },
        matchingVenueHalt: MATCHING_OPEN,
      }),
    ).toMatchObject({ ok: false, reason: 'arrival_price_invalid' });
  });

  it("refuses '0' with arrival_price_invalid", () => {
    expect(
      approveImplementationShortfallParent({
        parentClientOrderId: 'p-is',
        arrivalPrice: '0',
        operatorId: OP,
        jobs: { enabled: true },
        matchingVenueHalt: MATCHING_OPEN,
      }),
    ).toMatchObject({ ok: false, reason: 'arrival_price_invalid' });
  });

  it("jobs unwired / jobs_off refuse even with arrival '100'", () => {
    expect(
      approveImplementationShortfallParent({
        parentClientOrderId: 'p-is',
        arrivalPrice: '100',
        operatorId: OP,
        matchingVenueHalt: MATCHING_OPEN,
      }),
    ).toMatchObject({ ok: false, reason: 'jobs_gate_unwired' });
    expect(
      approveImplementationShortfallParent({
        parentClientOrderId: 'p-is',
        arrivalPrice: '100',
        operatorId: OP,
        jobs: { enabled: false },
        matchingVenueHalt: MATCHING_OPEN,
      }),
    ).toMatchObject({ ok: false, reason: 'jobs_off' });
  });

  it('missing operator refuses; parent not approved', () => {
    const missing = approveImplementationShortfallParent({
      parentClientOrderId: 'p-is',
      arrivalPrice: '100',
      jobs: { enabled: true },
      matchingVenueHalt: MATCHING_OPEN,
    });
    expect(missing).toMatchObject({ ok: false, reason: 'missing_operator' });
    expect(missing).not.toMatchObject({ approved: true });
    const blank = approveImplementationShortfallParent({
      parentClientOrderId: 'p-is',
      arrivalPrice: '100',
      operatorId: '   ',
      jobs: { enabled: true },
      matchingVenueHalt: MATCHING_OPEN,
    });
    expect(blank).toMatchObject({ ok: false, reason: 'missing_operator' });
    expect(blank).not.toMatchObject({ approved: true });
  });

  it('matching halt-all refuses venue_halted; missing halt source refuses venue_halt_unavailable', () => {
    expect(
      approveImplementationShortfallParent({
        parentClientOrderId: 'p-is',
        arrivalPrice: '100',
        operatorId: OP,
        jobs: { enabled: true },
        matchingVenueHalt: MATCHING_HALTED,
      }),
    ).toMatchObject({ ok: false, reason: 'venue_halted' });
    expect(
      approveImplementationShortfallParent({
        parentClientOrderId: 'p-is',
        arrivalPrice: '100',
        operatorId: OP,
        jobs: { enabled: true },
      }),
    ).toMatchObject({ ok: false, reason: 'venue_halt_unavailable' });
  });

  it("happy: parent id + arrival '100.5' + operator + jobs on + matching open", () => {
    expect(
      approveImplementationShortfallParent({
        parentClientOrderId: 'p-is',
        arrivalPrice: '100.5',
        operatorId: OP,
        jobs: { enabled: true },
        matchingVenueHalt: MATCHING_OPEN,
      }),
    ).toEqual({
      ok: true,
      approved: true,
      parent: { parentClientOrderId: 'p-is', kind: 'implementation_shortfall' },
      status: 'approved',
      arrivalPrice: '100.5',
    });
  });

  it('does not invent a book price: blank arrival is arrival_price_blank even if jobs/operator/halt are good', () => {
    expect(
      approveImplementationShortfallParent({
        parentClientOrderId: 'p-is',
        arrivalPrice: '',
        operatorId: OP,
        jobs: { enabled: true },
        matchingVenueHalt: MATCHING_OPEN,
      }),
    ).toMatchObject({ ok: false, reason: 'arrival_price_blank' });
  });
});
