/**
 * Contracts L3 — pure mentor-match status catalog honesty.
 *
 * Mirrors blueprint.ts mentorMatchSchema status: shortlisted | accepted | declined | ended.
 * Does not invent mentorship product law or money.
 */

export const MENTOR_MATCH_STATUSES = ['shortlisted', 'accepted', 'declined', 'ended'] as const;
export type MentorMatchStatusId = (typeof MENTOR_MATCH_STATUSES)[number];

/** L3 — catalog board. */
export function mentorMatchStatusCatalogBoardCard(): {
  readonly statuses: number;
  readonly hasShortlisted: number;
  readonly hasAccepted: number;
  readonly hasDeclined: number;
  readonly hasEnded: number;
} {
  return {
    statuses: MENTOR_MATCH_STATUSES.length,
    hasShortlisted: MENTOR_MATCH_STATUSES.includes('shortlisted') ? 1 : 0,
    hasAccepted: MENTOR_MATCH_STATUSES.includes('accepted') ? 1 : 0,
    hasDeclined: MENTOR_MATCH_STATUSES.includes('declined') ? 1 : 0,
    hasEnded: MENTOR_MATCH_STATUSES.includes('ended') ? 1 : 0,
  };
}

/** L3 — status line. */
export function mentorMatchStatusCatalogStatusLine(): string {
  const c = mentorMatchStatusCatalogBoardCard();
  return `statuses=${c.statuses} shortlisted=${c.hasShortlisted} accepted=${c.hasAccepted} declined=${c.hasDeclined} ended=${c.hasEnded}`;
}

/** L3 — parse status. */
export function parseMentorMatchStatusCatalogStatusLine(line: string): {
  readonly statuses: number;
  readonly shortlisted: number;
  readonly accepted: number;
  readonly declined: number;
  readonly ended: number;
} | null {
  const m = line.trim().match(/^statuses=(\d+) shortlisted=([01]) accepted=([01]) declined=([01]) ended=([01])$/);
  if (!m) return null;
  return {
    statuses: Number(m[1]),
    shortlisted: Number(m[2]),
    accepted: Number(m[3]),
    declined: Number(m[4]),
    ended: Number(m[5]),
  };
}

/** L3 — true when status matches. */
export function mentorMatchStatusCatalogStatusLineMatches(): boolean {
  const p = parseMentorMatchStatusCatalogStatusLine(mentorMatchStatusCatalogStatusLine());
  if (!p) return false;
  const c = mentorMatchStatusCatalogBoardCard();
  return (
    p.statuses === c.statuses &&
    p.shortlisted === c.hasShortlisted &&
    p.accepted === c.hasAccepted &&
    p.declined === c.hasDeclined &&
    p.ended === c.hasEnded
  );
}

/** L3 — four statuses. */
export function mentorMatchStatusCatalogStatusLineConsistent(line: string): boolean {
  const p = parseMentorMatchStatusCatalogStatusLine(line);
  if (!p) return false;
  return p.statuses === 4 && p.shortlisted === 1 && p.accepted === 1 && p.declined === 1 && p.ended === 1;
}

/** L3 — export header. */
export function mentorMatchStatusCatalogExportHeader(): string {
  return 'status';
}

/** L3 — export lines. */
export function mentorMatchStatusCatalogExportLines(): readonly string[] {
  return [...MENTOR_MATCH_STATUSES];
}

/** L3 — full export. */
export function mentorMatchStatusCatalogExportText(): string {
  return [mentorMatchStatusCatalogExportHeader(), ...mentorMatchStatusCatalogExportLines()].join('\n');
}

/** L3 — status declared. */
export function isDeclaredMentorMatchStatus(status: string): boolean {
  return (MENTOR_MATCH_STATUSES as readonly string[]).includes(status);
}
