import { describe, expect, it } from 'vitest';
import {
  tournamentErrorCatalogBoardCard,
  tournamentErrorCatalogStatusLine,
  parseTournamentErrorCatalogStatusLine,
  tournamentErrorCatalogStatusLineMatches,
  tournamentErrorCatalogStatusLineConsistent,
  tournamentErrorCatalogExportHeader,
  tournamentErrorCatalogExportLines,
  tournamentErrorCatalogExportText,
  isDeclaredTournamentErrorCode,
  TOURNAMENT_ERROR_CODES,
} from './tournament-error-honesty.js';

describe('L3 wave122 tournament error catalog honesty', () => {
  it('error code catalog boards', () => {
    expect(TOURNAMENT_ERROR_CODES).toHaveLength(5);
    expect(tournamentErrorCatalogBoardCard()).toEqual({
      codes: 5,
      hasSeasonInvalid: 1,
      hasStandingInvalid: 1,
      hasPrizeCode: 0,
    });
    expect(tournamentErrorCatalogStatusLine()).toBe(
      'codes=5 season_invalid=1 standing_invalid=1 prize=0',
    );
    expect(tournamentErrorCatalogStatusLineMatches()).toBe(true);
    expect(tournamentErrorCatalogStatusLineConsistent(tournamentErrorCatalogStatusLine())).toBe(
      true,
    );
    expect(tournamentErrorCatalogExportText().startsWith(tournamentErrorCatalogExportHeader())).toBe(
      true,
    );
    expect(tournamentErrorCatalogExportLines()).toEqual([...TOURNAMENT_ERROR_CODES]);
    expect(isDeclaredTournamentErrorCode('academy.season_not_live')).toBe(true);
    expect(isDeclaredTournamentErrorCode('academy.prize_unpaid')).toBe(false);
    expect(parseTournamentErrorCatalogStatusLine('nope')).toBeNull();
  });
});
