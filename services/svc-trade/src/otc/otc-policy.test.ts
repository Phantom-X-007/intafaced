import { describe, expect, it } from 'vitest';
import { OTC_DESK_LAW_RESIDUAL } from './errors.js';
import { OTC_MAKER_ROUTING_RESIDUAL } from './maker-routing.js';
import {
  OTC_MID_FEED_FLAG_ON_SYMBOL_MAP_EMPTY,
  OTC_MID_FEED_FLAG_ON_VENUE_UNWIRED,
  OTC_MID_FEED_RESIDUAL,
  describeOtcMidFeedWiring,
} from './mid-feed.js';
import { describeOtcPolicy } from './otc-policy.js';

describe('describeOtcPolicy', () => {
  it('states OTC desk honesty without inventing §8 spreads or maker routing', () => {
    const p = describeOtcPolicy();
    expect(p.deskLawUnsetResidual).toBe(OTC_DESK_LAW_RESIDUAL);
    expect(p.makerRoutingUnsetResidual).toBe(OTC_MAKER_ROUTING_RESIDUAL);
    expect(p.midFeedUnsetResidual).toBe(OTC_MID_FEED_RESIDUAL);
    expect(p.midFeedWiringStates).toEqual(['flag_off', 'flag_on_venue_unwired', 'flag_on_symbol_map_empty', 'live_observation']);
    expect(p.midFeedFlagOnVenueUnwiredResidual).toBe(OTC_MID_FEED_FLAG_ON_VENUE_UNWIRED);
    expect(p.midFeedFlagOnSymbolMapEmptyResidual).toBe(OTC_MID_FEED_FLAG_ON_SYMBOL_MAP_EMPTY);
    expect(p.midFeedWiringHonest).toBe(true);
    expect(p.bootMidFeedWiring.wiring).toBe('flag_off');
    expect(p.bootMidFeedWiring.residual).toBe(OTC_MID_FEED_RESIDUAL);
    expect(p.inventsSpreadBps).toBe(false);
    expect(p.inventsMakerBook).toBe(false);
    expect(p.moneyViaLedgerClientOnly).toBe(true);
  });

  it('bootMidFeedWiring matches describeOtcMidFeedWiring default boot posture (D42)', () => {
    const p = describeOtcPolicy();
    expect(p.bootMidFeedWiring).toEqual(
      describeOtcMidFeedWiring({
        midFromVenue: false,
        venueAdapterInstalled: false,
        venueSymbolsConfigured: false,
        liveObservationFeed: false,
      }),
    );
  });
});
