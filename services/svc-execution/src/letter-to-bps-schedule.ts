/**
 * execution.sor letter→bps owner schedule — refuse-closed when unset (D-S-14).
 *
 * Owner publishes JSON mapping latency letters to routing bps magnitudes.
 * This module never invents DEFAULT_THRESHOLDS or a default schedule.
 */
import type { VenueLatencyGrade } from '@intafaced/venue-contracts';

export const EXECUTION_SOR_LETTER_BPS_SCHEDULE_ENV = 'EXECUTION_SOR_LETTER_BPS_SCHEDULE' as const;

export const LATENCY_LETTERS = ['A', 'B', 'C', 'D', 'F'] as const;
export type LatencyLetter = (typeof LATENCY_LETTERS)[number];

export type LetterBpsSchedule = Readonly<Record<LatencyLetter, number>>;

export type LetterBpsScheduleRefuseReason = 'schedule_unset' | 'schedule_invalid_json' | 'schedule_incomplete' | 'letter_unmapped';

export type LetterBpsScheduleGate =
  | { readonly configured: true; readonly schedule: LetterBpsSchedule }
  | { readonly configured: false; readonly reason: LetterBpsScheduleRefuseReason; readonly detail: string };

function isLatencyLetter(value: string): value is LatencyLetter {
  return (LATENCY_LETTERS as readonly string[]).includes(value);
}

/** Parse owner schedule from env. Blank → refuse with schedule_unset. */
export function letterBpsScheduleGate(env: NodeJS.ProcessEnv = process.env): LetterBpsScheduleGate {
  const raw = env[EXECUTION_SOR_LETTER_BPS_SCHEDULE_ENV]?.trim() ?? '';
  if (!raw) {
    return { configured: false, reason: 'schedule_unset', detail: `${EXECUTION_SOR_LETTER_BPS_SCHEDULE_ENV} is unset` };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { configured: false, reason: 'schedule_invalid_json', detail: 'letter→bps schedule is not valid JSON' };
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { configured: false, reason: 'schedule_invalid_json', detail: 'letter→bps schedule must be a JSON object' };
  }

  const schedule = {} as Record<LatencyLetter, number>;
  for (const letter of LATENCY_LETTERS) {
    const value = (parsed as Record<string, unknown>)[letter];
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
      return {
        configured: false,
        reason: 'schedule_incomplete',
        detail: `letter ${letter} must be a non-negative integer bps magnitude`,
      };
    }
    schedule[letter] = value;
  }

  return { configured: true, schedule };
}

export function bpsForLatencyGrade(
  schedule: LetterBpsSchedule,
  grade: Pick<VenueLatencyGrade, 'grade'>,
): { readonly ok: true; readonly bps: number } | { readonly ok: false; readonly reason: LetterBpsScheduleRefuseReason } {
  if (grade.grade === null) {
    return { ok: false, reason: 'letter_unmapped' };
  }
  if (!isLatencyLetter(grade.grade)) {
    return { ok: false, reason: 'letter_unmapped' };
  }
  return { ok: true, bps: schedule[grade.grade] };
}
