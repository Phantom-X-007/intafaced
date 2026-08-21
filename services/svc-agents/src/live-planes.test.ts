import { describe, expect, it } from 'vitest';
import { describeAgentsLivePlanes } from './live-planes.js';

describe('describeAgentsLivePlanes', () => {
  it('reports all dark when env unset', () => {
    expect(describeAgentsLivePlanes({})).toEqual({
      tradeUrlConfigured: false,
      payUrlConfigured: false,
      supportUrlConfigured: false,
      identityUrlConfigured: false,
      storesMayStillRefuse: true,
    });
  });

  it('reports configured pins without claiming live stores', () => {
    expect(
      describeAgentsLivePlanes({
        TRADE_URL: 'http://svc-trade:4004',
        PAY_URL: 'http://svc-pay:4006',
        SUPPORT_URL: 'http://svc-support:4017',
        IDENTITY_URL: 'http://svc-identity:4002',
      }),
    ).toEqual({
      tradeUrlConfigured: true,
      payUrlConfigured: true,
      supportUrlConfigured: true,
      identityUrlConfigured: true,
      storesMayStillRefuse: true,
    });
  });
});
