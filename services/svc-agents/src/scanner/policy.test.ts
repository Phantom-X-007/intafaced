import { describe, expect, it } from 'vitest';
import { P0_11_BOARD_ID } from './signal-inputs-law.js';
import { describeScannerPolicy } from './policy.js';

describe('describeScannerPolicy', () => {
  it('states P0-11 law honesty without inventing live tickers', () => {
    const p = describeScannerPolicy();
    expect(p.boardId).toBe(P0_11_BOARD_ID);
    expect(p.productionDefaultPublished).toBe(false);
    expect(p.sealedRecipeId).toBe('abs_change_x_log_volume');
    expect(p.inventsRankings).toBe(false);
    expect(p.inventsLiveTickers).toBe(false);
    expect(p.liveTickersClassX).toBe(true);
    expect(p.fixtureRankOnlyWithoutLivePlane).toBe(true);
  });
});
