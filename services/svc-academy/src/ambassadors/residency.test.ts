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
});
