import type { BlueprintProfile } from '@intafaced/contracts';
import { SCORE_SCALE } from './crew-matching.js';

/**
 * MENTOR SHORTLIST (§7.1).
 *
 * Pure, like crew matching, and for the same reason: a shortlist that changes
 * between two identical runs cannot be explained to the person reading it.
 *
 * ── Why this is NOT the crew heuristic ──────────────────────────────────────
 * Crew matching wants difference everywhere. A mentor relationship wants
 * something narrower and, put plainly:
 *
 *   · **Difference in judgement.** A mentor whose decision style and risk
 *     temperament match yours has nothing to correct — they will confirm every
 *     instinct you already have, including the expensive ones. Difference here
 *     is the entire point of the relationship.
 *
 *   · **Sameness in transmission.** A mentor who learns the way you learn can
 *     explain things the way you take them in. Difference on *learning mode* is
 *     not productive friction, it is two people talking past each other.
 *
 * So the axes are split: some score on difference, some on similarity. Applying
 * one rule to all five — which is what reusing `complementarity()` would have
 * done — would have shortlisted mentors who cannot teach the student they
 * were matched with.
 */

type MentorAxis = keyof Pick<BlueprintProfile, 'decisionStyle' | 'riskTemperament' | 'crewRole' | 'learningMode' | 'energyRhythm'>;

/** Axes where the mentor should differ — that difference is the lesson. */
const GROWTH_AXES: Readonly<Record<string, number>> = {
  decisionStyle: 3,
  riskTemperament: 3,
  crewRole: 2,
};

/** Axes where the mentor should match — that sameness is the channel. */
const AFFINITY_AXES: Readonly<Record<string, number>> = {
  learningMode: 2,
  energyRhythm: 1,
};

const TOTAL_WEIGHT = Object.values(GROWTH_AXES).reduce((a, b) => a + b, 0) + Object.values(AFFINITY_AXES).reduce((a, b) => a + b, 0);

export type MentorProfile = Pick<BlueprintProfile, MentorAxis>;

export interface MentorCandidate {
  readonly userId: string;
  readonly profile: MentorProfile;
}

export interface ScoredMentor {
  readonly mentorId: string;
  /** 0–10000 basis points of fit. */
  readonly fitScore: number;
}

/**
 * Fit between a student and one mentor, in basis points.
 *
 * A perfect fit (differs on every growth axis, matches on every affinity axis)
 * is 10000. A mentor who is the student's twin scores only the growth axes'
 * complement — which is 0 — plus full affinity, i.e. 3000. That floor is
 * intentional: an identical mentor is not useless, just not a mentor.
 */
export function mentorFit(student: MentorProfile, mentor: MentorProfile): number {
  let weighted = 0;

  for (const [axis, weight] of Object.entries(GROWTH_AXES)) {
    const key = axis as MentorAxis;
    if (student[key] !== mentor[key]) weighted += weight;
  }

  for (const [axis, weight] of Object.entries(AFFINITY_AXES)) {
    const key = axis as MentorAxis;
    if (student[key] === mentor[key]) weighted += weight;
  }

  return Math.floor((weighted * SCORE_SCALE) / TOTAL_WEIGHT);
}

/** Unset / null refuses. Owner-explicit 3 is a published window, not a git default. */
function publishedShortlistLimit(value: number | undefined | null): number {
  if (value === undefined || value === null) {
    throw new Error('shortlistMentors limit is unset — refuse to invent 3');
  }
  return value;
}

/**
 * The shortlist: the best `limit` mentors, best first.
 *
 * `limit` is required. Unset refuses (never invent 3). Callers that have the
 * published env size must pass it.
 *
 * Self-matches are dropped here as well as being forbidden by a CHECK
 * constraint — a student is trivially their own perfect affinity match and
 * would otherwise take a slot on their own shortlist.
 *
 * Ties break on `mentorId`, so the shortlist is a function of the candidate
 * *set* and not of the order Postgres returned the rows in.
 */
export function shortlistMentors(
  studentId: string,
  student: MentorProfile,
  candidates: readonly MentorCandidate[],
  limit?: number | null,
): ScoredMentor[] {
  const n = publishedShortlistLimit(limit);
  return candidates
    .filter((candidate) => candidate.userId !== studentId)
    .map((candidate) => ({ mentorId: candidate.userId, fitScore: mentorFit(student, candidate.profile) }))
    .sort((a, b) => {
      if (a.fitScore !== b.fitScore) return b.fitScore - a.fitScore;
      return a.mentorId < b.mentorId ? -1 : a.mentorId > b.mentorId ? 1 : 0;
    })
    .slice(0, Math.max(0, n));
}
