import { describe, expect, it } from 'vitest';
import { SCORE_SCALE } from './crew-matching.js';
import { mentorFit, shortlistMentors, type MentorCandidate, type MentorProfile } from './mentor-matching.js';

/**
 * Mentor shortlist (§7.1).
 *
 * The interesting property is that this is NOT the crew heuristic: a mentor
 * should differ in judgement and match in how they transmit it. These tests pin
 * that distinction down, because reusing `complementarity()` here would pass a
 * naive "is it deterministic" test while shortlisting mentors who cannot teach
 * the student they were matched with.
 */

const STUDENT: MentorProfile = {
  crewRole: 'scout',
  decisionStyle: 'intuitive',
  riskTemperament: 'bold',
  energyRhythm: 'nocturnal',
  learningMode: 'narrative',
};

/** Differs on every growth axis, matches on every affinity axis. */
const IDEAL: MentorProfile = {
  crewRole: 'anchor',
  decisionStyle: 'analytical',
  riskTemperament: 'guarded',
  energyRhythm: 'nocturnal',
  learningMode: 'narrative',
};

const uuid = (n: number) => `${String(n).padStart(8, '0')}-0000-4000-8000-000000000000`;

describe('mentor fit', () => {
  it('scores the ideal mentor at the maximum', () => {
    expect(mentorFit(STUDENT, IDEAL)).toBe(SCORE_SCALE);
  });

  it('scores a twin low but not zero — an identical mentor is not a mentor', () => {
    const twin = mentorFit(STUDENT, STUDENT);
    expect(twin).toBeGreaterThan(0);
    expect(twin).toBeLessThan(SCORE_SCALE / 2);
  });

  it('rewards difference in judgement', () => {
    const sameJudgement: MentorProfile = { ...IDEAL, decisionStyle: STUDENT.decisionStyle };
    expect(mentorFit(STUDENT, sameJudgement)).toBeLessThan(mentorFit(STUDENT, IDEAL));
  });

  it('rewards SAMENESS in learning mode — the opposite of the crew rule', () => {
    // This is the assertion that would fail if someone "simplified" this file
    // by reusing the crew heuristic.
    const sharesLearning: MentorProfile = { ...IDEAL, learningMode: STUDENT.learningMode };
    const differsLearning: MentorProfile = { ...IDEAL, learningMode: 'systematic' };

    expect(mentorFit(STUDENT, sharesLearning)).toBeGreaterThan(mentorFit(STUDENT, differsLearning));
  });

  it('returns an integer inside the basis-point range for every axis combination', () => {
    const values: Array<[keyof MentorProfile, string]> = [
      ['crewRole', 'builder'],
      ['decisionStyle', 'collaborative'],
      ['riskTemperament', 'measured'],
      ['energyRhythm', 'dawn'],
      ['learningMode', 'visual'],
    ];

    for (const [axis, value] of values) {
      const variant = { ...IDEAL, [axis]: value } as MentorProfile;
      const score = mentorFit(STUDENT, variant);
      expect(Number.isInteger(score)).toBe(true);
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(SCORE_SCALE);
    }
  });
});

describe('shortlist', () => {
  const candidates: MentorCandidate[] = [
    { userId: uuid(1), profile: STUDENT },
    { userId: uuid(2), profile: IDEAL },
    { userId: uuid(3), profile: { ...IDEAL, learningMode: 'systematic' } },
    { userId: uuid(4), profile: { ...IDEAL, riskTemperament: STUDENT.riskTemperament } },
  ];

  it('orders by fit, best first', () => {
    const shortlist = shortlistMentors(uuid(99), STUDENT, candidates, 4);
    expect(shortlist[0]?.mentorId).toBe(uuid(2));

    const scores = shortlist.map((s) => s.fitScore);
    expect([...scores].sort((a, b) => b - a)).toEqual(scores);
  });

  it('is identical across repeated runs and under permutation', () => {
    const baseline = shortlistMentors(uuid(99), STUDENT, candidates, 3);
    for (let run = 0; run < 100; run++) {
      expect(shortlistMentors(uuid(99), STUDENT, candidates, 3)).toEqual(baseline);
    }
    expect(shortlistMentors(uuid(99), STUDENT, [...candidates].reverse(), 3)).toEqual(baseline);
  });

  it('breaks ties on mentor id', () => {
    const tied: MentorCandidate[] = [
      { userId: uuid(9), profile: IDEAL },
      { userId: uuid(7), profile: IDEAL },
      { userId: uuid(8), profile: IDEAL },
    ];
    expect(shortlistMentors(uuid(99), STUDENT, tied, 3).map((s) => s.mentorId)).toEqual([uuid(7), uuid(8), uuid(9)]);
  });

  it('never shortlists the student as their own mentor', () => {
    const withSelf = [...candidates, { userId: uuid(50), profile: STUDENT }];
    const shortlist = shortlistMentors(uuid(50), STUDENT, withSelf, 10);
    expect(shortlist.map((s) => s.mentorId)).not.toContain(uuid(50));
  });

  it('honours the limit and copes with an empty pool', () => {
    expect(shortlistMentors(uuid(99), STUDENT, candidates, 2)).toHaveLength(2);
    expect(shortlistMentors(uuid(99), STUDENT, [], 3)).toEqual([]);
    expect(shortlistMentors(uuid(99), STUDENT, candidates, 0)).toEqual([]);
  });
});
