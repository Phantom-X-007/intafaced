/**
 * Unit card — notify must not stay silent as all-fine during halt / incident
 * 1. Promise: M18 customer truth — halt-all / market halted / missing source
 *    are not allFine; silence without all-clear does not auto-unmute as success
 * 2. Break: /health ok:true read as venue recovered; all-clear while still halted
 * 3. Done bar: presentVenueIncident covers open / halt-all / one-market /
 *    unavailable / unwired / silence / refused all-clear
 * 4. Class N
 * 5. Paths: services/svc-notify/src/venue-incident-truth.ts
 * 6. RED
 * 7. Collision: none
 */

import { describe, expect, it } from 'vitest';
import { presentVenueIncident } from './venue-incident-truth.js';

const quiet = { incidentSilence: false, allClear: false } as const;

describe('venue incident customer-truth', () => {
  it('matching open and no silence is allFine', () => {
    expect(
      presentVenueIncident({
        load: { kind: 'board', board: { venueHalted: false, haltedMarkets: [] } },
        ...quiet,
      }),
    ).toMatchObject({ allFine: true, matching: 'open', code: null });
  });

  it('halt-all is not allFine and does not invent an all-clear', () => {
    expect(
      presentVenueIncident({
        load: { kind: 'board', board: { venueHalted: true, haltedMarkets: [] } },
        ...quiet,
      }),
    ).toMatchObject({ allFine: false, matching: 'halted', code: 'notify.venue_halted' });

    expect(
      presentVenueIncident({
        load: { kind: 'board', board: { venueHalted: true, haltedMarkets: [] } },
        incidentSilence: true,
        allClear: true,
      }),
    ).toMatchObject({ allFine: false, matching: 'halted', code: 'notify.incident_all_clear_refused' });
  });

  it('one-market halt is not allFine', () => {
    expect(
      presentVenueIncident({
        load: { kind: 'board', board: { venueHalted: false, haltedMarkets: ['btc-usd'] } },
        ...quiet,
      }),
    ).toMatchObject({ allFine: false, matching: 'halted', code: 'notify.market_halted' });
  });

  it('missing halt source is not live and refuses all-clear', () => {
    expect(presentVenueIncident({ load: { kind: 'unavailable' }, ...quiet })).toMatchObject({
      allFine: false,
      matching: 'unavailable',
      code: 'notify.venue_halt_unavailable',
    });
    expect(presentVenueIncident({ load: { kind: 'unavailable' }, incidentSilence: false, allClear: true })).toMatchObject({
      allFine: false,
      matching: 'unavailable',
      code: 'notify.incident_all_clear_refused',
    });
  });

  it('unwired matching is not allFine and does not invent a halt', () => {
    expect(presentVenueIncident({ load: { kind: 'unwired' }, ...quiet })).toMatchObject({
      allFine: false,
      matching: 'unwired',
      code: null,
    });
  });

  it('incident-silence blocks allFine until explicit all-clear — matching open is not auto-unmute', () => {
    expect(
      presentVenueIncident({
        load: { kind: 'board', board: { venueHalted: false, haltedMarkets: [] } },
        incidentSilence: true,
        allClear: false,
      }),
    ).toMatchObject({ allFine: false, matching: 'open', code: 'notify.incident_silence' });

    expect(
      presentVenueIncident({
        load: { kind: 'board', board: { venueHalted: false, haltedMarkets: [] } },
        incidentSilence: true,
        allClear: true,
      }),
    ).toMatchObject({ allFine: true, matching: 'open', code: null });
  });

  it('all-clear without a matching board is refused — never invent recovered', () => {
    expect(presentVenueIncident({ load: { kind: 'unwired' }, incidentSilence: true, allClear: true })).toMatchObject({
      allFine: false,
      matching: 'unwired',
      code: 'notify.incident_all_clear_refused',
    });
  });
});
