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

  it('L3 rejectedCount + withdrawnCount without invent', () => {
    const desk = new MemoryResidencyDesk();
    expect(desk.rejectedCount()).toBe(0);
    expect(desk.withdrawnCount()).toBe(0);
    const a = desk.apply({
      userId: 'u1',
      cohortSlug: 'bali-2026',
      statement: 'I host weekly risk-first lobbies and can commit six hours a week.',
    });
    desk.decide({ id: a.id, operatorId: 'op', decision: 'rejected' });
    expect(desk.rejectedCount()).toBe(1);
    const b = desk.apply({
      userId: 'u2',
      cohortSlug: 'bali-2026',
      statement: 'I host weekly risk-first lobbies and can commit six hours a week.',
    });
    desk.withdraw({ id: b.id, userId: 'u2' });
    expect(desk.withdrawnCount()).toBe(1);
  });

  it('L3 rejectedApplicationIds sorted without invent', () => {
    const desk = new MemoryResidencyDesk();
    expect(desk.rejectedApplicationIds()).toEqual([]);
    const a = desk.apply({
      userId: 'u1',
      cohortSlug: 'bali-2026',
      statement: 'I host weekly risk-first lobbies and can commit six hours a week.',
    });
    desk.decide({ id: a.id, operatorId: 'op', decision: 'rejected' });
    expect(desk.rejectedApplicationIds()).toEqual([a.id]);
  });
  it('L3 acceptedApplicationIds without invent', () => {
    const desk = new MemoryResidencyDesk();
    expect(desk.acceptedApplicationIds()).toEqual([]);
    const a = desk.apply({
      userId: 'u1',
      cohortSlug: 'bali-2026',
      statement: 'I host weekly risk-first lobbies and can commit six hours a week.',
    });
    desk.decide({ id: a.id, operatorId: 'op', decision: 'accepted' });
    expect(desk.acceptedApplicationIds()).toEqual([a.id]);
  });

  it('L3 withdrawnApplicationIds without invent', () => {
    const desk = new MemoryResidencyDesk();
    expect(desk.withdrawnApplicationIds()).toEqual([]);
    const a = desk.apply({
      userId: 'u1',
      cohortSlug: 'bali-2026',
      statement: 'I host weekly risk-first lobbies and can commit six hours a week.',
    });
    desk.withdraw({ id: a.id, userId: 'u1' });
    expect(desk.withdrawnApplicationIds()).toEqual([a.id]);
  });

  it('L3 applicationCount without invent', () => {
    const desk = new MemoryResidencyDesk();
    expect(desk.applicationCount()).toBe(0);
    desk.apply({
      userId: 'u1',
      cohortSlug: 'bali-2026',
      statement: 'I host weekly risk-first lobbies and can commit six hours a week.',
    });
    expect(desk.applicationCount()).toBe(1);
  });

  it('L3 hasOpenApplication without invent', () => {
    const desk = new MemoryResidencyDesk();
    expect(desk.hasOpenApplication('u1')).toBe(false);
    desk.apply({
      userId: 'u1',
      cohortSlug: 'bali-2026',
      statement: 'I host weekly risk-first lobbies and can commit six hours a week.',
    });
    expect(desk.hasOpenApplication('u1')).toBe(true);
  });

  it('L3 openApplicationCount without invent', () => {
    const desk = new MemoryResidencyDesk();
    expect(desk.openApplicationCount('u1')).toBe(0);
    desk.apply({
      userId: 'u1',
      cohortSlug: 'bali-2026',
      statement: 'I host weekly risk-first lobbies and can commit six hours a week.',
    });
    expect(desk.openApplicationCount('u1')).toBe(1);
  });

  it('L3 rejectedApplicationCount aliases rejectedCount', () => {
    const desk = new MemoryResidencyDesk();
    expect(desk.rejectedApplicationCount()).toBe(0);
  });

  it('L3 acceptedApplicationCount aliases acceptedCount', () => {
    const desk = new MemoryResidencyDesk();
    expect(desk.acceptedApplicationCount()).toBe(0);
  });

  it('L3 withdrawnApplicationCount aliases withdrawnCount', () => {
    const desk = new MemoryResidencyDesk();
    expect(desk.withdrawnApplicationCount()).toBe(0);
  });

  it('L3 wave25 applied count/ids + open ratio + hasAny', () => {
    const desk = new MemoryResidencyDesk();
    const u = 'u-wave25';
    expect(desk.appliedApplicationCount()).toBe(0);
    expect(desk.appliedApplicationIds()).toEqual([]);
    expect(desk.openApplicationRatio()).toBeNull();
    expect(desk.hasAnyApplication()).toBe(false);
    const app = desk.apply({
      userId: u,
      cohortSlug: 'bali-2026',
      statement: 'I host weekly risk-first lobbies and can commit six hours a week.',
      now: NOW,
    });
    expect(desk.appliedApplicationCount()).toBe(1);
    expect(desk.appliedApplicationIds()).toEqual([app.id]);
    expect(desk.openApplicationRatio()).toBe('1.0000');
    expect(desk.hasAnyApplication()).toBe(true);
  });

  it('L3 wave26 open empty + accept/reject ratios + cohorts sorted', () => {
    const desk = new MemoryResidencyDesk();
    expect(desk.hasNoOpenApplications()).toBe(true);
    expect(desk.acceptedApplicationRatio()).toBeNull();
    expect(desk.rejectedApplicationRatio()).toBeNull();
    expect(desk.knownCohortSlugsSorted()).toEqual([]);
    const a = desk.apply({
      userId: 'u-w26',
      cohortSlug: 'bali-2026',
      statement: 'I host weekly risk-first lobbies and can commit six hours a week.',
      now: NOW,
    });
    expect(desk.hasNoOpenApplications()).toBe(false);
    desk.decide({ id: a.id, operatorId: 'op1', decision: 'accepted', now: NOW });
    expect(desk.acceptedApplicationRatio()).toBe('1.0000');
    expect(desk.rejectedApplicationRatio()).toBe('0.0000');
    expect(desk.knownCohortSlugsSorted()).toEqual(['bali-2026']);
  });

  it('L3 wave27 accepted/rejected flags + withdrawn ratio + decided count', () => {
    const desk = new MemoryResidencyDesk();
    expect(desk.hasAcceptedApplication()).toBe(false);
    expect(desk.hasRejectedApplication()).toBe(false);
    expect(desk.withdrawnApplicationRatio()).toBeNull();
    expect(desk.decidedApplicationCount()).toBe(0);
    const a = desk.apply({
      userId: 'u-w27',
      cohortSlug: 'bali-2026',
      statement: 'I host weekly risk-first lobbies and can commit six hours a week.',
      now: NOW,
    });
    desk.decide({ id: a.id, operatorId: 'op1', decision: 'accepted', now: NOW });
    expect(desk.hasAcceptedApplication()).toBe(true);
    expect(desk.decidedApplicationCount()).toBe(1);
    expect(desk.withdrawnApplicationRatio()).toBe('0.0000');
  });

  it('L3 wave28 withdrawn flag + decided ratio + all open + first open', () => {
    const desk = new MemoryResidencyDesk();
    expect(desk.hasWithdrawnApplication()).toBe(false);
    expect(desk.decidedApplicationRatio()).toBeNull();
    expect(desk.isAllOpen()).toBe(false);
    expect(desk.firstOpenApplicationId()).toBeNull();
    const a = desk.apply({
      userId: 'u-w28',
      cohortSlug: 'bali-2026',
      statement: 'I host weekly risk-first lobbies and can commit six hours a week.',
      now: NOW,
    });
    expect(desk.isAllOpen()).toBe(true);
    expect(desk.firstOpenApplicationId()).toBe(a.id);
    desk.withdraw({ id: a.id, userId: 'u-w28' });
    expect(desk.hasWithdrawnApplication()).toBe(true);
    expect(desk.decidedApplicationRatio()).toBe('1.0000');
  });
});
