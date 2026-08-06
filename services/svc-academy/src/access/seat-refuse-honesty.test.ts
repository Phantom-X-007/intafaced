import { describe, expect, it } from 'vitest';
import {
  seatRefuseCatalogBoardCard,
  seatRefuseCatalogStatusLine,
  parseSeatRefuseCatalogStatusLine,
  seatRefuseCatalogStatusLineMatches,
  seatRefuseCatalogStatusLineConsistent,
  seatDecisionSimpleBoardCard,
  seatDecisionSimpleStatusLine,
  parseSeatDecisionSimpleStatusLine,
  seatDecisionSimpleStatusLineMatches,
  seatDecisionSimpleStatusLineConsistent,
  seatDecisionSimpleExportHeader,
  seatDecisionSimpleExportLine,
  seatDecisionSimpleExportText,
  isDeclaredSeatRefuseCode,
  SEAT_REFUSE_CODES,
  type SeatDecisionBoardInput,
} from './seat-refuse-honesty.js';

describe('L3 wave149 seat refuse honesty', () => {
  it('catalog and decision boards', () => {
    expect(SEAT_REFUSE_CODES).toHaveLength(3);
    expect(seatRefuseCatalogBoardCard()).toEqual({
      codes: 3,
      hasStake: 1,
      hasInvite: 1,
      hasFull: 1,
    });
    expect(seatRefuseCatalogStatusLine()).toBe('codes=3 stake=1 invite=1 full=1');
    expect(seatRefuseCatalogStatusLineMatches()).toBe(true);
    expect(seatRefuseCatalogStatusLineConsistent(seatRefuseCatalogStatusLine())).toBe(true);
    expect(isDeclaredSeatRefuseCode('academy.room_full')).toBe(true);
    expect(isDeclaredSeatRefuseCode('academy.paid_seat')).toBe(false);
    expect(parseSeatRefuseCatalogStatusLine('nope')).toBeNull();

    const ok: SeatDecisionBoardInput = { allowed: true };
    expect(seatDecisionSimpleBoardCard(ok)).toEqual({ allowed: 1, code: '-' });
    expect(seatDecisionSimpleStatusLineMatches(ok)).toBe(true);
    expect(seatDecisionSimpleStatusLineConsistent(seatDecisionSimpleStatusLine(ok))).toBe(true);
    expect(seatDecisionSimpleExportText(ok).startsWith(seatDecisionSimpleExportHeader())).toBe(
      true,
    );
    expect(seatDecisionSimpleExportLine(ok)).toBe('1,-');

    const refuse: SeatDecisionBoardInput = {
      allowed: false,
      code: 'academy.stake_required',
    };
    expect(seatDecisionSimpleStatusLine(refuse)).toBe(
      'allowed=0 code=academy.stake_required',
    );
    expect(seatDecisionSimpleStatusLineMatches(refuse)).toBe(true);
    expect(parseSeatDecisionSimpleStatusLine('nope')).toBeNull();
  });
});
