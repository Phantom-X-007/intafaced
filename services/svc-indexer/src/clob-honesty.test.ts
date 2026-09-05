import { describe, expect, it } from 'vitest';
import {
  DEV_VENUE_ADDRESS,
  INDEXER_CLOB_FIXTURE_NOT_LIVE,
  ZERO_VENUE_ADDRESS,
  clobFixtureRefusesLiveClaim,
  clobHonesty,
} from './clob-honesty.js';

describe('Q-index — fixture ABI is not a live CLOB', () => {
  it('never claims live, and never invents reserves', () => {
    for (const venue of [null, '', ZERO_VENUE_ADDRESS, DEV_VENUE_ADDRESS, '0x1111111111111111111111111111111111111111']) {
      const honesty = clobHonesty(venue);
      expect(honesty.live).toBe(false);
      expect(honesty.reserves).toBe(false);
    }
  });

  it('zero / blank is unset; DevVenue and any other address stay fixture', () => {
    expect(clobHonesty(null).kind).toBe('unset');
    expect(clobHonesty(ZERO_VENUE_ADDRESS).kind).toBe('unset');
    expect(clobHonesty(DEV_VENUE_ADDRESS).kind).toBe('fixture');
    expect(clobHonesty('0x1111111111111111111111111111111111111111').kind).toBe('fixture');
  });

  it('refuses the live-CLOB claim only when the door asks to present live and the ABI is fixture', () => {
    expect(clobFixtureRefusesLiveClaim({ claimLiveClob: false, venue: DEV_VENUE_ADDRESS })).toBe(false);
    expect(clobFixtureRefusesLiveClaim({ claimLiveClob: true, venue: ZERO_VENUE_ADDRESS })).toBe(false);
    expect(clobFixtureRefusesLiveClaim({ claimLiveClob: true, venue: DEV_VENUE_ADDRESS })).toBe(true);
    expect(INDEXER_CLOB_FIXTURE_NOT_LIVE).toBe('indexer.clob_fixture_not_live');
  });
});
