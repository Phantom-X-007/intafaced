import { describe, expect, it } from 'vitest';
import { OTC_DESK_LAW_RESIDUAL } from './errors.js';
import { OTC_MAKER_ROUTING_RESIDUAL } from './maker-routing.js';
import { OTC_MID_FEED_RESIDUAL } from './mid-feed.js';
import { describeOtcPolicy } from './otc-policy.js';

describe('describeOtcPolicy', () => {
  it('states OTC desk honesty without inventing §8 spreads or maker routing', () => {
    const p = describeOtcPolicy();
    expect(p.deskLawUnsetResidual).toBe(OTC_DESK_LAW_RESIDUAL);
    expect(p.makerRoutingUnsetResidual).toBe(OTC_MAKER_ROUTING_RESIDUAL);
    expect(p.midFeedUnsetResidual).toBe(OTC_MID_FEED_RESIDUAL);
    expect(p.inventsSpreadBps).toBe(false);
    expect(p.inventsMakerBook).toBe(false);
    expect(p.moneyViaLedgerClientOnly).toBe(true);
  });
});
