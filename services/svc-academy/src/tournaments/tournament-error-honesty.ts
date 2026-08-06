/**
 * Academy L3 — pure tournament error-code catalog honesty (no prize invent).
 *
 * Mirrors ladder.ts TournamentErrorCode.
 */

export const TOURNAMENT_ERROR_CODES = [
  'academy.tournament_disabled',
  'academy.season_not_found',
  'academy.season_not_live',
  'academy.season_invalid',
  'academy.standing_invalid',
] as const;
export type TournamentErrorCodeId = (typeof TOURNAMENT_ERROR_CODES)[number];

/** L3 — catalog board. */
export function tournamentErrorCatalogBoardCard(): {
  readonly codes: number;
  readonly hasSeasonInvalid: number;
  readonly hasStandingInvalid: number;
  readonly hasPrizeCode: number;
} {
  return {
    codes: TOURNAMENT_ERROR_CODES.length,
    hasSeasonInvalid: TOURNAMENT_ERROR_CODES.includes('academy.season_invalid') ? 1 : 0,
    hasStandingInvalid: TOURNAMENT_ERROR_CODES.includes('academy.standing_invalid') ? 1 : 0,
    hasPrizeCode: 0,
  };
}

/** L3 — status line. */
export function tournamentErrorCatalogStatusLine(): string {
  const c = tournamentErrorCatalogBoardCard();
  return `codes=${c.codes} season_invalid=${c.hasSeasonInvalid} standing_invalid=${c.hasStandingInvalid} prize=${c.hasPrizeCode}`;
}

/** L3 — parse status. */
export function parseTournamentErrorCatalogStatusLine(line: string): {
  readonly codes: number;
  readonly seasonInvalid: number;
  readonly standingInvalid: number;
  readonly prize: number;
} | null {
  const m = line.trim().match(/^codes=(\d+) season_invalid=([01]) standing_invalid=([01]) prize=([01])$/);
  if (!m) return null;
  return {
    codes: Number(m[1]),
    seasonInvalid: Number(m[2]),
    standingInvalid: Number(m[3]),
    prize: Number(m[4]),
  };
}

/** L3 — true when status matches. */
export function tournamentErrorCatalogStatusLineMatches(): boolean {
  const p = parseTournamentErrorCatalogStatusLine(tournamentErrorCatalogStatusLine());
  if (!p) return false;
  const c = tournamentErrorCatalogBoardCard();
  return (
    p.codes === c.codes &&
    p.seasonInvalid === c.hasSeasonInvalid &&
    p.standingInvalid === c.hasStandingInvalid &&
    p.prize === c.hasPrizeCode
  );
}

/** L3 — no prize code in Stage-2 (Class M residual). */
export function tournamentErrorCatalogStatusLineConsistent(line: string): boolean {
  const p = parseTournamentErrorCatalogStatusLine(line);
  if (!p) return false;
  return p.prize === 0 && p.codes === 5;
}

/** L3 — export header. */
export function tournamentErrorCatalogExportHeader(): string {
  return 'code';
}

/** L3 — export lines. */
export function tournamentErrorCatalogExportLines(): readonly string[] {
  return [...TOURNAMENT_ERROR_CODES];
}

/** L3 — full export. */
export function tournamentErrorCatalogExportText(): string {
  return [tournamentErrorCatalogExportHeader(), ...tournamentErrorCatalogExportLines()].join('\n');
}

/** L3 — code declared. */
export function isDeclaredTournamentErrorCode(code: string): boolean {
  return (TOURNAMENT_ERROR_CODES as readonly string[]).includes(code);
}
