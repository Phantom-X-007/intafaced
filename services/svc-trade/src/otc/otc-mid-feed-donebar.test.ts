/**
 * Done bar — SOCKET §13 `socket.otc-mid-feed`.
 *
 * Boot TRADE_OTC_MIDS map is age-gated memory, not a live observation feed.
 * deskStatus must name the socket refuse-closed — never claim a live mid wire.
 */

import { describe, expect, it } from 'vitest';
import { MemoryLedger, parseAmount } from '@intafaced/ledger-client';
import { OtcDeskService } from './otc-service.js';
import { FixedOtcStake } from './stake-source.js';
import { OTC_MID_FEED_RESIDUAL, OTC_MID_FEED_SOCKET, otcMidFeedStatus } from './mid-feed.js';

describe('socket.otc-mid-feed Done bar', () => {
  it('deskStatus names the mid-feed socket refuse-closed', () => {
    const svc = new OtcDeskService(new MemoryLedger(), new FixedOtcStake(parseAmount('0')));
    const status = svc.deskStatus();
    expect(status.midFeed).toEqual(otcMidFeedStatus());
    expect(status.midFeed.published).toBe(false);
    expect(status.midFeed.socket).toBe(OTC_MID_FEED_SOCKET);
    expect(status.midFeed.liveObservationFeed).toBe(false);
    expect(status.residuals.midFeed).toBe(OTC_MID_FEED_RESIDUAL);
  });
});
