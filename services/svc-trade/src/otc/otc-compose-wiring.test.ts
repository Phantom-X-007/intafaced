import { describe, expect, it } from 'vitest';
import { otcDeskLawComposeWired } from './otc-compose-wiring.js';

describe('trade.otc fleet compose wiring', () => {
  it('svc-trade passes TRADE_OTC_DESK_LAW owner env through', () => {
    expect(otcDeskLawComposeWired()).toBe(true);
  });
});
