import { describe, expect, it } from 'vitest';
import { MemoryResidencyDesk, ResidencyError } from './residency.js';

const NOW = new Date('2026-08-05T12:00:00.000Z');

describe('ambassador Stage-2 residency (no pay)', () => {
  it('apply → accept; second open application refused', () => {
    const desk = new MemoryResidencyDesk();
    const a = desk.apply({
      userId: 'u1',
      cohortSlug: 'bali-2026',
      statement: 'I host weekly risk-first lobbies and can commit six hours a week.',
      now: NOW,
    });
    expect(a.status).toBe('applied');
    expect(() =>
      desk.apply({
        userId: 'u1',
        cohortSlug: 'bali-2026',
        statement: 'I host weekly risk-first lobbies and can commit six hours a week.',
        now: NOW,
      }),
    ).toThrow(ResidencyError);
    const decided = desk.decide({ id: a.id, operatorId: 'op1', decision: 'accepted', note: 'strong host', now: NOW });
    expect(decided.status).toBe('accepted');
    expect(decided.decidedBy).toBe('op1');
  });

  it('short statement refused', () => {
    const desk = new MemoryResidencyDesk();
    expect(() => desk.apply({ userId: 'u1', cohortSlug: 'xx', statement: 'hi' })).toThrow(ResidencyError);
  });

  it('withdraw while applied; listAccepted after accept', () => {
    const desk = new MemoryResidencyDesk();
    const a = desk.apply({
      userId: 'u1',
      cohortSlug: 'bali-2026',
      statement: 'I host weekly risk-first lobbies and can commit six hours a week.',
    });
    const w = desk.withdraw({ id: a.id, userId: 'u1' });
    expect(w.status).toBe('withdrawn');
    const b = desk.apply({
      userId: 'u2',
      cohortSlug: 'bali-2026',
      statement: 'I host weekly risk-first lobbies and can commit six hours a week.',
    });
    desk.decide({ id: b.id, operatorId: 'op', decision: 'accepted' });
    expect(desk.listAccepted('bali-2026')).toHaveLength(1);
  });

  it('L3 cohortSummary counts by status without invent', () => {
    const desk = new MemoryResidencyDesk();
    expect(desk.cohortSummary('empty-2026').total).toBe(0);
    const a = desk.apply({
      userId: 'u1',
      cohortSlug: 'bali-2026',
      statement: 'I host weekly risk-first lobbies and can commit six hours a week.',
    });
    desk.decide({ id: a.id, operatorId: 'op', decision: 'accepted' });
    desk.apply({
      userId: 'u2',
      cohortSlug: 'bali-2026',
      statement: 'I host weekly risk-first lobbies and can commit six hours a week.',
    });
    const s = desk.cohortSummary('bali-2026');
    expect(s).toMatchObject({ accepted: 1, applied: 1, total: 2, rejected: 0, withdrawn: 0 });
  });

  it('L3 openForUser lists only applied — never invent accept', () => {
    const desk = new MemoryResidencyDesk();
    expect(desk.openForUser('u1')).toEqual([]);
    const a = desk.apply({
      userId: 'u1',
      cohortSlug: 'bali-2026',
      statement: 'I host weekly risk-first lobbies and can commit six hours a week.',
    });
    expect(desk.openForUser('u1').map((r) => r.id)).toEqual([a.id]);
    desk.decide({ id: a.id, operatorId: 'op', decision: 'accepted' });
    expect(desk.openForUser('u1')).toEqual([]);
  });

  it('L3 knownCohortSlugs + openCount without invent cohorts', () => {
    const desk = new MemoryResidencyDesk();
    expect(desk.knownCohortSlugs()).toEqual([]);
    expect(desk.openCount()).toBe(0);
    desk.apply({
      userId: 'u1',
      cohortSlug: 'bali-2026',
      statement: 'I host weekly risk-first lobbies and can commit six hours a week.',
    });
    desk.apply({
      userId: 'u2',
      cohortSlug: 'lisbon-2026',
      statement: 'I host weekly risk-first lobbies and can commit six hours a week.',
    });
    expect(desk.knownCohortSlugs()).toEqual(['bali-2026', 'lisbon-2026']);
    expect(desk.openCount()).toBe(2);
  });

  it('L3 acceptedCount + openApplicationIds without invent', () => {
    const desk = new MemoryResidencyDesk();
    expect(desk.acceptedCount()).toBe(0);
    expect(desk.openApplicationIds()).toEqual([]);
    const a = desk.apply({
      userId: 'u1',
      cohortSlug: 'bali-2026',
      statement: 'I host weekly risk-first lobbies and can commit six hours a week.',
    });
    expect(desk.openApplicationIds()).toEqual([a.id]);
    desk.decide({ id: a.id, operatorId: 'op', decision: 'accepted' });
    expect(desk.acceptedCount()).toBe(1);
    expect(desk.openApplicationIds()).toEqual([]);
  });
});
